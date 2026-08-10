import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import { mintPushToken, sha256Hex } from "../lib/push-token-crypto.js";
import type { AppEnv } from "../types.js";
import { ingestPushRoute } from "./ingest-push.js";

function makeIngestDb(tokenHash: string, prefix: string) {
	const members = [
		{
			id: 1,
			source_type: "x.com",
			external_author_id: "u1",
			handle: "alice",
		},
	];
	const items: Array<Record<string, unknown>> = [];
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
							id: 9,
							user_id: "u1",
							token_prefix: prefix,
							token_hash: tokenHash,
							label: "t",
							scopes: JSON.stringify(["ingest:push"]),
							created_at_ms: Date.now(),
							last_used_at_ms: null,
							revoked_at_ms: null,
						} as T;
					}
					if (sql.includes("FROM watchlists")) {
						return {
							id: 1,
							user_id: "u1",
							name: "WL",
							description: null,
							icon: "eye",
							translate_enabled: 0,
							created_at_ms: Date.now(),
							member_count: 1,
						} as T;
					}
					if (sql.includes("FROM settings")) {
						return { value: "24" } as T;
					}
					return null;
				},
				async all<T>() {
					if (sql.includes("FROM watchlist_members")) {
						return { results: members as T[] };
					}
					return { results: [] as T[] };
				},
				async run() {
					if (sql.includes("INSERT INTO items") || sql.includes("INSERT OR IGNORE INTO items")) {
						items.push({ binds: [...binds] });
						return { meta: { changes: 1, last_row_id: items.length } };
					}
					return { meta: { changes: 1 } };
				},
			};
			return stmt;
		},
	} as unknown as D1Database;
}

describe("ingestPushRoute", () => {
	test("rejects missing token and oversized content-length", async () => {
		const app = new Hono<AppEnv>();
		app.use("*", async (c, next) => {
			// @ts-expect-error test
			c.env = { DB: makeIngestDb("x", "p"), ENVIRONMENT: "test" };
			return next();
		});
		app.post("/api/v1/ingest/push", ingestPushRoute);
		expect((await app.request("/api/v1/ingest/push", { method: "POST" })).status).toBe(401);
		expect(
			(
				await app.request("/api/v1/ingest/push", {
					method: "POST",
					headers: { "content-length": String(2_000_000) },
				})
			).status,
		).toBe(413);
	});

	test("accepts canonical x.com item", async () => {
		const minted = await mintPushToken();
		const hash = await sha256Hex(minted.plaintext);
		const app = new Hono<AppEnv>();
		app.use("*", async (c, next) => {
			// @ts-expect-error test
			c.env = {
				DB: makeIngestDb(hash, minted.tokenPrefix),
				ENVIRONMENT: "test",
				XRAY_INGEST_RL: { limit: async () => ({ success: true }) },
			};
			return next();
		});
		app.post("/api/v1/ingest/push", ingestPushRoute);

		const body = {
			watchlist_id: 1,
			items: [
				{
					source_type: "x.com",
					external_id: "tw1",
					created_at: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
					body: {
						kind: "x.post",
						tweet: { id: "tw1", text: "hello from x", author_id: "u1" },
						includes: { users: [{ id: "u1", username: "alice" }] },
					},
				},
			],
		};
		const res = await app.request("/api/v1/ingest/push", {
			method: "POST",
			headers: {
				authorization: `Bearer ${minted.plaintext}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(body),
		});
		expect(res.status).toBe(200);
		const json = (await res.json()) as { ok: boolean; accepted: number };
		expect(json.ok).toBe(true);
		expect(json.accepted).toBe(1);
	});

	test("schema mismatch rejects item", async () => {
		const minted = await mintPushToken();
		const hash = await sha256Hex(minted.plaintext);
		const app = new Hono<AppEnv>();
		app.use("*", async (c, next) => {
			// @ts-expect-error test
			c.env = {
				DB: makeIngestDb(hash, minted.tokenPrefix),
				ENVIRONMENT: "test",
				XRAY_INGEST_RL: { limit: async () => ({ success: true }) },
			};
			return next();
		});
		app.post("/api/v1/ingest/push", ingestPushRoute);
		const res = await app.request("/api/v1/ingest/push", {
			method: "POST",
			headers: {
				authorization: `Bearer ${minted.plaintext}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				watchlist_id: 1,
				items: [{ source_type: "custom", external_id: "c1", created_at: "bad", body: {} }],
			}),
		});
		expect(res.status).toBe(200);
		const json = (await res.json()) as { rejected: number; errors: unknown[] };
		expect(json.rejected).toBe(1);
	});
});

test("rejects future created_at and accepts custom", async () => {
	const minted = await mintPushToken();
	const hash = await sha256Hex(minted.plaintext);
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		// @ts-expect-error test
		c.env = {
			DB: makeIngestDb(hash, minted.tokenPrefix),
			ENVIRONMENT: "test",
			XRAY_INGEST_RL: { limit: async () => ({ success: true }) },
		};
		return next();
	});
	app.post("/api/v1/ingest/push", ingestPushRoute);
	const future = new Date(Date.now() + 3600_000).toISOString().replace(/\.\d{3}Z$/, ".000Z");
	const res = await app.request("/api/v1/ingest/push", {
		method: "POST",
		headers: {
			authorization: `Bearer ${minted.plaintext}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({
			watchlist_id: 1,
			items: [
				{
					source_type: "x.com",
					external_id: "fut",
					created_at: future,
					body: { kind: "x.post", tweet: { id: "fut", text: "future" } },
				},
				{
					source_type: "custom",
					external_id: "c-ok",
					created_at: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
					body: { kind: "custom", text: "custom body", title: "T" },
				},
			],
		}),
	});
	expect(res.status).toBe(200);
	const json = (await res.json()) as { accepted: number; rejected: number };
	expect(json.rejected).toBeGreaterThanOrEqual(1);
	expect(json.accepted).toBeGreaterThanOrEqual(1);
});
