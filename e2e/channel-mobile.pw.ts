import { installExternalMedia } from "../fixtures/e2e";
import { DEMO_CATALOG } from "../fixtures/demo";
import { startLocalServer } from "../packages/ui/dev/local-server";
import { expect, test } from "@playwright/test";
import { BROWSER, browserApiHeaders, INGEST, WORKER } from "./helpers";

test.beforeEach(async ({ page }) => { await installExternalMedia(page); });

test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

test.beforeAll(() => {
	for (const address of [BROWSER, WORKER, INGEST]) {
		const url = new URL(address);
		if (!["127.0.0.1", "localhost"].includes(url.hostname) || ["7007", "37007"].includes(url.port)) {
			throw new Error("Mobile L3 requires explicit isolated local servers");
		}
	}
});

test("local environment segments and selection indicator stay inside the touch-sized rail", async ({ page }) => {
	const app = await startLocalServer({ mode: "e2e", automated: true, hosted: false, catalog: "demo", port: 0, built: true });
	try {
		for (const theme of ["light", "dark"]) {
			await page.setViewportSize({ width: 390, height: 844 });
			await page.goto(`${app.url}/channels/${DEMO_CATALOG.readingChannelId}/articles/${DEMO_CATALOG.readArticleId}`);
			await page.getByRole("document", { name: "Article content" }).waitFor();
			await page.evaluate(theme => localStorage.setItem("theme", theme), theme);
			await page.reload();
			for (const width of [320, 390]) {
				await page.setViewportSize({ width, height: 844 });
				await page.getByRole("button", { name: "More channel actions" }).tap();
				const panel = page.getByRole("dialog", { name: "Channel actions" });
				const group = panel.getByRole("radiogroup", { name: "Environment", exact: true });
				await expect(group.getByRole("radio", { name: "E2E", exact: true })).toBeChecked();
				await expect.poll(() => group.evaluate(rail => {
					const bounds = rail.getBoundingClientRect();
					const buttons = [...rail.querySelectorAll('[role="radio"]')];
					const selected = rail.querySelector('[aria-checked="true"]')!.getBoundingClientRect();
					const indicator = rail.querySelector('[data-slot="selection-indicator"]')!.getBoundingClientRect();
					return buttons.length === 3 && buttons.every(button => {
						const box = button.getBoundingClientRect();
						return box.width >= 44 && box.height === 44 && box.top >= bounds.top + 1 && box.bottom <= bounds.bottom - 1;
					}) && bounds.height === 48 && Math.abs(indicator.top - selected.top) < 1 && Math.abs(indicator.height - selected.height) < 1;
				})).toBe(true);
				await page.screenshot({ path: test.info().outputPath(`environment-segments-${width}-${theme}.png`) });
				await page.keyboard.press("Escape");
			}
			await page.setViewportSize({ width: 1440, height: 1000 });
			await expect.poll(() => page.getByRole("radiogroup", { name: "Environment", exact: true }).evaluate(node => node.getBoundingClientRect().height)).toBe(32);
		}
	} finally { await app.close(); }
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
	test(`mobile channel navigation and complete reading at ${viewport.width}px`, async ({ page, request }) => {
		await page.setViewportSize(viewport);
		const name = `Mobile ${viewport.width} ${Date.now()} — 研发观察与技术实践的长期研究频道`;
		const created = await request.post(`${WORKER}/api/channels`, {
			headers: browserApiHeaders,
			data: { name, description: "Long channel description with research notes and daily reports. ".repeat(8) },
		});
		expect(created.ok()).toBe(true);
		const channel = (await created.json()).data;
		try {
			const issued = await request.post(`${WORKER}/api/channels/${channel.id}/keys`, {
				headers: browserApiHeaders, data: { label: "Mobile research producer with a long name" },
			});
			expect(issued.ok()).toBe(true);
			const key = (await issued.json()).data;
			const titles = ["First report — 中文长标题与混合排版测试 ".repeat(4), "Second report — " + "longword".repeat(20)];
			const ids: number[] = [];
			for (const [index, title] of titles.entries()) {
				const pushed = await request.post(`${INGEST}/api/v1/ingest/articles`, {
					headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${key.token}` },
					data: {
						external_id: `mobile-${index}`, title, report_date: `2026-09-${22 - index}`,
						markdown: `## Start of report\n\n${Array.from({ length: 24 }, (_, i) => `### Section ${i}\n\nReadable content with 中文 and English. `.repeat(3)).join("\n\n")}\n\n\`\`\`text\n${"wide-code-".repeat(40)}\n\`\`\`\n\n## End of report`,
					},
				});
				expect(pushed.ok()).toBe(true);
				ids.push((await pushed.json()).id);
			}
			await page.goto(`${BROWSER}/channels`);
			await page.locator("main").getByRole("link", { name, exact: true }).tap();
			const content = page.getByRole("document", { name: "Article content" });
			await expect(content.getByRole("heading", { name: titles[0], exact: true })).toBeVisible();
			await expect.poll(() => content.evaluate(node => node.clientHeight)).toBeGreaterThan(viewport.height / 2);
			await expect(page.locator(".channel-header")).toHaveCount(0);
			await expect(page.locator("[data-basalt-header]")).toHaveCount(1);
			await expect.poll(() => page.locator(".channel-mobile-header").evaluate(node => node.clientHeight)).toBe(52);
			await expect.poll(() => content.evaluate(node => getComputedStyle(node).overflowY)).toBe("visible");
			await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
			await expect.poll(() => page.evaluate(() => {
				const selectors = ["[data-basalt-main]", "[data-basalt-island]", ".channel-page", ".channel-panes"];
				return selectors.every(selector => document.querySelector(selector)!.getBoundingClientRect().height > innerHeight);
			})).toBe(true);
			await expect(page.getByRole("button", { name: "Use full reading width", exact: true })).toBeHidden();
			for (const action of ["Back to reports", "Reading settings", "More channel actions"]) {
				await expect(page.getByRole("button", { name: action, exact: true })).toBeInViewport();
			}
			await page.getByRole("button", { name: "More channel actions" }).tap();
			const actions = page.getByRole("dialog", { name: "Channel actions" });
			await expect(actions.locator('svg[viewBox="0 0 20 10"]')).toHaveCount(0);
			await expect(actions.locator("button:has(> svg + span), a:has(> svg + span)")).toHaveCount(6);
			const geometry = await actions.evaluate(panel => {
				const rows = [...panel.querySelectorAll("button:has(> svg + span), a:has(> svg + span)")];
				return rows.map(row => {
					const style = getComputedStyle(row);
					const box = row.getBoundingClientRect();
					return { width: box.width, height: box.height, border: style.borderWidth, font: style.fontSize, padding: style.paddingLeft, icon: row.querySelector("svg")!.getBoundingClientRect().left, text: row.querySelector("span")!.getBoundingClientRect().left };
				});
			});
			for (const row of geometry) {
				expect(row).toEqual(geometry[0]);
				expect(row.height).toBeGreaterThanOrEqual(44);
				expect(row.border).toBe("0px");
				expect(row.font).toBe("14px");
			}
			await expect.poll(() => actions.getByRole("heading").evaluate(node => getComputedStyle(node).fontSize)).toBe("14px");
			await expect.poll(() => actions.getByText("Article tools and navigation.", { exact: true }).evaluate(node => getComputedStyle(node).fontSize)).toBe("12px");
			await page.screenshot({ path: test.info().outputPath(`xray-mobile-${viewport.width}-actions.png`) });
			for (const button of await page.locator(".channel-mobile-utilities button").all()) {
				const bounds = await button.boundingBox();
				expect(bounds!.width).toBeGreaterThanOrEqual(44);
				expect(bounds!.height).toBeGreaterThanOrEqual(44);
			}
			for (const action of ["Edit article", "Delete article", "Copy full article"])
				await expect(page.getByRole("button", { name: action, exact: true })).toBeInViewport();
			await expect(page.getByRole("link", { name: "Manage channel", exact: true })).toBeInViewport();
			await page.keyboard.press("Escape");
			await page.getByRole("button", { name: "Reading settings" }).tap();
			const preferences = page.getByRole("dialog", { name: "Reading settings" });
			await expect(preferences.locator('svg[viewBox="0 0 20 10"]')).toHaveCount(0);
			await expect.poll(() => preferences.getByRole("heading").evaluate(node => getComputedStyle(node).fontSize)).toBe("14px");
			await page.getByRole("button", { name: "Increase font size", exact: true }).tap();
			await page.keyboard.press("Escape");
			await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
			await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
			await expect.poll(() => content.evaluate(node => node.scrollTop)).toBe(0);
			await expect(page.getByRole("button", { name: "Back to reports", exact: true })).toBeInViewport();
			await expect(content.getByRole("heading", { name: "End of report", exact: true })).toBeInViewport();
			await expect.poll(() => content.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
			await page.getByRole("button", { name: "Back to reports", exact: true }).tap();
			await expect(content).toBeHidden();
			await page.locator(".channel-list-item").filter({ hasText: titles[1] }).tap();
			await expect(content.getByRole("heading", { name: titles[1], exact: true })).toBeInViewport();
			await page.getByRole("button", { name: "Back to reports", exact: true }).tap();
			await page.goBack();
			await expect(page).toHaveURL(new RegExp(`/articles/${ids[0]}$`));
			await expect(content).toBeVisible();
			await expect(content.getByRole("heading", { name: "End of report", exact: true })).toBeInViewport();
			await page.goForward();
			await expect(content.getByRole("heading", { name: titles[1], exact: true })).toBeInViewport();
			await page.reload();
			await expect(content.getByRole("heading", { name: titles[1], exact: true })).toBeInViewport();
			await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			await page.screenshot({ path: test.info().outputPath(`xray-mobile-${viewport.width}-after.png`) });
			await page.getByRole("button", { name: "More channel actions" }).tap();
			await page.getByRole("button", { name: "Open navigation menu", exact: true }).tap();
			await page.getByRole("dialog").getByRole("link", { name: "Channels", exact: true }).tap();
			await expect(page).toHaveURL(`${BROWSER}/channels`);
		} finally {
			await request.delete(`${WORKER}/api/channels/${channel.id}`, { headers: browserApiHeaders });
		}
	});
}

test("immersive reader preserves root scroll through dialogs, resizing and short reports", async ({ page, request }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	let releaseRead!: () => void;
	const pendingRead = new Promise<void>(resolve => { releaseRead = resolve; });
	await page.route("**/articles/*/read", async route => {
		await pendingRead;
		await route.continue();
	});
	const created = await request.post(`${WORKER}/api/channels`, {
		headers: browserApiHeaders, data: { name: `Immersive ${Date.now()}` },
	});
	expect(created.ok()).toBe(true);
	const channel = (await created.json()).data;
	try {
		const issued = await request.post(`${WORKER}/api/channels/${channel.id}/keys`, {
			headers: browserApiHeaders, data: { label: "Reader test" },
		});
		const key = (await issued.json()).data;
		for (const [id, markdown] of [["long", Array.from({ length: 36 }, (_, i) => `## Section ${i}\n\nContent for native document scrolling.`).join("\n\n")], ["short", "A brief report."]]) {
			const pushed = await request.post(`${INGEST}/api/v1/ingest/articles`, {
				headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${key.token}` },
				data: { external_id: id, title: `${id} report`, report_date: id === "long" ? "2026-10-02" : "2026-10-01", markdown },
			});
			expect(pushed.ok()).toBe(true);
		}
		await page.goto(`${BROWSER}/channels/${channel.id}`);
		const content = page.getByRole("document", { name: "Article content" });
		await expect(content.getByRole("heading", { name: "long report", exact: true })).toBeVisible();
		await page.evaluate(() => window.scrollTo(0, 800));
		const acknowledged = page.waitForResponse(response => response.url().endsWith("/read") && response.request().method() === "PUT");
		releaseRead();
		expect((await acknowledged).ok()).toBe(true);
		await expect(page.locator(".channel-list-item").filter({ hasText: "long report" }).locator(".unread-dot")).toHaveCount(0);
		await expect.poll(() => page.evaluate(() => scrollY)).toBe(800);
		const more = page.getByRole("button", { name: "More channel actions" });
		await more.tap();
		await page.getByRole("button", { name: "Edit article", exact: true }).tap();
		const editor = page.getByRole("dialog", { name: "Edit article", exact: true });
		await expect(editor).toBeVisible();
		await expect.poll(() => editor.getByLabel("Article title", { exact: true }).evaluate(node => getComputedStyle(node).fontSize)).toBe("16px");
		await editor.getByLabel("Article title", { exact: true }).fill("Unsaved edit");
		await editor.getByRole("button", { name: "Cancel", exact: true }).tap();
		await expect(more).toBeFocused();
		await expect.poll(() => page.evaluate(() => scrollY)).toBe(800);
		await more.tap();
		await page.getByRole("button", { name: "Delete article", exact: true }).tap();
		await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).tap();
		await expect(more).toBeFocused();
		await expect.poll(() => page.evaluate(() => scrollY)).toBe(800);
		await more.tap();
		await page.getByRole("button", { name: "Open navigation menu", exact: true }).tap();
		await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(more).toBeFocused();
		await expect.poll(() => page.evaluate(() => scrollY)).toBe(800);
		await more.tap();
		await page.getByRole("button", { name: "Delete article", exact: true }).tap();
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
		await expect(page.locator(".channel-header").getByRole("button", { name: "Delete article", exact: true })).toBeFocused();
		await expect(page.locator(".channel-header")).toBeVisible();
		await expect.poll(() => content.evaluate(node => getComputedStyle(node).overflowY)).toBe("auto");
		await expect.poll(() => content.evaluate(node => node.scrollTop)).toBeGreaterThan(600);
		await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
		await page.locator(".channel-header").getByRole("button", { name: "Delete article", exact: true }).click();
		await page.setViewportSize({ width: 390, height: 844 });
		await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).tap();
		await expect(more).toBeFocused();
		await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(600);
		let finishImage!: () => void;
		const imageReady = new Promise<void>(resolve => { finishImage = resolve; });
		await page.route("https://example.com/xray-delayed-reader.png", async route => {
			await imageReady;
			await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="2000"><rect width="320" height="2000" fill="#e8ede9"/></svg>' });
		});
		try {
			await more.tap();
			await page.getByRole("button", { name: "Edit article", exact: true }).tap();
			await editor.getByLabel("Markdown", { exact: true }).fill("![Delayed layout](https://example.com/xray-delayed-reader.png)");
			await editor.getByRole("button", { name: "Save article", exact: true }).tap();
			await expect(editor).toHaveCount(0);
			const image = content.getByRole("img", { name: "Delayed layout" });
			await expect(image).toBeAttached();
			finishImage();
			await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalHeight)).toBe(2000);
			await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(600);
		} finally { finishImage(); }
		await page.getByRole("button", { name: "Back to reports", exact: true }).tap();
		await page.locator(".channel-list-item").filter({ hasText: "short report" }).tap();
		await expect(content.getByRole("heading", { name: "short report", exact: true })).toBeInViewport();
		await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
		await expect.poll(() => page.locator(".channel-reading-panel").evaluate(node => node.getBoundingClientRect().bottom >= innerHeight - 1)).toBe(true);
		await page.screenshot({ path: test.info().outputPath("xray-immersive-short-mobile.png") });
	} finally {
		releaseRead();
		await request.delete(`${WORKER}/api/channels/${channel.id}`, { headers: browserApiHeaders });
	}
});
