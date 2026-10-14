import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import app from "../index.js";
import { identityHeaders, localIdentityBindings } from "../test/signed-identity.js";
import { createSqliteD1 } from "../test/sqlite-d1.js";
import type { AppEnv } from "../types.js";
import { patchChannelKeyRoute } from "./channels.js";
import { listManagedTokensRoute, patchTokenRoute } from "./tokens.js";

const KEK = "0123456789abcdef0123456789abcdef";
const INGEST_HOST = "xray-ingest.worker.hexly.ai";

function makeEnv(db: D1Database, environment = "test") {
	return {
		ENVIRONMENT: environment,
		...localIdentityBindings,
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
		...identityHeaders(actor),
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

describe("account-wide token management", () => {
	test("GET /api/tokens lists active watchlist and channel keys for the tenant", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = dataOf<{ id: number; name: string }>(
			(
				await call(
					"/api/channels",
					{ method: "POST", headers: hdr(), body: JSON.stringify({ name: "Research" }) },
					env,
				)
			).body,
		);
		const watch = dataOf<{ id: number; token: string; tokenPrefix: string }>(
			(
				await call(
					"/api/push-tokens",
					{ method: "POST", headers: hdr(), body: JSON.stringify({ label: "Watchlist key" }) },
					env,
				)
			).body,
		);
		const key = dataOf<{ id: number; token: string }>(
			(
				await call(
					`/api/channels/${channel.id}/keys`,
					{ method: "POST", headers: hdr(), body: JSON.stringify({ label: "Research Agent" }) },
					env,
				)
			).body,
		);
		await call(
			`/api/channels/${channel.id}/keys/${key.id}/tags`,
			{
				method: "PUT",
				headers: hdr(),
				body: JSON.stringify({
					tagIds: [
						dataOf<{ id: number }>(
							(
								await call(
									"/api/tags",
									{ method: "POST", headers: hdr(), body: JSON.stringify({ name: "Science" }) },
									env,
								)
							).body,
						).id,
					],
				}),
			},
			env,
		);
		const listed = await call("/api/tokens", { headers: hdr() }, env);
		expect(listed.status).toBe(200);
		expect(listed.text).not.toContain(watch.token);
		expect(listed.text).not.toContain(key.token);
		expect(listed.text).not.toMatch(/token_hash/);
		const tokens = dataOf<
			Array<{
				id: number;
				label: string;
				channelId: number | null;
				channelName: string | null;
				tags: Array<{ name: string }>;
				scopes: string[];
			}>
		>(listed.body);
		expect(tokens.map((t) => t.id)).toEqual([key.id, watch.id]);
		expect(tokens.find((t) => t.id === watch.id)).toMatchObject({
			label: "Watchlist key",
			channelId: null,
			channelName: null,
			tags: [],
			scopes: ["ingest:read", "ingest:push"],
		});
		expect(tokens.find((t) => t.id === key.id)).toMatchObject({
			label: "Research Agent",
			channelId: channel.id,
			channelName: "Research",
			tags: [{ name: "Science" }],
			scopes: ["articles:write"],
		});
		expect(
			dataOf<Array<{ label: string }>>(
				(await call("/api/push-tokens", { headers: hdr() }, env)).body,
			).map((t) => t.label),
		).toEqual(["Watchlist key"]);
		expect(dataOf<unknown[]>((await call("/api/tokens", { headers: hdr("b") }, env)).body)).toEqual(
			[],
		);
	});

	test("PATCH renames active owned tokens and rejects invalid labels", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = dataOf<{ id: number }>(
			(
				await call(
					"/api/channels",
					{ method: "POST", headers: hdr(), body: JSON.stringify({ name: "Research" }) },
					env,
				)
			).body,
		);
		const watch = dataOf<{ id: number }>(
			(
				await call(
					"/api/push-tokens",
					{ method: "POST", headers: hdr(), body: JSON.stringify({ label: "Watchlist key" }) },
					env,
				)
			).body,
		);
		const key = dataOf<{ id: number; token: string }>(
			(
				await call(
					`/api/channels/${channel.id}/keys`,
					{ method: "POST", headers: hdr(), body: JSON.stringify({ label: "Research Agent" }) },
					env,
				)
			).body,
		);
		const submitted = await call(
			"/api/v1/ingest/articles",
			{
				method: "POST",
				headers: ingestHdr(key.token),
				body: JSON.stringify({
					external_id: "ext-1",
					title: "日报",
					report_date: "2026-09-22",
					markdown: "## 进展",
				}),
			},
			env,
		);
		expect(submitted.status).toBe(201);
		const articleId = (submitted.body as { id: number }).id;

		expect(
			dataOf(
				(
					await call(
						`/api/push-tokens/${watch.id}`,
						{ method: "PATCH", headers: hdr(), body: JSON.stringify({ label: "  Renamed WL  " }) },
						env,
					)
				).body,
			),
		).toEqual({ updated: true });
		expect(
			dataOf(
				(
					await call(
						`/api/channels/${channel.id}/keys/${key.id}`,
						{ method: "PATCH", headers: hdr(), body: JSON.stringify({ label: "Daily agent" }) },
						env,
					)
				).body,
			),
		).toEqual({ updated: true });

		const tokens = dataOf<Array<{ id: number; label: string }>>(
			(await call("/api/tokens", { headers: hdr() }, env)).body,
		);
		expect(tokens.find((t) => t.id === watch.id)?.label).toBe("Renamed WL");
		expect(tokens.find((t) => t.id === key.id)?.label).toBe("Daily agent");
		expect(
			dataOf<{ sourceLabel: string }>(
				(await call(`/api/channels/${channel.id}/articles/${articleId}`, { headers: hdr() }, env))
					.body,
			).sourceLabel,
		).toBe("Research Agent");

		for (const [path, body] of [
			[`/api/push-tokens/${watch.id}`, JSON.stringify({ label: "a".repeat(65) })],
			[`/api/push-tokens/${watch.id}`, JSON.stringify({ label: "   " })],
			[`/api/push-tokens/${watch.id}`, "{"],
			[`/api/channels/${channel.id}/keys/${key.id}`, JSON.stringify({ label: 1 })],
		] as const) {
			expect((await call(path, { method: "PATCH", headers: hdr(), body }, env)).status, body).toBe(
				400,
			);
		}
		expect(
			dataOf<Array<{ id: number; label: string }>>(
				(await call("/api/tokens", { headers: hdr() }, env)).body,
			).find((t) => t.id === watch.id)?.label,
		).toBe("Renamed WL");
	});

	test("PATCH is tenant-scoped, active-only, and kind-bound", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = dataOf<{ id: number }>(
			(
				await call(
					"/api/channels",
					{ method: "POST", headers: hdr(), body: JSON.stringify({ name: "Research" }) },
					env,
				)
			).body,
		);
		const other = dataOf<{ id: number }>(
			(
				await call(
					"/api/channels",
					{ method: "POST", headers: hdr(), body: JSON.stringify({ name: "Other" }) },
					env,
				)
			).body,
		);
		const watch = dataOf<{ id: number }>(
			(
				await call(
					"/api/push-tokens",
					{ method: "POST", headers: hdr(), body: JSON.stringify({ label: "Watchlist key" }) },
					env,
				)
			).body,
		);
		const key = dataOf<{ id: number }>(
			(
				await call(
					`/api/channels/${channel.id}/keys`,
					{ method: "POST", headers: hdr(), body: JSON.stringify({ label: "Research Agent" }) },
					env,
				)
			).body,
		);
		const body = JSON.stringify({ label: "Hijack" });
		for (const path of [
			`/api/push-tokens/${watch.id}`,
			`/api/channels/${channel.id}/keys/${key.id}`,
		]) {
			expect(
				(await call(path, { method: "PATCH", headers: hdr("b"), body }, env)).status,
				path,
			).toBe(404);
		}
		expect(
			(await call(`/api/push-tokens/${key.id}`, { method: "PATCH", headers: hdr(), body }, env))
				.status,
		).toBe(404);
		expect(
			(
				await call(
					`/api/channels/${channel.id}/keys/${watch.id}`,
					{ method: "PATCH", headers: hdr(), body },
					env,
				)
			).status,
		).toBe(404);
		expect(
			(
				await call(
					`/api/channels/${other.id}/keys/${key.id}`,
					{ method: "PATCH", headers: hdr(), body },
					env,
				)
			).status,
		).toBe(404);
		expect(
			(await call("/api/push-tokens/0", { method: "PATCH", headers: hdr(), body }, env)).status,
		).toBe(400);
		expect(
			(
				await call(
					`/api/channels/${channel.id}/keys/0`,
					{ method: "PATCH", headers: hdr(), body },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await call(
					`/api/channels/999/keys/${key.id}`,
					{ method: "PATCH", headers: hdr(), body },
					env,
				)
			).status,
		).toBe(404);
		await call(`/api/push-tokens/${watch.id}`, { method: "DELETE", headers: hdr() }, env);
		await call(
			`/api/channels/${channel.id}/keys/${key.id}`,
			{ method: "DELETE", headers: hdr() },
			env,
		);
		expect(
			(
				await call(
					`/api/push-tokens/${watch.id}`,
					{ method: "PATCH", headers: hdr(), body: JSON.stringify({ label: "dead" }) },
					env,
				)
			).status,
		).toBe(404);
		expect(
			(
				await call(
					`/api/channels/${channel.id}/keys/${key.id}`,
					{ method: "PATCH", headers: hdr(), body: JSON.stringify({ label: "dead" }) },
					env,
				)
			).status,
		).toBe(404);
	});

	test("management APIs reject ingest hosts and Bearer admin", async () => {
		const env = makeEnv(createSqliteD1());
		const channel = dataOf<{ id: number }>(
			(
				await call(
					"/api/channels",
					{ method: "POST", headers: hdr(), body: JSON.stringify({ name: "Research" }) },
					env,
				)
			).body,
		);
		const watch = dataOf<{ id: number; token: string }>(
			(
				await call(
					"/api/push-tokens",
					{ method: "POST", headers: hdr(), body: JSON.stringify({ label: "Watchlist key" }) },
					env,
				)
			).body,
		);
		const key = dataOf<{ id: number; token: string }>(
			(
				await call(
					`/api/channels/${channel.id}/keys`,
					{ method: "POST", headers: hdr(), body: JSON.stringify({ label: "Research Agent" }) },
					env,
				)
			).body,
		);
		for (const [path, method, token] of [
			["/api/tokens", "GET", watch.token],
			[`/api/push-tokens/${watch.id}`, "PATCH", watch.token],
			[`/api/channels/${channel.id}/keys/${key.id}`, "PATCH", key.token],
		] as const) {
			const body = method === "GET" ? undefined : JSON.stringify({ label: "Hijack" });
			expect(
				(await call(path, { method, headers: ingestHdr(token), body }, env)).status,
				`${method} ${path} ingest`,
			).toBe(404);
			const prod = {
				...env,
				ENVIRONMENT: "production",
				XRAY_LOCAL_JWKS: undefined,
				XRAY_EXTERNAL: undefined,
				CF_ACCESS_TEAM_DOMAIN: "hexly.cloudflareaccess.com",
				CF_ACCESS_AUD: "aud",
			};
			expect(
				(
					await call(
						path,
						{
							method,
							headers: ingestHdr(token, {
								host: "xray.hexly.ai",
								origin: "https://xray.hexly.ai",
							}),
							body,
						},
						prod,
					)
				).status,
				`${method} ${path} bearer`,
			).toBe(401);
		}
	});

	test("handlers reject requests without an authenticated user", async () => {
		const bare = new Hono<AppEnv>();
		bare.use("*", async (c, next) => {
			// @ts-expect-error test env
			c.env = { DB: createSqliteD1(), ENVIRONMENT: "test" };
			return next();
		});
		bare.get("/api/tokens", listManagedTokensRoute);
		bare.patch("/api/push-tokens/:id", patchTokenRoute);
		bare.patch("/api/channels/:id/keys/:keyId", patchChannelKeyRoute);
		for (const [path, method] of [
			["/api/tokens", "GET"],
			["/api/push-tokens/1", "PATCH"],
			["/api/channels/1/keys/1", "PATCH"],
		] as const) {
			const res = await bare.request(path, {
				method,
				headers: { "content-type": "application/json" },
				body: method === "GET" ? undefined : JSON.stringify({ label: "x" }),
			});
			expect(res.status, `${method} ${path}`).toBe(401);
		}
	});
});
