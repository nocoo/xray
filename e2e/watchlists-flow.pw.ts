import { expect, test } from "@playwright/test";
import { BROWSER, WORKER, browserApiHeaders, requireWorker } from "./helpers";

test.describe("L3 watchlists flow", () => {
	test("list page + create via API appears in UI", async ({ page, request }) => {
		await requireWorker(request);

		const name = `pw-wl-${Date.now()}`;
		const create = await request.post(`${WORKER}/api/watchlists`, {
			headers: browserApiHeaders,
			data: { name },
		});
		expect(create.ok()).toBeTruthy();
		const body = (await create.json()) as { data: { id: number } };
		const id = body.data.id;

		await page.goto(`${BROWSER}/watchlist`);
		await expect(page.getByRole("heading", { name: /Watchlists/i })).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible({
			timeout: 15_000,
		});

		await page.goto(`${BROWSER}/watchlist/${id}`);
		await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId("ingest-logs")).toBeVisible();
	});
});
