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
		for (const width of [1440, 768, 320]) {
			await page.setViewportSize({ width, height: 1000 });
			for (const route of routes) {
				await page.goto(`${BROWSER}${route}`);
				const title = page.locator("#main-content header[aria-labelledby] h1").first();
				await expect(title).toBeVisible();
				await expect(title.locator("svg")).toHaveCount(1);
				await expect(title.locator("svg")).toHaveAttribute("aria-hidden", "true");
				await expect(page.locator("[data-basalt-island]")).toHaveCSS(
					"padding-left",
					width === 1440 ? "32px" : width === 768 ? "24px" : "16px",
				);
				await expect(page.locator("[data-basalt-island]")).toHaveCSS(
					"padding-right",
					width === 1440 ? "32px" : width === 768 ? "24px" : "16px",
				);
				for (const icon of await page.locator("[data-basalt-header-actions] svg").all()) {
					await expect(icon).toHaveCSS("width", "16px");
					await expect(icon).toHaveCSS("height", "16px");
				}
				await expect(page.locator("[data-basalt-header] h1")).toHaveCSS("font-size", "14px");
				await expect(title).toHaveCSS("font-size", "24px");
				for (const action of await page
					.locator("[data-basalt-header-actions] .basalt-action-icon")
					.all()) {
					await expect(action).toHaveCSS("width", "34px");
					await expect(action).toHaveCSS("height", "34px");
				}
				for (const table of await page
					.locator(
						'table[aria-label="Channels"], table[aria-label="Active tokens"], table[aria-label="Push tokens"]',
					)
					.all()) {
					await expect(table.locator("thead th").first()).toHaveCSS("padding-left", "16px");
					await expect(table.locator("thead th").last()).toHaveCSS("padding-right", "16px");
				}
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
				await expect(sidebar).not.toHaveAttribute("data-collapsed");
				await expect(footer).toHaveCSS("padding", "12px 16px");
				const avatar = footer.locator("img").first();
				await expect(avatar).toBeVisible();
				const outer = await sidebar.boundingBox();
				const inner = await avatar.boundingBox();
				expect(inner!.x).toBeGreaterThanOrEqual(outer!.x);
				expect(inner!.x + inner!.width).toBeLessThanOrEqual(outer!.x + outer!.width);
				expect(inner!.x - outer!.x).toBe(16);
				await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
				await expect(sidebar).toHaveAttribute("data-collapsed", "");
				await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(68);
				await expect.poll(async () => (await avatar.boundingBox())!.x).toBe(inner!.x);
				await expect(footer).toHaveCSS("padding", "12px 16px");
				await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
			}
		}
	}
	expect(errors).toEqual([]);
	await request.delete(`${WORKER}/api/channels/${channel.id}`, { headers: browserApiHeaders });
	await request.delete(`${WORKER}/api/watchlists/${watchlist.id}`, { headers: browserApiHeaders });
});
