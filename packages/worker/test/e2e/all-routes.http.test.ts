/**
 * L2 real-HTTP matrix — every /api/* route on worker index (docs/06 OBJECTIVE).
 * Hits local wrangler via fetch (not app.request).
 */
import { describe, expect, test } from "vitest";
import { AI_BASE_URL, AI_MODEL, ZHETO_WEBHOOK_URL } from "../../../../fixtures/primitives.js";
import {
	BASE,
	createGroup,
	createWatchlist,
	dataOf,
	ingestHeaders,
	jsonFetch,
	mintToken,
	rawHttp,
} from "./helpers.js";

describe("L2 real HTTP — all API routes", () => {
	test("GET /api/channels/:id/articles/:articleId/link-preview", async () => {
		expect((await jsonFetch("/api/channels/0/articles/0/link-preview")).status).toBe(400);
	});

	test("GET /api/live", async () => {
		const res = await fetch(`${BASE}/api/live`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok?: boolean; status?: string };
		expect(body.ok === true || body.status === "live" || res.ok).toBeTruthy();
	});

	test("GET /api/me", async () => {
		const { status, body } = await jsonFetch<{ authenticated: boolean; user: { email: string } }>(
			"/api/me",
		);
		expect(status).toBe(200);
		expect(body.authenticated).toBe(true);
		expect(body.user.email).toContain("@");
	});

	test("GET /api/media/proxy", async () => {
		// Route gate: hit the handler (missing url → 400). Full CDN stream is unit-tested.
		const { status, body } = await jsonFetch<{ error?: string }>("/api/media/proxy");
		expect(status).toBe(400);
		expect(body.error).toMatch(/url/i);

		const blocked = await jsonFetch<{ error?: string }>(
			`/api/media/proxy?url=${encodeURIComponent("https://evil.com/x.mp4")}`,
		);
		expect(blocked.status).toBe(403);
	});

	test("watchlists CRUD + members + tags + items + ingest-logs + delete item", async () => {
		const wl = await createWatchlist(`l2-wl-${Date.now()}`);
		expect(wl.id).toBeGreaterThan(0);

		{
			const { status, body } = await jsonFetch("/api/watchlists");
			expect(status).toBe(200);
			const list = dataOf<Array<{ id: number }>>(body);
			expect(list.some((w) => w.id === wl.id)).toBe(true);
		}

		{
			const { status, body } = await jsonFetch(`/api/watchlists/${wl.id}`);
			expect(status).toBe(200);
			expect(dataOf<{ name: string }>(body).name).toContain("l2-wl-");
		}

		{
			const { status, body } = await jsonFetch(`/api/watchlists/${wl.id}`, {
				method: "PATCH",
				body: JSON.stringify({ name: `l2-wl-patched-${wl.id}`, translateEnabled: true }),
			});
			expect(status).toBe(200);
			expect(dataOf<{ translateEnabled: boolean }>(body).translateEnabled).toBe(true);
		}

		const tag = await (async () => {
			const { status, body } = await jsonFetch("/api/tags", {
				method: "POST",
				body: JSON.stringify({ name: `t-${Date.now()}`, color: "#abc" }),
			});
			expect([200, 201]).toContain(status);
			return dataOf<{ id: number }>(body);
		})();

		{
			const { status, body } = await jsonFetch("/api/tags");
			expect(status).toBe(200);
			expect(dataOf<Array<{ id: number }>>(body).some((t) => t.id === tag.id)).toBe(true);
		}

		const member = await (async () => {
			const { status, body } = await jsonFetch(`/api/watchlists/${wl.id}/members`, {
				method: "POST",
				body: JSON.stringify({
					sourceType: "x.com",
					handle: "l2alice",
					displayName: "Alice",
					tagIds: [tag.id],
				}),
			});
			expect([200, 201]).toContain(status);
			return dataOf<{ id: number }>(body);
		})();

		{
			const { status, body } = await jsonFetch(`/api/watchlists/${wl.id}/members`);
			expect(status).toBe(200);
			expect(dataOf<Array<{ id: number }>>(body).some((m) => m.id === member.id)).toBe(true);
		}

		{
			const { status, body } = await jsonFetch(`/api/watchlists/${wl.id}/members/${member.id}`, {
				method: "PATCH",
				body: JSON.stringify({ note: "l2-note", displayName: "Alice2" }),
			});
			expect(status).toBe(200);
			expect(dataOf<{ note: string | null }>(body).note).toBe("l2-note");
		}

		const tok = await mintToken(`l2-${wl.id}`);
		{
			const res = await fetch(`${BASE}/api/v1/ingest/graph`, {
				headers: ingestHeaders(tok.token),
			});
			expect(res.status).toBe(200);
			const graph = (await res.json()) as { watchlists: Array<{ id: number }> };
			expect(graph.watchlists.some((w) => w.id === wl.id)).toBe(true);
		}
		const externalId = `l2-item-${Date.now()}`;
		{
			const res = await fetch(`${BASE}/api/v1/ingest/push`, {
				method: "POST",
				headers: ingestHeaders(tok.token),
				body: JSON.stringify({
					watchlist_id: wl.id,
					items: [
						{
							source_type: "custom",
							external_id: externalId,
							created_at: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
							body: { kind: "custom", text: "l2 body", title: "l2" },
						},
					],
				}),
			});
			expect(res.status).toBe(200);
			const push = (await res.json()) as { ok: boolean; accepted: number };
			expect(push.ok).toBe(true);
			expect(push.accepted).toBeGreaterThanOrEqual(1);
		}

		let itemId = 0;
		{
			const { status, body } = await jsonFetch(`/api/watchlists/${wl.id}/items?limit=20`);
			expect(status).toBe(200);
			const page = dataOf<{ items: Array<{ id: number; externalId: string }> }>(body);
			const hit = page.items.find((i) => i.externalId === externalId);
			expect(hit).toBeTruthy();
			if (!hit) throw new Error("Ingested item missing");
			itemId = hit.id;
		}

		{
			const { status, body } = await jsonFetch(`/api/watchlists/${wl.id}/ingest-logs?limit=10`);
			expect(status).toBe(200);
			expect(Array.isArray(dataOf(body))).toBe(true);
		}

		{
			const { status, body } = await jsonFetch(`/api/items/${itemId}`, { method: "DELETE" });
			expect(status).toBe(200);
			expect(dataOf<{ deleted: boolean }>(body).deleted).toBe(true);
		}

		{
			const { status } = await jsonFetch(`/api/watchlists/${wl.id}/members/${member.id}`, {
				method: "DELETE",
			});
			expect(status).toBe(200);
		}

		{
			const { status } = await jsonFetch(`/api/watchlists/${wl.id}`, { method: "DELETE" });
			expect(status).toBe(200);
		}

		// token revoke
		{
			const { status } = await jsonFetch(`/api/push-tokens/${tok.id}`, { method: "DELETE" });
			expect(status).toBe(200);
		}
	});

	test("groups CRUD + members + import + copy-to-watchlist", async () => {
		const g = await createGroup(`l2-g-${Date.now()}`);
		const wl = await createWatchlist(`l2-copy-${Date.now()}`);

		{
			const { status, body } = await jsonFetch("/api/groups");
			expect(status).toBe(200);
			expect(dataOf<Array<{ id: number }>>(body).some((x) => x.id === g.id)).toBe(true);
		}
		{
			const { status, body } = await jsonFetch(`/api/groups/${g.id}`);
			expect(status).toBe(200);
			expect(dataOf<{ id: number }>(body).id).toBe(g.id);
		}
		{
			const { status, body } = await jsonFetch(`/api/groups/${g.id}`, {
				method: "PATCH",
				body: JSON.stringify({ name: `l2-g-renamed-${g.id}` }),
			});
			expect(status).toBe(200);
			expect(dataOf<{ name: string }>(body).name).toContain("renamed");
		}

		const gm = await (async () => {
			const { status, body } = await jsonFetch(`/api/groups/${g.id}/members`, {
				method: "POST",
				body: JSON.stringify({ sourceType: "x.com", handle: "groupbob" }),
			});
			expect([200, 201]).toContain(status);
			return dataOf<{ id: number }>(body);
		})();

		{
			const { status, body } = await jsonFetch(`/api/groups/${g.id}/members`);
			expect(status).toBe(200);
			expect(dataOf<Array<{ id: number }>>(body).some((m) => m.id === gm.id)).toBe(true);
		}

		{
			const { status, body } = await jsonFetch(`/api/groups/${g.id}/members/import`, {
				method: "POST",
				body: JSON.stringify({ text: "@imp1\n@imp2" }),
			});
			expect(status).toBe(200);
			const r = dataOf<{ added: number; total: number }>(body);
			expect(r.total).toBeGreaterThanOrEqual(2);
		}

		{
			const { status, body } = await jsonFetch(`/api/groups/${g.id}/copy-to-watchlist`, {
				method: "POST",
				body: JSON.stringify({ watchlistId: wl.id }),
			});
			expect(status).toBe(200);
			const r = dataOf<{ added: number }>(body);
			expect(r.added).toBeGreaterThanOrEqual(1);
		}

		{
			const { status } = await jsonFetch(`/api/groups/${g.id}/members/${gm.id}`, {
				method: "DELETE",
			});
			expect(status).toBe(200);
		}
		{
			const { status } = await jsonFetch(`/api/groups/${g.id}`, { method: "DELETE" });
			expect(status).toBe(200);
		}
	});

	test("settings + dashboard + push-tokens list", async () => {
		{
			const { status, body } = await jsonFetch("/api/settings");
			expect(status).toBe(200);
			expect(dataOf<{ ingest: { windowHours: number } }>(body).ingest.windowHours).toBeGreaterThan(
				0,
			);
		}
		{
			const { status, body } = await jsonFetch("/api/settings", {
				method: "PATCH",
				body: JSON.stringify({ ingest: { windowHours: 36 } }),
			});
			expect(status).toBe(200);
			expect(dataOf<{ ingest: { windowHours: number } }>(body).ingest.windowHours).toBe(36);
		}
		{
			const { status, body } = await jsonFetch("/api/dashboard");
			expect(status).toBe(200);
			const d = dataOf<{ watchlistCount: number }>(body);
			expect(typeof d.watchlistCount).toBe("number");
		}
		{
			const { status, body } = await jsonFetch("/api/push-tokens");
			expect(status).toBe(200);
			expect(Array.isArray(dataOf(body))).toBe(true);
		}
	});

	test("ai-config get/put/test + translate", async () => {
		{
			const { status } = await jsonFetch("/api/ai-config");
			expect(status).toBe(200);
		}
		{
			const { status, body } = await jsonFetch("/api/ai-config", {
				method: "PUT",
				body: JSON.stringify({
					provider: "openai",
					model: AI_MODEL,
					baseUrl: AI_BASE_URL,
					apiKey: "sk-l2-test-key-not-real",
					translationPrompt: "translate",
				}),
			});
			expect(status).toBe(200);
			const cfg = dataOf<{ hasApiKey: boolean; provider: string }>(body);
			expect(cfg.hasApiKey).toBe(true);
			expect(cfg.provider).toBe("openai");
		}
		{
			const { status, body } = await jsonFetch("/api/ai-config/test", {
				method: "POST",
				body: JSON.stringify({}),
			});
			expect(status).toBe(200);
			expect(dataOf(body)).toMatchObject({
				ok: true,
				status: 200,
				provider: "openai",
				model: AI_MODEL,
			});
		}

		const wl = await createWatchlist(`l2-tr-${Date.now()}`);
		expect(
			(
				await jsonFetch(`/api/watchlists/${wl.id}`, {
					method: "PATCH",
					body: JSON.stringify({ translateEnabled: true }),
				})
			).status,
		).toBe(200);
		const token = await mintToken(`translation-${wl.id}`);
		const pushed = await rawHttp("/api/v1/ingest/push", {
			method: "POST",
			headers: ingestHeaders(token.token),
			body: JSON.stringify({
				watchlist_id: wl.id,
				items: [
					{
						source_type: "custom",
						external_id: `translate-${crypto.randomUUID()}`,
						created_at: new Date().toISOString(),
						body: { kind: "custom", text: "Keep a source beside each observation." },
					},
				],
			}),
		});
		expect(pushed.status).toBe(200);
		expect(JSON.parse(pushed.text)).toMatchObject({ ok: true, accepted: 1 });
		const before = dataOf<{ items: { aiStatus: string }[] }>(
			(await jsonFetch(`/api/watchlists/${wl.id}/items`)).body,
		);
		expect(before.items[0]?.aiStatus).toBe("not_requested");
		const { status, body } = await jsonFetch(`/api/watchlists/${wl.id}/translate`, {
			method: "POST",
			body: JSON.stringify({ limit: 5 }),
		});
		expect(status).toBe(200);
		expect(dataOf(body)).toMatchObject({
			timed_out: false,
			results: [
				{
					ai_status: "succeeded",
					translatedText: "将来源保留在观察记录旁，围绕一个明确问题展开实验。",
				},
			],
		});
		const after = dataOf<{ items: { aiStatus: string; translatedText: string }[] }>(
			(await jsonFetch(`/api/watchlists/${wl.id}/items`)).body,
		);
		expect(after.items[0]).toMatchObject({
			aiStatus: "succeeded",
			translatedText: "将来源保留在观察记录旁，围绕一个明确问题展开实验。",
		});
		const denied = await jsonFetch("/api/ai-config/test", {
			method: "POST",
			body: JSON.stringify({ baseUrl: "https://api.openai.com/unconfigured" }),
		});
		expect(denied.status).toBe(200);
		expect(dataOf(denied.body)).toMatchObject({ ok: false, status: 502 });
	});

	test("zheto get/put/save", async () => {
		{
			const { status, body } = await jsonFetch("/api/integrations/zheto");
			expect(status).toBe(200);
			expect(typeof dataOf<{ configured: boolean }>(body).configured).toBe("boolean");
		}
		{
			const { status, body } = await jsonFetch("/api/integrations/zheto", {
				method: "PUT",
				body: JSON.stringify({
					webhookUrl: ZHETO_WEBHOOK_URL,
					folder: "l2",
				}),
			});
			expect(status).toBe(200);
			expect(dataOf<{ configured: boolean }>(body).configured).toBe(true);
		}
		{
			const { status, body } = await jsonFetch("/api/integrations/zheto/save", {
				method: "POST",
				body: JSON.stringify({ url: "https://example.com/l2", note: "n" }),
			});
			expect(status).toBe(200);
			expect(dataOf(body)).toMatchObject({
				shortUrl: "https://zhe.to/fixture",
				slug: "fixture",
				originalUrl: "https://example.com/l2",
				isExisting: false,
			});
		}
	});

	test("unsigned browser requests and unknown hosts fail closed", async () => {
		expect((await rawHttp("/api/me", { headers: { host: "xray.dev.hexly.ai" } })).status).toBe(401);
		expect((await rawHttp("/api/live", { headers: { host: "evil.example" } })).status).toBe(404);
	});

	test("tenant isolation: foreign watchlist id → 404", async () => {
		const { status } = await jsonFetch("/api/watchlists/999999001");
		expect(status).toBe(404);
	});
});
