/**
 * L2 real-HTTP tenant isolation (docs/06 XR-13).
 * Dual actors via X-Test-Actor: a|b under AUTH_DEV_BYPASS + ENVIRONMENT=test.
 * Expect: cross-tenant resource access → 404; revoked token → 401.
 */
import { describe, expect, test } from "vitest";
import { BASE, browserHeaders, dataOf, ingestHeaders, jsonFetch } from "./helpers.js";

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

async function createGroupAs(actor: "a" | "b", name: string) {
	const { status, body } = await jsonFetch("/api/groups", {
		method: "POST",
		headers: actorHeaders(actor),
		body: JSON.stringify({ name }),
	});
	expect([200, 201]).toContain(status);
	return dataOf<{ id: number }>(body);
}

async function mintTokenAs(actor: "a" | "b", label: string) {
	const { status, body } = await jsonFetch("/api/push-tokens", {
		method: "POST",
		headers: actorHeaders(actor),
		body: JSON.stringify({ label }),
	});
	expect([200, 201]).toContain(status);
	return dataOf<{ id: number; token: string }>(body);
}

describe("L2 tenant isolation (real HTTP, dual actor)", () => {
	test("watchlist matrix: B cannot R/W A", async () => {
		const wlA = await createWatchlistAs("a", `iso-a-${Date.now()}`);

		for (const [method, path, body] of [
			["GET", `/api/watchlists/${wlA.id}`, undefined],
			["PATCH", `/api/watchlists/${wlA.id}`, JSON.stringify({ name: "hijack" })],
			["DELETE", `/api/watchlists/${wlA.id}`, undefined],
			["GET", `/api/watchlists/${wlA.id}/members`, undefined],
			["POST", `/api/watchlists/${wlA.id}/members`, JSON.stringify({ sourceType: "x.com", handle: "x" })],
			["GET", `/api/watchlists/${wlA.id}/items`, undefined],
			["GET", `/api/watchlists/${wlA.id}/ingest-logs`, undefined],
			["POST", `/api/watchlists/${wlA.id}/translate`, JSON.stringify({ limit: 1 })],
		] as const) {
			const res = await jsonFetch(path, {
				method,
				headers: actorHeaders("b"),
				body,
			});
			expect(res.status, `${method} ${path}`).toBe(404);
		}

		expect((await jsonFetch(`/api/watchlists/${wlA.id}`, { headers: actorHeaders("a") })).status).toBe(
			200,
		);
	});

	test("group matrix: B cannot R/W A", async () => {
		const g = await createGroupAs("a", `iso-g-${Date.now()}`);
		for (const [method, path, body] of [
			["GET", `/api/groups/${g.id}`, undefined],
			["PATCH", `/api/groups/${g.id}`, JSON.stringify({ name: "x" })],
			["DELETE", `/api/groups/${g.id}`, undefined],
			["GET", `/api/groups/${g.id}/members`, undefined],
			["POST", `/api/groups/${g.id}/members`, JSON.stringify({ sourceType: "x.com", handle: "y" })],
			["POST", `/api/groups/${g.id}/members/import`, JSON.stringify({ text: "@z" })],
			["POST", `/api/groups/${g.id}/copy-to-watchlist`, JSON.stringify({ watchlistId: 1 })],
		] as const) {
			const res = await jsonFetch(path, {
				method,
				headers: actorHeaders("b"),
				body,
			});
			expect(res.status, `${method} ${path}`).toBe(404);
		}
	});

	test("settings/ai/zheto are per-user (B cannot see A secrets)", async () => {
		// A configures AI
		const putA = await jsonFetch("/api/ai-config", {
			method: "PUT",
			headers: actorHeaders("a"),
			body: JSON.stringify({
				provider: "openai",
				model: "gpt-a",
				apiKey: "sk-actor-a-secret",
			}),
		});
		expect([200, 201]).toContain(putA.status);

		const getB = await jsonFetch("/api/ai-config", { headers: actorHeaders("b") });
		expect(getB.status).toBe(200);
		const cfgB = dataOf<{ hasApiKey?: boolean; model?: string | null }>(getB.body);
		// B has no key / different config — not A's
		expect(cfgB.hasApiKey === true && cfgB.model === "gpt-a").toBe(false);

		const zheA = await jsonFetch("/api/integrations/zheto", {
			method: "PUT",
			headers: actorHeaders("a"),
			body: JSON.stringify({ webhookUrl: "https://zhe.to/api/webhook/actor-a", folder: "a" }),
		});
		// may 200 or 400 host policy
		expect([200, 400]).toContain(zheA.status);
		const zheB = await jsonFetch("/api/integrations/zheto", { headers: actorHeaders("b") });
		expect(zheB.status).toBe(200);
	});

	test("revoked token → 401; A token cannot push to B watchlist → 404", async () => {
		const wlA = await createWatchlistAs("a", `iso-tok-${Date.now()}`);
		const wlB = await createWatchlistAs("b", `iso-b-${Date.now()}`);
		const tokA = await mintTokenAs("a", `iso-${Date.now()}`);

		const pushB = await fetch(`${BASE}/api/v1/ingest/push`, {
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
		expect(pushB.status).toBe(404);

		const { status: revStatus } = await jsonFetch(`/api/push-tokens/${tokA.id}`, {
			method: "DELETE",
			headers: actorHeaders("a"),
		});
		expect([200, 204]).toContain(revStatus);

		const pushRevoked = await fetch(`${BASE}/api/v1/ingest/push`, {
			method: "POST",
			headers: ingestHeaders(tokA.token),
			body: JSON.stringify({
				watchlist_id: wlA.id,
				items: [
					{
						source_type: "custom",
						external_id: `iso-r-${Date.now()}`,
						created_at: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
						body: { kind: "custom", text: "nope" },
					},
				],
			}),
		});
		expect(pushRevoked.status).toBe(401);
	});
});
