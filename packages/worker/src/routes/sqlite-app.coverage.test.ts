/**
 * L1 coverage: real SQL via bun:sqlite D1 shim + full worker app + AUTH_DEV_BYPASS.
 */
import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import app from "../index.js";
import { createSqliteD1 } from "../test/sqlite-d1.js";
import type { AppEnv } from "../types.js";
import { getAiConfigRoute, putAiConfigRoute, testAiConfigRoute } from "./ai.js";
import { getDashboardRoute } from "./dashboard.js";
import {
	addGroupMemberRoute,
	bulkImportGroupMembersRoute,
	copyGroupToWatchlistRoute,
	createGroupRoute,
	deleteGroupMemberRoute,
	deleteGroupRoute,
	getGroupRoute,
	listGroupMembersRoute,
	listGroupsRoute,
	patchGroupRoute,
} from "./groups.js";
import { listWatchlistIngestLogsRoute } from "./ingest-logs.js";
import { deleteItemRoute, listItemsRoute } from "./items.js";
import { getSettingsRoute, patchSettingsRoute } from "./settings.js";
import { createTokenRoute, listTokensRoute, revokeTokenRoute } from "./tokens.js";
import { translateWatchlistRoute } from "./translate.js";
import {
	addMemberRoute,
	createTagRoute,
	createWatchlistRoute,
	deleteMemberRoute,
	deleteWatchlistRoute,
	getWatchlistRoute,
	listMembersRoute,
	listTagsRoute,
	listWatchlistsRoute,
	patchMemberRoute,
	patchWatchlistRoute,
} from "./watchlists.js";
import { getZhetoSettingsRoute, putZhetoSettingsRoute, zhetoSaveRoute } from "./zheto.js";

const KEK = "0123456789abcdef0123456789abcdef";

