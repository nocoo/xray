import { Hono } from "hono";
import { afterEach, describe, expect, test, vi } from "vitest";
import app from "../index.js";
import * as previews from "../lib/link-preview.js";
import { createChannel, ingestChannelArticle } from "../repos/channels.js";
import { createChannelKey } from "../repos/push-tokens.js";
import { createSqliteD1 } from "../test/sqlite-d1.js";
import type { AppEnv } from "../types.js";
import { articleLinkPreviewRoute } from "./link-preview.js";

const url = "https://news.example.com/story";
const markdown = `[News](${url}#section)\n\n[HTTP](http://example.com/)\n\n[Local](https://127.0.0.1/)\n\n![Image](https://images.example.com/image.png)\n\n\`https://example.com/code\``;

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

async function setup() {
	const DB = createSqliteD1();
	const env = {
		DB,
		ENVIRONMENT: "test",
		AUTH_DEV_BYPASS: "true",
		ALLOWED_EMAILS: "dev@xray.local,dev-b@xray.local",
	} as AppEnv["Bindings"];
	const pending: Promise<unknown>[] = [];
	const ctx = {
		waitUntil: (promise: Promise<unknown>) => {
			pending.push(promise);
		},
		passThroughOnException() {},
		props: {},
	};
	const cache = new Map<string, Response>();
	const match = vi.fn(async (key: Request) => cache.get(key.url)?.clone());
	const put = vi.fn(async (key: Request, response: Response) => {
		cache.set(key.url, response);
	});
	vi.stubGlobal("caches", { default: { match, put } });
	const fetched = vi
		.spyOn(previews, "fetchLinkPreview")
		.mockResolvedValue({ ...previews.unavailablePreview(url), title: "Public title" });
	async function call(path: string, actor = "a", host = "127.0.0.1") {
		const response = await app.fetch(
			new Request(`http://127.0.0.1${path}`, { headers: { host, "x-test-actor": actor } }),
			env,
			ctx,
		);
		return {
			status: response.status,
			body: (await response.json()) as { data?: unknown; error?: string },
			headers: response.headers,
		};
	}
	const identity = await call("/api/me");
	const userId = (identity.body as unknown as { user: { id: string } }).user.id;
	const channel = await createChannel(DB, userId, { name: "Preview" });
	const key = await createChannelKey(DB, userId, channel.id, "Producer", "prefix", "hash-preview");
	const result = await ingestChannelArticle(
		DB,
		userId,
		channel.id,
		{ keyId: key.id, label: key.label },
		{
			externalId: "preview",
			title: "Report",
			reportDate: "2026-09-22",
			markdown,
			summary: null,
			author: null,
		},
	);
	if (result.status !== "created") throw Error("expected article");
	const path = `/api/channels/${channel.id}/articles/${result.article.id}/link-preview`;
	return {
		DB,
		env,
		call,
		channel,
		articleId: result.article.id,
		path,
		pending,
		match,
		put,
		fetched,
		userId,
	};
}

