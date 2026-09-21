import { describe, expect, test } from "vitest";
import {
	CHANNEL_KEY_SCOPES,
	createChannelKey,
	createPushToken,
	findActiveTokenByHash,
	listChannelKeys,
	listPushTokens,
	revokeChannelKey,
	revokePushToken,
	touchPushToken,
} from "./push-tokens.js";

function memDb() {
	const rows: Array<Record<string, unknown>> = [];
	let seq = 1;
	return {
		prepare(sql: string) {
			const binds: unknown[] = [];
			const stmt = {
				bind(...a: unknown[]) {
					binds.push(...a);
					return stmt;
				},
				async first<T>() {
					if (sql.includes("token_hash")) {
						const [hash] = binds as [string];
						return (
							(rows.find((r) => r.token_hash === hash && r.revoked_at_ms == null) as T) ?? null
						);
					}
					return null;
				},
				async all<T>() {
					const [userId, channelId] = binds as [string, number?];
					if (sql.includes("channel_id = ?")) {
						return {
							results: rows.filter(
								(r) =>
									r.user_id === userId && r.channel_id === channelId && r.revoked_at_ms == null,
							) as T[],
						};
					}
					return {
						results: rows.filter(
							(r) => r.user_id === userId && r.revoked_at_ms == null && r.channel_id == null,
						) as T[],
					};
				},
				async run() {
					if (sql.includes("INSERT INTO push_tokens")) {
						const [user_id, token_prefix, token_hash, label, scopes, created_at_ms, channel_id] =
							binds as [string, string, string, string, string, number, number | null];
						const id = seq++;
						rows.push({
							id,
							user_id,
							token_prefix,
							token_hash,
							label,
							scopes,
							created_at_ms,
							last_used_at_ms: null,
							revoked_at_ms: null,
							channel_id: channel_id ?? null,
						});
						return { meta: { changes: 1, last_row_id: id } };
					}
					if (sql.includes("SET revoked_at_ms")) {
						const [now, id, userId] = binds as [number, number, string];
						const r = rows.find(
							(x) => x.id === id && x.user_id === userId && x.revoked_at_ms == null,
						);
						if (r) r.revoked_at_ms = now;
						return { meta: { changes: r ? 1 : 0 } };
					}
					if (sql.includes("SET last_used_at_ms")) {
						const [now, id] = binds as [number, number];
						const r = rows.find((x) => x.id === id);
						if (r) r.last_used_at_ms = now;
						return { meta: { changes: 1 } };
					}
					return { meta: { changes: 0 } };
				},
			};
			return stmt;
		},
	} as unknown as D1Database;
}

describe("push-tokens repo", () => {
	test("create list revoke touch", async () => {
		const db = memDb();
		const t = await createPushToken(db, "u1", "cli", "abcd1234", "hash1");
		expect(t.tokenPrefix).toBe("abcd1234");
		expect(await listPushTokens(db, "u1")).toHaveLength(1);
		expect((await findActiveTokenByHash(db, "hash1"))?.id).toBe(t.id);
		await touchPushToken(db, t.id);
		expect(await revokePushToken(db, "u1", t.id)).toBe(true);
		expect(await listPushTokens(db, "u1")).toHaveLength(0);
	});

	test("channel keys are excluded from watchlist token list and scoped to their channel", async () => {
		const db = memDb();
		await createPushToken(db, "u1", "watchlist", "aaaa1111", "hash-wl");
		const key = await createChannelKey(db, "u1", 3, "Research Agent", "bbbb2222", "hash-ch");
		expect(key).toMatchObject({ channelId: 3, label: "Research Agent", tokenPrefix: "bbbb2222" });
		expect(JSON.parse(String(await tokenScopes(db, "hash-ch")))).toEqual([...CHANNEL_KEY_SCOPES]);
		const listed = await listPushTokens(db, "u1");
		expect(listed).toHaveLength(1);
		expect(listed[0]?.label).toBe("watchlist");
		const keys = await listChannelKeys(db, "u1", 3);
		expect(keys).toHaveLength(1);
		expect(keys[0]).toMatchObject({ id: key.id, channelId: 3, label: "Research Agent" });
		expect(await listChannelKeys(db, "u1", 4)).toHaveLength(0);
		expect(await listChannelKeys(db, "u2", 3)).toHaveLength(0);
		expect(await revokeChannelKey(db, "u1", 3, key.id)).toBe(true);
		expect(await revokeChannelKey(db, "u1", 3, key.id)).toBe(false);
		expect(await revokeChannelKey(db, "u1", 4, key.id + 1)).toBe(false);
		expect(await listChannelKeys(db, "u1", 3)).toHaveLength(0);
	});

	test("degraded D1 responses fall back safely", async () => {
		const nullResults = {
			prepare() {
				const stmt = {
					bind() {
						return stmt;
					},
					async all<T>() {
						return { results: null as T[] };
					},
					async run() {
						return { meta: {} };
					},
				};
				return stmt;
			},
		} as unknown as D1Database;
		expect(await listChannelKeys(nullResults, "u1", 1)).toEqual([]);
		expect(await revokeChannelKey(nullResults, "u1", 1, 2)).toBe(false);
	});
});

async function tokenScopes(db: D1Database, hash: string): Promise<string> {
	const row = await findActiveTokenByHash(db, hash);
	return (row as { scopes: string }).scopes;
}
