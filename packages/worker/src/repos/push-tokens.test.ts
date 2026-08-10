import { describe, expect, test } from "vitest";
import {
	createPushToken,
	findActiveTokenByHash,
	listPushTokens,
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
					const [userId] = binds as [string];
					return {
						results: rows.filter((r) => r.user_id === userId && r.revoked_at_ms == null) as T[],
					};
				},
				async run() {
					if (sql.includes("INSERT INTO push_tokens")) {
						const [user_id, token_prefix, token_hash, label, scopes, created_at_ms] = binds as [
							string,
							string,
							string,
							string,
							string,
							number,
						];
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
});
