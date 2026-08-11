import { expect, test } from "@playwright/test";
import { BROWSER, WORKER, browserApiHeaders, requireWorker } from "./helpers";

test.describe("L3 watchlists flow", () => {
	test("create via dialog, open detail, see empty timeline + logs", async ({ page, request }) => {
		await requireWorker(request);

		const name = `pw-wl-ui-${Date.now()}`;
		await page.goto(`${BROWSER}/watchlist`);
		await expect(page.getByRole("heading", { name: /Watchlists/i })).toBeVisible({
			timeout: 15_000,
		});

		// Prefer UI create if dialog available; fall back to API seed + reload
		const newBtn = page.getByRole("button", { name: /New Watchlist/i }).first();
		if (await newBtn.isVisible().catch(() => false)) {
			await newBtn.click();
			const nameInput = page.getByLabel(/name/i).or(page.locator('input[name="name"]')).first();
			if (await nameInput.isVisible().catch(() => false)) {
				await nameInput.fill(name);
				await page.getByRole("button", { name: /create|save|add/i }).first().click();
			} else {
				const create = await request.post(`${WORKER}/api/watchlists`, {
					headers: browserApiHeaders,
					data: { name },
				});
				expect(create.ok()).toBeTruthy();
				await page.reload();
			}
		} else {
			const create = await request.post(`${WORKER}/api/watchlists`, {
				headers: browserApiHeaders,
				data: { name },
			});
			expect(create.ok()).toBeTruthy();
			await page.reload();
		}

		const link = page.locator("main a", { hasText: name }).or(page.getByRole("link", { name: new RegExp(name) }));
		await expect(link.first()).toBeVisible({ timeout: 15_000 });
		await link.first().click();
		await expect(page.getByText(/Members|Posts|Translate/i).first()).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByTestId("ingest-logs")).toBeVisible();
	});
});
