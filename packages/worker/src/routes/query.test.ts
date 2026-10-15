import type { ManagedToken, QueryPage, QuerySources, QueryTokenAccess } from "@xray/shared";
import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import app from "../index.js";
import { sha256Hex } from "../lib/push-token-crypto.js";
import { encodeQueryCursor, type QueryCursorContext } from "../lib/query-cursor.js";
import { listQuerySources, queryContent } from "../repos/query.js";
import { identityHeaders, localIdentityBindings } from "../test/signed-identity.js";
import { createSqliteD1 } from "../test/sqlite-d1.js";
import type { AppEnv } from "../types.js";
import {
	createQueryTokenRoute,
	patchQueryTokenRoute,
	revokeQueryTokenRoute,
} from "./query-tokens.js";

const all: QueryTokenAccess = { mode: "all", watchlistIds: [], channelIds: [] };
function setup() {
	const db = createSqliteD1();
	const env: AppEnv["Bindings"] = {
		DB: db,
		ENVIRONMENT: "test",
		...localIdentityBindings,
		XRAY_SECRETS_KEK: "0123456789abcdef0123456789abcdef",
	};
	async function call(
		path: string,
		method = "GET",
		body?: unknown,
		actor: "a" | "b" = "a",
		extra: Record<string, string> = {},
	) {
		const response = await app.request(
			path,
			{
				method,
				headers: {
					host: "127.0.0.1",
					origin: "http://localhost:7007",
					"content-type": "application/json",
					...identityHeaders(actor),
					...extra,
				},
				body: body === undefined ? undefined : JSON.stringify(body),
			},
			env,
		);
		const json = (await response.json()) as { data: unknown; error?: string };
		return { status: response.status, data: json.data, json };
	}
	async function source(actor: "a" | "b" = "a") {
		const w = (await call("/api/watchlists", "POST", { name: "Watch" }, actor)).data as {
			id: number;
		};
		const c = (await call("/api/channels", "POST", { name: "Channel" }, actor)).data as {
			id: number;
		};
		const producer = (await call("/api/push-tokens", "POST", { label: "Producer" }, actor))
			.data as { id: number; token: string };
		const key = (await call(`/api/channels/${c.id}/keys`, "POST", { label: "Reports" }, actor))
			.data as { id: number; token: string };
		const user = (
			await db
				.prepare("SELECT user_id FROM watchlists WHERE id = ?")
				.bind(w.id)
				.first<{ user_id: string }>()
		)?.user_id;
		for (const [i, time] of [
			[1, Date.parse("2026-10-14T00:00:00Z")],
			[2, Date.parse("2026-10-14T01:00:00Z")],
			[3, Date.parse("2026-10-15T00:00:00Z")],
		])
			await db
				.prepare(
					`INSERT INTO items (user_id,watchlist_id,source_type,external_id,text,created_at_ms,ingested_at_ms,payload_json) VALUES (?,?,'custom',?,'Post',?,1,?)`,
				)
				.bind(user, w.id, `p-${i}`, time, i === 3 ? "broken" : '{"body":{"text":"Post"}}')
				.run();
		for (const [i, date] of [
			[1, "2026-10-14"],
			[2, "2026-10-14"],
			[3, "2026-10-15"],
		])
			await db
				.prepare(
					`INSERT INTO channel_articles (user_id,channel_id,external_id,title,report_date,markdown,source_key_id,source_label,created_at_ms) VALUES (?,?,?,'Report',?,'## Markdown',?,'Reports',1)`,
				)
				.bind(user, c.id, `a-${i}`, date, key.id)
				.run();
		return { w, c, producer, key, user };
	}
	async function mint(access = all, actor: "a" | "b" = "a") {
		const res = await call("/api/query-tokens", "POST", { label: "Reader", access }, actor);
		expect(res.status).toBe(201);
		return res.data as ManagedToken & { token: string };
	}
	async function query(token: string, params = "", extra: Record<string, string> = {}) {
		return call(`/api/v1/query${params}`, "GET", undefined, "a", {
			host: "xray-ingest.worker.hexly.ai",
			authorization: `Bearer ${token}`,
			...extra,
		});
	}
	return { db, env, call, source, mint, query };
}

