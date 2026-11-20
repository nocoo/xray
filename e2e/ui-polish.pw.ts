import { expect, test } from "@playwright/test";
import { installExternalMedia } from "../fixtures/e2e";
import { canonicalArticle, canonicalPost } from "../fixtures/primitives";
import { BROWSER, browserApiHeaders, INGEST, WORKER } from "./helpers";

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
					await expect(icon).toHaveCSS("width", "14px");
					await expect(icon).toHaveCSS("height", "14px");
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
				await expect(footer).toHaveCSS("padding", "8px 16px 16px");
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
				await expect(footer).toHaveCSS("padding", "8px 16px 16px");
				await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
			}
		}
	}
	expect(errors).toEqual([]);
	await request.delete(`${WORKER}/api/channels/${channel.id}`, { headers: browserApiHeaders });
	await request.delete(`${WORKER}/api/watchlists/${watchlist.id}`, { headers: browserApiHeaders });
});

test.describe("watchlist card footer", () => {
	test.use({ hasTouch: true, locale: "en-US" });

	test("keeps statistics and actions on one line, with details available", async ({ page, request }) => {
		await installExternalMedia(page);
		const watchlist = await request.post(`${WORKER}/api/watchlists`, {
			headers: browserApiHeaders,
			data: { name: `Card footer ${crypto.randomUUID()}` },
		});
		expect(watchlist.status()).toBe(201);
		const { id } = (await watchlist.json()).data;
		const issued = await request.post(`${WORKER}/api/push-tokens`, {
			headers: browserApiHeaders,
			data: { label: "Card footer producer" },
		});
		expect(issued.status()).toBe(201);
		const key = (await issued.json()).data;
		try {
			const post = canonicalPost("123456789");
			post.body.tweet.public_metrics = {
				like_count: 128,
				impression_count: 12_400,
				reply_count: 3,
				retweet_count: 7,
				quote_count: 2,
				bookmark_count: 16,
			};
			const note = canonicalArticle();
			const createdAt = new Date().toISOString();
			const items = [post, note].map((item) => ({ ...item, created_at: createdAt }));
			const pushed = await request.post(`${INGEST}/api/v1/ingest/push`, {
				headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${key.token}` },
				data: { watchlist_id: id, items },
			});
			expect(await pushed.json()).toMatchObject({ accepted: 2, rejected: 0 });
			await page.goto(`${BROWSER}/watchlist/${id}`);
			const footers = page.locator('[data-testid="posts-masonry"] [data-slot="card-footer"]');
			const postFooter = footers.filter({
				has: page.locator('dl[aria-label="Key post statistics"]'),
			});
			const noteFooter = page.getByTestId("custom-item-card").locator('[data-slot="card-footer"]');
			await expect(footers).toHaveCount(2);
			await expect(postFooter.locator("dd")).toHaveText(["128", "12.4K"]);
			await expect(noteFooter.locator("dl")).toHaveCount(0);
			await expect(noteFooter.getByRole("link", { name: /Open source/ })).toHaveAttribute(
				"href",
				"https://developers.cloudflare.com/workers/",
			);

			for (const width of [1440, 320]) {
				await page.setViewportSize({ width, height: 900 });
				for (const footer of [postFooter, noteFooter]) {
					await expect.poll(() =>
						footer.evaluate((element) => {
							const bounds = element.getBoundingClientRect();
							return [...element.querySelectorAll("dl, a, button")].every((item) => {
								const rect = item.getBoundingClientRect();
								return (
									rect.left >= bounds.left && rect.right <= bounds.right &&
									Math.abs(rect.top + rect.height / 2 - (bounds.top + bounds.height / 2)) <= 1
								);
							});
						}),
					).toBe(true);
					const translate = footer.getByRole("button", { name: "Translate", exact: true });
					await expect(translate).toHaveCSS("height", "44px");
					const label = translate.getByText("Translate", { exact: true });
					if (width === 320) await expect(label).toBeHidden();
					else await expect(label).toBeVisible();
				}
			}

			const more = postFooter.getByRole("button", { name: "More post details" });
			await more.click();
			const details = page.getByRole("dialog", { name: "Post details" });
			await expect(details.locator("dt")).toHaveText([
				"Likes", "Views", "Replies", "Reposts", "Quotes", "Bookmarks",
			]);
			await expect(details.locator("dd")).toHaveText(["128", "12,400", "3", "7", "2", "16"]);
			await expect(details.getByRole("button", { name: "Save to zhe.to" })).toBeVisible();
			await page.keyboard.press("Escape");
			await expect(details).toBeHidden();
			await expect(more).toBeFocused();
		} finally {
			await request.delete(`${WORKER}/api/watchlists/${id}`, { headers: browserApiHeaders });
			await request.delete(`${WORKER}/api/push-tokens/${key.id}`, { headers: browserApiHeaders });
		}
	});
});
