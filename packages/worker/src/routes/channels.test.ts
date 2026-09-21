/**
 * L1 channels coverage: full worker app over real SQLite (docs/11-channels.md).
 */

import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import app from "../index.js";
import { mintPushToken } from "../lib/push-token-crypto.js";
import { setJwtVerifierForTests } from "../middleware/access-auth.js";
import { createPushToken } from "../repos/push-tokens.js";
import { createSqliteD1 } from "../test/sqlite-d1.js";
import type { AppEnv } from "../types.js";
import {
	createChannelKeyRoute,
	createChannelRoute,
	deleteChannelRoute,
	getChannelArticleRoute,
	listChannelArticlesRoute,
	listChannelKeysRoute,
	listChannelsRoute,
	orderChannelsRoute,
	patchChannelRoute,
	revokeChannelKeyRoute,
} from "./channels.js";

const KEK = "0123456789abcdef0123456789abcdef";
const INGEST_HOST = "xray-ingest.worker.hexly.ai";

function makeEnv(db: D1Database, environment = "test") {
	return {
		ENVIRONMENT: environment,
		AUTH_DEV_BYPASS: "true",
		ALLOWED_EMAILS: "dev@xray.local,dev-b@xray.local",
		DB: db,
		XRAY_SECRETS_KEK: KEK,
		XRAY_SECRETS_KEY_VERSION: "1",
	} as AppEnv["Bindings"];
}

function hdr(actor: "a" | "b" = "a", extra: Record<string, string> = {}) {
	return {
		host: "127.0.0.1",
		origin: "http://localhost:7007",
		"content-type": "application/json",
		"x-test-actor": actor,
		...extra,
	};
}

function ingestHdr(token: string, extra: Record<string, string> = {}) {
	return {
		host: INGEST_HOST,
		authorization: `Bearer ${token}`,
		"content-type": "application/json",
		...extra,
	};
}

async function call(
	path: string,
	init: RequestInit & { headers?: Record<string, string> },
	env: AppEnv["Bindings"],
) {
	const res = await app.request(path, init, env);
	const text = await res.text();
	let body: unknown = null;
	if (text) {
		try {
			body = JSON.parse(text);
		} catch {
			body = text;
		}
	}
	return { status: res.status, body, text };
}

function dataOf<T>(body: unknown): T {
	const b = body as { data?: T };
	return b?.data as T;
}

async function createChannel(env: AppEnv["Bindings"], name = "Reports") {
	const r = await call(
		"/api/channels",
		{
			method: "POST",
			headers: hdr(),
			body: JSON.stringify({ name, description: "Daily reports" }),
		},
		env,
	);
	expect(r.status).toBe(201);
	return dataOf<{ id: number }>(r.body);
}

async function createKey(env: AppEnv["Bindings"], channelId: number, label = "Research Agent") {
	const r = await call(
		`/api/channels/${channelId}/keys`,
		{ method: "POST", headers: hdr(), body: JSON.stringify({ label }) },
		env,
	);
	expect(r.status).toBe(201);
	return dataOf<{ id: number; token: string; channelId: number }>(r.body);
}

function article(externalId = `e-${Math.random().toString(36).slice(2)}`, date = "2026-09-22") {
	return {
		external_id: externalId,
		title: "研发日报 · 2026-09-22",
		report_date: date,
		summary: "A brief report",
		author: "Research Team",
		markdown: "## 今日进展\n\n中文与 English。\n\n![Diagram](https://example.com/chart.png)",
	};
}

async function submit(env: AppEnv["Bindings"], token: string, body: unknown, extra = {}) {
	return call(
		"/api/v1/ingest/articles",
		{ method: "POST", headers: ingestHdr(token, extra), body: JSON.stringify(body) },
		env,
	);
}

