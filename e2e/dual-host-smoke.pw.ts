import { installExternalMedia } from "../fixtures/e2e";
import { expect, test } from "@playwright/test";

import { BROWSER, WORKER, INGEST, browserApiHeaders, requireWorker } from "./helpers";
import { canonicalArticle } from "../fixtures/primitives";

test.beforeEach(async ({ page }) => { await installExternalMedia(page); });

test.describe("dual-host smoke", () => {
	test("browser shell verifies its signed identity and shows dashboard", async ({ page }) => {
		await requireWorker(page.request);

		await page.goto(BROWSER + "/");
		await expect(
			page.locator("[data-basalt-surface-root]").getByRole("heading", { name: /Dashboard/i }),
		).toBeVisible({
			timeout: 15_000,
		});
	});

	test("ingest host accepts Bearer push that appears on timeline API", async ({ request }) => {
		await requireWorker(request);

		const wlRes = await request.post(`${WORKER}/api/watchlists`, {
			headers: browserApiHeaders,
			data: { name: `pw-smoke-${Date.now()}` },
		});
		expect(wlRes.ok()).toBeTruthy();
		const wl = (await wlRes.json()) as { data: { id: number } };
		const wlId = wl.data.id;

		const tokRes = await request.post(`${WORKER}/api/push-tokens`, {
			headers: browserApiHeaders,
			data: { label: "pw-smoke" },
		});
		expect(tokRes.ok()).toBeTruthy();
		const tok = (await tokRes.json()) as { data: { token: string } };
		const token = tok.data.token;
		expect(token).toMatch(/^xray_pt_/);

		const externalId = `pw-${Date.now()}`;
		const item = canonicalArticle(externalId, "playwright smoke item");
		item.created_at = new Date().toISOString();
		const pushRes = await request.post(`${INGEST}/api/v1/ingest/push`, {
			headers: {
				host: "xray-ingest.worker.hexly.ai",
				authorization: `Bearer ${token}`,
				"content-type": "application/json",
			},
			data: {
				watchlist_id: wlId,
				items: [item],
			},
		});
		expect(pushRes.ok()).toBeTruthy();
		const pushBody = (await pushRes.json()) as { ok: boolean; accepted: number };
		expect(pushBody.ok).toBe(true);
		expect(pushBody.accepted).toBeGreaterThanOrEqual(1);

		const itemsRes = await request.get(`${WORKER}/api/watchlists/${wlId}/items?limit=20`, {
			headers: browserApiHeaders,
		});
		expect(itemsRes.ok()).toBeTruthy();
		const items = (await itemsRes.json()) as {
			data: { items: Array<{ externalId: string; text: string }> };
		};
		expect(items.data.items.some((i) => i.externalId === externalId)).toBe(true);
	});
});
