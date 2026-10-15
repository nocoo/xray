import { expect, test } from "@playwright/test";
import { installExternalMedia } from "../fixtures/e2e";
import { BROWSER, WORKER, INGEST, browserApiHeaders, requireWorker } from "./helpers";

test.beforeEach(async ({ page }) => {
	await installExternalMedia(page);
});

test("global token management shares channel changes and separates producer permissions", async ({
	page,
	request,
}) => {
	await requireWorker(request);
	const suffix = Date.now();
	const channelName = `Token test ${suffix}`;
	const createdChannel = await request.post(`${WORKER}/api/channels`, {
		headers: browserApiHeaders,
		data: { name: channelName },
	});
	expect(createdChannel.ok()).toBeTruthy();
	const channel = (await createdChannel.json()).data;
	const watchName = `Watchlist ${suffix}`;
	const reportName = `Reports ${suffix}`;
	const tagName = `Token tag ${suffix}`;
	const tag = (
		await (
			await request.post(`${WORKER}/api/tags`, {
				headers: browserApiHeaders,
				data: { name: tagName },
			})
		).json()
	).data;
	let watchId: number | undefined;
	{
		await page.goto(`${BROWSER}/tokens`);
		await expect(page.locator('[data-nav-label="Tokens"]')).toHaveAttribute("aria-current", "page");
		await expect(page.getByRole("heading", { name: "Active credentials" })).toBeVisible();
		await page.getByRole("button", { name: "Create token", exact: true }).click();
		let dialog = page.getByRole("dialog");
		await dialog.getByLabel("Token name").fill(watchName);
		await dialog.getByRole("button", { name: "Create token", exact: true }).click();
		await expect(dialog.getByRole("heading", { name: "Token created" })).toBeVisible();
		const watchSecret = await dialog.getByLabel("API key").inputValue();
		expect(watchSecret).toMatch(/^xray_pt_/);
		await dialog.getByRole("button", { name: "Done", exact: true }).click();
		await expect(page.getByLabel("API key")).toHaveCount(0);
		const catalog = (
			await (await request.get(`${WORKER}/api/tokens`, { headers: browserApiHeaders })).json()
		).data;
		watchId = catalog.find((token: { label: string }) => token.label === watchName).id;
		expect(JSON.stringify(catalog)).not.toContain(watchSecret);
		const graph = await request.get(`${INGEST}/api/v1/ingest/graph`, {
			headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${watchSecret}` },
		});
		expect(graph.ok()).toBeTruthy();
		const forbiddenReport = await request.post(`${INGEST}/api/v1/ingest/articles`, {
			headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${watchSecret}` },
			data: {},
		});
		expect(forbiddenReport.status()).toBe(403);
		await page.getByRole("button", { name: `Rename ${watchName}`, exact: true }).click();
		dialog = page.getByRole("dialog");
		await dialog.getByLabel("Token name").fill(`${watchName} renamed`);
		await dialog.getByRole("button", { name: "Save name" }).click();
		await expect(
			page.getByRole("button", { name: `Rename ${watchName} renamed`, exact: true }),
		).toBeFocused();

		await page.getByRole("button", { name: "Create token", exact: true }).click();
		dialog = page.getByRole("dialog");
		await dialog.getByLabel("Token name").fill(reportName);
		await dialog.getByLabel("Token type", { exact: true }).click();
		await page.getByRole("option", { name: "Channel publishing" }).click();
		await expect(dialog.getByRole("button", { name: "Create token", exact: true })).toBeDisabled();
		await dialog.getByLabel("Channel", { exact: true }).click();
		await page.getByRole("option", { name: channelName, exact: true }).click();
		await dialog.getByRole("button", { name: "Create token", exact: true }).click();
		await expect(dialog.getByRole("heading", { name: "Token created" })).toBeVisible();
		const reportSecret = await dialog.getByLabel("API key").inputValue();
		await dialog.getByRole("button", { name: "Done", exact: true }).click();
		const reportHeaders = {
			host: "xray-ingest.worker.hexly.ai",
			authorization: `Bearer ${reportSecret}`,
		};
		expect(
			(await request.get(`${INGEST}/api/v1/ingest/graph`, { headers: reportHeaders })).status(),
		).toBe(403);
		const report = await request.post(`${INGEST}/api/v1/ingest/articles`, {
			headers: reportHeaders,
			data: {
				external_id: `report-${suffix}`,
				title: "Permission test",
				report_date: "2026-10-14",
				markdown: "A report created by a channel token.",
			},
		});
		expect(report.status()).toBe(201);
		const reportData = await report.json();
		await page.getByRole("button", { name: `Rename ${reportName}`, exact: true }).click();
		dialog = page.getByRole("dialog");
		await dialog.getByLabel("Token name").fill(`${reportName} global`);
		await dialog.getByRole("button", { name: "Save name" }).click();
		await expect(
			page.getByRole("button", { name: `Rename ${reportName} global`, exact: true }),
		).toBeVisible();
		await page.goto(`${BROWSER}/channels/${channel.id}/settings`);
		await expect(
			page.getByRole("button", { name: `Rename ${reportName} global`, exact: true }),
		).toBeVisible();
		await page.getByRole("button", { name: `Rename ${reportName} global`, exact: true }).click();
		dialog = page.getByRole("dialog");
		await dialog.getByLabel("Token name").fill(`${reportName} channel`);
		await dialog.getByRole("button", { name: "Save name" }).click();
		await expect(
			page.getByRole("button", { name: `Rename ${reportName} channel`, exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: `Rename ${reportName} channel`, exact: true }),
		).toBeFocused();
		await page.goto(`${BROWSER}/tokens`);
		await page.getByRole("button", { name: `Rename ${reportName} channel`, exact: true }).click();
		await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
		await expect(
			page.getByRole("button", { name: `Rename ${reportName} channel`, exact: true }),
		).toBeFocused();
		await page.getByRole("button", { name: `Rename ${reportName} channel`, exact: true }).click();
		await page.keyboard.press("Escape");
		await expect(
			page.getByRole("button", { name: `Rename ${reportName} channel`, exact: true }),
		).toBeFocused();
		await page.getByRole("textbox", { name: "Search tokens" }).fill(channelName);
		await expect(
			page.getByRole("button", { name: `Rename ${reportName} channel`, exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: `Rename ${watchName} renamed`, exact: true }),
		).toHaveCount(0);
		await page.getByRole("button", { name: `Edit ${reportName} channel tags` }).click();
		await expect(page.getByRole("checkbox", { name: tagName, exact: true })).toBeVisible();
		await page.getByRole("checkbox", { name: tagName, exact: true }).click();
		await expect(page.getByRole("checkbox", { name: tagName, exact: true })).toBeChecked();
		await page.getByRole("button", { name: "Close tag picker" }).click();
		await page.goto(`${BROWSER}/channels/${channel.id}/settings`);
		await expect(
			page.getByRole("table", { name: "Push tokens" }).getByText(tagName, { exact: true }),
		).toBeVisible();
		const oldReport = (
			await (
				await request.get(`${WORKER}/api/channels/${channel.id}/articles/${reportData.id}`, {
					headers: browserApiHeaders,
				})
			).json()
		).data;
		expect(oldReport.sourceLabel).toBe(reportName);
		await page.goto(`${BROWSER}/tokens`);
		await page.getByRole("button", { name: `Revoke ${reportName} channel`, exact: true }).click();
		await page
			.getByRole("alertdialog")
			.getByRole("button", { name: "Cancel", exact: true })
			.click();
		await expect(
			page.getByRole("button", { name: `Revoke ${reportName} channel`, exact: true }),
		).toBeFocused();
		await page.getByRole("button", { name: `Revoke ${reportName} channel`, exact: true }).click();
		await page
			.getByRole("alertdialog")
			.getByRole("button", { name: "Revoke", exact: true })
			.click();
		await expect(
			page.getByRole("button", { name: `Revoke ${reportName} channel`, exact: true }),
		).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Create token", exact: true })).toBeFocused();
		expect(
			(
				await request.post(`${INGEST}/api/v1/ingest/articles`, { headers: reportHeaders, data: {} })
			).status(),
		).toBe(401);
		await page.getByRole("button", { name: `Revoke ${watchName} renamed`, exact: true }).click();
		await page
			.getByRole("alertdialog")
			.getByRole("button", { name: "Revoke", exact: true })
			.click();
		await expect(
			page.getByRole("button", { name: `Revoke ${watchName} renamed`, exact: true }),
		).toHaveCount(0);
		expect(
			(
				await request.get(`${INGEST}/api/v1/ingest/graph`, {
					headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${watchSecret}` },
				})
			).status(),
		).toBe(401);
	}
	{
		await request.delete(`${WORKER}/api/channels/${channel.id}`, { headers: browserApiHeaders });
		if (watchId)
			await request.delete(`${WORKER}/api/push-tokens/${watchId}`, { headers: browserApiHeaders });
		await request.delete(`${WORKER}/api/tags/${tag.id}`, { headers: browserApiHeaders });
	}
});

test("tokens remain usable on narrow screens with empty filters, dialogs and retry", async ({
	page,
	request,
}) => {
	const suffix = crypto.randomUUID();
	const fixtureName = `Mobile fixture ${suffix}`;
	const renamedName = `Renamed mobile ${suffix}`;
	const fixture = (
		await (
			await request.post(`${WORKER}/api/push-tokens`, {
				headers: browserApiHeaders,
				data: { label: fixtureName },
			})
		).json()
	).data;
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`${BROWSER}/tokens`);
	await expect(page.getByRole("heading", { name: "Active credentials" })).toBeVisible();
	await page.getByRole("textbox", { name: "Search tokens" }).fill("no-token-matches-this-search");
	await expect(page.getByText("No matching tokens", { exact: true })).toBeVisible();
	await page.getByRole("textbox", { name: "Search tokens" }).clear();
	await page.getByRole("combobox", { name: "Filter token type" }).click();
	await page.getByRole("option", { name: "Watchlist", exact: true }).click();
	await page.getByRole("button", { name: "Create token", exact: true }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("button", { name: "Create token", exact: true })).toBeDisabled();
	await dialog.getByLabel("Token name").fill("Cancelled token");
	await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(page.getByRole("button", { name: "Create token", exact: true })).toBeFocused();
	await page.getByRole("textbox", { name: "Search tokens" }).fill(fixtureName);
	await page.getByRole("button", { name: `Rename ${fixtureName}`, exact: true }).click();
	await page.getByRole("dialog").getByLabel("Token name").fill(renamedName);
	await page.getByRole("dialog").getByRole("button", { name: "Save name" }).click();
	await expect(page.getByText("No matching tokens", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Create token", exact: true })).toBeFocused();
	await page.getByRole("textbox", { name: "Search tokens" }).clear();
	await expect(
		page.getByRole("button", { name: `Rename ${renamedName}`, exact: true }),
	).toBeVisible();
	for (const width of [320, 390, 1440]) {
		await page.setViewportSize({ width, height: 900 });
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
		).toBeTruthy();
	}
	for (const theme of ["light", "dark"]) {
		for (let step = 0; step < 3; step++) {
			if (
				await page.getByRole("button", { name: `Toggle theme (now ${theme})`, exact: true }).count()
			)
				break;
			await page.getByRole("button", { name: /Toggle theme/ }).click();
		}
		await expect(page.locator("html")).toHaveClass(new RegExp(theme));
		const stats = page.getByRole("img", { name: /^(Active tokens|Watchlist|Channel) \d/ });
		await expect(stats).toHaveCount(3);
		await expect
			.poll(() =>
				stats.evaluateAll((cards) =>
					cards.every((card) => {
						const probe = document.createElement("span");
						probe.style.backgroundColor = "hsl(var(--basalt-bright))";
						card.append(probe);
						const expected = getComputedStyle(probe).backgroundColor;
						probe.remove();
						return getComputedStyle(card).backgroundColor === expected;
					}),
				),
			)
			.toBe(true);
	}
	await page.route("**/api/tokens", (route) =>
		route.fulfill({ status: 503, body: '{"error":"Offline"}', contentType: "application/json" }),
	);
	await page.getByRole("button", { name: "Refresh", exact: true }).click();
	await expect(page.getByRole("alert")).toContainText("Worker unreachable");
	await page.unroute("**/api/tokens");
	await page.getByRole("button", { name: "Refresh", exact: true }).click();
	await expect(page.getByRole("alert")).toHaveCount(0);
	await request.delete(`${WORKER}/api/push-tokens/${fixture.id}`, { headers: browserApiHeaders });
});

test("token table uses aligned columns and container-aware details", async ({ page, request }) => {
	const suffix = crypto.randomUUID();
	const channel = (await (await request.post(`${WORKER}/api/channels`, {
		headers: browserApiHeaders, data: { name: `Layout ${suffix}` },
	})).json()).data;
	const channelLabel = `Publisher ${suffix}`;
	const watchLabel = `Collector ${suffix}`;
	await request.post(`${WORKER}/api/channels/${channel.id}/keys`, {
		headers: browserApiHeaders, data: { label: channelLabel },
	});
	const watch = (await (await request.post(`${WORKER}/api/push-tokens`, {
		headers: browserApiHeaders, data: { label: watchLabel },
	})).json()).data;
	try {
		await page.goto(`${BROWSER}/tokens`);
		await page.getByRole("textbox", { name: "Search tokens" }).fill(suffix);
		const table = page.getByRole("table", { name: "Active tokens", exact: true });
		await expect(table.locator("tbody tr")).toHaveCount(2);
		for (const width of [1440, 1024, 768, 390, 320]) {
			await page.setViewportSize({ width, height: 1000 });
			await expect.poll(() => table.evaluate(node => node.parentElement!.scrollWidth <= node.parentElement!.clientWidth)).toBe(true);
			await expect.poll(() => table.locator("tbody td:first-child").evaluateAll(cells => cells.every(cell => cell.getBoundingClientRect().width >= 140))).toBe(true);
			const row = table.getByRole("row").filter({ hasText: channelLabel });
			for (const action of ["Rename", "Revoke"]) {
				const button = row.getByRole("button", { name: `${action} ${channelLabel}`, exact: true });
				await expect(button).toBeInViewport();
				const bounds = await button.boundingBox();
				if (width < 640) {
					expect(bounds!.width).toBeGreaterThanOrEqual(44);
					expect(bounds!.height).toBeGreaterThanOrEqual(44);
				}
			}
			if (width === 1440) {
				await expect(table.getByRole("columnheader")).toHaveText(["Token", "Access", "Tags", "Last used", "Actions"]);
				await expect(table.getByRole("columnheader", { name: "Tags", exact: true })).toBeVisible();
				const heights = await table.locator("tbody tr").evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
				expect(heights[0]).toBe(heights[1]);
				expect(heights[0]).toBeLessThanOrEqual(90);
			} else {
				const details = row.getByRole("button", { name: `Details for ${channelLabel}`, exact: true });
				await details.click();
				await expect(details).toHaveAttribute("aria-expanded", "true");
				await expect(row.getByRole("button", { name: `Edit ${channelLabel} tags`, exact: true })).toBeVisible();
				await expect(row.getByText("Never used", { exact: true }).filter({ visible: true })).toBeVisible();
				await details.click();
				await expect(details).toHaveAttribute("aria-expanded", "false");
			}
			const search = await page.getByRole("textbox", { name: "Search tokens" }).boundingBox();
			expect(search!.width).toBeGreaterThan(180);
		}
	} finally {
		await request.delete(`${WORKER}/api/channels/${channel.id}`, { headers: browserApiHeaders });
		await request.delete(`${WORKER}/api/push-tokens/${watch.id}`, { headers: browserApiHeaders });
	}
});
