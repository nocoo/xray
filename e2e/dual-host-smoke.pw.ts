import { expect, test } from "@playwright/test";
import { BROWSER as H_BROWSER, WORKER as H_WORKER, INGEST as H_INGEST, requireWorker } from "./helpers";

/**
 * Dual-host smoke (docs/06 / plan M8).
 * Defaults: browser UI http://127.0.0.1:7007, worker http://127.0.0.1:8787 with AUTH_DEV_BYPASS.
 * Override with PLAYWRIGHT_BROWSER_URL / PLAYWRIGHT_WORKER_URL / PLAYWRIGHT_INGEST_URL.
 */
function env(name: string): string | undefined {
	// biome-ignore lint/suspicious/noExplicitAny: process may be absent in some runners
	const p = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
	return p?.env?.[name];
}
const BROWSER = env("PLAYWRIGHT_BROWSER_URL") || env("PLAYWRIGHT_BASE_URL") || "http://127.0.0.1:7007";
const WORKER = env("PLAYWRIGHT_WORKER_URL") || "http://127.0.0.1:8787";
const INGEST = env("PLAYWRIGHT_INGEST_URL") || WORKER;

test.describe("dual-host smoke", () => {
	test("browser shell authenticates (dev bypass) and shows dashboard", async ({ page }) => {
		try {
			const live = await page.request.get(`${WORKER}/api/live`, {
				headers: { host: "localhost" },
			});
			if (!live.ok()) {
				if (env("CI")) throw new Error("L3 CI requires worker");
				test.skip(true, "worker not reachable — start bun run dev");
			}
		} catch (e) {
			if (env("CI")) throw e instanceof Error ? e : new Error("L3 CI requires worker");
			test.skip(true, "worker not reachable — start bun run dev");
		}

		await page.goto(BROWSER + "/");
		// SessionGate may load /api/me via vite proxy
		await expect(page.getByRole("heading", { name: /Dashboard/i })).toBeVisible({
			timeout: 15_000,
		});
	});

	test("ingest host accepts Bearer push that appears on timeline API", async ({ request }) => {
		try {
			const live = await request.get(`${WORKER}/api/live`, { headers: { host: "localhost" } });
			if (!live.ok()) {
				if (env("CI")) throw new Error("L3 CI requires worker");
				test.skip(true, "worker not reachable");
			}
		} catch (e) {
			if (env("CI")) throw e instanceof Error ? e : new Error("L3 CI requires worker");
			test.skip(true, "worker not reachable");
		}

		// Create WL + token via browser host headers (dev bypass)
		const browserHeaders = {
			host: "localhost",
			origin: "http://localhost:7007",
			"content-type": "application/json",
		};

		const wlRes = await request.post(`${WORKER}/api/watchlists`, {
			headers: browserHeaders,
			data: { name: `pw-smoke-${Date.now()}` },
		});
		expect(wlRes.ok()).toBeTruthy();
		const wl = (await wlRes.json()) as { data: { id: number } };
		const wlId = wl.data.id;

		const tokRes = await request.post(`${WORKER}/api/push-tokens`, {
			headers: browserHeaders,
			data: { label: "pw-smoke" },
		});
		expect(tokRes.ok()).toBeTruthy();
		const tok = (await tokRes.json()) as { data: { token: string } };
		const token = tok.data.token;
		expect(token).toMatch(/^xray_pt_/);

		const externalId = `pw-${Date.now()}`;
		const pushRes = await request.post(`${INGEST}/api/v1/ingest/push`, {
			headers: {
				host: "xray-ingest.hexly.ai",
				authorization: `Bearer ${token}`,
				"content-type": "application/json",
			},
			data: {
				watchlist_id: wlId,
				items: [
					{
						source_type: "custom",
						external_id: externalId,
						created_at: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
						body: { kind: "custom", text: "playwright smoke item", title: "pw" },
					},
				],
			},
		});
		expect(pushRes.ok()).toBeTruthy();
		const pushBody = (await pushRes.json()) as { ok: boolean; accepted: number };
		expect(pushBody.ok).toBe(true);
		expect(pushBody.accepted).toBeGreaterThanOrEqual(1);

		const itemsRes = await request.get(`${WORKER}/api/watchlists/${wlId}/items?limit=20`, {
			headers: { host: "localhost" },
		});
		expect(itemsRes.ok()).toBeTruthy();
		const items = (await itemsRes.json()) as {
			data: { items: Array<{ externalId: string; text: string }> };
		};
		expect(items.data.items.some((i) => i.externalId === externalId)).toBe(true);
	});
});
