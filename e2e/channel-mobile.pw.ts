import { expect, test } from "@playwright/test";
import { BROWSER, browserApiHeaders, INGEST, WORKER } from "./helpers";

test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

test.beforeAll(() => {
	for (const address of [BROWSER, WORKER, INGEST]) {
		const url = new URL(address);
		if (!["127.0.0.1", "localhost"].includes(url.hostname) || ["7007", "37007"].includes(url.port)) {
			throw new Error("Mobile L3 requires explicit isolated local servers");
		}
	}
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
			await expect.poll(() => page.locator(".channel-header").evaluate(node => node.clientHeight)).toBeLessThanOrEqual(100);
			await expect(page.getByRole("button", { name: "Use full reading width", exact: true })).toBeHidden();
			for (const action of ["Back to reports", "Edit article", "Delete article", "Increase font size", "Related links"]) {
				await expect(page.getByRole("button", { name: action, exact: true })).toBeInViewport();
			}
			await expect(page.getByRole("link", { name: "Manage channel", exact: true })).toBeInViewport();
			await page.getByRole("button", { name: "Increase font size", exact: true }).tap();
			await content.evaluate(node => { node.scrollTop = node.scrollHeight; });
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
			await page.screenshot({ path: `/tmp/xray-mobile-${viewport.width}-after.png` });
			await page.getByRole("button", { name: "Open navigation menu", exact: true }).tap();
			await page.getByRole("dialog").getByRole("link", { name: "Channels", exact: true }).tap();
			await expect(page).toHaveURL(`${BROWSER}/channels`);
		} finally {
			await request.delete(`${WORKER}/api/channels/${channel.id}`, { headers: browserApiHeaders });
		}
	});
}
