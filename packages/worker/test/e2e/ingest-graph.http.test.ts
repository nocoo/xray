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
});