describe("channels browser routes", () => {
	test("ordering requires a valid full set and returns ordered channel DTOs", async () => {
		const env = makeEnv(createSqliteD1());
		const request = (body: string, actor: "a" | "b" = "a") =>
			call("/api/channels/order", { method: "PUT", headers: hdr(actor), body }, env);
		expect(dataOf((await request('{"ids":[]}')).body)).toEqual([]);
		const a = await createChannel(env, "A");
		const b = await createChannel(env, "B");
		for (const body of [
			"{",
			"null",
			"[]",
			"1",
			"{}",
			'{"ids":"x"}',
			'{"ids":[0]}',
			'{"ids":[-1]}',
			'{"ids":[1.1]}',
			'{"ids":["1"]}',
			'{"ids":[9007199254740992]}',
			JSON.stringify({ ids: [a.id, a.id] }),
			'{"ids":[]}',
			JSON.stringify({ ids: [a.id] }),
			JSON.stringify({ ids: [b.id, 9999] }),
			JSON.stringify({ ids: [a.id, b.id], user_id: "other" }),
		]) {
			expect((await request(body)).status, body).toBe(400);
		}
		expect((await request(JSON.stringify({ ids: [a.id, b.id] }), "b")).status).toBe(400);
		const result = await request(JSON.stringify({ ids: [b.id, a.id] }));
		expect(result.status).toBe(200);
		expect(
			dataOf<Array<{ id: number; sortOrder: number }>>(result.body).map((c) => [c.id, c.sortOrder]),
		).toEqual([
			[b.id, 0],
			[a.id, 1],
		]);
	});

	test("delete cascades and permanently invalidates producer keys", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = await createChannel(env);
		const key = await createKey(env, channel.id);
		expect((await submit(env, key.token, article())).status).toBe(201);
		const remove = (id: string, actor: "a" | "b" = "a") =>
			call(`/api/channels/${id}`, { method: "DELETE", headers: hdr(actor) }, env);
		expect((await remove("bad")).status).toBe(400);
		expect((await remove(String(channel.id), "b")).status).toBe(404);
		const result = await remove(String(channel.id));
		expect(result.status).toBe(200);
		expect(dataOf(result.body)).toEqual({ deleted: true });
		expect((await remove(String(channel.id))).status).toBe(404);
		expect((await submit(env, key.token, article())).status).toBe(401);
	});

	test("management mutations reject ingest hosts, bearer-only browser auth and foreign origins", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = await createChannel(env);
		const key = await createKey(env, channel.id);
		for (const [path, method] of [
			[`/api/channels/${channel.id}`, "DELETE"],
			["/api/channels/order", "PUT"],
		] as const) {
			const body = JSON.stringify({ ids: [channel.id] });
			expect((await call(path, { method, headers: ingestHdr(key.token), body }, env)).status).toBe(
				404,
			);
			expect(
				(
					await call(
						path,
						{ method, headers: hdr("a", { origin: "https://evil.example" }), body },
						env,
					)
				).status,
			).toBe(403);
			const prod = {
				...env,
				ENVIRONMENT: "production",
				AUTH_DEV_BYPASS: undefined,
				CF_ACCESS_TEAM_DOMAIN: "hexly.cloudflareaccess.com",
				CF_ACCESS_AUD: "aud",
			};
			expect(
				(
					await call(
						path,
						{
							method,
							headers: ingestHdr(key.token, {
								host: "xray.hexly.ai",
								origin: "https://xray.hexly.ai",
							}),
							body,
						},
						prod,
					)
				).status,
			).toBe(401);
		}
		expect(
			dataOf<unknown[]>((await call("/api/channels", { headers: hdr() }, env)).body),
		).toHaveLength(1);
	});
	test("create, rename, list with counts, read articles", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = await createChannel(env);
		const key = await createKey(env, channel.id);

		const patched = await call(
			`/api/channels/${channel.id}`,
			{
				method: "PATCH",
				headers: hdr(),
				body: JSON.stringify({ name: "Daily Research", description: "Updated" }),
			},
			env,
		);
		expect(patched.status).toBe(200);
		expect(dataOf<{ name: string; description: string }>(patched.body)).toMatchObject({
			name: "Daily Research",
			description: "Updated",
		});

		const submitted = await submit(env, key.token, article());
		expect(submitted.status).toBe(201);
		const created = submitted.body as {
			id: number;
			channelId: number;
			url: string;
			duplicate: boolean;
		};
		expect(created).toMatchObject({ channelId: channel.id, duplicate: false });
		expect(created.url).toBe(
			`https://xray.dev.hexly.ai/channels/${channel.id}/articles/${created.id}`,
		);

		const listed = await call(`/api/channels/${channel.id}/articles`, { headers: hdr() }, env);
		expect(listed.status).toBe(200);
		expect(listed.text).not.toContain("markdown");
		const page = dataOf<{ items: unknown[]; nextCursor: number | null }>(listed.body);
		expect(page.items).toHaveLength(1);
		expect(page.nextCursor).toBeNull();

		const detail = await call(
			`/api/channels/${channel.id}/articles/${created.id}`,
			{ headers: hdr() },
			env,
		);
		expect(detail.status).toBe(200);
		expect(dataOf<{ markdown: string; sourceLabel: string }>(detail.body)).toMatchObject({
			markdown: article().markdown,
			sourceLabel: "Research Agent",
		});

		const channels = await call("/api/channels", { headers: hdr() }, env);
		expect(dataOf<Array<{ id: number; articleCount: number }>>(channels.body)).toContainEqual(
			expect.objectContaining({ id: channel.id, articleCount: 1 }),
		);
	});

	test("validation and tenant isolation", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = await createChannel(env);
		const key = await createKey(env, channel.id);

		for (const [path, init] of [
			["/api/channels", { method: "POST", headers: hdr(), body: JSON.stringify({ name: "  " }) }],
			["/api/channels", { method: "POST", headers: hdr(), body: "not-json" }],
			["/api/channels/0", { method: "PATCH", headers: hdr(), body: JSON.stringify({ name: "x" }) }],
			[
				`/api/channels/${channel.id}`,
				{ method: "PATCH", headers: hdr(), body: JSON.stringify({}) },
			],
			[
				"/api/channels/abc",
				{ method: "PATCH", headers: hdr(), body: JSON.stringify({ name: "x" }) },
			],
			[`/api/channels/${channel.id}/articles?date=2026-02-30`, { headers: hdr() }],
			[`/api/channels/${channel.id}/articles?limit=0`, { headers: hdr() }],
			[`/api/channels/${channel.id}/articles?limit=101`, { headers: hdr() }],
			[`/api/channels/${channel.id}/articles?before=abc`, { headers: hdr() }],
			[`/api/channels/${channel.id}/articles?before=999`, { headers: hdr() }],
			[`/api/channels/${channel.id}/articles/0`, { headers: hdr() }],
			[`/api/channels/${channel.id}/articles/abc`, { headers: hdr() }],
			[
				`/api/channels/${channel.id}/keys`,
				{ method: "POST", headers: hdr(), body: JSON.stringify({ label: "" }) },
			],
			[`/api/channels/${channel.id}/keys`, { method: "POST", headers: hdr(), body: "x" }],
			[`/api/channels/${channel.id}/keys/0`, { method: "DELETE", headers: hdr() }],
		] as const) {
			const r = await call(path, { ...init }, env);
			expect(r.status, `${init.method ?? "GET"} ${path}`).toBe(400);
		}

		const submitted = await submit(env, key.token, article());
		const { id } = submitted.body as { id: number };
		for (const [path, init] of [
			[
				"/api/channels/999",
				{ method: "PATCH", headers: hdr(), body: JSON.stringify({ name: "x" }) },
			],
			["/api/channels/999/articles", { headers: hdr() }],
			["/api/channels/999/articles/1", { headers: hdr() }],
			["/api/channels/999/keys", { headers: hdr() }],
			[
				"/api/channels/999/keys",
				{ method: "POST", headers: hdr(), body: JSON.stringify({ label: "x" }) },
			],
			["/api/channels/999/keys/1", { method: "DELETE", headers: hdr() }],
			[
				`/api/channels/${channel.id}`,
				{ method: "PATCH", headers: hdr("b"), body: JSON.stringify({ name: "Hijack" }) },
			],
			[`/api/channels/${channel.id}/articles`, { headers: hdr("b") }],
			[`/api/channels/${channel.id}/articles/${id}`, { headers: hdr("b") }],
			[`/api/channels/${channel.id}/keys`, { headers: hdr("b") }],
			[
				`/api/channels/${channel.id}/keys`,
				{ method: "POST", headers: hdr("b"), body: JSON.stringify({ label: "Hijack" }) },
			],
			[`/api/channels/${channel.id}/keys/${key.id}`, { method: "DELETE", headers: hdr("b") }],
		] as const) {
			const r = await call(path, { ...init }, env);
			expect(r.status, `${init.method ?? "GET"} ${path} tenant`).toBe(404);
		}
	});

	test("keys: one-time token, listing hides secrets, revocation stops ingest", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = await createChannel(env);
		const key = await createKey(env, channel.id);

		const listed = await call(`/api/channels/${channel.id}/keys`, { headers: hdr() }, env);
		expect(listed.status).toBe(200);
		expect(listed.text).not.toContain(key.token);
		const keys = dataOf<Array<{ id: number; channelId: number; lastUsedAtMs: number | null }>>(
			listed.body,
		);
		expect(keys).toHaveLength(1);
		expect(keys[0]).toMatchObject({ id: key.id, channelId: channel.id, lastUsedAtMs: null });

		expect((await submit(env, key.token, article())).status).toBe(201);
		const afterUse = dataOf<Array<{ lastUsedAtMs: number | null }>>(
			(await call(`/api/channels/${channel.id}/keys`, { headers: hdr() }, env)).body,
		);
		expect(afterUse[0]?.lastUsedAtMs).toEqual(expect.any(Number));

		const revoked = await call(
			`/api/channels/${channel.id}/keys/${key.id}`,
			{ method: "DELETE", headers: hdr() },
			env,
		);
		expect(revoked.status).toBe(200);
		expect(dataOf<{ revoked: boolean }>(revoked.body)).toEqual({ revoked: true });
		expect(
			(
				await call(
					`/api/channels/${channel.id}/keys/${key.id}`,
					{ method: "DELETE", headers: hdr() },
					env,
				)
			).status,
		).toBe(404);
		expect((await submit(env, key.token, article())).status).toBe(401);
		expect(
			dataOf<unknown[]>(
				(await call(`/api/channels/${channel.id}/keys`, { headers: hdr() }, env)).body,
			),
		).toEqual([]);
	});

	test("push-tokens listing excludes channel keys", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = await createChannel(env);
		await createKey(env, channel.id, "Channel key");
		const watchlist = await call(
			"/api/push-tokens",
			{ method: "POST", headers: hdr(), body: JSON.stringify({ label: "Watchlist key" }) },
			env,
		);
		expect(watchlist.status).toBe(201);
		const listed = dataOf<Array<{ label: string }>>(
			(await call("/api/push-tokens", { headers: hdr() }, env)).body,
		);
		expect(listed.map((t) => t.label)).toEqual(["Watchlist key"]);
	});

	test("all channel endpoints require browser Access auth (401 without JWT)", async () => {
		const env = makeEnv(createSqliteD1(), "production");
		delete env.AUTH_DEV_BYPASS;
		env.CF_ACCESS_TEAM_DOMAIN = "hexly.cloudflareaccess.com";
		env.CF_ACCESS_AUD = "aud-1";
		const noJwt = { host: "xray.hexly.ai", "content-type": "application/json" };
		for (const [path, method] of [
			["/api/channels", "GET"],
			["/api/channels", "POST"],
			["/api/channels/1", "PATCH"],
			["/api/channels/1", "DELETE"],
			["/api/channels/order", "PUT"],
			["/api/channels/1/articles", "GET"],
			["/api/channels/1/articles/1", "GET"],
			["/api/channels/1/keys", "GET"],
			["/api/channels/1/keys", "POST"],
			["/api/channels/1/keys/1", "DELETE"],
		] as const) {
			const r = await call(
				path,
				{ method, headers: noJwt, body: method === "GET" ? undefined : "{}" },
				env,
			);
			expect(r.status, `${method} ${path}`).toBe(401);
		}
	});

	test("key label must be a non-empty string", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = await createChannel(env);
		for (const body of [JSON.stringify({ label: 5 }), JSON.stringify([1]), "null"]) {
			const r = await call(
				`/api/channels/${channel.id}/keys`,
				{ method: "POST", headers: hdr(), body },
				env,
			);
			expect(r.status, body).toBe(400);
		}
	});

	test("channel body parsing branches", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = await createChannel(env);
		expect(
			(await call("/api/channels", { method: "POST", headers: hdr(), body: "{}" }, env)).status,
		).toBe(400);
		expect(
			(
				await call(
					"/api/channels",
					{ method: "POST", headers: hdr(), body: JSON.stringify({ name: "x", description: 5 }) },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await call(
					`/api/channels/${channel.id}`,
					{ method: "PATCH", headers: hdr(), body: "not-json" },
					env,
				)
			).status,
		).toBe(400);
		const descOnly = await call(
			`/api/channels/${channel.id}`,
			{ method: "PATCH", headers: hdr(), body: JSON.stringify({ description: "only desc" }) },
			env,
		);
		expect(descOnly.status).toBe(200);
		expect(dataOf<{ name: string; description: string | null }>(descOnly.body)).toMatchObject({
			description: "only desc",
		});
	});

	test("handlers reject requests without an authenticated user", async () => {
		const bare = new Hono<AppEnv>();
		bare.use("*", async (c, next) => {
			// @ts-expect-error test env
			c.env = { DB: createSqliteD1(), ENVIRONMENT: "test", AUTH_DEV_BYPASS: "true" };
			return next();
		});
		bare.get("/api/channels", listChannelsRoute);
		bare.post("/api/channels", createChannelRoute);
		bare.patch("/api/channels/:id", patchChannelRoute);
		bare.delete("/api/channels/:id", deleteChannelRoute);
		bare.put("/api/channels/order", orderChannelsRoute);
		bare.get("/api/channels/:id/articles", listChannelArticlesRoute);
		bare.get("/api/channels/:id/articles/:articleId", getChannelArticleRoute);
		bare.get("/api/channels/:id/keys", listChannelKeysRoute);
		bare.post("/api/channels/:id/keys", createChannelKeyRoute);
		bare.delete("/api/channels/:id/keys/:keyId", revokeChannelKeyRoute);
		for (const [path, method] of [
			["/api/channels", "GET"],
			["/api/channels", "POST"],
			["/api/channels/1", "PATCH"],
			["/api/channels/1", "DELETE"],
			["/api/channels/order", "PUT"],
			["/api/channels/1/articles", "GET"],
			["/api/channels/1/articles/1", "GET"],
			["/api/channels/1/keys", "GET"],
			["/api/channels/1/keys", "POST"],
			["/api/channels/1/keys/1", "DELETE"],
		] as const) {
			const res = await bare.request(path, {
				method,
				headers: { "content-type": "application/json" },
				body: method === "GET" || method === "DELETE" ? undefined : "{}",
			});
			expect(res.status, `${method} ${path}`).toBe(401);
		}
	});
});

