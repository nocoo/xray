/**
 * Dense L1 branch matrix: HTTP error paths + edge cases on real schema.
 */
import { Hono } from "hono";
import { afterEach, describe, expect, test, vi } from "vitest";
import app from "../index.js";
import { mintPushToken, sha256Hex } from "../lib/push-token-crypto.js";
import * as itemsRepo from "../repos/items.js";
import * as translateRepo from "../repos/translate.js";
import { createSqliteD1 } from "../test/sqlite-d1.js";
import type { AppEnv } from "../types.js";
import { ingestPushRoute } from "./ingest-push.js";
import { defaultZhetoUpstream, zhetoSaveRoute } from "./zheto.js";

const KEK = "0123456789abcdef0123456789abcdef";

function baseEnv(db: D1Database, extra: Record<string, unknown> = {}) {
	return {
		ENVIRONMENT: "test",
		AUTH_DEV_BYPASS: "true",
		ALLOWED_EMAILS: "dev@xray.local,dev-b@xray.local",
		DB: db,
		XRAY_SECRETS_KEK: KEK,
		XRAY_SECRETS_KEY_VERSION: "1",
		ZHETO_WEBHOOK_ALLOW_HOSTS: "localhost,127.0.0.1",
		TRANSLATE_FN: async () => ({ translatedText: "译", summaryText: "摘" }),
		ZHETO_UPSTREAM: async () => ({
			status: 200,
			json: { shortUrl: "https://zhe.to/x", slug: "x", originalUrl: "u", isExisting: false },
		}),
		...extra,
	};
}

function hdr(actor: "a" | "b" = "a") {
	return {
		host: "localhost",
		origin: "http://localhost:7007",
		"content-type": "application/json",
		"x-test-actor": actor,
	};
}

async function json(req: Promise<Response>) {
	const res = await req;
	const body = await res.json().catch(() => null);
	return { status: res.status, body };
}

async function seedWl(env: ReturnType<typeof baseEnv>) {
	const wl = await json(
		app.request(
			"/api/watchlists",
			{
				method: "POST",
				headers: hdr(),
				body: JSON.stringify({ name: "W", translateEnabled: true }),
			},
			env,
		),
	);
	return (wl.body as { data: { id: number } }).data.id;
}

function itemBody(overrides: Record<string, unknown> = {}) {
	return {
		source_type: "custom",
		external_id: `ex-${Math.random().toString(36).slice(2)}`,
		created_at: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
		body: { kind: "custom", text: "hello", title: "t" },
		...overrides,
	};
}

