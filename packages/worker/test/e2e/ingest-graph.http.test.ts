import { describe, expect, test } from "vitest";
import { createWatchlist, ingestHeaders, jsonFetch, mintToken, rawHttp } from "./helpers.js";

describe("GET /api/v1/ingest/graph", () => {
	test("401 without bearer; 404 on browser host; 200 owner graph on ingest", async () => {
		const wl = await createWatchlist(`graph-${Date.now()}`);
		await jsonFetch(`/api/watchlists/${wl.id}/members`, {
			method: "POST",
			body: JSON.stringify({ handle: "sama", sourceType: "x.com" }),
		});
		await jsonFetch(`/api/watchlists/${wl.id}/members`, {
			method: "POST",
			body: JSON.stringify({ handle: "note", sourceType: "custom" }),
		});
		const tok = await mintToken(`graph-${wl.id}`);

		const noAuth = await rawHttp("/api/v1/ingest/graph", {
			headers: { host: "xray-ingest.hexly.ai", accept: "application/json" },
		});
		expect(noAuth.status).toBe(401);

		const browser = await rawHttp("/api/v1/ingest/graph", {
			headers: {
				host: "xray.hexly.ai",
				authorization: `Bearer ${tok.token}`,
				accept: "application/json",
			},
		});
		expect(browser.status).toBe(404);

		const crudOnIngest = await rawHttp("/api/watchlists", {
			headers: ingestHeaders(tok.token),
		});
		expect(crudOnIngest.status).toBe(404);

		const res = await rawHttp("/api/v1/ingest/graph", {
			headers: ingestHeaders(tok.token),
		});
		expect(res.status).toBe(200);
		const body = JSON.parse(res.text) as {
			watchlists: Array<{ id: number; name: string; members: Array<{ handle: string }> }>;
		};
		const mine = body.watchlists.find((w) => w.id === wl.id);
		expect(mine).toBeTruthy();
		expect(mine?.members.map((m) => m.handle)).toEqual(["sama"]);
	});

	test("scope, revoke, 429, and ingest deny matrix", async () => {
		const wl = await createWatchlist(`graph-neg-${Date.now()}`);
		const pushOnly = await mintToken(`push-only-${wl.id}`, ["ingest:push"]);
		const readOnly = await mintToken(`read-only-${wl.id}`, ["ingest:read"]);
		const both = await mintToken(`both-${wl.id}`);
		expect(pushOnly.scopes).toEqual(["ingest:push"]);
		expect(readOnly.scopes).toEqual(["ingest:read"]);

		const pushBody = JSON.stringify({
			watchlist_id: wl.id,
			items: [
				{
					source_type: "custom",
					external_id: `neg-${Date.now()}`,
					created_at: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
					body: { kind: "custom", text: "neg" },
				},
			],
		});

		expect(
			(await rawHttp("/api/v1/ingest/graph", { headers: ingestHeaders(pushOnly.token) })).status,
		).toBe(403);
		expect(
			(
				await rawHttp("/api/v1/ingest/push", {
					method: "POST",
					headers: ingestHeaders(pushOnly.token),
					body: pushBody,
				})
			).status,
		).toBe(200);

		expect(
			(await rawHttp("/api/v1/ingest/graph", { headers: ingestHeaders(readOnly.token) })).status,
		).toBe(200);
		expect(
			(
				await rawHttp("/api/v1/ingest/push", {
					method: "POST",
					headers: ingestHeaders(readOnly.token),
					body: pushBody,
				})
			).status,
		).toBe(403);

		expect(
			(
				await rawHttp("/api/v1/ingest/graph", {
					headers: ingestHeaders(both.token, { "x-test-force-rl": "1" }),
				})
			).status,
		).toBe(429);

		expect(
			(await rawHttp("/api/v1/ingest/graph", { headers: ingestHeaders("xray_pt_bad_token") }))
				.status,
		).toBe(401);

		await jsonFetch(`/api/push-tokens/${both.id}`, { method: "DELETE" });
		expect(
			(await rawHttp("/api/v1/ingest/graph", { headers: ingestHeaders(both.token) })).status,
		).toBe(401);

		for (const [method, path] of [
			["GET", "/api/push-tokens"],
			["POST", "/api/push-tokens"],
			["GET", "/api/groups"],
			["GET", "/api/ai-config"],
			["GET", "/api/settings"],
			["GET", "/"],
		] as const) {
			expect(
				(
					await rawHttp(path, {
						method,
						headers: ingestHeaders(readOnly.token),
					})
				).status,
				`${method} ${path}`,
			).toBe(404);
		}
	});
});
