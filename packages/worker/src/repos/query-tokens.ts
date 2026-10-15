import type { ManagedToken, QueryTokenInput } from "@xray/shared";

const VALID_ACCESS = `
 (SELECT COUNT(*) FROM watchlists WHERE user_id = ? AND id IN (SELECT value FROM json_each(?, '$.watchlistIds'))) = json_array_length(?, '$.watchlistIds')
 AND (SELECT COUNT(*) FROM channels WHERE user_id = ? AND id IN (SELECT value FROM json_each(?, '$.channelIds'))) = json_array_length(?, '$.channelIds')`;

export async function createQueryToken(
	db: D1Database,
	userId: string,
	input: QueryTokenInput,
	minted: { tokenPrefix: string; tokenHash: string },
): Promise<ManagedToken | null> {
	const access = JSON.stringify(input.access);
	const cursorKey = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
	const now = Date.now();
	const row = await db
		.prepare(`INSERT INTO push_tokens
 (user_id, label, token_prefix, token_hash, scopes, created_at_ms, query_access, query_cursor_key)
 SELECT ?, ?, ?, ?, '["query:read"]', ?, ?, ? WHERE ${VALID_ACCESS} RETURNING id`)
		.bind(
			userId,
			input.label,
			minted.tokenPrefix,
			minted.tokenHash,
			now,
			access,
			cursorKey,
			userId,
			access,
			access,
			userId,
			access,
			access,
		)
		.first<{ id: number }>();
	if (!row) return null;
	return {
		id: row.id,
		kind: "query",
		queryAccess: input.access,
		label: input.label,
		tokenPrefix: minted.tokenPrefix,
		scopes: ["query:read"],
		createdAtMs: now,
		lastUsedAtMs: null,
		channelId: null,
		channelName: null,
		tags: [],
	};
}

export async function updateQueryToken(
	db: D1Database,
	userId: string,
	id: number,
	input: QueryTokenInput,
): Promise<boolean> {
	const access = JSON.stringify(input.access);
	const result = await db
		.prepare(`UPDATE push_tokens SET label = ?, query_access = ?
 WHERE id = ? AND user_id = ? AND revoked_at_ms IS NULL AND query_access IS NOT NULL
 AND ${VALID_ACCESS}`)
		.bind(input.label, access, id, userId, userId, access, access, userId, access, access)
		.run();
	return result.meta.changes > 0;
}

export async function revokeQueryToken(
	db: D1Database,
	userId: string,
	id: number,
): Promise<boolean> {
	const result = await db
		.prepare(`UPDATE push_tokens SET revoked_at_ms = ?
 WHERE id = ? AND user_id = ? AND revoked_at_ms IS NULL AND query_access IS NOT NULL`)
		.bind(Date.now(), id, userId)
		.run();
	return result.meta.changes > 0;
}
