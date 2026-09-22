import { expect, type Page, test } from "@playwright/test";
import { BROWSER, browserApiHeaders, INGEST, WORKER } from "./helpers";

test.beforeAll(() => {
	for (const url of [BROWSER, WORKER, INGEST]) {
		const parsed = new URL(url);
		if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || ["7007", "37007"].includes(parsed.port)) {
			throw new Error("Channels L3 requires explicit, isolated loopback test servers");
		}
	}
});

async function expectReaderChrome(page: Page) {
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
	await page.locator("#main-content").getByRole("button", { name: "New channel", exact: true }).click();
	await page.getByLabel("Channel name", { exact: true }).fill(name);
	await page.getByLabel(/^Description\s*\(optional\)$/).fill("Daily research reports");
	await page.getByRole("button", { name: "Create channel", exact: true }).click();
	await expect(page).toHaveURL(/\/channels\/\d+\/settings$/);
	const channelId = Number(new URL(page.url()).pathname.split("/")[2]);
	await expect(page.locator("header[aria-labelledby]").getByRole("heading", { name, exact: true })).toBeVisible();
	await expect(page.getByText("Channel settings · Profile, activity, and push tokens.", { exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Push tokens", exact: true })).toBeVisible();
	await page.getByLabel("Token name", { exact: true }).fill("Fundly Agent");
	await page.getByRole("button", { name: "Create token", exact: true }).click();
	const keyField = page.getByLabel("API key", { exact: true });
	await expect(keyField).toBeVisible();
	const token = await keyField.inputValue();
	expect(token).toMatch(/^xray_pt_/);
	await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
	await page.getByRole("button", { name: "Copy key", exact: true }).click();
	await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(token);
	await page.getByRole("button", { name: "Copy example", exact: true }).click();
	await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("external_id");
	const example = await page.evaluate(() => navigator.clipboard.readText());
	expect(example).toContain("markdown");
	expect(example).toContain("cat > report.json");
	expect(example).toContain("curl '");
	expect(example).toContain("/api/v1/ingest/articles");
	expect(example.includes(`Authorization: Bearer ${token}`)).toBe(true);
	expect(example).toContain("--data @report.json");
	const ids: number[] = [];
	for (const [index, date] of ["2026-09-21", "2026-09-22"].entries()) {
		const result = await request.post(`${INGEST}/api/v1/ingest/articles`, {
			headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${token}` },
			data: { external_id: `${name}-${index}`, title: `研发日报 · ${date}`, report_date: date, summary: "今日研发与阅读体验进展", author: "Fundly Research", markdown: reportBody },
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
	await page.goto(`${BROWSER}/channels/${channelId}?date=2026-09-21`);
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

test("channel management edits profiles, persists ordering and confirms deletion", async ({ page, request }) => {
	const prefix = `Manage ${Date.now()}`;
	const channelIds: number[] = [];
	for (const suffix of ["A", "B"]) {
		const response = await request.post(`${WORKER}/api/channels`, {
			headers: browserApiHeaders,
			data: { name: `${prefix} ${suffix}`, description: "Initial description" },
		});
		expect(response.status()).toBe(201);
		channelIds.push((await response.json()).data.id);
	}
	await page.goto(`${BROWSER}/channels`);
	await expect(page.locator("header[aria-labelledby]").getByRole("heading", { name: "Channels", exact: true })).toBeVisible();
	const sidebar = page.getByTestId("app-sidebar");
	const channelsLink = sidebar.getByRole("link", { name: "Channels", exact: true });
	const settingsLink = sidebar.getByRole("link", { name: "Settings", exact: true });
	await expect(channelsLink).toBeVisible();
	await expect(settingsLink).toBeVisible();
	const links = await sidebar.getByRole("link").evaluateAll(nodes => nodes.map(node => node.getAttribute("href")));
	expect(links.indexOf("/channels")).toBeLessThan(links.indexOf("/settings"));
	await page.locator("#main-content").getByRole("button", { name: "New channel", exact: true }).click();
	await expect(page.getByLabel("Channel name", { exact: true })).toBeVisible();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(page.locator("#main-content").getByRole("button", { name: "New channel", exact: true })).toBeDisabled();
	await page.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(page.getByLabel("Channel name", { exact: true })).toHaveCount(0);

	await page.getByRole("link", { name: `Manage ${prefix} A`, exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/channels/${channelIds[0]}/settings$`));
	const renamed = `${prefix} edited`;
	await page.getByLabel("Channel name", { exact: true }).fill(renamed);
	await page.getByLabel(/^Description\s*\(optional\)$/).fill("Updated channel description");
	await page.getByRole("button", { name: "Save changes", exact: true }).click();
	await expect(page.locator("header[aria-labelledby]").getByRole("heading", { name: renamed, exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByLabel("Channel name", { exact: true })).toHaveValue(renamed);
	await expect(page.getByLabel(/^Description\s*\(optional\)$/)).toHaveValue("Updated channel description");
	await page.goto(`${BROWSER}/channels`);
	const table = page.getByRole("table");
	const managedLinks = table.getByRole("link", { name: new RegExp(`^Manage ${prefix}`) });
	await expect(managedLinks).toHaveCount(2);
	const order = () => managedLinks.evaluateAll(nodes => nodes.map(node => node.getAttribute("href")));
	const originalOrder = channelIds.map(id => `/channels/${id}/settings`);
	await expect.poll(order).toEqual(originalOrder);
	await page.getByRole("button", { name: `Move ${prefix} B up`, exact: true }).click();
	await expect.poll(order).toEqual([...originalOrder].reverse());
	await page.reload();
	await expect.poll(order).toEqual([...originalOrder].reverse());
	await page.getByRole("button", { name: `Move ${prefix} B down`, exact: true }).click();
	await expect.poll(order).toEqual(originalOrder);
	await page.reload();
	await expect.poll(order).toEqual(originalOrder);

	await page.getByRole("link", { name: `Read ${renamed}`, exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/channels/${channelIds[0]}$`));
	await expect(page.getByText("No reports for this date.", { exact: true })).toBeVisible();
	await expect(page.getByText("Updated channel description", { exact: true })).toBeVisible();
	await page.getByRole("link", { name: "Manage channel", exact: true }).click();
	await page.locator("#main-content").getByRole("button", { name: "Delete channel", exact: true }).click();
	const confirmation = page.getByRole("alertdialog", { name: "Delete channel?", exact: true });
	await expect(confirmation).toContainText(renamed);
	await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(confirmation).toHaveCount(0);
	await expect(page).toHaveURL(new RegExp(`/channels/${channelIds[0]}/settings$`));
	await page.locator("#main-content").getByRole("button", { name: "Delete channel", exact: true }).click();
	await confirmation.getByRole("button", { name: "Delete channel", exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`${BROWSER}/channels$`));
	await expect(page.getByRole("link", { name: `Manage ${renamed}`, exact: true })).toHaveCount(0);
	await page.reload();
	await expect(page.getByRole("link", { name: `Manage ${renamed}`, exact: true })).toHaveCount(0);
	await expect(page.getByRole("link", { name: `Manage ${prefix} B`, exact: true })).toBeVisible();
	const remaining = await request.get(`${WORKER}/api/channels`, { headers: browserApiHeaders });
	expect(remaining.ok()).toBe(true);
	const remainingIds = (await remaining.json()).data.map((channel: { id: number }) => channel.id);
	expect(remainingIds).not.toContain(channelIds[0]);
	expect(remainingIds).toContain(channelIds[1]);
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
	await page.goto(`${BROWSER}/channels/${channel.id}`);
	await expect(page).toHaveURL(new RegExp(`/channels/${channel.id}/articles/${article.id}$`));
	const content = page.getByRole("document", { name: "Article content" });
	await expect(content.getByRole("heading", { name: "今日进展" })).toBeVisible();
	await expect(content.locator("script, img[src^='data:'], img[src^='http:'], a[href^='javascript:']")).toHaveCount(0);
	expect(await page.evaluate(() => Reflect.get(window, "injected"))).toBeUndefined();
	const widthToggle = page.getByRole("button", { name: "Use full reading width", exact: true });
	for (const width of [390, 320]) {
		await page.setViewportSize({ width, height: 844 });
		await expectReaderChrome(page);
		await widthToggle.click();
		await expect(content).toHaveAttribute("data-full-width", "true");
		await expectReaderChrome(page);
		await widthToggle.click();
		await expect(content).toHaveAttribute("data-full-width", "false");
	}
	await page.setViewportSize({ width: 390, height: 844 });
	await expectReaderChrome(page);
	await page.screenshot({ path: "/tmp/xray-channels-mobile.png", fullPage: true });
	await page.mouse.move(0, 0);
	await content.focus();
	await widthToggle.focus();
	await expect(page.getByRole("tooltip", { name: "Use full width", exact: true })).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("tooltip")).toHaveCount(0);
	await expect(widthToggle).toBeFocused();
	await expect(content).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("button", { name: /中文阅读与安全排版/ })).toBeFocused();
	await page.getByRole("button", { name: /中文阅读与安全排版/ }).click();
	await page.getByRole("button", { name: "Back to reports", exact: true }).click();
	await expect(page.getByRole("button", { name: /中文阅读与安全排版/ })).toBeVisible();
	await expect(page.getByRole("button", { name: /中文阅读与安全排版/ })).toBeFocused();
});

test("global settings retains account and AI without push-token controls", async ({ page }) => {
	await page.goto(`${BROWSER}/settings`);
	await expect(page.locator("header[aria-labelledby]").getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "AI", exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Push tokens", exact: true })).toHaveCount(0);
	await expect(page.getByRole("button", { name: /^(New token|Create token|Revoke.*)$/ })).toHaveCount(0);
	await expect(page.getByLabel("Token name", { exact: true })).toHaveCount(0);
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
	await expect(content.getByRole("heading", { name: "Historical report 00", exact: true })).toBeVisible();
	await expect(content).toHaveAttribute("aria-busy", "false");
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

test("article actions edit inline, retain failed drafts and select the next report after deletion", async ({ page, request }) => {
	const created = await request.post(`${WORKER}/api/channels`, { headers: browserApiHeaders, data: { name: `Article edits ${Date.now()}` } });
	const channel = (await created.json()).data;
	const issued = await request.post(`${WORKER}/api/channels/${channel.id}/keys`, { headers: browserApiHeaders, data: { label: "Editing producer" } });
	const key = (await issued.json()).data;
	const ids: number[] = [];
	for (const date of ["2026-09-21", "2026-09-22"]) {
		const response = await request.post(`${INGEST}/api/v1/ingest/articles`, {
			headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${key.token}` },
			data: { external_id: date, title: `Original ${date}`, report_date: date, markdown: "## Original body" },
		});
		expect(response.status()).toBe(201);
		ids.push((await response.json()).id);
	}
	await page.goto(`${BROWSER}/channels/${channel.id}`);
	const content = page.getByRole("document", { name: "Article content" });
	const edit = page.locator(".channel-header").getByRole("button", { name: "Edit article", exact: true });
	const remove = page.locator(".channel-header").getByRole("button", { name: "Delete article", exact: true });
	await expect(page).toHaveURL(new RegExp(`/articles/${ids[1]}$`));
	await edit.click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await page.getByLabel("Article title", { exact: true }).fill("Unsaved title");
	await content.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(content.getByRole("heading", { name: "Original 2026-09-22", exact: true })).toBeVisible();
	await edit.click();
	await page.getByLabel("Article title", { exact: true }).fill("Edited 中文日报");
	await page.getByLabel("Markdown", { exact: true }).fill("## 修改后的内容\n\n**保存后的正文**");
	await page.getByLabel("Report date", { exact: true }).fill("2026-09-23");
	const target = `**/api/channels/${channel.id}/articles/${ids[1]}`;
	await page.route(target, async route => {
		if (route.request().method() === "PATCH") await route.fulfill({ status: 503, json: { error: "Try again" } });
		else await route.continue();
	});
	await content.getByRole("button", { name: "Save article", exact: true }).click();
	await expect(page.getByRole("alert")).toContainText("Worker unreachable");
	await expect(page.getByLabel("Article title", { exact: true })).toHaveValue("Edited 中文日报");
	await page.unroute(target);
	await content.getByRole("button", { name: "Save article", exact: true }).click();
	await expect(content.getByRole("heading", { name: "修改后的内容", exact: true })).toBeVisible();
	await expect(page.getByRole("region", { name: "Articles", exact: true }).getByRole("button").first()).toContainText("Edited 中文日报");
	await page.reload();
	await expect(content.getByRole("heading", { name: "Edited 中文日报", exact: true })).toBeVisible();
	await remove.click();
	const confirmation = page.getByRole("region", { name: "Confirm article deletion", exact: true });
	await expect(page.getByRole("alertdialog")).toHaveCount(0);
	await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(confirmation).toHaveCount(0);
	await expect(content.getByRole("heading", { name: "Edited 中文日报", exact: true })).toBeVisible();
	await remove.click();
	await confirmation.getByRole("button", { name: "Confirm delete", exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/articles/${ids[0]}$`));
	await expect(content.getByRole("heading", { name: "Original 2026-09-21", exact: true })).toBeVisible();
	await remove.click();
	await confirmation.getByRole("button", { name: "Confirm delete", exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/channels/${channel.id}$`));
	await expect(page.getByText("No reports for this date.", { exact: true })).toBeVisible();
	await expect(edit).toBeDisabled();
	await expect(remove).toBeDisabled();
	const channels = await request.get(`${WORKER}/api/channels`, { headers: browserApiHeaders });
	expect((await channels.json()).data.find((item: { id: number }) => item.id === channel.id).articleCount).toBe(0);
});

test("tags are managed in Settings and created inline for channels and tokens with stable colors", async ({ page, request }) => {
	const suffix = Date.now();
	const sharedTag = `研究 ${suffix}`;
	const renamedTag = `研发 ${suffix}`;
	const channelTag = `日报 ${suffix}`;
	const tokenTag = `自动化 ${suffix}`;
	await page.goto(`${BROWSER}/settings`);
	await page.getByRole("button", { name: "New tag", exact: true }).click();
	await page.getByLabel("New tag name", { exact: true }).fill(sharedTag);
	await page.getByRole("button", { name: "Create tag", exact: true }).click();
	await expect(page.getByLabel("New tag name", { exact: true })).toHaveValue("");
	const badge = (name: string) => page.locator("[data-tag-color]").filter({ hasText: name });
	const color = await badge(sharedTag).getAttribute("data-tag-color");
	expect(color).toMatch(/^(slate|blue|violet|teal|amber|rose)$/);
	await page.getByLabel("New tag name", { exact: true }).fill(sharedTag);
	await page.getByRole("button", { name: "Create tag", exact: true }).click();
	await expect(page.getByRole("alert")).toContainText("tag exists");

	const created = await request.post(`${WORKER}/api/channels`, { headers: browserApiHeaders, data: { name: `Tagged ${suffix}` } });
	const channel = (await created.json()).data;
	await page.goto(`${BROWSER}/channels/${channel.id}/settings`);
	await page.getByRole("button", { name: "Edit channel tags", exact: true }).click();
	await page.getByRole("checkbox", { name: sharedTag, exact: true }).click();
	await expect(page.getByRole("checkbox", { name: sharedTag, exact: true })).toBeChecked();
	await page.getByLabel("New tag for channel", { exact: true }).fill(channelTag);
	await page.getByRole("button", { name: "Create & assign", exact: true }).click();
	await expect(page.getByRole("checkbox", { name: channelTag, exact: true })).toBeChecked();
	await page.getByRole("button", { name: "Edit channel tags", exact: true }).click();
	await expect(badge(sharedTag)).toHaveAttribute("data-tag-color", color!);

	await page.getByLabel("Token name", { exact: true }).fill("Tagged producer");
	await page.getByRole("button", { name: "Create token", exact: true }).click();
	const token = await page.getByLabel("API key", { exact: true }).inputValue();
	await page.getByRole("button", { name: "Edit Tagged producer tags", exact: true }).click();
	await page.getByRole("checkbox", { name: sharedTag, exact: true }).click();
	await expect(page.getByRole("checkbox", { name: sharedTag, exact: true })).toBeChecked();
	await page.getByLabel("New tag for Tagged producer", { exact: true }).fill(tokenTag);
	await page.getByRole("button", { name: "Create & assign", exact: true }).click();
	await expect(page.getByRole("checkbox", { name: tokenTag, exact: true })).toBeChecked();
	await page.getByRole("button", { name: "Edit Tagged producer tags", exact: true }).click();
	await expect(page.getByLabel("API key", { exact: true })).toHaveValue(token);
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await page.reload();
	await expect(badge(sharedTag)).toHaveCount(2);
	for (const node of await badge(sharedTag).all()) await expect(node).toHaveAttribute("data-tag-color", color!);
	await expect(badge(channelTag)).toBeVisible();
	await expect(badge(tokenTag)).toBeVisible();
	await page.screenshot({ path: "/tmp/xray-tags-settings-desktop.png", fullPage: true });
	await page.setViewportSize({ width: 320, height: 844 });
	await page.getByRole("button", { name: "Edit Tagged producer tags", exact: true }).click();
	await expect.poll(() => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth)).toBe(true);
	await page.screenshot({ path: "/tmp/xray-tags-settings-mobile.png", fullPage: true });
	await page.setViewportSize({ width: 1440, height: 1000 });

	await page.goto(`${BROWSER}/settings`);
	await page.getByRole("button", { name: `Rename ${sharedTag}`, exact: true }).click();
	await page.getByRole("textbox", { name: `Rename ${sharedTag}`, exact: true }).fill(renamedTag);
	await page.getByRole("textbox", { name: `Rename ${sharedTag}`, exact: true }).locator("..").getByRole("button", { name: "Save", exact: true }).click();
	await expect(badge(renamedTag)).toBeVisible();
	const renamedColor = await badge(renamedTag).getAttribute("data-tag-color");
	await page.goto(`${BROWSER}/channels/${channel.id}/settings`);
	await expect(badge(renamedTag)).toHaveCount(2);
	for (const node of await badge(renamedTag).all()) await expect(node).toHaveAttribute("data-tag-color", renamedColor!);
	await expect(badge(sharedTag)).toHaveCount(0);
	await page.goto(`${BROWSER}/settings`);
	await page.getByRole("button", { name: `Delete ${renamedTag}`, exact: true }).click();
	const confirmation = page.getByRole("group", { name: `Confirm deleting ${renamedTag}`, exact: true });
	await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(confirmation).toHaveCount(0);
	await page.getByRole("button", { name: `Delete ${renamedTag}`, exact: true }).click();
	await confirmation.getByRole("button", { name: "Delete tag", exact: true }).click();
	await expect(badge(renamedTag)).toHaveCount(0);
	await page.goto(`${BROWSER}/channels/${channel.id}/settings`);
	await expect(badge(renamedTag)).toHaveCount(0);
	await expect(badge(channelTag)).toBeVisible();
	await expect(badge(tokenTag)).toBeVisible();
	await expect(page.getByRole("button", { name: "Revoke Tagged producer", exact: true })).toBeVisible();
	const submitted = await request.post(`${INGEST}/api/v1/ingest/articles`, {
		headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${token}` },
		data: { external_id: "tagged-report", title: "Tagged report", report_date: "2026-09-22", markdown: "# Tag assignment preserves the token" },
	});
	expect(submitted.status()).toBe(201);
	await page.goto(`${BROWSER}/channels/${channel.id}`);
	await expect(page.locator(".channel-header [data-tag-color]").filter({ hasText: channelTag })).toBeVisible();
	await expect(page.getByRole("document", { name: "Article content" }).getByRole("heading", { name: "Tagged report", exact: true })).toBeVisible();
});

test("leaving a pending article deletion does not pull navigation back to the reader", async ({ page, request }) => {
	const created = await request.post(`${WORKER}/api/channels`, { headers: browserApiHeaders, data: { name: `Pending delete ${Date.now()}` } });
	const channel = (await created.json()).data;
	const issued = await request.post(`${WORKER}/api/channels/${channel.id}/keys`, { headers: browserApiHeaders, data: { label: "Delete navigation producer" } });
	const key = (await issued.json()).data;
	const submitted = await request.post(`${INGEST}/api/v1/ingest/articles`, {
		headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${key.token}` },
		data: { external_id: "pending", title: "Pending deletion", report_date: "2026-09-22", markdown: "# Pending" },
	});
	const article = await submitted.json();
	await page.goto(`${BROWSER}/channels/${channel.id}`);
	await expect(page.getByRole("document", { name: "Article content" }).getByRole("heading", { name: "Pending", exact: true })).toBeVisible();
	let release!: () => void;
	const pending = new Promise<void>(resolve => { release = resolve; });
	await page.route(`**/api/channels/${channel.id}/articles/${article.id}`, async route => {
		if (route.request().method() === "DELETE") await pending;
		await route.continue();
	});
	await page.getByRole("button", { name: "Delete article", exact: true }).click();
	const deleting = page.waitForRequest(req => req.method() === "DELETE");
	await page.getByRole("button", { name: "Confirm delete", exact: true }).click();
	await deleting;
	await page.getByRole("link", { name: "Manage channel", exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/channels/${channel.id}/settings$`));
	const refreshed = page.waitForResponse(res => res.url().endsWith("/api/channels") && res.ok());
	release();
	await refreshed;
	await expect.poll(async () => {
		const result = await request.get(`${WORKER}/api/channels/${channel.id}/articles/${article.id}`, { headers: browserApiHeaders });
		return result.status();
	}).toBe(404);
	await expect(page).toHaveURL(new RegExp(`/channels/${channel.id}/settings$`));
	await expect(page.getByLabel("Channel name", { exact: true })).toBeVisible();
});
