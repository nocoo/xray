import { expect, test } from "@playwright/test";
import { BROWSER } from "./helpers";

for (const unauthorized of [false, true]) {
	test(`data modes stay isolated${unauthorized ? " when Product requires login" : " across reloads"}`, async ({ page }) => {
		const requests: string[] = [];
		await page.route((url) => /^\/(?:__product\/)?api\//.test(url.pathname), async (route) => {
			const path = new URL(route.request().url()).pathname;
			requests.push(path);
			const product = path.startsWith("/__product/");
			const api = path.replace(/^\/__product/, "");
			if (product && unauthorized) {
				await route.fulfill({ status: 401, json: { error: "Product sign-in required." } });
				return;
			}
			const name = product ? "Product fixture" : "Mock fixture";
			const data = api === "/api/me"
				? { authenticated: true, user: { id: name, email: "fixture@xray.test", name, image: null } }
				: api === "/api/dashboard"
					? { watchlistCount: 1, groupCount: 0, memberCount: 0, items24h: 0, pendingAi: 0, bySourceType: [], itemsTrend: [], ingestTrend: [], recentIngestLogs: [] }
					: api === "/api/watchlists"
						? [{ id: product ? 2 : 1, name, icon: "eye", description: null, translateEnabled: false, createdAtMs: 0, memberCount: 0 }]
						: [];
			await route.fulfill({ json: { success: true, data } });
		});
		await page.goto(BROWSER);
		await expect(page.getByText("Mock fixture").first()).toBeVisible();
		expect(requests.some((path) => path.startsWith("/__product/"))).toBe(false);
		requests.length = 0;
		await page.getByRole("radio", { name: "PROD", exact: true }).click();
		await expect(page.getByText(unauthorized ? "Sign in required" : "Product fixture").first()).toBeVisible();
		expect(requests.length).toBeGreaterThan(0);
		expect(requests.every((path) => path.startsWith("/__product/"))).toBe(true);
		await page.reload();
		await expect(page.getByText(unauthorized ? "Sign in required" : "Product fixture").first()).toBeVisible();
		requests.length = 0;
		await page.getByRole("radio", { name: "MOCK", exact: true }).click();
		await expect(page.getByText("Mock fixture").first()).toBeVisible();
		expect(requests.some((path) => path.startsWith("/__product/"))).toBe(false);
		await expect(page.getByText("Product fixture")).toHaveCount(0);
	});
}
