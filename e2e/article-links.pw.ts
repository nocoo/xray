import { expect, test } from "@playwright/test";
import { BROWSER, browserApiHeaders, INGEST, WORKER } from "./helpers";

test.beforeAll(() => {
	for (const value of [BROWSER, WORKER, INGEST]) {
		const url = new URL(value);
		if (!["127.0.0.1", "localhost"].includes(url.hostname) || ["7007", "37007"].includes(url.port)) throw new Error("Article links require an isolated local test stack");
	}
});

test("related previews integrate with reading width, tags, keyboard, and mobile sheets", async ({ page, request }) => {
	await page.setViewportSize({ width: 1660, height: 1000 });
	const created = await request.post(`${WORKER}/api/channels`, { headers: browserApiHeaders, data: { name: `Reader links ${Date.now()}` } });
	const channel = (await created.json()).data;
	const issued = await request.post(`${WORKER}/api/channels/${channel.id}/keys`, { headers: browserApiHeaders, data: { label: "Link producer" } });
	const token = (await issued.json()).data.token;
	const submitted = await request.post(`${INGEST}/api/v1/ingest/articles`, {
		headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${token}` },
		data: { external_id: "links", title: "研发观察：让阅读回到内容", report_date: "2026-09-22", markdown: "## 阅读与设计\n\n这是一篇记录阅读体验的报告，正文应当拥有最清晰的视觉层级。\n\n[中文阅读与 Kami](https://sources.example.com/kami#reader) 与 [Kami 重复来源](https://sources.example.com/kami) 提供阅读参考。\n\n[Workers 文档][docs] 帮助我们实现可靠的链接预览。\n\n[尚无预览的页面](https://sources.example.com/unavailable) 仍然可以直接打开。\n\n[docs]: https://sources.example.com/workers\n\n```text\nhttps://sources.example.com/code-only\n```\n\n![示例正文插图](https://images.example.com/article.svg)" },
	});
	expect(submitted.status()).toBe(201);
	const id = (await submitted.json()).id;
	const previewed: string[] = [];
	await page.route("https://images.example.com/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#d6e5df"/><circle cx="410" cy="140" r="78" fill="#92b8a5"/><path d="M0 300L230 80L510 360H0" fill="#71948a"/></svg>' }));
	await page.route("**/link-preview?*", async route => {
		const url = new URL(route.request().url()).searchParams.get("url")!;
		previewed.push(url);
		const unavailable = url.endsWith("unavailable");
		await route.fulfill({ json: { success: true, data: { url, title: unavailable ? null : url.endsWith("kami") ? "Kami · 舒适的中文阅读体验" : "Cloudflare Workers — Build with confidence", description: unavailable ? null : "保持清晰的信息层级，在文章旁边查看原始来源、摘要与图片。", siteName: unavailable ? null : "Research sources", imageUrl: unavailable ? null : "https://images.example.com/preview.svg" } } });
	});
	await page.goto(`${BROWSER}/channels/${channel.id}/articles/${id}`);
	const aside = page.getByRole("complementary", { name: "Related article links", exact: true });
	const content = page.getByRole("document", { name: "Article content" });
	await expect(aside).toBeVisible();
	await expect(aside.getByRole("listitem")).toHaveCount(3);
	await expect(aside.getByRole("link", { name: /Kami · 舒适/ })).toBeVisible();
	await expect(aside.locator("img")).toHaveCount(2);
	await expect.poll(() => aside.locator("img").first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
	await expect(aside.getByRole("link", { name: /尚无预览的页面/ })).toBeVisible();
	await expect.poll(() => new Set(previewed).size).toBe(3);
	expect(previewed.every(url => !url.includes("code-only") && !url.includes("images.example.com") && !url.includes("#"))).toBe(true);
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
	await aside.getByRole("link").first().focus();
	await page.keyboard.press("j");
	await expect(page).toHaveURL(new RegExp(`/articles/${id}$`));
	await page.screenshot({ path: "/tmp/xray-related-links-desktop.png", fullPage: true });
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
	await page.screenshot({ path: "/tmp/xray-related-links-dark.png", fullPage: true, animations: "disabled" });
	await page.getByRole("button", { name: "Related links", exact: true }).click();
	await expect(aside).toHaveCount(0);
	await page.getByRole("button", { name: "Related links", exact: true }).click();
	await expect(aside).toBeVisible();
	await page.getByRole("button", { name: "Use full reading width", exact: true }).click();
	await expect(aside).toHaveCount(0);
	await expect.poll(async () => (await content.boundingBox())!.width).toBeGreaterThan(geometry.width);
	const openLinks = page.getByRole("button", { name: "Related links", exact: true });
	await openLinks.click();
	const sheet = page.getByRole("dialog", { name: "Related links", exact: true });
	await expect(sheet).toBeVisible();
	await expect(sheet.getByRole("listitem")).toHaveCount(3);
	await page.keyboard.press("Escape");
	await expect(sheet).toHaveCount(0);
	await expect(openLinks).toBeFocused();
	await page.setViewportSize({ width: 320, height: 844 });
	await openLinks.click();
	await expect(sheet).toBeVisible();
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({ path: "/tmp/xray-related-links-mobile.png", fullPage: true });
	await page.keyboard.press("Escape");
	await expect(content.getByRole("heading", { name: "研发观察：让阅读回到内容", exact: true })).toBeVisible();
	await expect(openLinks).toBeFocused();
});
