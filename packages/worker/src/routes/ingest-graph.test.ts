import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import { mintPushToken, sha256Hex } from "../lib/push-token-crypto.js";
import type { AppEnv } from "../types.js";
import { ingestGraphRoute } from "./ingest-graph.js";

function makeGraphDb(opts: {
	tokenHash: string;
	prefix: string;
	scopes: string[];
	watchlists?: Array<{ id: number; name: string; user_id?: string }>;
	members?: Array<{
		id: number;
		watchlist_id: number;
		source_type: string;
		handle: string;
		user_id?: string;
	}>;
}) {
	return {
		prepare(sql: string) {
			const binds: unknown[] = [];
			const stmt = {
				bind(...a: unknown[]) {
					binds.push(...a);
					return stmt;
				},
				async first<T>() {
					if (sql.includes("FROM push_tokens")) {
						return {
							id: 3,
							user_id: "u1",
							token_prefix: opts.prefix,
							token_hash: opts.tokenHash,
							label: "t",
							scopes: JSON.stringify(opts.scopes),
							created_at_ms: 1,
							last_used_at_ms: null,
							revoked_at_ms: null,
						} as T;
					}
					return null;
				},
				async all<T>() {
					if (sql.includes("FROM watchlists")) {
						return {
							results: (opts.watchlists ?? []).map((w) => ({
								...w,
								user_id: w.user_id ?? "u1",
								description: null,
								icon: "eye",
								translate_enabled: 1,
								created_at_ms: 1,
								member_count: 0,
							})) as T[],
						};
					}
					if (sql.includes("FROM watchlist_members")) {
						const wlId = binds[1];
						const rows = (opts.members ?? []).filter((m) =>
							wlId === undefined ? true : m.watchlist_id === wlId,
						);
						return {
							results: rows.map((m) => ({
								...m,
								user_id: m.user_id ?? "u1",
								external_author_id: null,
								display_name: null,
								note: null,
								added_at_ms: 1,
							})) as T[],
						};
					}
					return { results: [] as T[] };
				},
				async run() {
					return { meta: { changes: 1 } };
				},
			};
			return stmt;
		},
	} as unknown as D1Database;
}

async function appWith(db: D1Database, rl: { success: boolean } = { success: true }) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		// @ts-expect-error test
		c.env = {
			DB: db,
			ENVIRONMENT: "test",
			XRAY_INGEST_RL: { limit: async () => rl },
		};
		return next();
	});
	app.get("/api/v1/ingest/graph", ingestGraphRoute);
	return app;
}

describe("ingestGraphRoute", () => {
	test("401 without bearer", async () => {
		const minted = await mintPushToken();
		const hash = await sha256Hex(minted.plaintext);
		const app = await appWith(
			makeGraphDb({ tokenHash: hash, prefix: minted.tokenPrefix, scopes: ["ingest:read"] }),
		);
		expect((await app.request("/api/v1/ingest/graph")).status).toBe(401);
	});

	test("403 when token lacks ingest:read", async () => {
		const minted = await mintPushToken();
		const hash = await sha256Hex(minted.plaintext);
		const app = await appWith(
			makeGraphDb({
				tokenHash: hash,
				prefix: minted.tokenPrefix,
				scopes: ["ingest:push"],
			}),
		);
		const res = await app.request("/api/v1/ingest/graph", {
			headers: { authorization: `Bearer ${minted.plaintext}` },
		});
		expect(res.status).toBe(403);
	});

	test("429 when x-test-force-rl in test env", async () => {
		const minted = await mintPushToken();
		const hash = await sha256Hex(minted.plaintext);
		const app = await appWith(
			makeGraphDb({
				tokenHash: hash,
				prefix: minted.tokenPrefix,
				scopes: ["ingest:read"],
			}),
		);
		const res = await app.request("/api/v1/ingest/graph", {
			headers: {
				authorization: `Bearer ${minted.plaintext}`,
				"x-test-force-rl": "1",
			},
		});
		expect(res.status).toBe(429);
	});

	test("429 when rate limited", async () => {
		const minted = await mintPushToken();
		const hash = await sha256Hex(minted.plaintext);
		const app = await appWith(
			makeGraphDb({
				tokenHash: hash,
				prefix: minted.tokenPrefix,
				scopes: ["ingest:read"],
			}),
			{ success: false },
		);
		const res = await app.request("/api/v1/ingest/graph", {
			headers: { authorization: `Bearer ${minted.plaintext}` },
		});
		expect(res.status).toBe(429);
	});

	test("200 empty graph", async () => {
		const minted = await mintPushToken();
		const hash = await sha256Hex(minted.plaintext);
		const app = await appWith(
			makeGraphDb({
				tokenHash: hash,
				prefix: minted.tokenPrefix,
				scopes: ["ingest:read", "ingest:push"],
			}),
		);
		const res = await app.request("/api/v1/ingest/graph", {
			headers: { authorization: `Bearer ${minted.plaintext}` },
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ watchlists: [] });
	});

	test("200 owner x.com members only", async () => {
		const minted = await mintPushToken();
		const hash = await sha256Hex(minted.plaintext);
		const app = await appWith(
			makeGraphDb({
				tokenHash: hash,
				prefix: minted.tokenPrefix,
				scopes: ["ingest:read"],
				watchlists: [
					{ id: 1, name: "AI" },
					{ id: 2, name: "Empty" },
				],
				members: [
					{ id: 1, watchlist_id: 1, source_type: "x.com", handle: "sama" },
					{ id: 2, watchlist_id: 1, source_type: "custom", handle: "note" },
				],
			}),
		);
		const res = await app.request("/api/v1/ingest/graph", {
			headers: { authorization: `Bearer ${minted.plaintext}` },
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			watchlists: [
				{ id: 1, name: "AI", members: [{ handle: "sama", sourceType: "x.com" }] },
				{ id: 2, name: "Empty", members: [] },
			],
		});
	});
});