describe("read-only query tokens", () => {
	test("SQL rechecks stale authenticated grants after edits or revocation", async () => {
		const s = setup();
		const a = await s.source();
		const token = await s.mint();
		const row = await s.db
			.prepare("SELECT user_id, query_access, query_cursor_key FROM push_tokens WHERE id = ?")
			.bind(token.id)
			.first<{ user_id: string; query_access: string; query_cursor_key: string }>();
		if (!row) throw new Error("missing test credential");
		const context: QueryCursorContext = {
			tokenId: token.id,
			accessJson: row.query_access,
			key: row.query_cursor_key,
			query: {
				source: { kind: "watchlist", id: a.w.id },
				startMs: null,
				endMs: null,
				order: "desc",
				limit: 100,
				cursor: null,
			},
		};
		for (const change of ["edit", "revoke"]) {
			if (change === "edit")
				await s.call(`/api/query-tokens/${token.id}`, "PATCH", {
					label: "Restricted",
					access: { mode: "selected", watchlistIds: [], channelIds: [a.c.id] },
				});
			else {
				await s.call(`/api/query-tokens/${token.id}`, "PATCH", { label: "Restored", access: all });
				await s.call(`/api/query-tokens/${token.id}`, "DELETE");
			}
			expect(await queryContent(s.db, row.user_id, context.query, null, context)).toEqual({
				items: [],
				nextCursor: null,
			});
			expect(await listQuerySources(s.db, row.user_id, all, token.id, context.accessJson)).toEqual({
				watchlists: [],
				channels: [],
			});
		}
	});
	test("queries one source with stable cursors in both directions, without side effects", async () => {
		const s = setup();
		const first = await s.source();
		await s.source();
		const foreign = await s.source("b");
		const token = await s.mint();
		for (const selector of [`watchlistId=${first.w.id}`, `channelId=${first.c.id}`]) {
			const full = (await s.query(token.token, `?${selector}`)).data as QueryPage;
			expect(full.items).toHaveLength(3);
			for (const item of full.items) {
				if (selector.startsWith("watchlist"))
					expect(item).toMatchObject({ kind: "post", post: { watchlistId: first.w.id } });
				else
					expect(item).toMatchObject({
						kind: "article",
						article: { channelId: first.c.id, markdown: "## Markdown" },
					});
			}
			for (const order of ["asc", "desc"]) {
				const collected: QueryPage["items"] = [];
				let cursor: string | null = null;
				do {
					const r = await s.query(
						token.token,
						`?${selector}&order=${order}&limit=1${cursor ? `&cursor=${cursor}` : ""}`,
					);
					expect(r.status).toBe(200);
					const page = r.data as QueryPage;
					collected.push(...page.items);
					cursor = page.nextCursor;
				} while (cursor);
				expect(collected).toEqual(order === "desc" ? full.items : [...full.items].reverse());
			}
		}
		expect(
			((await s.query(token.token, `?watchlistId=${first.w.id}`)).data as QueryPage).items[0],
		).toMatchObject({ post: { payload: null } });
		for (const params of [
			`?watchlistId=${foreign.w.id}`,
			`?channelId=${foreign.c.id}`,
			"?watchlistId=9999",
			"?channelId=9999",
		])
			expect((await s.query(token.token, params)).status).toBe(404);
		expect(
			(
				await s.db
					.prepare("SELECT COUNT(*) AS n FROM channel_articles WHERE is_read = 1")
					.first<{ n: number }>()
			)?.n,
		).toBe(0);
		expect(
			(await s.db.prepare("SELECT COUNT(*) AS n FROM ingest_logs").first<{ n: number }>())?.n,
		).toBe(0);
		expect(
			(
				await s.db
					.prepare("SELECT COUNT(*) AS n FROM items WHERE ai_status != 'not_requested'")
					.first<{ n: number }>()
			)?.n,
		).toBe(0);
	});
	test("filters UTC boundaries within the requested authorized source before paging", async () => {
		const s = setup();
		const a = await s.source();
		const b = await s.source();
		const token = await s.mint({
			mode: "selected",
			watchlistIds: [a.w.id, b.w.id],
			channelIds: [a.c.id],
		});
		for (const selector of [
			`watchlistId=${a.w.id}`,
			`watchlistId=${b.w.id}`,
			`channelId=${a.c.id}`,
		]) {
			const result = await s.query(
				token.token,
				`?${selector}&start=2026-10-14T00:00:00Z&end=2026-10-15T00:00:00Z&order=asc`,
			);
			expect(result.status).toBe(200);
			const page = result.data as QueryPage;
			expect(page.items).toHaveLength(2);
			expect(
				page.items.every(
					(i) =>
						i.timeMs >= Date.parse("2026-10-14T00:00:00Z") &&
						i.timeMs < Date.parse("2026-10-15T00:00:00Z"),
				),
			).toBe(true);
			expect(
				(
					await s.query(
						token.token,
						`?${selector}&start=2026-10-14T00:00:00.001Z&end=2026-10-14T01:00:00Z`,
					)
				).data,
			).toEqual({ items: [], nextCursor: null });
			expect((await s.query(token.token, `?${selector}&start=2027-01-01T00:00:00Z`)).data).toEqual({
				items: [],
				nextCursor: null,
			});
		}
		expect((await s.query(token.token, `?channelId=${b.c.id}`)).status).toBe(403);
	});
	test("discovers only authorized live sources, including future all grants, never broadening deleted selections", async () => {
		const s = setup();
		const account = await s.mint();
		expect((await s.query(account.token, "/sources")).data).toEqual({
			watchlists: [],
			channels: [],
		});
		const a = await s.source();
		const selected = await s.mint({
			mode: "selected",
			watchlistIds: [a.w.id],
			channelIds: [a.c.id],
		});
		const b = await s.source();
		await s.source("b");
		const catalog = (await s.query(account.token, "/sources")).data as QuerySources;
		expect(catalog.watchlists).toEqual([
			{ id: a.w.id, name: "Watch" },
			{ id: b.w.id, name: "Watch" },
		]);
		expect(catalog.channels).toEqual([
			{ id: a.c.id, name: "Channel" },
			{ id: b.c.id, name: "Channel" },
		]);
		expect((await s.query(selected.token, "/sources")).data).toEqual({
			watchlists: [{ id: a.w.id, name: "Watch" }],
			channels: [{ id: a.c.id, name: "Channel" }],
		});
		expect(
			((await s.query(account.token, `?watchlistId=${b.w.id}`)).data as QueryPage).items,
		).toHaveLength(3);
		expect(
			((await s.query(account.token, `?channelId=${b.c.id}`)).data as QueryPage).items,
		).toHaveLength(3);
		for (const selector of [`watchlistId=${b.w.id}`, `channelId=${b.c.id}`])
			expect((await s.query(selected.token, `?${selector}`)).status).toBe(403);
		await s.call(`/api/watchlists/${a.w.id}`, "DELETE");
		await s.call(`/api/channels/${a.c.id}`, "DELETE");
		expect((await s.query(selected.token, "/sources")).data).toEqual({
			watchlists: [],
			channels: [],
		});
		for (const selector of [`watchlistId=${a.w.id}`, `channelId=${a.c.id}`])
			expect((await s.query(selected.token, `?${selector}`)).status).toBe(404);
		const metadata = (await s.call("/api/tokens")).data as ManagedToken[];
		expect(metadata.find((t) => t.id === selected.id)).toMatchObject({
			queryAccess: { mode: "selected", watchlistIds: [a.w.id], channelIds: [a.c.id] },
		});
	});
	test("edits grants atomically with owner checks and keeps credentials", async () => {
		const s = setup();
		const a = await s.source();
		const foreign = await s.source("b");
		const token = await s.mint();
		const input = {
			label: "Renamed",
			access: { mode: "selected", watchlistIds: [a.w.id], channelIds: [] },
		};
		expect((await s.call(`/api/query-tokens/${token.id}`, "PATCH", input)).data).toEqual({
			updated: true,
		});
		expect(((await s.query(token.token, "?watchlistId=1")).data as QueryPage).items).toHaveLength(
			3,
		);
		const before = (await s.call("/api/tokens")).data;
		expect(
			(
				await s.call(`/api/query-tokens/${token.id}`, "PATCH", {
					label: "Hijack",
					access: { ...input.access, channelIds: [foreign.c.id] },
				})
			).status,
		).toBe(404);
		expect((await s.call(`/api/query-tokens/${token.id}`, "PATCH", input, "b")).status).toBe(404);
		expect((await s.call(`/api/query-tokens/${token.id}`, "DELETE", undefined, "b")).status).toBe(
			404,
		);
		expect((await s.call("/api/tokens")).data).toEqual(before);
		expect(
			(
				await s.call("/api/query-tokens", "POST", {
					label: "Foreign",
					access: { ...input.access, watchlistIds: [foreign.w.id] },
				})
			).status,
		).toBe(400);
		expect(JSON.stringify(before)).not.toContain(token.token);
		expect(JSON.stringify(before)).not.toContain("token_hash");
	});
	test("isolates producer kinds, browser management and query host", async () => {
		const s = setup();
		const a = await s.source();
		const token = await s.mint();
		for (const credential of [a.producer.token, a.key.token]) {
			expect((await s.query(credential)).status).toBe(403);
			expect((await s.query(credential, "/sources")).status).toBe(403);
		}
		for (const host of ["xray.hexly.ai", "unknown.example"])
			expect((await s.query(token.token, "/sources", { host })).status).toBe(404);
		expect((await s.query("invalid-token", "/sources")).status).toBe(401);
		for (const [path, method] of [
			["/api/v1/ingest/graph", "GET"],
			["/api/v1/ingest/push", "POST"],
			["/api/v1/ingest/articles", "POST"],
		])
			expect(
				(
					await s.call(path, method, method === "POST" ? {} : undefined, "a", {
						host: "xray-ingest.worker.hexly.ai",
						authorization: `Bearer ${token.token}`,
					})
				).status,
			).toBe(403);
		for (const host of ["xray.hexly.ai", "unknown.example"])
			expect((await s.query(token.token, "", { host })).status).toBe(404);
		expect((await s.query(token.token, "?watchlistId=1", { host: "127.0.0.1" })).status).toBe(200);
		for (const method of ["PATCH", "DELETE"])
			expect(
				(
					await s.call(
						`/api/push-tokens/${token.id}`,
						method,
						method === "PATCH" ? { label: "Wrong" } : undefined,
					)
				).status,
			).toBe(404);
		expect(
			((await s.call("/api/push-tokens")).data as { id: number }[]).map((t) => t.id),
		).not.toContain(token.id);
		for (const id of [a.producer.id, a.key.id]) {
			expect(
				(await s.call(`/api/query-tokens/${id}`, "PATCH", { label: "wrong", access: all })).status,
			).toBe(404);
			expect((await s.call(`/api/query-tokens/${id}`, "DELETE")).status).toBe(404);
		}
		for (const [path, method] of [
			["/api/query-tokens", "POST"],
			[`/api/query-tokens/${token.id}`, "PATCH"],
			[`/api/query-tokens/${token.id}`, "DELETE"],
		]) {
			expect(
				(
					await s.call(
						path,
						method,
						method === "DELETE" ? undefined : { label: "wrong", access: all },
						"a",
						{ host: "xray-ingest.worker.hexly.ai" },
					)
				).status,
			).toBe(404);
			expect(
				(
					await s.call(
						path,
						method,
						method === "DELETE" ? undefined : { label: "wrong", access: all },
						"a",
						{ host: "xray.hexly.ai", origin: "https://evil.example" },
					)
				).status,
			).toBe(403);
		}
	});
	test("rejects invalid inputs, cursors, changed context and revoked credentials", async () => {
		const s = setup();
		await s.source();
		const token = await s.mint();
		const another = await s.mint();
		const cursor = ((await s.query(token.token, "?watchlistId=1&limit=1")).data as QueryPage)
			.nextCursor;
		expect(cursor).toBeTruthy();
		for (const params of [
			"",
			"?limit=1",
			"?watchlistId=1&channelId=1",
			"?watchlistId=1&watchlistId=1",
			"?watchlistId=1&order=asc&order=desc",
			"?watchlistId=0",
			"?channelId=-1",
			`?channelId=1&cursor=${cursor}`,
			"?watchlistId=1&cursor=garbage",
			`?watchlistId=1&cursor=${cursor}&order=asc`,
			`?watchlistId=1&cursor=${cursor}&start=2026-01-01T00:00:00Z`,
			"?watchlistId=1&limit=101",
			"?watchlistId=1&tenant=other",
		])
			expect((await s.query(token.token, params)).status).toBe(400);
		expect((await s.query(another.token, `?watchlistId=1&cursor=${cursor}`)).status).toBe(400);
		await s.call(`/api/query-tokens/${token.id}`, "PATCH", {
			label: "Changed",
			access: {
				mode: "selected",
				watchlistIds: [1],
				channelIds: [((await s.call("/api/channels")).data as { id: number }[])[0]?.id],
			},
		});
		expect((await s.query(token.token, `?watchlistId=1&cursor=${cursor}`)).status).toBe(400);
		for (const method of ["PATCH", "DELETE"])
			expect(
				(
					await s.call(
						"/api/query-tokens/0",
						method,
						method === "PATCH" ? { label: "x", access: all } : undefined,
					)
				).status,
			).toBe(400);
		expect((await s.call("/api/query-tokens", "POST", null)).status).toBe(400);
		expect((await s.call(`/api/query-tokens/${token.id}`, "PATCH", {})).status).toBe(400);
		expect((await s.call(`/api/query-tokens/${token.id}`, "DELETE")).data).toEqual({
			revoked: true,
		});
		expect((await s.query(token.token)).status).toBe(401);
		expect((await s.call(`/api/query-tokens/${token.id}`, "DELETE")).status).toBe(404);
		expect(
			(await s.call(`/api/query-tokens/${token.id}`, "PATCH", { label: "dead", access: all }))
				.status,
		).toBe(404);
		expect((await s.query("invalid-token")).status).toBe(401);
	});
	test("fails closed for malformed stored grants, scopes and kind conflicts", async () => {
		const s = setup();
		const token = await s.mint();
		for (const raw of ['"all"', "{}"]) {
			await s.db
				.prepare("UPDATE push_tokens SET query_access = ? WHERE id = ?")
				.bind(raw, token.id)
				.run();
			expect((await s.query(token.token)).status).toBe(403);
		}
		await s.db
			.prepare(
				'UPDATE push_tokens SET scopes = \'["query:read","ingest:read"]\', query_access = ? WHERE id = ?',
			)
			.bind(JSON.stringify(all), token.id)
			.run();
		expect((await s.query(token.token)).status).toBe(403);
		expect(
			(
				await s.call("/api/v1/ingest/graph", "GET", undefined, "a", {
					host: "xray-ingest.worker.hexly.ai",
					authorization: `Bearer ${token.token}`,
				})
			).status,
		).toBe(403);
	});
	test("bearer holders cannot derive cursor signing keys or retrieve them through metadata", async () => {
		const s = setup();
		await s.source();
		const token = await s.mint();
		const row = await s.db
			.prepare("SELECT query_cursor_key FROM push_tokens WHERE id = ?")
			.bind(token.id)
			.first<{ query_cursor_key: string }>();
		expect(row?.query_cursor_key).toMatch(/^[a-f0-9]{64}$/);
		expect(row?.query_cursor_key).not.toBe(await sha256Hex(token.token));
		for (const data of [token, (await s.call("/api/tokens")).data]) {
			expect(JSON.stringify(data)).not.toContain("query_cursor_key");
			expect(JSON.stringify(data)).not.toContain(row?.query_cursor_key);
		}
		const forged = await encodeQueryCursor(
			{ timeMs: 1, kind: "post", id: 1 },
			{
				tokenId: token.id,
				accessJson: JSON.stringify(all),
				key: await sha256Hex(token.token),
				query: {
					source: { kind: "watchlist", id: 1 },
					startMs: null,
					endMs: null,
					order: "desc",
					limit: 100,
					cursor: null,
				},
			},
		);
		expect((await s.query(token.token, `?watchlistId=1&cursor=${forged}`)).status).toBe(400);
		await s.db
			.prepare("UPDATE push_tokens SET query_cursor_key = NULL WHERE id = ?")
			.bind(token.id)
			.run();
		expect((await s.query(token.token)).status).toBe(403);
	});
	test("bare management handlers require authenticated owners", async () => {
		const bare = new Hono<AppEnv>();
		bare.post("/tokens", createQueryTokenRoute);
		bare.patch("/tokens/:id", patchQueryTokenRoute);
		bare.delete("/tokens/:id", revokeQueryTokenRoute);
		for (const [path, method] of [
			["/tokens", "POST"],
			["/tokens/1", "PATCH"],
			["/tokens/1", "DELETE"],
		])
			expect((await bare.request(path, { method })).status).toBe(401);
	});
});
