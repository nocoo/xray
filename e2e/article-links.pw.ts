import { installExternalMedia } from "../fixtures/e2e";
import { MEDIA_URLS } from "../fixtures/primitives";
import { expect, test } from "@playwright/test";
import { BROWSER, browserApiHeaders, INGEST, WORKER } from "./helpers";

test.beforeEach(async ({ page }) => { await installExternalMedia(page); });

test.beforeAll(() => {
	for (const value of [BROWSER, WORKER, INGEST]) {
		const url = new URL(value);
		if (!["127.0.0.1", "localhost"].includes(url.hostname) || ["7007", "37007"].includes(url.port)) throw new Error("Article links require an isolated local test stack");
	}
});

test("related previews stay beside the reader and expand inline on mobile", async ({ page, request }) => {
	await page.setViewportSize({ width: 1660, height: 1000 });
	const created = await request.post(`${WORKER}/api/channels`, { headers: browserApiHeaders, data: { name: `Reader links ${Date.now()}` } });
	const channel = (await created.json()).data;
	const issued = await request.post(`${WORKER}/api/channels/${channel.id}/keys`, { headers: browserApiHeaders, data: { label: "Link producer" } });
	const token = (await issued.json()).data.token;
	const submitted = await request.post(`${INGEST}/api/v1/ingest/articles`, {
		headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${token}` },
		data: { external_id: "links", title: "研发观察：让阅读回到内容", report_date: "2026-09-22", markdown: "## 阅读与设计\n\n这是一篇记录阅读体验的报告，正文应当拥有最清晰的视觉层级。\n\n[中文阅读与 Kami](https://github.com/tw93/Kami#reader) 与 [Kami 重复来源](https://github.com/tw93/Kami) 提供阅读参考。\n\n[Workers 文档][docs] 帮助我们实现可靠的链接预览。\n\n[尚无预览的页面](https://example.com/xray-demo-preview-unavailable-v1) 仍然可以直接打开。\n\n[docs]: https://developers.cloudflare.com/workers/\n\n```text\nhttps://example.com/code-only\n```\n\n![示例正文插图](" + MEDIA_URLS.desk + ")" },
	});
	expect(submitted.status()).toBe(201);
	const id = (await submitted.json()).id;
	const previewed: string[] = [];
	page.on("request", request => {
		const url = new URL(request.url());
		if (url.pathname.endsWith("/link-preview")) previewed.push(url.searchParams.get("url") ?? "");
	});
	await page.goto(`${BROWSER}/channels/${channel.id}/articles/${id}`);
	const aside = page.getByRole("complementary", { name: "Related article links", exact: true });
	const content = page.getByRole("document", { name: "Article content" });
	await expect(aside).toBeVisible();
	await expect(aside.getByRole("listitem")).toHaveCount(3);
	await expect(aside.getByRole("link", { name: /Kami · A quieter/ })).toBeVisible();
	await expect(aside.locator("img")).toHaveCount(2);
	await expect.poll(() => aside.locator("img").first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
	await expect(aside.getByRole("link", { name: /尚无预览的页面/ })).toBeVisible();
	await expect.poll(() => new Set(previewed).size).toBe(3);
	expect(previewed.every(url => !url.includes("code-only") && !url.includes("images.unsplash.com") && !url.includes("#"))).toBe(true);
	const geometry = await page.locator(".channel-panes").evaluate(panes => {
		const list = panes.querySelector(".channel-list")!.getBoundingClientRect();
		const body = panes.querySelector(".channel-detail")!;
		const article = body.getBoundingClientRect();
		const links = panes.querySelector(".channel-related-links")!.getBoundingClientRect();
		return { ordered: list.right <= article.left && article.right <= links.left, width: article.width, background: getComputedStyle(body).backgroundColor };
	});
	expect(geometry.ordered).toBe(true);
	expect(geometry.width).toBeGreaterThan(500);
	expect(geometry.background).toBe("rgb(255, 255, 255)");
	for (const width of [1440, 1366, 1280]) {
		await page.setViewportSize({ width, height: 1000 });
		await expect(aside).toBeVisible();
		await expect.poll(() => page.locator(".channel-panes").evaluate(panes => {
			const list = panes.querySelector(".channel-list-column")!.getBoundingClientRect();
			const reader = panes.querySelector(".channel-reading-panel")!.getBoundingClientRect();
			const links = panes.querySelector(".channel-related-links")!.getBoundingClientRect();
			const headings = [...panes.querySelectorAll(".channel-panel-heading")].map(node => node.getBoundingClientRect());
			return Math.abs(list.width - links.width) < 1 && reader.width >= 440
				&& list.top === reader.top && reader.top === links.top
				&& headings[0].height === headings[1].height
				&& document.documentElement.scrollWidth <= innerWidth;
		})).toBe(true);
	}
	await page.setViewportSize({ width: 1660, height: 1000 });
	await aside.getByRole("link").first().focus();
	await page.keyboard.press("j");
	await expect(page).toHaveURL(new RegExp(`/articles/${id}$`));
	await page.screenshot({ path: test.info().outputPath("xray-related-links-desktop.png"), fullPage: true });
	await page.getByRole("button", { name: /Toggle theme/ }).click();
	await page.getByRole("button", { name: /Toggle theme/ }).click();
	await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
	await expect.poll(() => page.evaluate(() => {
		const luminance = (selector: string) => {
			const numbers = getComputedStyle(document.querySelector(selector)!).backgroundColor.match(/[\d.]+/g)!.slice(0, 3).map(Number);
			return numbers.reduce((sum, n) => sum + n, 0);
		};
		return luminance(".channel-detail") > luminance(".channel-panes");
	})).toBe(true);
	await expect.poll(() => page.evaluate(() => {
		const value = (selector: string, property: "backgroundColor" | "color") =>
			Number(getComputedStyle(document.querySelector(selector)!)[property].match(/[\d.]+/)![0]);
		return value('[data-testid="app-sidebar"]', "backgroundColor") < 35
			&& value('.channel-related-links a p', "color") > 200
			&& value('.channel-header button', "backgroundColor") < 50;
	})).toBe(true);
	await page.screenshot({ path: test.info().outputPath("xray-related-links-dark.png"), fullPage: true, animations: "disabled" });
	const openLinks = page.getByRole("button", { name: "Related links", exact: true });
	const region = page.locator(".channel-links-region");
	await expect(openLinks).toHaveAttribute("aria-expanded", "true");
	expect(await openLinks.getAttribute("aria-controls")).toBe(await region.getAttribute("id"));
	const expandedWidth = (await content.boundingBox())!.width;
	const previewsBeforeClose = previewed.length;
	await aside.getByRole("button", { name: "Close related links" }).click();
	await expect(openLinks).toBeFocused();
	await expect(openLinks).toHaveAttribute("aria-expanded", "false");
	await expect(region).toHaveAttribute("inert", "");
	expect(await region.evaluate(node => node.getAnimations().some(animation => (animation as CSSTransition).transitionProperty === "width"))).toBe(true);
	await expect(aside).toHaveCount(0);
	await expect.poll(async () => (await region.boundingBox())!.width).toBe(0);
	await expect.poll(async () => (await content.boundingBox())!.width).toBeGreaterThan(expandedWidth);
	await openLinks.click();
	await expect(aside).toBeVisible();
	await expect.poll(async () => (await content.boundingBox())!.width).toBe(expandedWidth);
	expect(previewed).toHaveLength(previewsBeforeClose);
	await page.setViewportSize({ width: 2400, height: 1000 });
	const prose = page.locator(".channel-prose");
	const limitedWidth = (await prose.boundingBox())!.width;
	await page.getByRole("button", { name: "Use full reading width", exact: true }).click();
	await expect(aside).toBeVisible();
	await expect.poll(async () => (await prose.boundingBox())!.width).toBeGreaterThan(limitedWidth);
	await expect(openLinks).toHaveAttribute("aria-expanded", "true");
	await page.setViewportSize({ width: 1024, height: 1000 });
	await expect(page.getByRole("button", { name: "Back to reports", exact: true })).toBeVisible();
	await expect.poll(() => page.locator(".channel-panes").evaluate(panes => {
		const reader = panes.querySelector(".channel-reading-panel")!.getBoundingClientRect();
		const links = panes.querySelector(".channel-related-links")!.getBoundingClientRect();
		return reader.width >= 440 && reader.right <= links.left && reader.top === links.top
			&& document.documentElement.scrollWidth <= innerWidth;
	})).toBe(true);
	await page.getByRole("button", { name: "Back to reports", exact: true }).click();
	await expect(aside).not.toBeVisible();
	await page.getByRole("button", { name: /研发观察：让阅读回到内容/ }).click();
	await expect(aside).toBeVisible();
	await page.setViewportSize({ width: 320, height: 844 });
	await expect(content.locator(".channel-links-region[data-open='true']")).toHaveCount(1);
	await expect(aside).toBeVisible();
	await expect(page.getByRole("dialog", { name: "Related links", exact: true })).toHaveCount(0);
	await expect.poll(() => content.evaluate(document => {
		const article = document.querySelector("article")!.getBoundingClientRect();
		const links = document.querySelector(".channel-related-links")!.getBoundingClientRect();
		return links.top >= article.bottom && links.left >= article.left && links.right <= article.right;
	})).toBe(true);
	await aside.getByRole("heading", { name: "Related links", exact: true }).scrollIntoViewIfNeeded();
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({ path: test.info().outputPath("xray-related-links-mobile.png") });
	await aside.getByRole("button", { name: "Close related links" }).click();
	expect(await region.evaluate(node => node.getAnimations().some(animation => (animation as CSSTransition).transitionProperty === "grid-template-rows"))).toBe(true);
	const more = page.getByRole("button", { name: "More channel actions" });
	await expect(more).toBeFocused();
	await expect.poll(async () => (await region.boundingBox())!.height).toBe(0);
	await more.click();
	await openLinks.click();
	await expect(aside).toBeVisible();
	await page.emulateMedia({ reducedMotion: "reduce" });
	await more.click();
	await openLinks.click();
	await expect.poll(async () => (await region.boundingBox())!.height).toBe(0);
	expect(await region.evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0);
	await page.reload();
	await expect(content.locator(".channel-links-region[data-open='true']")).toHaveCount(1);
	await expect(aside).toBeVisible();
	await more.click();
	await expect(openLinks).toHaveAttribute("aria-pressed", "true");
});
