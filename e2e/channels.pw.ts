import { installExternalMedia } from "../fixtures/e2e";
import { MEDIA_URLS } from "../fixtures/primitives";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { BROWSER, browserApiHeaders, INGEST, WORKER } from "./helpers";

test.beforeEach(async ({ page }) => { await installExternalMedia(page); });

test.beforeAll(() => {
	for (const url of [BROWSER, WORKER, INGEST]) {
		const parsed = new URL(url);
		if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || ["7007", "37007"].includes(parsed.port)) {
			throw new Error("Channels L3 requires explicit, isolated loopback test servers");
		}
	}
});

test.afterEach(async ({ page }) => {
	await page.context().setOffline(false);
});

async function expectReaderChrome(page: Page) {
	if ((page.viewportSize()?.width ?? 1280) < 768) {
		for (const name of ["Reading settings", "More channel actions", "Back to reports"]) {
			const button = page.getByRole("button", { name, exact: true });
			await expect(button).toBeInViewport();
			const box = await button.boundingBox();
			expect(box!.width).toBeGreaterThanOrEqual(44);
			expect(box!.height).toBeGreaterThanOrEqual(44);
		}
		await expect(page.getByRole("button", { name: "Edit article", exact: true })).toBeHidden();
		await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		return;
	}
	await expect(page.locator(".channel-header").getByRole("group", { name: "Reading preferences", exact: true })).toBeVisible();
	await expect(page.getByLabel("Report date", { exact: true })).toHaveCount(0);
	await expect(page.locator(".channel-detail").getByRole("group", { name: "Reading preferences", exact: true })).toHaveCount(0);
	await expect(page.locator(".channel-header h1, .channel-prose > header > h1")).toHaveCount(2);
	await expect.poll(() => page.evaluate(() => {
		const controls = document.querySelector('[aria-label="Reading preferences"]');
		const titles = document.querySelectorAll(".channel-header h1, .channel-prose > header > h1");
		if (!controls || titles.length !== 2) return false;
		const toolbar = controls.getBoundingClientRect();
		return toolbar.width > 0 && toolbar.left >= 0 && toolbar.right <= innerWidth && [...titles].every(title => {
			const rect = title.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0 && (
				rect.right <= toolbar.left || rect.left >= toolbar.right ||
				rect.bottom <= toolbar.top || rect.top >= toolbar.bottom
			);
		});
	}), { message: "Reader toolbar must not overlap the page or article title" }).toBe(true);
	await expect.poll(() => page.evaluate(() => {
		const controls = document.querySelector('[aria-label="Reading preferences"]');
		const settings = document.querySelector('.channel-header a[aria-label="Manage channel"]');
		const title = document.querySelector('.channel-header h1');
		if (!controls || !settings || !title) return false;
		const toolbar = controls.getBoundingClientRect();
		const gear = settings.getBoundingClientRect();
		const heading = title.getBoundingClientRect();
		return toolbar.right < gear.left && Math.abs(toolbar.top - gear.top) < 1 &&
			(innerWidth < 768 || Math.abs(toolbar.top - heading.top) < 1);
	}), { message: "Reading controls and settings must share one row, aligned with the desktop title" }).toBe(true);
	await expect.poll(() => page.evaluate(() =>
		Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth,
	), { message: "Reader must not overflow the viewport horizontally" }).toBe(true);
}

async function expectOverlayFits(page: Page, overlay: Locator) {
	await expect(overlay).toBeVisible();
	await expect.poll(() => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth)).toBe(true);
	await expect.poll(() => overlay.evaluate(node => {
		const rect = node.getBoundingClientRect();
		return rect.left >= 0 && rect.right <= innerWidth && node.scrollWidth <= node.clientWidth;
	})).toBe(true);
}

