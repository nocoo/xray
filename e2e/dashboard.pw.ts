import { expect, type Page, test } from "@playwright/test";
import { installExternalMedia } from "../fixtures/e2e";
import { canonicalArticle, canonicalPost, FIXTURE_ANCHOR_MS } from "../fixtures/primitives";
import type { DashboardAggregates } from "../packages/shared/src/dashboard";
import { startLocalServer } from "../packages/ui/dev/local-server";

const chartName = "Daily content by watchlists and channels";

async function expectFits(page: Page) {
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth,
			),
		)
		.toBe(true);
	const chart = page.getByRole("group", { name: chartName, exact: true });
	await expect(chart).toBeVisible();
	await expect
		.poll(() =>
			chart.locator(".recharts-surface").evaluate((node) => {
				const rect = node.getBoundingClientRect();
				return rect.width > 100 && rect.height > 100 && rect.left >= 0 && rect.right <= innerWidth;
			}),
		)
		.toBe(true);
}

test("dashboard counts real channel and watchlist submissions equally, including retries and tenant isolation", async ({
	page,
	request,
}) => {
	const app = await startLocalServer({ mode: "e2e", automated: true, port: 0, built: true });
	try {
		const runtime = app.runtime;
		if (!runtime) throw new Error("Missing owned runtime");
		const headers = { origin: app.url, "Cf-Access-Jwt-Assertion": runtime.jwtA };
		const read = async () => {
			const response = await request.get(`${runtime.url}/api/dashboard`, { headers });
			expect(response.status()).toBe(200);
			return (await response.json()).data as DashboardAggregates;
		};
		await installExternalMedia(page);
		await page.goto(app.url);
		await expect(
			page.getByText("No content added in the last 14 days.", { exact: false }),
		).toBeVisible();
		expect(await read()).toMatchObject({
			contentCount: 0,
			content24h: 0,
			channelCount: 0,
			watchlistCount: 0,
		});

		const channel = await request.post(`${runtime.url}/api/channels`, {
			headers,
			data: { name: "Dashboard reports" },
		});
		expect(channel.status()).toBe(201);
		const channelId = (await channel.json()).data.id;
		const issued = await request.post(`${runtime.url}/api/channels/${channelId}/keys`, {
			headers,
			data: { label: "Dashboard reporter" },
		});
		expect(issued.status()).toBe(201);
		const reportToken = (await issued.json()).data.token;
		const article = {
			external_id: "dashboard-report",
			title: "Previously published report",
			report_date: "2000-01-01",
			markdown: "# Dashboard report",
		};
		const reportHeaders = {
			host: "xray-ingest.worker.hexly.ai",
			authorization: `Bearer ${reportToken}`,
		};
		expect(
			(
				await request.post(`${runtime.url}/api/v1/ingest/articles`, {
					headers: reportHeaders,
					data: article,
				})
			).status(),
		).toBe(201);
		expect(
			(
				await request.post(`${runtime.url}/api/v1/ingest/articles`, {
					headers: reportHeaders,
					data: article,
				})
			).status(),
		).toBe(200);
		// Arrange receipt time against the launcher's fixed presentation clock after real ingestion.
		await runtime.sql(`UPDATE channel_articles SET created_at_ms = ${FIXTURE_ANCHOR_MS}`);
		expect(await read()).toMatchObject({
			contentCount: 1,
			content24h: 1,
			channelCount: 1,
			watchlistCount: 0,
		});
		await page.reload();
		await expect(
			page.getByText("1 added · Watchlists 0 · Channels 1", { exact: true }),
		).toBeVisible();

		const watchlist = await request.post(`${runtime.url}/api/watchlists`, {
			headers,
			data: { name: "Dashboard watchlist" },
		});
		expect(watchlist.status()).toBe(201);
		const watchlistId = (await watchlist.json()).data.id;
		const token = await request.post(`${runtime.url}/api/push-tokens`, {
			headers,
			data: { label: "Dashboard collector" },
		});
		expect(token.status()).toBe(201);
		const pushToken = (await token.json()).data.token;
		const items = [canonicalPost("dashboard-post"), canonicalArticle("dashboard-note")].map(
			(item) => ({ ...item, created_at: new Date().toISOString() }),
		);
		const push = () =>
			request.post(`${runtime.url}/api/v1/ingest/push`, {
				headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${pushToken}` },
				data: { watchlist_id: watchlistId, items },
			});
		expect(await (await push()).json()).toMatchObject({ accepted: 2, deduped: 0 });
		expect(await (await push()).json()).toMatchObject({ accepted: 0, deduped: 2 });
		await runtime.sql(`UPDATE items SET ingested_at_ms = ${FIXTURE_ANCHOR_MS}`);
		const result = await read();
		expect(result).toMatchObject({
			contentCount: 3,
			content24h: 3,
			channelCount: 1,
			watchlistCount: 1,
		});
		expect(result.contentTrend.at(-1)).toEqual({
			date: "2026-09-27",
			watchlists: 2,
			channels: 1,
			channelReports: [{ id: channelId, name: "Dashboard reports", count: 1 }],
		});
		expect(
			result.contentTrend
				.slice(0, -1)
				.every((point) => point.watchlists === 0 && point.channels === 0),
		).toBe(true);
		const other = await request.get(`${runtime.url}/api/dashboard`, {
			headers: { "Cf-Access-Jwt-Assertion": runtime.jwtB },
		});
		const otherData = (await other.json()).data as DashboardAggregates;
		expect(otherData).toMatchObject({
			contentCount: 0,
			content24h: 0,
			watchlistCount: 0,
			channelCount: 0,
		});
		expect(otherData.contentTrend.flatMap((point) => point.channelReports)).toEqual([]);
		expect((await runtime.sql("SELECT COUNT(*) AS c FROM items"))[0]?.results).toEqual([{ c: 2 }]);
		expect((await runtime.sql("SELECT COUNT(*) AS c FROM channel_articles"))[0]?.results).toEqual([
			{ c: 1 },
		]);

		await page.reload();
		await expect(page.getByRole("img", { name: /^Total content 3 / })).toBeVisible();
		await expect(page.getByRole("img", { name: /^Added \(24h\) 3 / })).toBeVisible();
		const log = result.recentIngestLogs[0];
		expect(log).toBeDefined();
		const logTime = page.locator(`time[datetime="${new Date(log.createdAtMs).toISOString()}"]`).first();
		await expect(logTime).toContainText("just now");
		await expect(
			page.getByText("3 added · Watchlists 2 · Channels 1", { exact: true }),
		).toBeVisible();
		const chart = page.getByRole("group", { name: chartName, exact: true });
		await expect(chart.locator(".recharts-line-curve")).toHaveCount(1);
		await chart.locator(".recharts-line-dot").last().hover();
		const tooltip = chart.getByTestId("chart-tooltip");
		await expect(tooltip).toContainText("2026-09-27");
		await expect(tooltip).toContainText("Watchlists");
		await expect(tooltip).toContainText("Dashboard reports");
		await expect(tooltip).toContainText("Total");
		await chart.locator("summary").click();
		await expect(chart.getByRole("row")).toHaveCount(15);
		const cells = chart.getByRole("row").last().getByRole("cell");
		await expect(cells.nth(0)).toHaveText("2026-09-27");
		await expect(cells.nth(1)).toHaveText("2");
		await expect(cells.nth(2).getByRole("list", { name: "Channel breakdown" })).toHaveText("Dashboard reports: 1");
		await expect(cells.nth(3)).toHaveText("3");
		await page.setViewportSize({ width: 320, height: 844 });
		await expectFits(page);
		await chart.locator("summary").click();
		await page.screenshot({
			path: test.info().outputPath("dashboard-mobile320.png"),
			fullPage: true,
		});
	} finally {
		await app.close();
	}
});
