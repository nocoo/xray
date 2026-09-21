import { expect, test } from "@playwright/test";
import { BROWSER, browserApiHeaders, INGEST, WORKER } from "./helpers";

test.beforeAll(() => {
	for (const url of [BROWSER, WORKER, INGEST]) {
		const parsed = new URL(url);
		if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || ["7007", "37007"].includes(parsed.port)) {
			throw new Error("Channels L3 requires explicit, isolated loopback test servers");
		}
	}
});

const reportBody = [
	"## 今日进展",
	"中文长文阅读需要稳定的字体与行距。报告保留原始 Markdown，方便团队集中查看每日进展。English stays readable alongside 中文。",
	"| 项目 | 状态 |\n| --- | --- |\n| 阅读器 | 已完成 |",
	"![趋势图](https://images.example.test/chart.svg)",
	"```typescript\nconst report = { title: 'Daily report' };\n```",
	...Array.from({ length: 18 }, (_, i) => `### 观察 ${i + 1}\n\n清晰的标题、紧凑的信息和适当的行宽，让每天的报告更容易阅读。保存滚动位置后，返回时可以接着看。`),
].join("\n\n");

test("channel creation, one-time key, delivery, reader navigation and revocation", async ({ page, request }) => {
	const name = `Research ${Date.now()}`;
	await page.route("https://images.example.test/chart.svg", (route) => route.fulfill({
		contentType: "image/svg+xml",
		body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240"><rect width="640" height="240" fill="#eee"/><path d="M20 210L180 140L340 170L620 30" fill="none" stroke="#345" stroke-width="3"/></svg>',
	}));
	await page.goto(`${BROWSER}/channels`);
	await page.getByRole("button", { name: "New channel", exact: true }).first().click();
	await page.getByLabel("Channel name", { exact: true }).fill(name);
	await page.getByRole("button", { name: "Create channel", exact: true }).click();
	await expect(page).toHaveURL(/\/channels\/\d+/);
	const channelId = Number(new URL(page.url()).pathname.split("/")[2]);
	await page.getByRole("button", { name: "Manage channel", exact: true }).click();
	await page.getByLabel("Key label", { exact: true }).fill("Fundly Agent");
	await page.getByRole("button", { name: "Create key", exact: true }).click();
	const keyField = page.getByLabel("API key", { exact: true });
	await expect(keyField).toBeVisible();
	const token = await keyField.inputValue();
	expect(token).toMatch(/^xray_pt_/);
	await page.keyboard.press("Escape");
	const ids: number[] = [];
	for (const [index, date] of ["2026-09-21", "2026-09-22"].entries()) {
		const result = await request.post(`${INGEST}/api/v1/ingest/articles`, {
			headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${token}` },
			data: { external_id: `${name}-${index}`, title: `研发日报 · ${date}`, report_date: date, summary: "今日研发与阅读体验进展", author: "Fundly Research", markdown: reportBody },
		});
		expect(result.status()).toBe(201);
		ids.push((await result.json()).id);
	}
	await page.reload();
	await page.getByRole("button", { name: /研发日报 · 2026-09-22/ }).click();
	await expect(page).toHaveURL(new RegExp(`/channels/${channelId}/articles/${ids[1]}`));
	const content = page.getByRole("document", { name: "Article content" });
	await expect(content.getByRole("heading", { name: "今日进展" })).toBeVisible();
	await expect(content.getByRole("table")).toBeVisible();
	await expect(content.getByRole("img", { name: "趋势图" })).toBeVisible();
	await expect.poll(() => content.getByRole("img", { name: "趋势图" }).evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
	await expect.poll(() => page.evaluate(() => document.fonts.check('18px "TsangerJinKai02"', "中文"))).toBe(true);
	const bodyStyle = await content.locator("article > p").first().evaluate((node) => ({ font: getComputedStyle(node).fontFamily, size: getComputedStyle(node).fontSize }));
	expect(bodyStyle.font).toContain("TsangerJinKai02");
	expect(bodyStyle.size).toBe("18px");
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("DOM.enable");
	await cdp.send("CSS.enable");
	const dom = await cdp.send("DOM.getDocument");
	const paragraph = await cdp.send("DOM.querySelector", { nodeId: dom.root.nodeId, selector: '[role="document"] article > p' });
	await expect.poll(async () => {
		const result = await cdp.send("CSS.getPlatformFontsForNode", { nodeId: paragraph.nodeId });
		return result.fonts.some((font) => /TsangerJinKai/i.test(font.familyName) && font.glyphCount > 0);
	}).toBe(true);
	await cdp.detach();
	await page.screenshot({ path: "/tmp/xray-channels-desktop.png", fullPage: true });
	await page.getByRole("button", { name: /研发日报 · 2026-09-22/ }).focus();
	await page.evaluate(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "j", isComposing: true, bubbles: true })));
	await expect(page).toHaveURL(new RegExp(`/articles/${ids[1]}`));
	await page.keyboard.press("j");
	await expect(page).toHaveURL(new RegExp(`/articles/${ids[0]}`));
	await page.keyboard.press("k");
	await expect(page).toHaveURL(new RegExp(`/articles/${ids[1]}`));
	await page.keyboard.press("Enter");
	await expect(content).toBeFocused();
	await content.evaluate((node) => { node.scrollTop = 600; });
	await page.waitForTimeout(250);
	await page.reload();
	await expect(content.getByRole("heading", { name: "今日进展" })).toBeAttached();
	await expect.poll(() => content.evaluate((node) => node.scrollTop)).toBeGreaterThan(400);
	await page.keyboard.press("Escape");
	await expect(page.getByRole("button", { name: /研发日报 · 2026-09-22/ })).toBeFocused();
	await page.getByLabel("Report date", { exact: true }).fill("2026-09-21");
	await expect(page.getByRole("button", { name: /研发日报 · 2026-09-22/ })).toHaveCount(0);
	await expect(page.getByRole("button", { name: /研发日报 · 2026-09-21/ })).toBeVisible();
	await page.getByRole("button", { name: "Manage channel", exact: true }).click();
	await expect(page.getByLabel("API key", { exact: true })).toHaveCount(0);
	await page.getByRole("button", { name: /Revoke.*Fundly Agent/ }).click();
	const revoked = await request.post(`${INGEST}/api/v1/ingest/articles`, {
		headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${token}` },
		data: { external_id: "after-revocation", title: "Blocked", report_date: "2026-09-22", markdown: "Blocked" },
	});
	expect(revoked.status()).toBe(401);
	const existing = await request.get(`${WORKER}/api/channels/${channelId}/articles/${ids[1]}`, { headers: browserApiHeaders });
	expect(existing.status()).toBe(200);
});