const reportBody = [
	"## 今日进展",
	"中文长文阅读需要稳定的字体与行距。报告保留原始 Markdown，方便团队集中查看每日进展。English stays readable alongside 中文。",
	"| 项目 | 状态 |\n| --- | --- |\n| 阅读器 | 已完成 |",
	`![趋势图](${MEDIA_URLS.desk})`,
	"```typescript\nconst report = { title: 'Daily report' };\n```",
	...Array.from({ length: 18 }, (_, i) => `### 观察 ${i + 1}\n\n清晰的标题、紧凑的信息和适当的行宽，让每天的报告更容易阅读。保存滚动位置后，返回时可以接着看。`),
].join("\n\n");

test("channel creation, one-time key, delivery, reader navigation and revocation", async ({ page, request }) => {
	const name = `Research ${Date.now()}`;
	await page.goto(`${BROWSER}/channels`);
	await page.locator("#main-content").getByRole("button", { name: "New channel", exact: true }).click();
	await page.getByLabel("Channel name", { exact: true }).fill(name);
	await page.getByLabel(/^Description\s*\(optional\)$/).fill("Daily research reports");
	await page.getByRole("button", { name: "Create channel", exact: true }).click();
	await expect(page).toHaveURL(/\/channels\/\d+\/settings$/);
	const channelId = Number(new URL(page.url()).pathname.split("/")[2]);
	await expect(page.locator("header[aria-labelledby]").getByRole("heading", { name, exact: true })).toBeVisible();
	await expect(page.getByText("Profile and push tokens.", { exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Push tokens", exact: true })).toBeVisible();
	await expect(page.getByText(/Organize this channel with shared labels|Copied examples use/)).toHaveCount(0);
	await expect(page.getByText(`POST ${INGEST}/api/v1/ingest/articles`, { exact: true })).toHaveCount(0);
	await page.getByRole("button", { name: "Create token", exact: true }).click();
	const tokenDialog = page.getByRole("dialog", { name: "Create push token", exact: true });
	await tokenDialog.getByLabel("Token name", { exact: true }).fill("Fundly Agent");
	await tokenDialog.getByRole("button", { name: "Create token", exact: true }).click();
	const keyField = page.getByLabel("API key", { exact: true });
	await expect(keyField).toBeVisible();
	await expect(page.getByText("This key is shown only once.", { exact: true })).toBeVisible();
	const token = await keyField.inputValue();
	expect(token).toMatch(/^xray_pt_/);
	await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
	await page.getByRole("button", { name: "Copy key", exact: true }).click();
	await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(token);
	await page.getByRole("dialog", { name: "Token created", exact: true }).getByRole("button", { name: "Done", exact: true }).click();
	await expect(page.getByRole("button", { name: "Create token", exact: true })).toBeFocused();
	await expect(keyField).toHaveCount(0);
	await page.getByRole("button", { name: "Copy example", exact: true }).click();
	await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("external_id");
	const example = await page.evaluate(() => navigator.clipboard.readText());
	expect(example).toContain("markdown");
	expect(example).toContain("cat > report.json");
	expect(example).toContain("curl '");
	expect(example).toContain("/api/v1/ingest/articles");
	expect(example).toContain("Authorization: Bearer YOUR_CHANNEL_TOKEN");
	expect(example.includes(token)).toBe(false);
	expect(example).toContain("--data @report.json");
	const ids: number[] = [];
	for (const [index, date] of ["2026-09-21", "2026-09-22"].entries()) {
		const result = await request.post(`${INGEST}/api/v1/ingest/articles`, {
			headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${token}` },
			data: { external_id: `${name}-${index}`, title: `研发日报 · ${date}`, report_date: date, summary: "今日研发与阅读体验进展", ...(index === 1 ? { author: "Fundly Research" } : {}), markdown: reportBody },
		});
		expect(result.status()).toBe(201);
		ids.push((await result.json()).id);
	}
	await page.goto(`${BROWSER}/channels`);
	const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: `Read ${name}`, exact: true }) });
	await expect(row.getByRole("cell", { name: "2", exact: true })).toBeVisible();
	await expect(row.getByRole("cell", { name: "1", exact: true })).toBeVisible();
	await expect(row).toContainText("2026-09-22");
	const channels = await request.get(`${WORKER}/api/channels`, { headers: browserApiHeaders });
	expect(channels.ok()).toBe(true);
	const channel = (await channels.json()).data.find((item: { id: number }) => item.id === channelId);
	expect(channel).toMatchObject({ articleCount: 2, activeKeyCount: 1, latestReportDate: "2026-09-22" });
	expect(channel.lastReceivedAtMs).toBeGreaterThan(0);
	await row.getByRole("link", { name: `Read ${name}`, exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/channels/${channelId}/articles/${ids[1]}`));
	const content = page.getByRole("document", { name: "Article content" });
	await expect(content.getByRole("heading", { name: "今日进展" })).toBeVisible();
	const authorIcon = content.getByText("Fundly Research", { exact: true }).locator("..").locator('svg.lucide-user-round[aria-hidden="true"]');
	const agentIcon = content.getByText("Fundly Agent", { exact: true }).locator("..").locator('svg.lucide-bot[aria-hidden="true"]');
	await expect(authorIcon).toBeVisible();
	await expect(agentIcon).toBeVisible();
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
	const fontToggle = page.getByRole("button", { name: "Use sans-serif font", exact: true });
	const smaller = page.getByRole("button", { name: "Decrease font size", exact: true });
	const larger = page.getByRole("button", { name: "Increase font size", exact: true });
	await fontToggle.click();
	await expect(fontToggle).toHaveAttribute("aria-pressed", "true");
	await expect(content.locator("article")).toHaveClass(/channel-sans/);
	await smaller.click();
	await expect(smaller).toBeDisabled();
	await expect(content.locator("article")).toHaveCSS("font-size", "16px");
	await larger.click();
	await larger.click();
	await larger.click();
	await expect(larger).toBeDisabled();
	await expect(content.locator("article")).toHaveCSS("font-size", "22px");
	await page.reload();
	await expect(fontToggle).toHaveAttribute("aria-pressed", "true");
	await expect(content.locator("article")).toHaveCSS("font-size", "22px");
	await fontToggle.click();
	await smaller.click();
	await smaller.click();
	await expect(fontToggle).toHaveAttribute("aria-pressed", "false");
	await expect(content.locator("article")).toHaveCSS("font-size", "18px");
	await page.setViewportSize({ width: 2000, height: 1000 });
	await expectReaderChrome(page);
	const widthToggle = page.getByRole("button", { name: "Use full reading width", exact: true });
	await expect(widthToggle).toHaveAttribute("aria-pressed", "false");
	await expect(content).toHaveAttribute("data-full-width", "false");
	const readableWidth = await content.locator("article").evaluate(node => node.getBoundingClientRect().width);
	await widthToggle.click();
	await expect(widthToggle).toHaveAttribute("aria-pressed", "true");
	await expect(content).toHaveAttribute("data-full-width", "true");
	await expectReaderChrome(page);
	await expect.poll(() => content.locator("article").evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThan(readableWidth);
	await page.reload();
	await expect(widthToggle).toHaveAttribute("aria-pressed", "true");
	await expect(content).toHaveAttribute("data-full-width", "true");
	await widthToggle.click();
	await expect(content).toHaveAttribute("data-full-width", "false");
	await page.setViewportSize({ width: 1600, height: 1000 });
	await expectReaderChrome(page);
	await page.screenshot({ path: test.info().outputPath("xray-channels-desktop.png"), fullPage: true });
	await page.getByRole("button", { name: /研发日报 · 2026-09-22/ }).focus();
	await page.evaluate(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "j", isComposing: true, bubbles: true })));
	await expect(page).toHaveURL(new RegExp(`/articles/${ids[1]}`));
	await Promise.all([
		page.waitForResponse((response) => response.url().endsWith(`/api/channels/${channelId}/articles/${ids[0]}/read`) && response.request().method() === "PUT" && response.ok()),
		page.waitForResponse((response) => response.url().endsWith("/api/channels") && response.ok()),
		page.keyboard.press("j"),
	]);
	await expect(page).toHaveURL(new RegExp(`/articles/${ids[0]}`));
	await expect(page.getByRole("button", { name: /研发日报 · 2026-09-21/ })).toBeFocused();
	await expect(content).toHaveAttribute("aria-busy", "false");
	await expect(authorIcon).toHaveCount(0);
	await expect(agentIcon).toBeVisible();
	await expect(page.getByRole("region", { name: "Articles", exact: true })).toHaveAttribute("aria-busy", "false");
	const articleResponse = Promise.withResolvers<void>();
	let articleRequestSeen = false;
	await page.route(`**/api/channels/${channelId}/articles/${ids[1]}`, async (route) => {
		const response = await route.fetch();
		articleRequestSeen = true;
		await articleResponse.promise;
		await route.fulfill({ response });
	}, { times: 1 });
	try {
		await page.keyboard.press("k");
		await expect(page).toHaveURL(new RegExp(`/articles/${ids[1]}`));
		await expect.poll(() => articleRequestSeen).toBe(true);
		await expect(content).toHaveAttribute("aria-busy", "true");
		await expect(page.getByRole("button", { name: /研发日报 · 2026-09-22/ })).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(content).toBeFocused();
	} finally {
		articleResponse.resolve();
	}
	await expect(content).toHaveAttribute("aria-busy", "false");
	await expect(content).toBeFocused();
	await content.evaluate((node) => { node.scrollTop = 600; });
	await page.waitForTimeout(250);
	await page.reload();
	await expect(content.getByRole("heading", { name: "今日进展" })).toBeAttached();
	await expect.poll(() => content.evaluate((node) => node.scrollTop)).toBeGreaterThan(400);
	await page.keyboard.press("Escape");
	await expect(page.getByRole("button", { name: /研发日报 · 2026-09-22/ })).toBeFocused();
	await page.goto(`${BROWSER}/channels/${channelId}?date_from=2026-09-21&date_to=2026-09-21`);
	await expect(page.getByRole("button", { name: /研发日报 · 2026-09-22/ })).toHaveCount(0);
	await expect(page.getByRole("button", { name: /研发日报 · 2026-09-21/ })).toBeVisible();
	await page.getByRole("link", { name: "Manage channel", exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/channels/${channelId}/settings$`));
	await expect(page.getByLabel("API key", { exact: true })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Copy key", exact: true })).toHaveCount(0);
	await page.getByRole("button", { name: "Revoke Fundly Agent", exact: true }).click();
	const confirmation = page.getByRole("alertdialog", { name: "Revoke push token?", exact: true });
	await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(confirmation).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Revoke Fundly Agent", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Revoke Fundly Agent", exact: true }).click();
	await confirmation.getByRole("button", { name: "Revoke", exact: true }).click();
	await expect(confirmation).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Revoke Fundly Agent", exact: true })).toHaveCount(0);
	const revoked = await request.post(`${INGEST}/api/v1/ingest/articles`, {
		headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${token}` },
		data: { external_id: "after-revocation", title: "Blocked", report_date: "2026-09-22", markdown: "Blocked" },
	});
	expect(revoked.status()).toBe(401);
	const existing = await request.get(`${WORKER}/api/channels/${channelId}/articles/${ids[1]}`, { headers: browserApiHeaders });
	expect(existing.status()).toBe(200);
	await page.goto(`${BROWSER}/channels`);
	await expect(row.getByRole("cell", { name: "0", exact: true })).toBeVisible();
	await expect(row.getByRole("cell", { name: "2", exact: true })).toBeVisible();
});