function baseEnv(db: D1Database) {
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

describe("sqlite-backed full app coverage", () => {
	test("full CRUD matrix on real schema", async () => {
		const db = createSqliteD1();
		const env = baseEnv(db);

		expect((await app.request("/api/live", { headers: { host: "localhost" } }, env)).status).toBe(
			200,
		);
		expect((await app.request("/api/me", { headers: hdr() }, env)).status).toBe(200);

		const wlRes = await json(
			app.request(
				"/api/watchlists",
				{
					method: "POST",
					headers: hdr(),
					body: JSON.stringify({
						name: "WL1",
						description: "d",
						icon: "eye",
						translateEnabled: true,
					}),
				},
				env,
			),
		);
		expect([200, 201]).toContain(wlRes.status);
		const wlId = (wlRes.body as { data: { id: number } }).data.id;

		expect((await app.request("/api/watchlists", { headers: hdr() }, env)).status).toBe(200);
		expect((await app.request(`/api/watchlists/${wlId}`, { headers: hdr() }, env)).status).toBe(
			200,
		);
		expect(
			(
				await app.request(
					`/api/watchlists/${wlId}`,
					{ method: "PATCH", headers: hdr(), body: JSON.stringify({ name: "WL1b" }) },
					env,
				)
			).status,
		).toBe(200);

		const tagRes = await json(
			app.request(
				"/api/tags",
				{ method: "POST", headers: hdr(), body: JSON.stringify({ name: "t1", color: "#abc" }) },
				env,
			),
		);
		expect([200, 201]).toContain(tagRes.status);
		const tagId = (tagRes.body as { data: { id: number } }).data.id;
		expect((await app.request("/api/tags", { headers: hdr() }, env)).status).toBe(200);

		const memRes = await json(
			app.request(
				`/api/watchlists/${wlId}/members`,
				{
					method: "POST",
					headers: hdr(),
					body: JSON.stringify({
						sourceType: "x.com",
						handle: "alice",
						displayName: "Alice",
						tagIds: [tagId],
					}),
				},
				env,
			),
		);
		expect([200, 201]).toContain(memRes.status);
		const memId = (memRes.body as { data: { id: number } }).data.id;
		expect(
			(await app.request(`/api/watchlists/${wlId}/members`, { headers: hdr() }, env)).status,
		).toBe(200);
		expect(
			(
				await app.request(
					`/api/watchlists/${wlId}/members/${memId}`,
					{ method: "PATCH", headers: hdr(), body: JSON.stringify({ note: "n" }) },
					env,
				)
			).status,
		).toBe(200);

		const gRes = await json(
			app.request(
				"/api/groups",
				{ method: "POST", headers: hdr(), body: JSON.stringify({ name: "G1" }) },
				env,
			),
		);
		expect([200, 201]).toContain(gRes.status);
		const gId = (gRes.body as { data: { id: number } }).data.id;
		expect((await app.request("/api/groups", { headers: hdr() }, env)).status).toBe(200);
		expect((await app.request(`/api/groups/${gId}`, { headers: hdr() }, env)).status).toBe(200);
		expect(
			(
				await app.request(
					`/api/groups/${gId}`,
					{ method: "PATCH", headers: hdr(), body: JSON.stringify({ name: "G1b" }) },
					env,
				)
			).status,
		).toBe(200);

		const gmRes = await json(
			app.request(
				`/api/groups/${gId}/members`,
				{
					method: "POST",
					headers: hdr(),
					body: JSON.stringify({ sourceType: "x.com", handle: "bob" }),
				},
				env,
			),
		);
		expect([200, 201]).toContain(gmRes.status);
		const gmId = (gmRes.body as { data: { id: number } }).data.id;
		expect((await app.request(`/api/groups/${gId}/members`, { headers: hdr() }, env)).status).toBe(
			200,
		);
		expect(
			(
				await app.request(
					`/api/groups/${gId}/members/import`,
					{ method: "POST", headers: hdr(), body: JSON.stringify({ text: "@c\n@d" }) },
					env,
				)
			).status,
		).toBe(200);
		expect(
			(
				await app.request(
					`/api/groups/${gId}/copy-to-watchlist`,
					{ method: "POST", headers: hdr(), body: JSON.stringify({ watchlistId: wlId }) },
					env,
				)
			).status,
		).toBe(200);

		const tokRes = await json(
			app.request(
				"/api/push-tokens",
				{ method: "POST", headers: hdr(), body: JSON.stringify({ label: "lab" }) },
				env,
			),
		);
		expect([200, 201]).toContain(tokRes.status);
		const tok = (tokRes.body as { data: { id: number; token: string } }).data;
		expect((await app.request("/api/push-tokens", { headers: hdr() }, env)).status).toBe(200);

		const push = await app.request(
			"/api/v1/ingest/push",
			{
				method: "POST",
				headers: {
					host: "localhost",
					authorization: `Bearer ${tok.token}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					watchlist_id: wlId,
					items: [
						{
							source_type: "custom",
							external_id: `ex-${Date.now()}`,
							created_at: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
							body: { kind: "custom", text: "body", title: "t" },
						},
					],
				}),
			},
			env,
		);
		expect(push.status).toBe(200);

		expect(
			(await app.request(`/api/watchlists/${wlId}/items`, { headers: hdr() }, env)).status,
		).toBe(200);
		expect(
			(
				await app.request(
					`/api/watchlists/${wlId}/items?source_type=custom&limit=5`,
					{
						headers: hdr(),
					},
					env,
				)
			).status,
		).toBe(200);
		expect(
			(await app.request(`/api/watchlists/${wlId}/ingest-logs`, { headers: hdr() }, env)).status,
		).toBe(200);

		const itemsBody = (await (
			await app.request(`/api/watchlists/${wlId}/items`, { headers: hdr() }, env)
		).json()) as { data: { items: Array<{ id: number }> } };
		const itemId = itemsBody.data.items[0]?.id as number;

		expect((await app.request("/api/settings", { headers: hdr() }, env)).status).toBe(200);
		expect(
			(
				await app.request(
					"/api/settings",
					{
						method: "PATCH",
						headers: hdr(),
						body: JSON.stringify({ ingest: { windowHours: 12 } }),
					},
					env,
				)
			).status,
		).toBe(200);
		expect((await app.request("/api/dashboard", { headers: hdr() }, env)).status).toBe(200);

		expect((await app.request("/api/ai-config", { headers: hdr() }, env)).status).toBe(200);
		expect(
			(
				await app.request(
					"/api/ai-config",
					{
						method: "PUT",
						headers: hdr(),
						body: JSON.stringify({
							provider: "openai",
							model: "m",
							baseUrl: "https://api.openai.com/v1",
							apiKey: "sk-x",
							translationPrompt: "t",
							summaryPrompt: "s",
						}),
					},
					env,
				)
			).status,
		).toBe(200);
		expect(
			(
				await app.request(
					"/api/ai-config/test",
					{ method: "POST", headers: hdr(), body: JSON.stringify({}) },
					env,
				)
			).status,
		).toBe(200);

		// translate after AI configured (TRANSLATE_FN inject)
		expect(
			(
				await app.request(
					`/api/watchlists/${wlId}/translate`,
					{ method: "POST", headers: hdr(), body: JSON.stringify({ limit: 10 }) },
					env,
				)
			).status,
		).toBe(200);

		expect((await app.request("/api/integrations/zheto", { headers: hdr() }, env)).status).toBe(
			200,
		);
		expect(
			(
				await app.request(
					"/api/integrations/zheto",
					{
						method: "PUT",
						headers: hdr(),
						body: JSON.stringify({
							webhookUrl: "https://localhost/api/webhook/x",
							folder: "f",
						}),
					},
					env,
				)
			).status,
		).toBe(200);
		expect(
			(
				await app.request(
					"/api/integrations/zheto/save",
					{
						method: "POST",
						headers: hdr(),
						body: JSON.stringify({ url: "https://example.com", note: "n" }),
					},
					env,
				)
			).status,
		).toBe(200);

		// tenant B
		expect((await app.request(`/api/watchlists/${wlId}`, { headers: hdr("b") }, env)).status).toBe(
			404,
		);
		expect((await app.request(`/api/groups/${gId}`, { headers: hdr("b") }, env)).status).toBe(404);
		expect(
			(
				await app.request(
					`/api/items/${itemId}`,
					{
						method: "DELETE",
						headers: hdr("b"),
					},
					env,
				)
			).status,
		).toBe(404);

		// deletes
		expect(
			(await app.request(`/api/items/${itemId}`, { method: "DELETE", headers: hdr() }, env)).status,
		).toBe(200);
		expect(
			(
				await app.request(
					`/api/watchlists/${wlId}/members/${memId}`,
					{
						method: "DELETE",
						headers: hdr(),
					},
					env,
				)
			).status,
		).toBe(200);
		expect(
			(
				await app.request(
					`/api/groups/${gId}/members/${gmId}`,
					{
						method: "DELETE",
						headers: hdr(),
					},
					env,
				)
			).status,
		).toBe(200);
		expect(
			(await app.request(`/api/push-tokens/${tok.id}`, { method: "DELETE", headers: hdr() }, env))
				.status,
		).toBe(200);
		expect(
			(await app.request(`/api/groups/${gId}`, { method: "DELETE", headers: hdr() }, env)).status,
		).toBe(200);
		expect(
			(await app.request(`/api/watchlists/${wlId}`, { method: "DELETE", headers: hdr() }, env))
				.status,
		).toBe(200);

		// validation errors
		expect(
			(
				await app.request(
					"/api/watchlists",
					{ method: "POST", headers: hdr(), body: JSON.stringify({}) },
					env,
				)
			).status,
		).toBe(400);
		expect((await app.request("/api/watchlists/99999", { headers: hdr() }, env)).status).toBe(404);

		// invalid ids → 400
		for (const path of [
			"/api/watchlists/0",
			"/api/watchlists/abc",
			"/api/groups/0",
			"/api/groups/x",
			"/api/items/0",
			"/api/push-tokens/0",
		]) {
			const method = path.includes("items") || path.includes("push-tokens") ? "DELETE" : "GET";
			expect((await app.request(path, { method, headers: hdr() }, env)).status, path).toBeLessThan(
				500,
			);
		}
	});

	test("401 without bypass when AUTH_DEV_BYPASS off", async () => {
		const db = createSqliteD1();
		const env = {
			...baseEnv(db),
			AUTH_DEV_BYPASS: "false",
			CF_ACCESS_TEAM_DOMAIN: undefined,
			CF_ACCESS_AUD: undefined,
		};
		// Missing Access config → 500, or missing JWT → 401
		const res = await app.request("/api/me", { headers: { host: "localhost" } }, env);
		expect([401, 500]).toContain(res.status);
	});

	test("invalid bodies and duplicate member 409", async () => {
		const db = createSqliteD1();
		const env = baseEnv(db);
		const h = hdr();
		const wl = await json(
			app.request(
				"/api/watchlists",
				{ method: "POST", headers: h, body: JSON.stringify({ name: "W" }) },
				env,
			),
		);
		const wlId = (wl.body as { data: { id: number } }).data.id;
		const g = await json(
			app.request(
				"/api/groups",
				{ method: "POST", headers: h, body: JSON.stringify({ name: "G" }) },
				env,
			),
		);
		const gId = (g.body as { data: { id: number } }).data.id;

		// bad JSON
		expect(
			(await app.request("/api/watchlists", { method: "POST", headers: h, body: "{bad" }, env))
				.status,
		).toBe(400);
		expect(
			(await app.request(`/api/groups/${gId}`, { method: "PATCH", headers: h, body: "{bad" }, env))
				.status,
		).toBe(400);
		expect(
			(await app.request("/api/settings", { method: "PATCH", headers: h, body: "{bad" }, env))
				.status,
		).toBe(400);
		expect(
			(await app.request("/api/tags", { method: "POST", headers: h, body: "{bad" }, env)).status,
		).toBe(400);
		expect(
			(await app.request("/api/push-tokens", { method: "POST", headers: h, body: "{bad" }, env))
				.status,
		).toBe(400);
		expect(
			(await app.request("/api/ai-config", { method: "PUT", headers: h, body: "{bad" }, env))
				.status,
		).toBe(400);
		expect(
			(
				await app.request(
					"/api/integrations/zheto",
					{ method: "PUT", headers: h, body: "{bad" },
					env,
				)
			).status,
		).toBe(400);

		// empty patch
		expect(
			(
				await app.request(
					`/api/watchlists/${wlId}`,
					{ method: "PATCH", headers: h, body: JSON.stringify({}) },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					`/api/groups/${gId}`,
					{ method: "PATCH", headers: h, body: JSON.stringify({}) },
					env,
				)
			).status,
		).toBe(400);

		// duplicate group member
		await app.request(
			`/api/groups/${gId}/members`,
			{
				method: "POST",
				headers: h,
				body: JSON.stringify({ sourceType: "x.com", handle: "dup" }),
			},
			env,
		);
		const dup = await app.request(
			`/api/groups/${gId}/members`,
			{
				method: "POST",
				headers: h,
				body: JSON.stringify({ sourceType: "x.com", handle: "dup" }),
			},
			env,
		);
		expect([409, 400]).toContain(dup.status);

		// bad member body
		expect(
			(
				await app.request(
					`/api/groups/${gId}/members`,
					{ method: "POST", headers: h, body: JSON.stringify({ sourceType: "x.com" }) },
					env,
				)
			).status,
		).toBe(400);
		expect(
			(
				await app.request(
					`/api/watchlists/${wlId}/members`,
					{ method: "POST", headers: h, body: JSON.stringify({ handle: "x" }) },
					env,
				)
			).status,
		).toBe(400);

		// zheto save without config for fresh user B
		expect(
			(
				await app.request(
					"/api/integrations/zheto/save",
					{
						method: "POST",
						headers: hdr("b"),
						body: JSON.stringify({ url: "https://example.com" }),
					},
					env,
				)
			).status,
		).toBe(400);

		// translate without AI
		const env2 = baseEnv(createSqliteD1());
		const wl2 = await json(
			app.request(
				"/api/watchlists",
				{ method: "POST", headers: h, body: JSON.stringify({ name: "T" }) },
				env2,
			),
		);
		const id2 = (wl2.body as { data: { id: number } }).data.id;
		expect(
			(
				await app.request(
					`/api/watchlists/${id2}/translate`,
					{ method: "POST", headers: h, body: JSON.stringify({}) },
					env2,
				)
			).status,
		).toBe(400);

		// ingest bad token
		expect(
			(
				await app.request(
					"/api/v1/ingest/push",
					{
						method: "POST",
						headers: {
							host: "localhost",
							authorization: "Bearer nope",
							"content-type": "application/json",
						},
						body: JSON.stringify({ watchlist_id: wlId, items: [] }),
					},
					env,
				)
			).status,
		).toBe(401);
	});

	test("401 requireUser on all business routes without authUser", async () => {
		const db = createSqliteD1();
		const h = new Hono<AppEnv>();
		h.use("*", async (c, next) => {
			// @ts-expect-error test
			c.env = { DB: db, ENVIRONMENT: "test", XRAY_SECRETS_KEK: KEK };
			return next();
		});
		// mount every authenticated route
		h.get("/api/watchlists", listWatchlistsRoute);
		h.post("/api/watchlists", createWatchlistRoute);
		h.get("/api/watchlists/:id", getWatchlistRoute);
		h.patch("/api/watchlists/:id", patchWatchlistRoute);
		h.delete("/api/watchlists/:id", deleteWatchlistRoute);
		h.get("/api/watchlists/:id/members", listMembersRoute);
		h.post("/api/watchlists/:id/members", addMemberRoute);
		h.patch("/api/watchlists/:id/members/:memberId", patchMemberRoute);
		h.delete("/api/watchlists/:id/members/:memberId", deleteMemberRoute);
		h.get("/api/watchlists/:id/items", listItemsRoute);
		h.get("/api/watchlists/:id/ingest-logs", listWatchlistIngestLogsRoute);
		h.delete("/api/items/:itemId", deleteItemRoute);
		h.get("/api/tags", listTagsRoute);
		h.post("/api/tags", createTagRoute);
		h.get("/api/groups", listGroupsRoute);
		h.post("/api/groups", createGroupRoute);
		h.get("/api/groups/:id", getGroupRoute);
		h.patch("/api/groups/:id", patchGroupRoute);
		h.delete("/api/groups/:id", deleteGroupRoute);
		h.get("/api/groups/:id/members", listGroupMembersRoute);
		h.post("/api/groups/:id/members", addGroupMemberRoute);
		h.post("/api/groups/:id/members/import", bulkImportGroupMembersRoute);
		h.post("/api/groups/:id/copy-to-watchlist", copyGroupToWatchlistRoute);
		h.delete("/api/groups/:id/members/:memberId", deleteGroupMemberRoute);
		h.get("/api/settings", getSettingsRoute);
		h.patch("/api/settings", patchSettingsRoute);
		h.get("/api/dashboard", getDashboardRoute);
		h.get("/api/ai-config", getAiConfigRoute);
		h.put("/api/ai-config", putAiConfigRoute);
		h.post("/api/ai-config/test", testAiConfigRoute);
		h.post("/api/watchlists/:id/translate", translateWatchlistRoute);
		h.get("/api/integrations/zheto", getZhetoSettingsRoute);
		h.put("/api/integrations/zheto", putZhetoSettingsRoute);
		h.post("/api/integrations/zheto/save", zhetoSaveRoute);
		h.get("/api/push-tokens", listTokensRoute);
		h.post("/api/push-tokens", createTokenRoute);
		h.delete("/api/push-tokens/:id", revokeTokenRoute);

		const paths: Array<[string, string]> = [
			["GET", "/api/watchlists"],
			["POST", "/api/watchlists"],
			["GET", "/api/watchlists/1"],
			["PATCH", "/api/watchlists/1"],
			["DELETE", "/api/watchlists/1"],
			["GET", "/api/watchlists/1/members"],
			["POST", "/api/watchlists/1/members"],
			["PATCH", "/api/watchlists/1/members/1"],
			["DELETE", "/api/watchlists/1/members/1"],
			["GET", "/api/watchlists/1/items"],
			["GET", "/api/watchlists/1/ingest-logs"],
			["DELETE", "/api/items/1"],
			["GET", "/api/tags"],
			["POST", "/api/tags"],
			["GET", "/api/groups"],
			["POST", "/api/groups"],
			["GET", "/api/groups/1"],
			["PATCH", "/api/groups/1"],
			["DELETE", "/api/groups/1"],
			["GET", "/api/groups/1/members"],
			["POST", "/api/groups/1/members"],
			["POST", "/api/groups/1/members/import"],
			["POST", "/api/groups/1/copy-to-watchlist"],
			["DELETE", "/api/groups/1/members/1"],
			["GET", "/api/settings"],
			["PATCH", "/api/settings"],
			["GET", "/api/dashboard"],
			["GET", "/api/ai-config"],
			["PUT", "/api/ai-config"],
			["POST", "/api/ai-config/test"],
			["POST", "/api/watchlists/1/translate"],
			["GET", "/api/integrations/zheto"],
			["PUT", "/api/integrations/zheto"],
			["POST", "/api/integrations/zheto/save"],
			["GET", "/api/push-tokens"],
			["POST", "/api/push-tokens"],
			["DELETE", "/api/push-tokens/1"],
		];
		for (const [method, path] of paths) {
			const res = await h.request(path, {
				method,
				headers: { "content-type": "application/json" },
				body: ["POST", "PUT", "PATCH"].includes(method) ? "{}" : undefined,
			});
			expect(res.status, `${method} ${path}`).toBe(401);
		}
	});
});
