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

	test("AI + zhe.to secrets are per-user (B does not inherit A)", async () => {
		const putA = await jsonFetch("/api/ai-config", {
			method: "PUT",
			headers: actorHeaders("a"),
			body: JSON.stringify({
				provider: "openai",
				model: "gpt-actor-a-only",
				apiKey: "sk-actor-a-secret",
			}),
		});
		expect([200, 201]).toContain(putA.status);
		const cfgA = dataOf<{ hasApiKey: boolean; model: string | null }>(putA.body);
		expect(cfgA.hasApiKey).toBe(true);
		expect(cfgA.model).toBe("gpt-actor-a-only");

		const getB = await jsonFetch("/api/ai-config", { headers: actorHeaders("b") });
		expect(getB.status).toBe(200);
		const cfgB = dataOf<{ hasApiKey?: boolean; model?: string | null; configured?: boolean }>(
			getB.body,
		);
		expect(cfgB.model === "gpt-actor-a-only").toBe(false);
		expect(cfgB.hasApiKey === true && cfgB.model === "gpt-actor-a-only").toBe(false);

		// allowlisted local host (ZHETO_WEBHOOK_ALLOW_HOSTS in L2 global-setup)
		const zheA = await jsonFetch("/api/integrations/zheto", {
			method: "PUT",
			headers: actorHeaders("a"),
			body: JSON.stringify({
				webhookUrl: "https://localhost/api/webhook/actor-a-secret",
				folder: "folder-a",
			}),
		});
		expect(zheA.status).toBe(200);
		const zheAbody = dataOf<{ configured: boolean; folder: string | null }>(zheA.body);
		expect(zheAbody.configured).toBe(true);
		expect(zheAbody.folder).toBe("folder-a");

		const zheB = await jsonFetch("/api/integrations/zheto", { headers: actorHeaders("b") });
		expect(zheB.status).toBe(200);
		const zheBbody = dataOf<{ configured: boolean; folder: string | null }>(zheB.body);
		expect(zheBbody.configured).toBe(false);
		expect(zheBbody.folder).toBeNull();
	});


	test("B cannot revoke A token; B cannot delete A item", async () => {
		const wlA = await createWatchlistAs("a", `iso-item-${Date.now()}`);
		const tokA = await mintTokenAs("a", `iso-tok-${Date.now()}`);
		const tokB = await mintTokenAs("b", `iso-tok-b-${Date.now()}`);

		// Seed item owned by A via push
		const externalId = `iso-item-${Date.now()}`;
		const push = await fetch(`${BASE}/api/v1/ingest/push`, {
			method: "POST",
			headers: ingestHeaders(tokA.token),
			body: JSON.stringify({
				watchlist_id: wlA.id,
				items: [
					{
						source_type: "custom",
						external_id: externalId,
						created_at: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
						body: { kind: "custom", text: "owned by a" },
					},
				],
			}),
		});
		expect(push.status).toBe(200);
		const items = await jsonFetch(`/api/watchlists/${wlA.id}/items`, {
			headers: actorHeaders("a"),
		});
		const page = dataOf<{ items: Array<{ id: number; externalId: string }> }>(items.body);
		const itemId = page.items.find((i) => i.externalId === externalId)?.id;
		expect(itemId).toBeTruthy();

		// B cannot delete A's item
		expect(
			(
				await jsonFetch(`/api/items/${itemId}`, {
					method: "DELETE",
					headers: actorHeaders("b"),
				})
			).status,
		).toBe(404);

		// B cannot revoke A's token
		expect(
			(
				await jsonFetch(`/api/push-tokens/${tokA.id}`, {
					method: "DELETE",
					headers: actorHeaders("b"),
				})
			).status,
		).toBe(404);

		// A token cannot push into B's watchlist
		const wlB = await createWatchlistAs("b", `iso-b-${Date.now()}`);
		const pushCross = await fetch(`${BASE}/api/v1/ingest/push`, {
			method: "POST",
			headers: ingestHeaders(tokA.token),
			body: JSON.stringify({
				watchlist_id: wlB.id,
				items: [
					{
						source_type: "custom",
						external_id: `cross-${Date.now()}`,
						created_at: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
						body: { kind: "custom", text: "nope" },
					},
				],
			}),
		});
		expect(pushCross.status).toBe(404);

		// A can still revoke own token; then 401
		expect(
			(
				await jsonFetch(`/api/push-tokens/${tokA.id}`, {
					method: "DELETE",
					headers: actorHeaders("a"),
				})
			).status,
		).toBe(200);
		const pushRevoked = await fetch(`${BASE}/api/v1/ingest/push`, {
			method: "POST",
			headers: ingestHeaders(tokA.token),
			body: JSON.stringify({
				watchlist_id: wlA.id,
				items: [
					{
						source_type: "custom",
						external_id: `rev-${Date.now()}`,
						created_at: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
						body: { kind: "custom", text: "nope" },
					},
				],
			}),
		});
		expect(pushRevoked.status).toBe(401);
		void tokB;
	});

	test("graph lists only token owner watchlists", async () => {
		const wlA = await createWatchlistAs("a", `graph-a-${Date.now()}`);
		const wlB = await createWatchlistAs("b", `graph-b-${Date.now()}`);
		const tokA = await mintTokenAs("a", `graph-tok-a-${Date.now()}`);
		const tokB = await mintTokenAs("b", `graph-tok-b-${Date.now()}`);
		const resA = await fetch(`${BASE}/api/v1/ingest/graph`, {
			headers: ingestHeaders(tokA.token),
		});
		expect(resA.status).toBe(200);
		const bodyA = (await resA.json()) as { watchlists: Array<{ id: number }> };
		expect(bodyA.watchlists.some((w) => w.id === wlA.id)).toBe(true);
		expect(bodyA.watchlists.some((w) => w.id === wlB.id)).toBe(false);
		const resB = await fetch(`${BASE}/api/v1/ingest/graph`, {
			headers: ingestHeaders(tokB.token),
		});
		expect(resB.status).toBe(200);
		const bodyB = (await resB.json()) as { watchlists: Array<{ id: number }> };
		expect(bodyB.watchlists.some((w) => w.id === wlB.id)).toBe(true);
		expect(bodyB.watchlists.some((w) => w.id === wlA.id)).toBe(false);
	});
});

