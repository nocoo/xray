import type { ChannelKey } from "@xray/shared";

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
	/** Channel-scoped key (articles:write only); NULL = watchlist ingest token */
	channel_id: number | null;
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
			`SELECT * FROM push_tokens
			 WHERE user_id = ? AND revoked_at_ms IS NULL AND channel_id IS NULL
			 ORDER BY id DESC`,
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
	channelId?: number,
): Promise<PushTokenDto> {
	const now = Date.now();
	const scopesJson = JSON.stringify(scopes);
	const result = await db
		.prepare(
			`INSERT INTO push_tokens
       (user_id, token_prefix, token_hash, label, scopes, created_at_ms, channel_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(userId, tokenPrefix, tokenHash, label.trim(), scopesJson, now, channelId ?? null)
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

export const CHANNEL_KEY_SCOPES = ["articles:write"] as const;

/** Active channel-scoped keys for one channel (browser management view). */
export async function listChannelKeys(
	db: D1Database,
	userId: string,
	channelId: number,
): Promise<ChannelKey[]> {
	const { results } = await db
		.prepare(
			`SELECT id, channel_id, label, token_prefix, created_at_ms, last_used_at_ms
			 FROM push_tokens
			 WHERE user_id = ? AND channel_id = ? AND revoked_at_ms IS NULL
			 ORDER BY id ASC`,
		)
		.bind(userId, channelId)
		.all<{
			id: number;
			channel_id: number;
			label: string;
			token_prefix: string;
			created_at_ms: number;
			last_used_at_ms: number | null;
		}>();
	return (results ?? []).map((r) => ({
		id: r.id,
		channelId: r.channel_id,
		label: r.label,
		tokenPrefix: r.token_prefix,
		createdAtMs: r.created_at_ms,
		lastUsedAtMs: r.last_used_at_ms,
	}));
}

/** Mint row for a channel key: articles:write only, bound to one channel. */
export async function createChannelKey(
	db: D1Database,
	userId: string,
	channelId: number,
	label: string,
	tokenPrefix: string,
	tokenHash: string,
): Promise<ChannelKey> {
	const dto = await createPushToken(
		db,
		userId,
		label,
		tokenPrefix,
		tokenHash,
		[...CHANNEL_KEY_SCOPES],
		channelId,
	);
	return {
		id: dto.id,
		channelId,
		label: dto.label,
		tokenPrefix: dto.tokenPrefix,
		createdAtMs: dto.createdAtMs,
		lastUsedAtMs: dto.lastUsedAtMs,
	};
}

export async function revokeChannelKey(
	db: D1Database,
	userId: string,
	channelId: number,
	keyId: number,
): Promise<boolean> {
	const now = Date.now();
	const result = await db
		.prepare(
			`UPDATE push_tokens SET revoked_at_ms = ?
			 WHERE id = ? AND user_id = ? AND channel_id = ? AND revoked_at_ms IS NULL`,
		)
		.bind(now, keyId, userId, channelId)
		.run();
	return (result.meta.changes ?? 0) > 0;
}