describe("browser article link previews", () => {
	test("requires article ownership and actual Markdown link membership before cache or outbound", async () => {
		const s = await setup();
		for (const path of [
			"/api/channels/bad/articles/1/link-preview",
			"/api/channels/1/articles/0/link-preview",
		])
			expect((await s.call(path)).status).toBe(400);
		expect((await s.call("/api/channels/9999/articles/1/link-preview?url=x")).status).toBe(404);
		expect(
			(await s.call(`/api/channels/${s.channel.id}/articles/9999/link-preview?url=x`)).status,
		).toBe(404);
		expect((await s.call(`${s.path}?url=${encodeURIComponent(url)}`, "b")).status).toBe(404);
		expect(
			(await s.call(`${s.path}?url=${encodeURIComponent(url)}`, "a", "xray-ingest.worker.hexly.ai"))
				.status,
		).toBe(404);
		for (const value of [
			"",
			"bad",
			"x".repeat(4097),
			"https://example.com/code",
			"https://images.example.com/image.png",
			"https://example.com/unlisted",
			"javascript:alert(1)",
			"https://user@news.example.com/story",
		]) {
			expect((await s.call(`${s.path}?url=${encodeURIComponent(value)}`)).status).toBe(400);
		}
		expect((await s.call(s.path)).status).toBe(400);
		expect(s.fetched).not.toHaveBeenCalled();
		expect(s.match).not.toHaveBeenCalled();
		const bare = new Hono<AppEnv>();
		bare.get("/api/channels/:id/articles/:articleId/link-preview", articleLinkPreviewRoute);
		expect((await bare.request(s.path)).status).toBe(401);
	});
	test("valid HTTP or private links return null metadata without outbound", async () => {
		const s = await setup();
		for (const value of ["http://example.com/", "https://127.0.0.1/"]) {
			const response = await s.call(`${s.path}?url=${encodeURIComponent(value)}`);
			expect(response.status).toBe(200);
			expect(response.body.data).toEqual(previews.unavailablePreview(value));
		}
		expect(s.fetched).not.toHaveBeenCalled();
		expect(s.match).not.toHaveBeenCalled();
	});
	test("normalizes fragments, caches by tenant, sets private response and rechecks updated content", async () => {
		const s = await setup();
		const response = await s.call(`${s.path}?url=${encodeURIComponent(`${url}#new`)}`);
		expect(response.status).toBe(200);
		expect(response.body.data).toMatchObject({ url, title: "Public title" });
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		await Promise.all(s.pending);
		expect(s.put).toHaveBeenCalledTimes(1);
		expect(s.put.mock.calls[0]?.[1].headers.get("cache-control")).toBe("public, max-age=900");
		expect((await s.call(`${s.path}?url=${encodeURIComponent(url)}`)).body).toEqual(response.body);
		expect(s.fetched).toHaveBeenCalledTimes(1);
		await s.DB.prepare("UPDATE channel_articles SET markdown = '' WHERE id = ?")
			.bind(s.articleId)
			.run();
		expect((await s.call(`${s.path}?url=${encodeURIComponent(url)}`)).status).toBe(400);
		expect(s.match).toHaveBeenCalledTimes(2);
	});
	test("two owners of the same public link get separate cache entries", async () => {
		const s = await setup();
		await s.call(`${s.path}?url=${encodeURIComponent(url)}`);
		await Promise.all(s.pending);
		const identity = await s.call("/api/me", "b");
		const userId = (identity.body as unknown as { user: { id: string } }).user.id;
		const channel = await createChannel(s.DB, userId, { name: "Other tenant" });
		const key = await createChannelKey(s.DB, userId, channel.id, "Other", "other", "other-hash");
		const result = await ingestChannelArticle(
			s.DB,
			userId,
			channel.id,
			{ keyId: key.id, label: key.label },
			{
				externalId: "other",
				title: "Other report",
				reportDate: "2026-09-22",
				markdown,
				summary: null,
				author: null,
			},
		);
		if (result.status !== "created") throw Error("expected article");
		expect(
			(
				await s.call(
					`/api/channels/${channel.id}/articles/${result.article.id}/link-preview?url=${encodeURIComponent(url)}`,
					"b",
				)
			).status,
		).toBe(200);
		await Promise.all(s.pending);
		expect(s.fetched).toHaveBeenCalledTimes(2);
		expect(s.put.mock.calls[0]?.[0].url).not.toBe(s.put.mock.calls[1]?.[0].url);
	});
	test("cache failures do not lose a usable preview", async () => {
		const s = await setup();
		s.match.mockRejectedValue(Error("cache read unavailable"));
		s.put.mockRejectedValue(Error("cache write unavailable"));
		const response = await s.call(`${s.path}?url=${encodeURIComponent(url)}`);
		expect(response.status).toBe(200);
		expect(response.body.data).toMatchObject({ title: "Public title" });
		await Promise.all(s.pending);
	});
});
