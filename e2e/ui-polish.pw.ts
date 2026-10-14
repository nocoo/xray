import { expect, test } from "@playwright/test";
import { BROWSER, WORKER, browserApiHeaders } from "./helpers";

test("page icon hierarchy and bright statistics survive themes and narrow layouts", async ({
	page,
	request,
}) => {
	const suffix = crypto.randomUUID();
	const create = async (path: string, data: unknown) => {
		const response = await request.post(`${WORKER}/api/${path}`, {
			headers: browserApiHeaders,
			data,
		});
		expect(response.ok()).toBeTruthy();
		return (await response.json()).data;
	};
	const channel = await create("channels", { name: `UI ${suffix}` });
	const watchlist = await create("watchlists", { name: `Watch ${suffix}`, icon: "eye" });
	const routes = [
		"/",
		"/watchlist",
		"/groups",
		"/channels",
		"/tags",
		"/tokens",
		"/settings",
		"/integrations/zheto",
		`/channels/${channel.id}/settings`,
		`/watchlist/${watchlist.id}`,
	];
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	for (const theme of ["light", "dark"]) {
		await page.goto(`${BROWSER}/tokens`);
		for (let i = 0; i < 3; i++) {
			if (
				await page.getByRole("button", { name: `Toggle theme (now ${theme})`, exact: true }).count()
			)
				break;
			await page.getByRole("button", { name: /Toggle theme/ }).click();
		}
		await expect(page.locator("html")).toHaveClass(new RegExp(theme));
		for (const width of [1440, 320]) {
			await page.setViewportSize({ width, height: 1000 });
			for (const route of routes) {
				await page.goto(`${BROWSER}${route}`);
				const title = page.locator("#main-content header[aria-labelledby] h1").first();
				await expect(title).toBeVisible();
				await expect(title.locator("svg")).toHaveCount(1);
				await expect(title.locator("svg")).toHaveAttribute("aria-hidden", "true");
				await expect
					.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
					.toBe(true);
				await expect
					.poll(() =>
						page
							.locator("[data-basalt-island]")
							.evaluateAll((islands) =>
								islands.every((island) => island.scrollWidth <= island.clientWidth),
							),
					)
					.toBe(true);
				if (["/", "/channels", "/tokens", `/channels/${channel.id}/settings`].includes(route)) {
					await expect(page.locator('[data-slot="stat-card"]').first()).toBeVisible();
					await expect
						.poll(() =>
							page.locator('[data-slot="stat-card"]').evaluateAll((cards) =>
								cards.every((card) => {
									const probe = document.createElement("span");
									probe.style.backgroundColor = "hsl(var(--basalt-bright))";
									card.append(probe);
									const bright = getComputedStyle(probe).backgroundColor;
									probe.remove();
									return getComputedStyle(card).backgroundColor === bright;
								}),
							),
						)
						.toBe(true);
				}
			}
			if (width === 1440) {
				const sidebar = page.getByTestId("app-sidebar");
				const footer = sidebar.locator('[data-slot="sidebar-footer"]');
				const avatar = footer.locator("img").first();
				await expect(avatar).toBeVisible();
				const outer = await sidebar.boundingBox();
				const inner = await avatar.boundingBox();
				expect(inner!.x).toBeGreaterThanOrEqual(outer!.x);
				expect(inner!.x + inner!.width).toBeLessThanOrEqual(outer!.x + outer!.width);
			}
		}
	}
	expect(errors).toEqual([]);
	await request.delete(`${WORKER}/api/channels/${channel.id}`, { headers: browserApiHeaders });
	await request.delete(`${WORKER}/api/watchlists/${watchlist.id}`, { headers: browserApiHeaders });
});
