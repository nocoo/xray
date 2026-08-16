export type PushTokenRow = {
	id: number;
	user_id: string;
	token_prefix: string;
	token_hash: string;
	label: string;
	scopes: string;
	created_at_ms: number;
	last_used_at_ms: number | null;
	revoked_at_ms: number | null;
};

export type PushTokenDto = {
	id: number;
	label: string;
	tokenPrefix: string;
	scopes: string[];
	createdAtMs: number;
	lastUsedAtMs: number | null;
	revokedAtMs: number | null;
};

export const DEFAULT_INGEST_SCOPES = ["ingest:read", "ingest:push"] as const;

function toDto(row: PushTokenRow): PushTokenDto {
	let scopes: string[] = [...DEFAULT_INGEST_SCOPES];
	try {
		const parsed = JSON.parse(row.scopes) as unknown;
		if (Array.isArray(parsed)) scopes = parsed.map(String);
	} catch {
		/* default */
	}
	return {
		id: row.id,
		label: row.label,
		tokenPrefix: row.token_prefix,
		scopes,
		createdAtMs: row.created_at_ms,
		lastUsedAtMs: row.last_used_at_ms,
		revokedAtMs: row.revoked_at_ms,
	};
}

export async function listPushTokens(db: D1Database, userId: string): Promise<PushTokenDto[]> {
	const { results } = await db
		.prepare(
			`SELECT * FROM push_tokens WHERE user_id = ? AND revoked_at_ms IS NULL ORDER BY id DESC`,
		)
		.bind(userId)
		.all<PushTokenRow>();
	return (results ?? []).map(toDto);
}

export async function createPushToken(
	db: D1Database,
	userId: string,
	label: string,
	tokenPrefix: string,
	tokenHash: string,
	scopes: string[] = [...DEFAULT_INGEST_SCOPES],
): Promise<PushTokenDto> {
	const now = Date.now();
	const scopesJson = JSON.stringify(scopes);
	const result = await db
		.prepare(
			`INSERT INTO push_tokens
       (user_id, token_prefix, token_hash, label, scopes, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
		)
		.bind(userId, tokenPrefix, tokenHash, label.trim(), scopesJson, now)
		.run();
	const id = Number(result.meta.last_row_id);
	return {
		id,
		label: label.trim(),
		tokenPrefix,
		scopes,
		createdAtMs: now,
		lastUsedAtMs: null,
		revokedAtMs: null,
	};
}

export async function revokePushToken(
	db: D1Database,
	userId: string,
	id: number,
): Promise<boolean> {
	const now = Date.now();
	const result = await db
		.prepare(
			`UPDATE push_tokens SET revoked_at_ms = ?
       WHERE id = ? AND user_id = ? AND revoked_at_ms IS NULL`,
		)
		.bind(now, id, userId)
		.run();
	return (result.meta.changes ?? 0) > 0;
}

export async function findActiveTokenByHash(
	db: D1Database,
	tokenHash: string,
): Promise<PushTokenRow | null> {
	return db
		.prepare(`SELECT * FROM push_tokens WHERE token_hash = ? AND revoked_at_ms IS NULL LIMIT 1`)
		.bind(tokenHash)
		.first<PushTokenRow>();
}

export async function touchPushToken(db: D1Database, id: number): Promise<void> {
	await db
		.prepare(`UPDATE push_tokens SET last_used_at_ms = ? WHERE id = ?`)
		.bind(Date.now(), id)
		.run();
}
