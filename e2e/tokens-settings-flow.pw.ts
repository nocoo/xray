import { expect, test } from "@playwright/test";
import { BROWSER, WORKER, browserApiHeaders, requireWorker } from "./helpers";

test.describe("L3 tokens + settings + AI + zheto shells", () => {
	test("settings and tokens pages load", async ({ page, request }) => {
		await requireWorker(request);

		await page.goto(`${BROWSER}/settings`);
		await expect(
			page.locator("[data-basalt-surface-root]").getByRole("heading", { name: /^Settings$/i }),
		).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByText(/Ingest window hours/i)).toBeVisible();

		const tok = await request.post(`${WORKER}/api/push-tokens`, {
			headers: browserApiHeaders,
			data: { label: `pw-tok-${Date.now()}` },
		});
		expect(tok.ok()).toBeTruthy();

		await expect(
			page.locator("[data-basalt-surface-root]").getByRole("heading", { name: /Push tokens/i }),
		).toBeVisible();
	});

	test("AI settings and zheto pages load", async ({ page, request }) => {
		await requireWorker(request);

		await page.goto(`${BROWSER}/settings`);
		await expect(
			page.locator("[data-basalt-surface-root]").getByRole("heading", { name: /^Settings$/i }),
		).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByText(/Provider/i).first()).toBeVisible();

		await page.goto(`${BROWSER}/integrations/zheto`);
		await expect(
			page.locator("[data-basalt-surface-root]").getByRole("heading", { name: /zhe/i }),
		).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByText(/Webhook URL/i).first()).toBeVisible();
	});

	test("dashboard aggregates shell", async ({ page, request }) => {
		await requireWorker(request);

		await page.goto(`${BROWSER}/`);
		await expect(
			page.locator("[data-basalt-surface-root]").getByRole("heading", { name: /Dashboard/i }),
		).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByText(/Watchlists/i).first()).toBeVisible();
	});
});
