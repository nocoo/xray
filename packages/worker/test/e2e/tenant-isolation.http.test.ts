/**
 * L2 real-HTTP tenant isolation (docs/06 XR-13).
 * Dual actors via X-Test-Actor: a|b under AUTH_DEV_BYPASS + ENVIRONMENT=test.
 */
import { describe, expect, test } from "vitest";
import { BASE, browserHeaders, dataOf, ingestHeaders, jsonFetch, mintToken } from "./helpers.js";

function actorHeaders(actor: "a" | "b", extra?: Record<string, string>) {
	return browserHeaders({ "x-test-actor": actor, ...extra });
}

async function createWatchlistAs(actor: "a" | "b", name: string) {
	const { status, body } = await jsonFetch("/api/watchlists", {
		method: "POST",
		headers: actorHeaders(actor),
		body: JSON.stringify({ name }),
	});
	expect([200, 201]).toContain(status);
	return dataOf<{ id: number; name: string }>(body);
}

describe("L2 tenant isolation (real HTTP, dual actor)", () => {
	test("user B cannot read/patch/delete user A watchlist (404)", async () => {
		const wlA = await createWatchlistAs("a", `iso-a-${Date.now()}`);

		expect((await jsonFetch(`/api/watchlists/${wlA.id}`, { headers: actorHeaders("b") })).status).toBe(
			404,
		);
		expect(
			(
				await jsonFetch(`/api/watchlists/${wlA.id}`, {
					method: "PATCH",
					headers: actorHeaders("b"),
					body: JSON.stringify({ name: "hijack" }),
				})
			).status,
		).toBe(404);
		expect(
			(
				await jsonFetch(`/api/watchlists/${wlA.id}`, {
					method: "DELETE",
					headers: actorHeaders("b"),
				})
			).status,
		).toBe(404);
		expect(
			(await jsonFetch(`/api/watchlists/${wlA.id}/members`, { headers: actorHeaders("b") }))
				.status,
		).toBe(404);
		expect(
			(await jsonFetch(`/api/watchlists/${wlA.id}/items`, { headers: actorHeaders("b") })).status,
		).toBe(404);

		// Owner still OK
		expect((await jsonFetch(`/api/watchlists/${wlA.id}`, { headers: actorHeaders("a") })).status).toBe(
			200,
		);
	});

	test("user B cannot read user A group", async () => {
		const { status, body } = await jsonFetch("/api/groups", {
			method: "POST",
			headers: actorHeaders("a"),
			body: JSON.stringify({ name: `iso-g-${Date.now()}` }),
		});
		expect([200, 201]).toContain(status);
		const g = dataOf<{ id: number }>(body);
		expect((await jsonFetch(`/api/groups/${g.id}`, { headers: actorHeaders("b") })).status).toBe(
			404,
		);
	});

	test("revoked push token → 401", async () => {
		const wl = await createWatchlistAs("a", `iso-tok-${Date.now()}`);
		const tok = await mintToken(`iso-${Date.now()}`);
		const { status: revStatus } = await jsonFetch(`/api/push-tokens/${tok.id}`, {
			method: "DELETE",
			headers: actorHeaders("a"),
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

	test("token A cannot push into B watchlist → 404", async () => {
		const wlB = await createWatchlistAs("b", `iso-b-${Date.now()}`);
		const tokA = await mintToken(`iso-push-a-${Date.now()}`);
		const res = await fetch(`${BASE}/api/v1/ingest/push`, {
			method: "POST",
			headers: ingestHeaders(tokA.token),
			body: JSON.stringify({
				watchlist_id: wlB.id,
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
});