describe("branch matrix coverage", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	test("groups/watchlists/tags/items 404 and validation branches", async () => {
		const db = createSqliteD1();
		const env = baseEnv(db);
		const h = hdr();
		const wlId = await seedWl(env);

		const g = await json(
			app.request(
				"/api/groups",
				{ method: "POST", headers: h, body: JSON.stringify({ name: "G" }) },
				env,
			),
		);
		const gId = (g.body as { data: { id: number } }).data.id;

		// 404s
		expect((await app.request("/api/groups/99999", { headers: h }, env)).status).toBe(404);
		expect(
			(
				await app.request(
					"/api/groups/99999",
					{ method: "PATCH", headers: h, body: JSON.stringify({ name: "x" }) },
					env,
				)
			).status,
		).toBe(404);
		expect(
			(await app.request("/api/groups/99999", { method: "DELETE", headers: h }, env)).status,
		).toBe(404);
		expect((await app.request("/api/groups/99999/members", { headers: h }, env)).status).toBe(404);
		expect(
			(
				await app.request(
					"/api/groups/99999/members",
					{
						method: "POST",
						headers: h,
						body: JSON.stringify({ sourceType: "x.com", handle: "a" }),
					},
					env,
				)
			).status,
		).toBe(404);
		expect(
			(await app.request(`/api/groups/${gId}/members/99999`, { method: "DELETE", headers: h }, env))
				.status,
		).toBe(404);
		expect(
			(
				await app.request(
					"/api/groups/99999/members/import",
					{ method: "POST", headers: h, body: JSON.stringify({ text: "@a" }) },
					env,
				)
			).status,
		).toBe(404);
		expect(
			(
				await app.request(
					`/api/groups/${gId}/copy-to-watchlist`,
					{ method: "POST", headers: h, body: JSON.stringify({ watchlistId: 99999 }) },
					env,
				)
			).status,
		).toBe(404);
		expect(
			(
				await app.request(
					"/api/groups/99999/copy-to-watchlist",
					{ method: "POST", headers: h, body: JSON.stringify({ watchlistId: wlId }) },
					env,
				)
			).status,
		).toBe(404);

		// import validation
		expect(
			(
				await app.request(
					`/api/groups/${gId}/members/import`,
					{ method: "POST", headers: h, body: JSON.stringify({}) },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					`/api/groups/${gId}/members/import`,
					{ method: "POST", headers: h, body: JSON.stringify({ text: "   " }) },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					`/api/groups/${gId}/members/import`,
					{ method: "POST", headers: h, body: JSON.stringify({ text: "no handles here" }) },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					`/api/groups/${gId}/members/import`,
					{ method: "POST", headers: h, body: "[]" },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					`/api/groups/${gId}/members/import`,
					{ method: "POST", headers: h, body: JSON.stringify({ text: "x".repeat(512_001) }) },
					env,
				)
			).status,
		).toBe(400);

		// copy validation
		expect(
			(
				await app.request(
					`/api/groups/${gId}/copy-to-watchlist`,
					{ method: "POST", headers: h, body: JSON.stringify({}) },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					`/api/groups/${gId}/copy-to-watchlist`,
					{ method: "POST", headers: h, body: JSON.stringify({ watchlistId: "abc" }) },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					`/api/groups/${gId}/copy-to-watchlist`,
					{ method: "POST", headers: h, body: JSON.stringify({ watchlistId: "2" }) },
					env,
				)
			).status,
		).toBe(404); // string numeric id ok parse, wl missing
		expect(
			(
				await app.request(
					`/api/groups/${gId}/copy-to-watchlist`,
					{
						method: "POST",
						headers: h,
						body: JSON.stringify({ watchlistId: wlId, memberIds: "nope" }),
					},
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					`/api/groups/${gId}/copy-to-watchlist`,
					{
						method: "POST",
						headers: h,
						body: JSON.stringify({ watchlistId: wlId, memberIds: [-1] }),
					},
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					`/api/groups/${gId}/copy-to-watchlist`,
					{
						method: "POST",
						headers: h,
						body: JSON.stringify({
							watchlistId: wlId,
							memberIds: Array.from({ length: 501 }, (_, i) => i + 1),
						}),
					},
					env,
				)
			).status,
		).toBe(400);
		// empty memberIds = copy none
		expect(
			(
				await app.request(
					`/api/groups/${gId}/copy-to-watchlist`,
					{
						method: "POST",
						headers: h,
						body: JSON.stringify({ watchlistId: wlId, memberIds: [] }),
					},
					env,
				)
			).status,
		).toBe(200);

		const gm = await json(
			app.request(
				`/api/groups/${gId}/members`,
				{
					method: "POST",
					headers: h,
					body: JSON.stringify({
						sourceType: "x.com",
						handle: "bob",
						displayName: "B",
						externalAuthorId: "eid1",
					}),
				},
				env,
			),
		);
		const gmId = (gm.body as { data: { id: number } }).data.id;
		expect(
			(
				await app.request(
					`/api/groups/${gId}/copy-to-watchlist`,
					{
						method: "POST",
						headers: h,
						body: JSON.stringify({ watchlistId: wlId, memberIds: [gmId] }),
					},
					env,
				)
			).status,
		).toBe(200);

		// invalid id params
		expect(
			(
				await app.request(
					"/api/groups/abc/members",
					{
						method: "POST",
						headers: h,
						body: JSON.stringify({ sourceType: "x.com", handle: "z" }),
					},
					env,
				)
			).status,
		).toBe(400);
		expect(
			(await app.request(`/api/groups/${gId}/members/abc`, { method: "DELETE", headers: h }, env))
				.status,
		).toBe(400);

		// watchlist 404s
		expect(
			(
				await app.request(
					"/api/watchlists/99999",
					{ method: "PATCH", headers: h, body: JSON.stringify({ name: "x" }) },
					env,
				)
			).status,
		).toBe(404);
		expect(
			(await app.request("/api/watchlists/99999", { method: "DELETE", headers: h }, env)).status,
		).toBe(404);
		expect((await app.request("/api/watchlists/99999/members", { headers: h }, env)).status).toBe(
			404,
		);
		expect(
			(
				await app.request(
					"/api/watchlists/99999/members",
					{
						method: "POST",
						headers: h,
						body: JSON.stringify({ sourceType: "x.com", handle: "a" }),
					},
					env,
				)
			).status,
		).toBe(404);
		expect(
			(
				await app.request(
					`/api/watchlists/${wlId}/members/99999`,
					{ method: "PATCH", headers: h, body: JSON.stringify({ note: "n" }) },
					env,
				)
			).status,
		).toBe(404);
		expect(
			(
				await app.request(
					`/api/watchlists/${wlId}/members/99999`,
					{ method: "DELETE", headers: h },
					env,
				)
			).status,
		).toBe(404);
		expect((await app.request("/api/watchlists/99999/items", { headers: h }, env)).status).toBe(
			404,
		);
		expect(
			(await app.request("/api/watchlists/99999/ingest-logs", { headers: h }, env)).status,
		).toBe(404);
		expect(
			(
				await app.request(
					"/api/watchlists/99999/translate",
					{ method: "POST", headers: h, body: JSON.stringify({}) },
					env,
				)
			).status,
		).toBe(404);

		// tag duplicate 409
		await app.request(
			"/api/tags",
			{ method: "POST", headers: h, body: JSON.stringify({ name: "dup" }) },
			env,
		);
		expect(
			(
				await app.request(
					"/api/tags",
					{ method: "POST", headers: h, body: JSON.stringify({ name: "dup" }) },
					env,
				)
			).status,
		).toBe(409);

		// member conflict + validation
		await app.request(
			`/api/watchlists/${wlId}/members`,
			{
				method: "POST",
				headers: h,
				body: JSON.stringify({ sourceType: "x.com", handle: "alice", tagIds: [99999] }),
			},
			env,
		);
		// bad tagIds may 400
		const m1 = await app.request(
			`/api/watchlists/${wlId}/members`,
			{
				method: "POST",
				headers: h,
				body: JSON.stringify({ sourceType: "x.com", handle: "alice2" }),
			},
			env,
		);
		expect([200, 201]).toContain(m1.status);
		const m1dup = await app.request(
			`/api/watchlists/${wlId}/members`,
			{
				method: "POST",
				headers: h,
				body: JSON.stringify({ sourceType: "x.com", handle: "alice2" }),
			},
			env,
		);
		expect([409, 400]).toContain(m1dup.status);

		// items cursor invalid
		expect(
			(await app.request(`/api/watchlists/${wlId}/items?cursor=%%%`, { headers: h }, env)).status,
		).toBe(400);
		expect(
			(
				await app.request(
					`/api/watchlists/${wlId}/items?limit=abc&source_type=nope`,
					{
						headers: h,
					},
					env,
				)
			).status,
		).toBe(200);

		// invalid member patch ids
		expect(
			(
				await app.request(
					`/api/watchlists/${wlId}/members/0`,
					{ method: "PATCH", headers: h, body: JSON.stringify({ note: "x" }) },
					env,
				)
			).status,
		).toBe(400);
	});

	test("ai/translate/zheto/settings edge branches", async () => {
		const db = createSqliteD1();
		const env = baseEnv(db);
		const h = hdr();
		const wlId = await seedWl(env);

		// AI put validation
		expect(
			(
				await app.request(
					"/api/ai-config",
					{ method: "PUT", headers: h, body: JSON.stringify({ provider: "" }) },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					"/api/ai-config",
					{ method: "PUT", headers: h, body: JSON.stringify([]) },
					env,
				)
			).status,
		).toBe(400);

		// KEK missing on put
		const envNoKek = baseEnv(db, { XRAY_SECRETS_KEK: undefined });
		expect(
			(
				await app.request(
					"/api/ai-config",
					{
						method: "PUT",
						headers: h,
						body: JSON.stringify({
							provider: "openai",
							model: "m",
							apiKey: "sk",
						}),
					},
					envNoKek,
				)
			).status,
		).toBe(500);

		// KEK invalid length
		const envBadKek = baseEnv(db, { XRAY_SECRETS_KEK: "short" });
		expect(
			(
				await app.request(
					"/api/ai-config",
					{
						method: "PUT",
						headers: h,
						body: JSON.stringify({ provider: "openai", model: "m", apiKey: "sk" }),
					},
					envBadKek,
				)
			).status,
		).toBe(500);

		await app.request(
			"/api/ai-config",
			{
				method: "PUT",
				headers: h,
				body: JSON.stringify({
					provider: "openai",
					model: "m",
					baseUrl: "https://api.openai.com/v1",
					apiKey: "sk-ok",
					translationPrompt: "t",
					summaryPrompt: "s",
				}),
			},
			env,
		);

		// keep key + null prompts
		expect(
			(
				await app.request(
					"/api/ai-config",
					{
						method: "PUT",
						headers: h,
						body: JSON.stringify({
							provider: "openai",
							model: null,
							baseUrl: null,
							translationPrompt: null,
							summaryPrompt: null,
						}),
					},
					env,
				)
			).status,
		).toBe(200);

		// AI test with draft body + mock fetch
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
						status: 200,
						headers: { "content-type": "application/json" },
					}),
			),
		);
		expect(
			(
				await app.request(
					"/api/ai-config/test",
					{
						method: "POST",
						headers: h,
						body: JSON.stringify({
							provider: "openai",
							model: "gpt-4o-mini",
							baseUrl: "https://api.openai.com/v1",
							apiKey: "sk-draft",
						}),
					},
					env,
				)
			).status,
		).toBe(200);

		// AI test bad upstream status
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("nope", { status: 502, statusText: "Bad Gateway" })),
		);
		expect(
			(
				await app.request(
					"/api/ai-config/test",
					{ method: "POST", headers: h, body: JSON.stringify({}) },
					env,
				)
			).status,
		).toBe(200);

		// AI test non-JSON success body
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("not-json", { status: 200 })),
		);
		expect(
			(
				await app.request(
					"/api/ai-config/test",
					{ method: "POST", headers: h, body: JSON.stringify({}) },
					env,
				)
			).status,
		).toBe(200);

		// AI test missing content
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () => new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 }),
			),
		);
		expect(
			(
				await app.request(
					"/api/ai-config/test",
					{ method: "POST", headers: h, body: JSON.stringify({}) },
					env,
				)
			).status,
		).toBe(200);

		// AI test blocked base URL
		expect(
			(
				await app.request(
					"/api/ai-config/test",
					{
						method: "POST",
						headers: h,
						body: JSON.stringify({ baseUrl: "http://localhost:1", apiKey: "sk" }),
					},
					env,
				)
			).status,
		).toBe(200);

		// AI test no provider on empty db user B
		expect(
			(
				await app.request(
					"/api/ai-config/test",
					{ method: "POST", headers: hdr("b"), body: JSON.stringify({}) },
					env,
				)
			).status,
		).toBe(400);

		// translate validation
		expect(
			(
				await app.request(
					`/api/watchlists/${wlId}/translate`,
					{ method: "POST", headers: h, body: JSON.stringify({ limit: 0 }) },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					`/api/watchlists/${wlId}/translate`,
					{ method: "POST", headers: h, body: JSON.stringify({ item_ids: "x" }) },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					`/api/watchlists/${wlId}/translate`,
					{ method: "POST", headers: h, body: JSON.stringify({ item_ids: [1.5] }) },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					`/api/watchlists/abc/translate`,
					{ method: "POST", headers: h, body: JSON.stringify({}) },
					env,
				)
			).status,
		).toBe(400);

		// seed item then translate with item_ids (already succeeded path)
		const tokRes = await json(
			app.request(
				"/api/push-tokens",
				{ method: "POST", headers: h, body: JSON.stringify({ label: "t" }) },
				env,
			),
		);
		const tok = (tokRes.body as { data: { token: string } }).data.token;
		await app.request(
			"/api/v1/ingest/push",
			{
				method: "POST",
				headers: {
					host: "localhost",
					authorization: `Bearer ${tok}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					watchlist_id: wlId,
					items: [itemBody({ external_id: "tr1" })],
				}),
			},
			env,
		);
		const items = (await (
			await app.request(`/api/watchlists/${wlId}/items`, { headers: h }, env)
		).json()) as { data: { items: Array<{ id: number }> } };
		const iid = items.data.items[0]?.id;
		expect(
			(
				await app.request(
					`/api/watchlists/${wlId}/translate`,
					{ method: "POST", headers: h, body: JSON.stringify({ item_ids: [iid], limit: 5 }) },
					env,
				)
			).status,
		).toBe(200);
		// second call hits succeeded hydrate
		expect(
			(
				await app.request(
					`/api/watchlists/${wlId}/translate`,
					{ method: "POST", headers: h, body: JSON.stringify({ item_ids: [iid] }) },
					env,
				)
			).status,
		).toBe(200);

		// settings invalid
		expect(
			(
				await app.request(
					"/api/settings",
					{ method: "PATCH", headers: h, body: JSON.stringify({ ingest: { windowHours: 999 } }) },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					"/api/settings",
					{ method: "PATCH", headers: h, body: JSON.stringify([]) },
					env,
				)
			).status,
		).toBe(400);

		// zheto put validation + KEK
		expect(
			(
				await app.request(
					"/api/integrations/zheto",
					{ method: "PUT", headers: h, body: JSON.stringify({ webhookUrl: "http://x" }) },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					"/api/integrations/zheto",
					{ method: "PUT", headers: h, body: JSON.stringify([]) },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					"/api/integrations/zheto",
					{
						method: "PUT",
						headers: h,
						body: JSON.stringify({ webhookUrl: "https://localhost/h" }),
					},
					envNoKek,
				)
			).status,
		).toBe(500);
		expect(
			(
				await app.request(
					"/api/integrations/zheto",
					{
						method: "PUT",
						headers: h,
						body: JSON.stringify({ webhookUrl: "https://localhost/h" }),
					},
					envBadKek,
				)
			).status,
		).toBe(500);

		// folder-only update after configured
		await app.request(
			"/api/integrations/zheto",
			{
				method: "PUT",
				headers: h,
				body: JSON.stringify({ webhookUrl: "https://localhost/api/webhook/x", folder: "f1" }),
			},
			env,
		);
		expect(
			(
				await app.request(
					"/api/integrations/zheto",
					{ method: "PUT", headers: h, body: JSON.stringify({ folder: "f2" }) },
					env,
				)
			).status,
		).toBe(200);
		expect(
			(
				await app.request(
					"/api/integrations/zheto",
					{ method: "PUT", headers: h, body: JSON.stringify({ folder: null }) },
					env,
				)
			).status,
		).toBe(200);

		// zheto save variants
		expect(
			(
				await app.request(
					"/api/integrations/zheto/save",
					{ method: "POST", headers: h, body: JSON.stringify({}) },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					"/api/integrations/zheto/save",
					{ method: "POST", headers: h, body: JSON.stringify({ url: "  " }) },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					"/api/integrations/zheto/save",
					{ method: "POST", headers: h, body: "[]" },
					env,
				)
			).status,
		).toBe(400);

		// upstream 201 with nested data
		const env201 = baseEnv(db, {
			ZHETO_UPSTREAM: async () => ({
				status: 201,
				json: { data: { shortUrl: "s", slug: "sl", originalUrl: "o" } },
			}),
		});
		expect(
			(
				await app.request(
					"/api/integrations/zheto/save",
					{
						method: "POST",
						headers: h,
						body: JSON.stringify({
							url: "https://example.com/a",
							note: "n",
							folder: "ff",
						}),
					},
					env201,
				)
			).status,
		).toBe(200);

		// upstream 500 / 400 / throw
		const env500 = baseEnv(db, {
			ZHETO_UPSTREAM: async () => ({ status: 500, json: {} }),
		});
		expect(
			(
				await app.request(
					"/api/integrations/zheto/save",
					{ method: "POST", headers: h, body: JSON.stringify({ url: "https://e.com" }) },
					env500,
				)
			).status,
		).toBe(502);
		const env400 = baseEnv(db, {
			ZHETO_UPSTREAM: async () => ({ status: 400, json: {} }),
		});
		expect(
			(
				await app.request(
					"/api/integrations/zheto/save",
					{ method: "POST", headers: h, body: JSON.stringify({ url: "https://e.com" }) },
					env400,
				)
			).status,
		).toBe(400);
		const envThrow = baseEnv(db, {
			ZHETO_UPSTREAM: async () => {
				throw new Error("net");
			},
		});
		expect(
			(
				await app.request(
					"/api/integrations/zheto/save",
					{ method: "POST", headers: h, body: JSON.stringify({ url: "https://e.com" }) },
					envThrow,
				)
			).status,
		).toBe(502);

		// defaultZhetoUpstream unit
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ shortUrl: "x" }), { status: 200 })),
		);
		const up = await defaultZhetoUpstream("https://localhost/h", { url: "https://e.com" });
		expect(up.status).toBe(200);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("bad", { status: 200 })),
		);
		const up2 = await defaultZhetoUpstream("https://localhost/h", { url: "https://e.com" });
		expect(up2.json).toEqual({});
	});

	test("ingest push validation matrix via mock scopes", async () => {
		const minted = await mintPushToken();
		const hash = await sha256Hex(minted.plaintext);

		function makeDb(opts: {
			scopes?: unknown;
			scopesRaw?: string;
			tokenHash?: string;
			hasWl?: boolean;
			dedupe?: boolean;
			members?: Array<{
				id: number;
				source_type: string;
				external_author_id: string | null;
				handle: string;
			}>;
		}) {
			const items: unknown[] = [];
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
									id: 1,
									user_id: "u1",
									token_prefix: minted.tokenPrefix,
									token_hash: opts.tokenHash ?? hash,
									label: "t",
									scopes: opts.scopesRaw ?? JSON.stringify(opts.scopes ?? ["ingest:push"]),
									created_at_ms: Date.now(),
									last_used_at_ms: null,
									revoked_at_ms: null,
								} as T;
							}
							if (sql.includes("FROM watchlists")) {
								if (opts.hasWl === false) return null;
								return {
									id: 1,
									user_id: "u1",
									name: "W",
									description: null,
									icon: "eye",
									translate_enabled: 0,
									created_at_ms: Date.now(),
									member_count: 0,
								} as T;
							}
							if (sql.includes("FROM settings")) return { value: "24" } as T;
							return null;
						},
						async all<T>() {
							if (sql.includes("FROM watchlist_members")) {
								return {
									results: (opts.members ?? [
										{
											id: 1,
											source_type: "x.com",
											external_author_id: "uid1",
											handle: "alice",
										},
									]) as T[],
								};
							}
							return { results: [] as T[] };
						},
						async run() {
							if (sql.includes("INSERT") && sql.includes("items")) {
								if (opts.dedupe && items.length > 0) {
									return { meta: { changes: 0 } };
								}
								items.push(binds);
								return { meta: { changes: 1, last_row_id: items.length } };
							}
							return { meta: { changes: 1 } };
						},
					};
					return stmt;
				},
			} as unknown as D1Database;
		}

		async function push(
			db: D1Database,
			body: BodyInit | null,
			headers: Record<string, string> = {},
			extraEnv: Record<string, unknown> = {},
		) {
			const hono = new Hono<AppEnv>();
			hono.use("*", async (c, next) => {
				// @ts-expect-error test
				c.env = {
					DB: db,
					ENVIRONMENT: "test",
					XRAY_INGEST_RL: { limit: async () => ({ success: true }) },
					...extraEnv,
				};
				return next();
			});
			hono.post("/api/v1/ingest/push", ingestPushRoute);
			return hono.request("/api/v1/ingest/push", {
				method: "POST",
				headers: {
					authorization: `Bearer ${minted.plaintext}`,
					"content-type": "application/json",
					...headers,
				},
				body,
			});
		}

		// bad scopes
		expect((await push(makeDb({ scopes: { x: 1 } }), "{}")).status).toBe(403);
		expect((await push(makeDb({ scopesRaw: "not-json" }), "{}")).status).toBe(403);
		expect((await push(makeDb({ scopes: ["other"] }), "{}")).status).toBe(403);

		// rate limit
		expect(
			(
				await push(
					makeDb({}),
					"{}",
					{},
					{
						XRAY_INGEST_RL: {
							limit: async () => ({ success: false, error: "slow" }),
						},
					},
				)
			).status,
		).toBe(429);

		// empty body
		expect((await push(makeDb({}), null)).status).toBe(400);

		// invalid JSON
		expect((await push(makeDb({}), "not-json")).status).toBe(400);
		expect((await push(makeDb({}), "[]")).status).toBe(400);

		// watchlist_id / items validation
		expect((await push(makeDb({}), JSON.stringify({}))).status).toBe(400);
		expect((await push(makeDb({}), JSON.stringify({ watchlist_id: 0, items: [] }))).status).toBe(
			400,
		);
		expect((await push(makeDb({}), JSON.stringify({ watchlist_id: 1, items: "x" }))).status).toBe(
			400,
		);
		expect((await push(makeDb({}), JSON.stringify({ watchlist_id: 1, items: [] }))).status).toBe(
			400,
		);
		expect(
			(
				await push(
					makeDb({}),
					JSON.stringify({
						watchlist_id: 1,
						items: Array.from({ length: 51 }, (_, i) => itemBody({ external_id: `m${i}` })),
					}),
				)
			).status,
		).toBe(400);

		// wl not found
		expect(
			(
				await push(
					makeDb({ hasWl: false }),
					JSON.stringify({ watchlist_id: 1, items: [itemBody()] }),
				)
			).status,
		).toBe(404);

		// apply_window_hours bad
		expect(
			(
				await push(
					makeDb({}),
					JSON.stringify({
						watchlist_id: 1,
						items: [itemBody()],
						options: { apply_window_hours: 0 },
					}),
				)
			).status,
		).toBe(400);
		expect(
			(
				await push(
					makeDb({}),
					JSON.stringify({
						watchlist_id: 1,
						items: [itemBody()],
						options: { apply_window_hours: "24" },
					}),
				)
			).status,
		).toBe(400);

		// outside window + match by handle + apply_window_hours ok + dedupe
		const old = new Date(Date.now() - 48 * 3600_000).toISOString().replace(/\.\d{3}Z$/, ".000Z");
		const res = await push(
			makeDb({
				dedupe: true,
				members: [{ id: 2, source_type: "x.com", external_author_id: null, handle: "alice" }],
			}),
			JSON.stringify({
				watchlist_id: 1,
				options: { apply_window_hours: 12 },
				items: [
					itemBody({ external_id: "old", created_at: old }),
					{
						source_type: "x.com",
						external_id: "tw-h",
						created_at: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
						body: {
							kind: "x.post",
							tweet: { id: "tw-h", text: "hi", author_id: "other" },
							includes: { users: [{ id: "other", name: "A", username: "alice" }] },
						},
					},
					{
						source_type: "x.com",
						external_id: "tw-h",
						created_at: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
						body: {
							kind: "x.post",
							tweet: { id: "tw-h", text: "hi", author_id: "other" },
							includes: { users: [{ id: "other", name: "A", username: "alice" }] },
						},
					},
					itemBody({ external_id: "ok1" }),
				],
			}),
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { rejected: number; accepted: number; deduped: number };
		expect(body.rejected).toBeGreaterThanOrEqual(1);
		expect(body.accepted + body.deduped).toBeGreaterThanOrEqual(1);

		// content-length ok path still parses body; large stream via oversized chunks simulated by CL header already covered
		// hash mismatch
		expect(
			(
				await push(
					makeDb({ tokenHash: "0".repeat(64) }),
					JSON.stringify({ watchlist_id: 1, items: [itemBody()] }),
				)
			).status,
		).toBe(401);
	});

	test("translate timeout and fail paths in repo", async () => {
		const db = createSqliteD1();
		await db
			.prepare(
				`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
         VALUES ('u1', 'u@t.local', 'n', NULL, 'iss', 'sub', ?)`,
			)
			.bind(Date.now())
			.run();
		const wl = await db
			.prepare(
				`INSERT INTO watchlists (user_id, name, description, icon, translate_enabled, created_at_ms)
         VALUES ('u1', 'W', NULL, 'eye', 1, ?) RETURNING id`,
			)
			.bind(Date.now())
			.first<{ id: number }>();
		const wlId = wl?.id;
		for (const i of [1, 2, 3]) {
			await itemsRepo.insertItemIgnore(db, "u1", {
				watchlistId: wlId,
				sourceType: "custom",
				externalId: `t${i}`,
				text: `text ${i}`,
				createdAtMs: Date.now(),
				payload: {},
			});
		}
		const config = {
			user_id: "u1",
			provider: "openai",
			model: "m",
			base_url: "https://api.openai.com/v1",
			api_key_ciphertext: new ArrayBuffer(8),
			api_key_key_version: 1,
			translation_prompt: null,
			summary_prompt: null,
			updated_at_ms: Date.now(),
		};

		// immediate timeout before work
		const timed = await translateRepo.runTranslateBatch(db, "u1", wlId, {
			limit: 3,
			config,
			apiKey: "sk",
			nowMs: Date.now(),
			deadlineMs: 0,
			translateFn: async () => ({ translatedText: "x", summaryText: null }),
		});
		expect(timed.timed_out).toBe(true);

		// abort path
		const aborted = await translateRepo.runTranslateBatch(db, "u1", wlId, {
			limit: 2,
			config,
			apiKey: "sk",
			deadlineMs: 60_000,
			translateFn: async () => {
				const err = new Error("The operation was aborted");
				throw err;
			},
		});
		expect(aborted.results.some((r) => r.error === "timed_out")).toBe(true);

		// generic fail
		const failed = await translateRepo.runTranslateBatch(db, "u1", wlId, {
			limit: 1,
			config,
			apiKey: "sk",
			translateFn: async () => {
				throw new Error("boom");
			},
		});
		expect(failed.results[0]?.ai_status).toBe("failed");

		// empty candidates + item_ids hydrate empty
		const empty = await translateRepo.runTranslateBatch(db, "u1", wlId, {
			limit: 1,
			itemIds: [99999],
			config,
			apiKey: "sk",
			translateFn: async () => ({ translatedText: "x", summaryText: null }),
		});
		expect(empty.results).toEqual([]);

		// loadSucceeded with empty / invalid ids
		expect(await translateRepo.loadSucceededTranslations(db, "u1", wlId, [])).toEqual([]);
		expect(await translateRepo.loadSucceededTranslations(db, "u1", wlId, [0, -1])).toEqual([]);
		// empty itemIds falls through to open candidate scan (length falsy)
		const open = await translateRepo.selectTranslateCandidates(db, "u1", wlId, {
			limit: 1,
			itemIds: [],
		});
		expect(Array.isArray(open)).toBe(true);
		expect(
			await translateRepo.selectTranslateCandidates(db, "u1", wlId, { limit: 1, itemIds: [0] }),
		).toEqual([]);
		await translateRepo.markPending(db, "u1", [], Date.now());
	});

	test("zheto decrypt failure path", async () => {
		const db = createSqliteD1();
		const hono = new Hono<AppEnv>();
		hono.use("*", async (c, next) => {
			c.set("authUser", {
				id: "u1",
				email: "u@t.local",
				name: null,
				image: null,
				accessIss: null,
				accessSub: null,
			});
			// @ts-expect-error test
			c.env = {
				DB: db,
				ENVIRONMENT: "test",
				XRAY_SECRETS_KEK: KEK,
				// broken ciphertext row
			};
			await db
				.prepare(
					`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
           VALUES ('u1', 'u@t.local', 'n', NULL, 'iss', 'sub', ?)`,
				)
				.bind(Date.now())
				.run();
			await db
				.prepare(
					`INSERT INTO integration_secrets
           (user_id, integration, ciphertext, key_version, meta_json, updated_at_ms)
           VALUES ('u1', 'zheto', ?, 1, '{bad', ?)`,
				)
				.bind(new Uint8Array([1, 2, 3]), Date.now())
				.run();
			return next();
		});
		hono.post("/api/integrations/zheto/save", zhetoSaveRoute);
		const res = await hono.request("/api/integrations/zheto/save", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ url: "https://example.com" }),
		});
		expect(res.status).toBe(500);
	});

	test("items list cursor pagination and decode edges", async () => {
		const db = createSqliteD1();
		await db
			.prepare(
				`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
         VALUES ('u1', 'u@t.local', 'n', NULL, 'iss', 'sub', ?)`,
			)
			.bind(Date.now())
			.run();
		const wl = await db
			.prepare(
				`INSERT INTO watchlists (user_id, name, description, icon, translate_enabled, created_at_ms)
         VALUES ('u1', 'W', NULL, 'eye', 0, ?) RETURNING id`,
			)
			.bind(Date.now())
			.first<{ id: number }>();
		const wlId = wl?.id;
		const now = Date.now();
		for (let i = 0; i < 5; i++) {
			await itemsRepo.insertItemIgnore(db, "u1", {
				watchlistId: wlId,
				sourceType: "custom",
				externalId: `p${i}`,
				text: `t${i}`,
				createdAtMs: now - i * 1000,
				payload: { i },
			});
		}
		// bad payload_json path via raw insert
		await db
			.prepare(
				`INSERT INTO items
         (user_id, watchlist_id, source_type, external_id, member_id, author_username, title, text,
          created_at_ms, ingested_at_ms, payload_json, ai_status, ai_status_updated_at_ms)
         VALUES ('u1', ?, 'custom', 'badjson', NULL, NULL, NULL, 'x', ?, ?, 'not-json', 'not_requested', 0)`,
			)
			.bind(wlId, now - 9000, now)
			.run();

		const page1 = await itemsRepo.listItems(db, "u1", wlId, { limit: 2 });
		expect(page1.items.length).toBe(2);
		expect(page1.next_cursor).toBeTruthy();
		const page2 = await itemsRepo.listItems(db, "u1", wlId, {
			limit: 2,
			cursor: page1.next_cursor,
		});
		expect(page2.items.length).toBeGreaterThan(0);
		expect(itemsRepo.decodeItemCursor("!!!")).toBeNull();
		expect(itemsRepo.decodeItemCursor(btoa("x:y"))).toBeNull();
		expect(itemsRepo.decodeItemCursor(itemsRepo.encodeItemCursor(1, 1))).toEqual({
			createdAtMs: 1,
			id: 1,
		});

		// invalid source_type in row throws on map — skip if constraint
		await expect(itemsRepo.listItems(db, "u1", wlId, { limit: 100 })).resolves.toBeTruthy();
	});
});
