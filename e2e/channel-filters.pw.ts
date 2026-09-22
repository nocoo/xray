import { expect, type APIRequestContext, type Locator, type Page, test } from "@playwright/test";
import { BROWSER, browserApiHeaders, INGEST, WORKER } from "./helpers";

test.beforeAll(() => {
	for (const url of [BROWSER, WORKER, INGEST]) {
		const parsed = new URL(url);
		if (
			!["127.0.0.1", "localhost"].includes(parsed.hostname) ||
			["7007", "37007"].includes(parsed.port)
		) {
			throw new Error("Channel filters L3 requires explicit, isolated loopback test servers");
		}
	}
});

async function seed(request: APIRequestContext) {
	const prefix = `Filters ${crypto.randomUUID()}`;
	const now = new Date();
	const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
	const response = await request.post(`${WORKER}/api/channels`, {
		headers: browserApiHeaders,
		data: { name: prefix },
	});
	expect(response.status()).toBe(201);
	const channelId: number = (await response.json()).data.id;
	const tags: { id: number; name: string }[] = [];
	for (const label of ["Channel", "Alpha", "Beta"]) {
		const r = await request.post(`${WORKER}/api/tags`, {
			headers: browserApiHeaders,
			data: { name: `${prefix} ${label}` },
		});
		expect(r.status()).toBe(201);
		tags.push((await r.json()).data);
	}
	const keys: { id: number; token: string }[] = [];
	for (const label of ["Alpha source", "Beta source", "Untagged source"]) {
		const r = await request.post(`${WORKER}/api/channels/${channelId}/keys`, {
			headers: browserApiHeaders,
			data: { label },
		});
		expect(r.status()).toBe(201);
		keys.push((await r.json()).data);
	}
	const assign = async (path: string, tagIds: number[]) => {
		expect(
			(
				await request.put(`${WORKER}${path}`, { headers: browserApiHeaders, data: { tagIds } })
			).status(),
		).toBe(200);
	};
	await assign(`/api/channels/${channelId}/tags`, [tags[0].id]);
	await assign(`/api/channels/${channelId}/keys/${keys[0].id}/tags`, [tags[0].id, tags[1].id]);
	await assign(`/api/channels/${channelId}/keys/${keys[1].id}/tags`, [tags[2].id]);
	const reports: { id: number; title: string }[] = [];
	const add = async (
		title: string,
		date: string,
		key: number,
		summary = "",
		markdown = "cohort report",
	) => {
		const r = await request.post(`${INGEST}/api/v1/ingest/articles`, {
			headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${keys[key].token}` },
			data: { external_id: crypto.randomUUID(), title, report_date: date, summary, markdown },
		});
		expect(r.status()).toBe(201);
		reports.push({ id: (await r.json()).id, title });
	};
	await add("Title needle cohort", `${month}-10`, 0);
	await add("Summary target", `${month}-10`, 1, "Summary needle cohort");
	await add("Body target", `${month}-10`, 0, "", "Body needle cohort 中文");
	for (let i = 0; i < 34; i++)
		await add(
			`Cohort report ${String(i).padStart(2, "0")}`,
			`${month}-${i === 33 ? "12" : "11"}`,
			i % 2,
		);
	await add("Outside date cohort", `${month}-13`, 0);
	await add("Wrong tag cohort", `${month}-11`, 2);
	await add("Wrong keyword", `${month}-11`, 0, "", "Unrelated content");
	expect(
		(
			await request.delete(`${WORKER}/api/channels/${channelId}/keys/${keys[0].id}`, {
				headers: browserApiHeaders,
			})
		).status(),
	).toBe(200);
	return {
		channelId,
		tags,
		month,
		reports,
		cleanup: async () => {
			expect(
				(
					await request.delete(`${WORKER}/api/channels/${channelId}`, {
						headers: browserApiHeaders,
					})
				).status(),
			).toBe(200);
			for (const tag of tags)
				expect(
					(
						await request.delete(`${WORKER}/api/tags/${tag.id}`, { headers: browserApiHeaders })
					).status(),
				).toBe(200);
		},
	};
}

async function search(page: Page, query: string) {
	await page.getByRole("textbox", { name: "Search reports", exact: true }).fill(query);
	await page.getByRole("button", { name: "Apply keyword search", exact: true }).click();
	await expect(page).toHaveURL((url) => url.searchParams.get("q") === query);
}

async function filters(page: Page) {
	await page.getByRole("button", { name: /^Filter reports/ }).click();
	const dialog = page.getByRole("dialog", { name: "Filter reports", exact: true });
	await expect(dialog).toBeVisible();
	return dialog;
}

async function fits(page: Page, overlay: Locator) {
	await expect(overlay).toBeVisible();
	await expect
		.poll(() =>
			overlay.evaluate((node) => {
				const r = node.getBoundingClientRect();
				return {
					left: r.left >= 0,
					right: r.right <= innerWidth,
					top: r.top >= 0,
					bottom: r.bottom <= innerHeight,
					content: node.scrollWidth <= node.clientWidth,
					bounds: `${r.x},${r.y} ${r.width}x${r.height}; scroll ${node.scrollWidth}/${node.clientWidth}`,
				};
			}),
		)
		.toMatchObject({ left: true, right: true, top: true, bottom: true, content: true });
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth,
			),
		)
		.toBe(true);
}

test("server filters find unloaded reports and preserve combined filters through reader history", async ({
	page,
	request,
}) => {
	test.setTimeout(120_000);
	page.setDefaultTimeout(15_000);
	const data = await seed(request);
	try {
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto(`${BROWSER}/channels/${data.channelId}`);
		const list = page.getByRole("region", { name: "Articles", exact: true });
		await expect(list.locator(".channel-list-item")).toHaveCount(30);
		await expect(list.getByRole("button", { name: /Title needle/ })).toHaveCount(0);
		for (const [query, title] of [
			["title needle", "Title needle cohort"],
			["summary needle", "Summary target"],
			["body needle", "Body target"],
		]) {
			await search(page, query);
			await expect(list.locator(".channel-list-item")).toHaveCount(1);
			await expect(
				page.locator(".channel-prose > header").getByRole("heading", { name: title, exact: true }),
			).toBeVisible();
		}
		await search(page, "cohort");
		const dialog = await filters(page);
		await dialog.getByRole("button", { name: /^Report date range(?::|$)/ }).click();
		await page.getByRole("button", { name: `${data.month}-10`, exact: true }).click();
		await page.getByRole("button", { name: `${data.month}-12`, exact: true }).click();
		await dialog.getByRole("checkbox", { name: data.tags[1].name, exact: true }).check();
		await dialog.getByRole("checkbox", { name: data.tags[2].name, exact: true }).check();
		await dialog.getByRole("button", { name: "Apply filters", exact: true }).click();
		const assertQuery = async () => {
			await expect(page).toHaveURL(
				(url) =>
					url.searchParams.get("date_from") === `${data.month}-10` &&
					url.searchParams.get("date_to") === `${data.month}-12` &&
					url.searchParams.get("q") === "cohort" &&
					url.searchParams.get("tag_ids") ===
						data.tags
							.slice(1)
							.map((t) => t.id)
							.sort((a, b) => a - b)
							.join(","),
			);
		};
		await assertQuery();
		await expect(list.locator(".channel-list-item")).toHaveCount(30);
		const nextResponse = page.waitForResponse((r) => {
			const url = new URL(r.url());
			return (
				url.pathname === `/api/channels/${data.channelId}/articles` &&
				url.searchParams.has("before")
			);
		});
		await list.getByRole("button", { name: "Load more", exact: true }).click();
		const next = await nextResponse;
		expect(next.status()).toBe(200);
		expect(new URL(next.url()).searchParams.get("tag_ids")).toBe(
			data.tags
				.slice(1)
				.map((t) => t.id)
				.join(","),
		);
		expect(new URL(next.url()).searchParams.get("date_to")).toBe(`${data.month}-12`);
		expect(new URL(next.url()).searchParams.get("q")).toBe("cohort");
		await expect(list.locator(".channel-list-item")).toHaveCount(37);
		await expect(list.getByRole("button", { name: "Load more", exact: true })).toHaveCount(0);
		for (const title of ["Outside date cohort", "Wrong tag cohort", "Wrong keyword"])
			await expect(list.getByRole("button", { name: new RegExp(title) })).toHaveCount(0);
		await list.getByRole("button", { name: /Title needle cohort/ }).click();
		await assertQuery();
		const selected = page.url();
		await list.getByRole("button", { name: /Summary target/ }).click();
		await assertQuery();
		await page.goBack();
		await expect(page).toHaveURL(selected);
		await page.reload();
		await expect(page).toHaveURL(selected);
		await expect(list.locator(".channel-list-item")).toHaveCount(37);
		const articleHeader = page.locator(".channel-prose > header");
		for (const tag of data.tags.slice(0, 2)) {
			await expect(articleHeader.getByText(tag.name, { exact: true })).toHaveCount(1);
			await expect(
				page.locator(".channel-header").getByText(tag.name, { exact: true }),
			).toHaveCount(0);
			await expect(list.getByText(tag.name, { exact: true })).toHaveCount(0);
		}
		await page.getByRole("button", { name: "Edit article", exact: true }).click();
		const editor = page.getByRole("dialog", { name: "Edit article", exact: true });
		await editor.getByLabel("Article title", { exact: true }).fill("Removed from results");
		await editor.getByLabel("Markdown", { exact: true }).fill("Unrelated revised content");
		await editor.getByRole("button", { name: "Save article", exact: true }).click();
		await expect(editor).toHaveCount(0);
		await expect(page).toHaveURL(
			(url) => url.pathname === `/channels/${data.channelId}/articles/${data.reports[36].id}`,
		);
		await assertQuery();
		await expect(list.locator(".channel-list-item")).toHaveCount(36);
		await expect(list.getByRole("button", { name: /Removed from results/ })).toHaveCount(0);
		await expect(
			articleHeader.getByRole("heading", { name: "Cohort report 33", exact: true }),
		).toBeVisible();
		await search(page, "missing phrase xyz");
		await expect(list.getByText("No matching reports", { exact: true })).toBeVisible();
		await expect(list.getByRole("status").locator("svg")).toBeVisible();
		await expect(page.getByRole("document", { name: "Article content" }).getByText("No matching reports", { exact: true })).toBeVisible();
		await page.getByRole("button", { name: "Clear filters", exact: true }).click();
		await expect(page).toHaveURL(
			(url) =>
				url.search === "" &&
				url.pathname === `/channels/${data.channelId}/articles/${data.reports[37].id}`,
		);
		await expect(list.locator(".channel-list-item")).toHaveCount(30);
	} finally {
		await data.cleanup();
	}
});

test("320px filter and calendar overlays fit and text input isolates reader shortcuts", async ({
	page,
	request,
}) => {
	test.setTimeout(120_000);
	page.setDefaultTimeout(15_000);
	const data = await seed(request);
	try {
		await page.setViewportSize({ width: 320, height: 800 });
		await page.goto(`${BROWSER}/channels/${data.channelId}`);
		await page.getByRole("button", { name: "Back to reports", exact: true }).click();
		await expect(page.locator('.channel-list-item[aria-current="true"]')).toBeFocused();
		const selected = page.url();
		const input = page.getByRole("textbox", { name: "Search reports", exact: true });
		await input.focus();
		await page.keyboard.type("jk");
		await expect(input).toHaveValue("jk");
		await expect(page).toHaveURL(selected);
		await input.dispatchEvent("compositionstart", { data: "中" });
		await input.dispatchEvent("keydown", {
			key: "j",
			code: "KeyJ",
			isComposing: true,
			bubbles: true,
		});
		await input.dispatchEvent("keydown", {
			key: "k",
			code: "KeyK",
			isComposing: true,
			bubbles: true,
		});
		await input.dispatchEvent("compositionend", { data: "中文" });
		await expect(page).toHaveURL(selected);
		await input.fill("");
		const dialog = await filters(page);
		await fits(page, dialog);
		const tagInput = dialog.getByRole("textbox", { name: "Find filter tags", exact: true });
		await tagInput.fill("jk");
		await tagInput.press("j");
		await tagInput.press("k");
		await expect(page).toHaveURL(selected);
		await tagInput.fill("");
		await dialog.getByRole("button", { name: /^Report date range(?::|$)/ }).click();
		const calendar = page.getByRole("dialog", { name: "Report date range calendar", exact: true });
		await fits(page, calendar);
		await calendar.getByRole("button", { name: `${data.month}-10`, exact: true }).click();
		await calendar.getByRole("button", { name: `${data.month}-12`, exact: true }).click();
		await expect(calendar).toHaveCount(0);
		await fits(page, dialog);
		await dialog.getByRole("button", { name: "Apply filters", exact: true }).click();
		await expect(page).toHaveURL(
			(url) =>
				url.searchParams.get("date_from") === `${data.month}-10` &&
				url.searchParams.get("date_to") === `${data.month}-12`,
		);
		await expect(page).toHaveURL((url) => /\/articles\/\d+$/.test(url.pathname));
		await expect(page.getByRole("region", { name: "Articles", exact: true })).toBeVisible();
		await expect(input).toBeVisible();
		const filterTrigger = page.getByRole("button", { name: /^Filter reports/ });
		await expect(filterTrigger).toBeFocused();
		await input.fill("cohort");
		await input.press("Enter");
		await expect(page).toHaveURL(
			(url) => url.searchParams.get("q") === "cohort" && /\/articles\/\d+$/.test(url.pathname),
		);
		await expect(page.getByRole("region", { name: "Articles", exact: true })).toBeVisible();
		await expect(input).toBeVisible();
		await expect(input).toBeFocused();
	} finally {
		await data.cleanup();
	}
});
