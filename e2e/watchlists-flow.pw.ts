import { installExternalMedia } from "../fixtures/e2e";
import { expect, test } from "@playwright/test";
import { BROWSER, requireWorker } from "./helpers";

test.beforeEach(async ({ page }) => { await installExternalMedia(page); });

test.describe("L3 watchlists flow", () => {
	test("create via dialog, open detail, see empty timeline + logs", async ({ page, request }) => {
		await requireWorker(request);

		const name = `pw-wl-ui-${Date.now()}`;
		await page.goto(`${BROWSER}/watchlist`);
		await expect(
			page.locator("[data-basalt-surface-root]").getByRole("heading", { name: /Watchlists/i }),
		).toBeVisible({
			timeout: 15_000,
		});

		await page.getByRole("button", { name: "New Watchlist", exact: true }).first().click();
		const dialog = page.getByRole("dialog", { name: "New watchlist", exact: true });
		await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(name);
		await dialog.getByRole("button", { name: "Create watchlist", exact: true }).click();
		await expect(dialog).toHaveCount(0);
		await expect(page).toHaveURL(/\/watchlist\/\d+$/);
		await expect(page.locator("header[aria-labelledby]").getByRole("heading", { name, exact: true })).toBeVisible();
		await page.getByRole("button", { name: "Open activity panel" }).click();
		await expect(page.getByTestId("ingest-logs")).toBeVisible();
	});
});
