import { expect, test } from "@playwright/test";
import { BROWSER, WORKER, browserApiHeaders } from "./helpers";

test.describe("L3 groups flow", () => {
	test("groups page shows created group", async ({ page, request }) => {
		const live = await request.get(`${WORKER}/api/live`, { headers: { host: "localhost" } });
		test.skip(!live.ok(), "worker not reachable");

		const name = `pw-g-${Date.now()}`;
		const create = await request.post(`${WORKER}/api/groups`, {
			headers: browserApiHeaders,
			data: { name },
		});
		expect(create.ok()).toBeTruthy();

		await page.goto(`${BROWSER}/groups`);
		await expect(page.getByRole("heading", { name: /Groups/i })).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible({
			timeout: 15_000,
		});
	});
});