test("mobile reader contains long Markdown and blocks executable or embedded image URLs", async ({ page, request }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const created = await request.post(`${WORKER}/api/channels`, { headers: browserApiHeaders, data: { name: `Mobile ${Date.now()}` } });
	const channel = (await created.json()).data;
	const issued = await request.post(`${WORKER}/api/channels/${channel.id}/keys`, { headers: browserApiHeaders, data: { label: "Mobile test" } });
	const key = (await issued.json()).data;
	const result = await request.post(`${INGEST}/api/v1/ingest/articles`, {
		headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${key.token}` },
		data: { external_id: "mobile", title: "中文阅读与安全排版", report_date: "2026-09-22", markdown: `${reportBody}\n\n<script>window.injected=true</script>\n\n[Unsafe](javascript:alert(1))\n\n![Embedded](data:image/png;base64,aGVsbG8=)\n\n![Insecure](http://example.com/a.png)` },
	});
	const article = await result.json();
	await page.goto(`${BROWSER}/channels/${channel.id}/articles/${article.id}`);
	const content = page.getByRole("document", { name: "Article content" });
	await expect(content.getByRole("heading", { name: "今日进展" })).toBeVisible();
	await expect(content.locator("script, img[src^='data:'], img[src^='http:'], a[href^='javascript:']")).toHaveCount(0);
	expect(await page.evaluate(() => Reflect.get(window, "injected"))).toBeUndefined();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({ path: "/tmp/xray-channels-mobile.png", fullPage: true });
	await page.keyboard.press("Escape");
	await expect(page.getByRole("button", { name: /中文阅读与安全排版/ })).toBeVisible();
});

test("loaded history and reading positions survive reload and browser navigation", async ({ page, request }) => {
	const created = await request.post(`${WORKER}/api/channels`, { headers: browserApiHeaders, data: { name: `Archive ${Date.now()}` } });
	const channel = (await created.json()).data;
	const issued = await request.post(`${WORKER}/api/channels/${channel.id}/keys`, { headers: browserApiHeaders, data: { label: "Archive producer" } });
	const key = (await issued.json()).data;
	for (let index = 0; index < 35; index++) {
		const number = String(index).padStart(2, "0");
		const response = await request.post(`${INGEST}/api/v1/ingest/articles`, {
			headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${key.token}` },
			data: { external_id: number, title: `Historical report ${number}`, report_date: "2026-09-22", markdown: reportBody },
		});
		expect(response.status()).toBe(201);
	}
	await page.goto(`${BROWSER}/channels/${channel.id}`);
	await page.getByRole("button", { name: "Load more", exact: true }).click();
	const oldest = page.getByRole("button", { name: /Historical report 00/ });
	await oldest.click();
	const content = page.getByRole("document", { name: "Article content" });
	const list = page.getByRole("region", { name: "Articles", exact: true });
	await expect(content.getByRole("heading", { name: "今日进展" })).toBeVisible();
	await content.evaluate((node) => { node.scrollTop = 700; });
	await page.waitForTimeout(200);
	await page.reload();
	await expect(oldest).toBeVisible();
	await expect.poll(() => list.evaluate(node => node.scrollTop)).toBeGreaterThan(400);
	await expect.poll(() => content.evaluate(node => node.scrollTop)).toBeGreaterThan(500);
	await page.getByRole("button", { name: /Historical report 01/ }).click();
	await expect(content.getByRole("heading", { name: "Historical report 01", exact: true })).toBeVisible();
	await page.goBack();
	await expect(content.getByRole("heading", { name: "Historical report 00", exact: true })).toBeAttached();
	await expect.poll(() => content.evaluate(node => node.scrollTop)).toBeGreaterThan(500);
	await expect(oldest).toBeFocused();
	await page.goForward();
	await expect(content.getByRole("heading", { name: "Historical report 01", exact: true })).toBeVisible();
});
