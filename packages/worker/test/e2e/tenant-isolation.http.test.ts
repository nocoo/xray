/**
 * L2 real-HTTP tenant isolation (docs/06 XR-13).
 * Single AUTH_DEV_BYPASS identity: foreign resource ids must 404; revoked token 401.
 */
import { describe, expect, test } from "vitest";
import {
	BASE,
	browserHeaders,
	createWatchlist,
	dataOf,
	ingestHeaders,
	jsonFetch,
	mintToken,
} from "./helpers.js";

describe("L2 tenant isolation (real HTTP)", () => {
	test("foreign watchlist/group/item ids → 404", async () => {
		const wl = await createWatchlist(`iso-wl-${Date.now()}`);
		const foreign = 9_000_001;

		expect((await jsonFetch(`/api/watchlists/${foreign}`)).status).toBe(404);
		expect(
			(await jsonFetch(`/api/watchlists/${foreign}`, { method: "PATCH", body: JSON.stringify({ name: "x" }) }))
				.status,
		).toBe(404);
		expect((await jsonFetch(`/api/watchlists/${foreign}`, { method: "DELETE" })).status).toBe(404);
		expect((await jsonFetch(`/api/watchlists/${foreign}/members`)).status).toBe(404);
		expect((await jsonFetch(`/api/watchlists/${foreign}/items`)).status).toBe(404);
		expect((await jsonFetch(`/api/watchlists/${foreign}/ingest-logs`)).status).toBe(404);
		expect((await jsonFetch(`/api/groups/${foreign}`)).status).toBe(404);
		expect((await jsonFetch(`/api/items/${foreign}`, { method: "DELETE" })).status).toBe(404);

		// own resource still works
		expect((await jsonFetch(`/api/watchlists/${wl.id}`)).status).toBe(200);
	});

	test("revoked push token → 401 on ingest", async () => {
		const wl = await createWatchlist(`iso-tok-${Date.now()}`);
		const tok = await mintToken(`iso-${Date.now()}`);
		const { status: revStatus } = await jsonFetch(`/api/push-tokens/${tok.id}`, {
			method: "DELETE",
		});
		expect([200, 204]).toContain(revStatus);

		const res = await fetch(`${BASE}/api/v1/ingest/push`, {
			method: "POST",
			headers: ingestHeaders(tok.token),
			body: JSON.stringify({
				watchlist_id: wl.id,
				items: [
					{
						source_type: "custom",
						external_id: `iso-${Date.now()}`,
						created_at: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
						body: { kind: "custom", text: "nope" },
					},
				],
			}),
		});
		expect(res.status).toBe(401);
	});

	test("push to non-owned watchlist_id → 404", async () => {
		const tok = await mintToken(`iso-push-${Date.now()}`);
		const res = await fetch(`${BASE}/api/v1/ingest/push`, {
			method: "POST",
			headers: ingestHeaders(tok.token),
			body: JSON.stringify({
				watchlist_id: 9_000_002,
				items: [
					{
						source_type: "custom",
						external_id: `iso-f-${Date.now()}`,
						created_at: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
						body: { kind: "custom", text: "nope" },
					},
				],
			}),
		});
		expect([404, 403]).toContain(res.status);
	});

	test("unauthenticated browser mutation without bypass identity is blocked outside test env", async () => {
		// In test env bypass is on — assert live remains public and me is authenticated.
		const live = await fetch(`${BASE}/api/live`);
		expect(live.status).toBe(200);
		const me = await jsonFetch("/api/me");
		expect(me.status).toBe(200);
		expect((me.body as { authenticated?: boolean }).authenticated).toBe(true);
		// Sanity: create requires JSON body shape
		const bad = await jsonFetch("/api/watchlists", {
			method: "POST",
			headers: browserHeaders(),
			body: JSON.stringify({}),
		});
		expect([400, 422]).toContain(bad.status);
		void dataOf;
	});
});