describe("channels ingest route", () => {
	test("scope boundaries: watchlist tokens cannot post articles and vice versa", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = await createChannel(env);
		const key = await createKey(env, channel.id);
		const watchlistToken = dataOf<{ token: string }>(
			(
				await call(
					"/api/push-tokens",
					{ method: "POST", headers: hdr(), body: JSON.stringify({ label: "Watchlist producer" }) },
					env,
				)
			).body,
		);

		expect((await submit(env, watchlistToken.token, article())).status).toBe(403);
		expect(
			(await call("/api/v1/ingest/graph", { headers: ingestHdr(key.token) }, env)).status,
		).toBe(403);
		expect(
			(
				await call(
					"/api/v1/ingest/push",
					{ method: "POST", headers: ingestHdr(key.token), body: "{}" },
					env,
				)
			).status,
		).toBe(403);
		expect((await submit(env, "invalid-token", article())).status).toBe(401);
		expect(
			(
				await call(
					"/api/v1/ingest/articles",
					{
						method: "POST",
						headers: { host: INGEST_HOST, "content-type": "application/json" },
						body: JSON.stringify(article()),
					},
					env,
				)
			).status,
		).toBe(401);
	});

	test("host matrix: articles only on ingest/local hosts", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = await createChannel(env);
		const key = await createKey(env, channel.id);

		expect(
			(
				await call(
					"/api/v1/ingest/articles",
					{
						method: "POST",
						headers: ingestHdr(key.token, { host: "xray.hexly.ai" }),
						body: JSON.stringify(article()),
					},
					env,
				)
			).status,
		).toBe(404);
		expect(
			(
				await call(
					"/api/v1/ingest/articles",
					{
						method: "POST",
						headers: ingestHdr(key.token, { host: "localhost" }),
						body: JSON.stringify(article()),
					},
					env,
				)
			).status,
		).toBe(201);
		expect(
			(await call(`/api/channels/${channel.id}/articles`, { headers: ingestHdr(key.token) }, env))
				.status,
		).toBe(404);
		expect(
			(
				await call(
					"/api/push-tokens",
					{ method: "POST", headers: ingestHdr(key.token), body: '{"label":"forbidden"}' },
					env,
				)
			).status,
		).toBe(404);
		expect((await call("/api/live", { headers: { host: INGEST_HOST } }, env)).status).toBe(200);
	});

	test("idempotency under concurrency, conflict never replaces content", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = await createChannel(env);
		const key = await createKey(env, channel.id);
		const second = await createKey(env, channel.id, "Another producer");
		const payload = article();

		const retries = await Promise.all([
			submit(env, key.token, payload),
			submit(env, key.token, payload),
		]);
		expect(retries.map((r) => r.status).sort()).toEqual([200, 201]);
		const ids = retries.map((r) => (r.body as { id: number }).id);
		expect(ids[0]).toBe(ids[1]);

		expect((await submit(env, key.token, { ...payload, markdown: "Replacement" })).status).toBe(
			409,
		);
		expect((await submit(env, second.token, payload)).status).toBe(409);
		expect(
			(await submit(env, second.token, { ...payload, external_id: `${payload.external_id}x` }))
				.status,
		).toBe(201);

		const read = await call(
			`/api/channels/${channel.id}/articles/${ids[0]}`,
			{ headers: hdr() },
			env,
		);
		expect(dataOf<{ markdown: string; sourceLabel: string }>(read.body)).toMatchObject({
			markdown: payload.markdown,
			sourceLabel: "Research Agent",
		});
	});

	test("strict payload validation and bounded bodies", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = await createChannel(env);
		const key = await createKey(env, channel.id);

		for (const bad of [
			null,
			{},
			{ ...article(), report_date: "2026-02-30" },
			{ ...article(), title: " " },
			{ ...article(), title: "a".repeat(241) },
			{ ...article(), external_id: "e".repeat(161) },
			{ ...article(), summary: "s".repeat(1001) },
			{ ...article(), author: "a".repeat(121) },
			{ ...article(), extra: true },
			{ ...article(), markdown: " " },
		]) {
			expect((await submit(env, key.token, bad)).status, JSON.stringify(bad)).toBe(400);
		}
		expect((await submit(env, key.token, "not-json-string")).status).toBe(400);

		const oversized = await submit(env, key.token, {
			...article(),
			markdown: "汉".repeat(400_000),
		});
		expect(oversized.status).toBe(413);

		// streaming body cap without content-length (1 MiB+ of JSON)
		const big = JSON.stringify({ ...article(), markdown: "a".repeat(1_048_600) });
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				const bytes = new TextEncoder().encode(big);
				for (let i = 0; i < bytes.length; i += 64 * 1024) {
					controller.enqueue(bytes.slice(i, i + 64 * 1024));
				}
				controller.close();
			},
		});
		const res = await app.request(
			"/api/v1/ingest/articles",
			{
				method: "POST",
				headers: ingestHdr(key.token),
				body: stream,
				duplex: "half",
			} as RequestInit,
			env,
		);
		expect(res.status).toBe(413);

		// declared content-length over the cap short-circuits
		expect(
			(
				await call(
					"/api/v1/ingest/articles",
					{
						method: "POST",
						headers: ingestHdr(key.token, { "content-length": "2000000" }),
						body: JSON.stringify(article()),
					},
					env,
				)
			).status,
		).toBe(413);

		const page = dataOf<{ items: unknown[] }>(
			(await call(`/api/channels/${channel.id}/articles`, { headers: hdr() }, env)).body,
		);
		expect(page.items).toEqual([]);
	});

	test("rate limit gate returns 429 before write", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = await createChannel(env);
		const key = await createKey(env, channel.id);
		expect((await submit(env, key.token, article(), { "x-test-force-rl": "1" })).status).toBe(429);
		expect(
			dataOf<{ items: unknown[] }>(
				(await call(`/api/channels/${channel.id}/articles`, { headers: hdr() }, env)).body,
			).items,
		).toEqual([]);
	});

	test("edge auth and body branches", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = await createChannel(env);
		const key = await createKey(env, channel.id);

		// content-length declared and within the cap
		const ok = await submit(env, key.token, article(), { "content-length": "400" });
		expect(ok.status).toBe(201);

		// no body at all
		const noBody = await app.request(
			"/api/v1/ingest/articles",
			{ method: "POST", headers: ingestHdr(key.token) },
			env,
		);
		expect(noBody.status).toBe(400);

		// articles:write token without a channel binding is rejected defensively
		const minted = await mintPushToken();
		const user = await env.DB.prepare("SELECT id FROM users LIMIT 1").first<{ id: string }>();
		const dto = await createPushToken(
			env.DB,
			(user as { id: string }).id,
			"unbound",
			minted.tokenPrefix,
			minted.tokenHash,
			["articles:write"],
		);
		expect(dto.scopes).toEqual(["articles:write"]);
		const unbound = await submit(env, minted.plaintext, article());
		expect(unbound.status).toBe(403);
	});

	test("cross-tenant bound key yields 404 and unset environment uses the dev base", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = await createChannel(env);
		await env.DB.prepare(
			"INSERT OR IGNORE INTO users (id, email, created_at_ms) VALUES ('user-b', 'dev-b@xray.local', 1)",
		).run();
		const userB = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
			.bind("dev-b@xray.local")
			.first<{ id: string }>();
		const minted = await mintPushToken();
		await createPushToken(
			env.DB,
			(userB as { id: string }).id,
			"thief",
			minted.tokenPrefix,
			minted.tokenHash,
			["articles:write"],
			channel.id,
		);
		expect((await submit(env, minted.plaintext, article())).status).toBe(404);

		setJwtVerifierForTests(async () => ({
			email: "dev@xray.local",
			sub: "sub-channels-noenv",
			iss: "https://hexly.cloudflareaccess.com",
		}));
		try {
			const env2 = makeEnv(createSqliteD1());
			delete env2.ENVIRONMENT;
			delete env2.AUTH_DEV_BYPASS;
			env2.CF_ACCESS_TEAM_DOMAIN = "hexly.cloudflareaccess.com";
			env2.CF_ACCESS_AUD = "aud-1";
			const jwtHeaders = {
				host: "xray.hexly.ai",
				origin: "https://xray.hexly.ai",
				"content-type": "application/json",
				"Cf-Access-Jwt-Assertion": "h.p.s",
			};
			const channelRes = await app.request(
				"/api/channels",
				{ method: "POST", headers: jwtHeaders, body: JSON.stringify({ name: "NoEnv" }) },
				env2,
			);
			expect(channelRes.status).toBe(201);
			const ch = ((await channelRes.json()) as { data: { id: number } }).data;
			const keyRes = await app.request(
				`/api/channels/${ch.id}/keys`,
				{ method: "POST", headers: jwtHeaders, body: JSON.stringify({ label: "Agent" }) },
				env2,
			);
			const key = ((await keyRes.json()) as { data: { token: string } }).data;
			const r = await app.request(
				"/api/v1/ingest/articles",
				{ method: "POST", headers: ingestHdr(key.token), body: JSON.stringify(article()) },
				env2,
			);
			expect(r.status).toBe(201);
			const { url } = (await r.json()) as { url: string };
			expect(url.startsWith("https://xray.dev.hexly.ai/channels/")).toBe(true);
		} finally {
			setJwtVerifierForTests(null);
		}
	});

	test("production url points at the browser host", async () => {
		setJwtVerifierForTests(async () => ({
			email: "dev@xray.local",
			sub: "sub-channels-prod",
			iss: "https://hexly.cloudflareaccess.com",
		}));
		try {
			const env = makeEnv(createSqliteD1(), "production");
			delete env.AUTH_DEV_BYPASS;
			env.CF_ACCESS_TEAM_DOMAIN = "hexly.cloudflareaccess.com";
			env.CF_ACCESS_AUD = "aud-1";
			env.XRAY_INGEST_RL = { limit: async () => ({ success: true }) };
			const jwtHeaders = {
				host: "xray.hexly.ai",
				origin: "https://xray.hexly.ai",
				"content-type": "application/json",
				"Cf-Access-Jwt-Assertion": "h.p.s",
			};
			const channelRes = await app.request(
				"/api/channels",
				{ method: "POST", headers: jwtHeaders, body: JSON.stringify({ name: "Prod" }) },
				env,
			);
			expect(channelRes.status).toBe(201);
			const channel = ((await channelRes.json()) as { data: { id: number } }).data;
			const keyRes = await app.request(
				`/api/channels/${channel.id}/keys`,
				{ method: "POST", headers: jwtHeaders, body: JSON.stringify({ label: "Prod agent" }) },
				env,
			);
			const key = ((await keyRes.json()) as { data: { token: string } }).data;
			const r = await app.request(
				"/api/v1/ingest/articles",
				{
					method: "POST",
					headers: ingestHdr(key.token),
					body: JSON.stringify(article()),
				},
				env,
			);
			expect(r.status).toBe(201);
			const { url } = (await r.json()) as { url: string };
			expect(url.startsWith("https://xray.hexly.ai/channels/")).toBe(true);
		} finally {
			setJwtVerifierForTests(null);
		}
	});
});
