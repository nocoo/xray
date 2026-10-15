import { expect, test } from "@playwright/test";
import type { QueryPage } from "../packages/shared/src/query";
import { installExternalMedia } from "../fixtures/e2e";
import { canonicalArticle } from "../fixtures/primitives";
import { BROWSER, WORKER, INGEST, browserApiHeaders } from "./helpers";

test("query tokens manage mixed-source access, paginate read-only and copy credential-free guides", async ({ page, request }) => {
	await installExternalMedia(page);
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as typeof window & { copiedGuide: string }).copiedGuide = text; } } });
	});
	const suffix = crypto.randomUUID();
	const label = `Reader ${suffix}`;
	const watchlists: { id: number; name: string }[] = [];
	const channels: { id: number; name: string }[] = [];
	let queryId: number | undefined;
	const producer = (await (await request.post(`${WORKER}/api/push-tokens`, { headers: browserApiHeaders, data: { label: `Collector ${suffix}` } })).json()).data;
	const agentHeaders = (token: string) => ({ host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${token}` });
	try {
		for (const index of [0, 1]) {
			const watchlist = (await (await request.post(`${WORKER}/api/watchlists`, { headers: browserApiHeaders, data: { name: `Query watch ${index} ${suffix}` } })).json()).data;
			watchlists.push(watchlist);
			const item = canonicalArticle(`query-${index}-${suffix}`, `Query post ${index}`);
			item.created_at = new Date().toISOString();
			const pushed = await request.post(`${INGEST}/api/v1/ingest/push`, { headers: agentHeaders(producer.token), data: { watchlist_id: watchlist.id, items: [item] } });
			expect((await pushed.json()).accepted).toBe(1);
			const channel = (await (await request.post(`${WORKER}/api/channels`, { headers: browserApiHeaders, data: { name: `Query channel ${index} ${suffix}` } })).json()).data;
			channels.push(channel);
			const key = (await (await request.post(`${WORKER}/api/channels/${channel.id}/keys`, { headers: browserApiHeaders, data: { label: `Query publisher ${index}` } })).json()).data;
			expect((await request.post(`${INGEST}/api/v1/ingest/articles`, { headers: agentHeaders(key.token), data: { external_id: `query-${suffix}`, title: `Query article ${index}`, report_date: new Date().toISOString().slice(0, 10), markdown: `Full report ${index}` } })).status()).toBe(201);
		}
		await page.goto(`${BROWSER}/tokens`);
		for (const kind of ["Query", "Watchlist", "Channel"]) await expect(page.getByRole("region", { name: `${kind} token management` })).toBeVisible();
		await page.getByRole("button", { name: "Create token", exact: true }).click();
		let dialog = page.getByRole("dialog");
		await dialog.getByLabel("Token name").fill(label);
		await dialog.getByLabel("Token type", { exact: true }).click();
		await page.getByRole("option", { name: "Read-only query", exact: true }).click();
		await expect(dialog.getByLabel("Read access", { exact: true })).toContainText("All watchlists and channels");
		await dialog.getByRole("button", { name: "Create token", exact: true }).click();
		await expect(dialog.getByRole("heading", { name: "Token created" })).toBeVisible();
		const token = await dialog.getByLabel("API key").inputValue();
		await dialog.getByRole("button", { name: "Done", exact: true }).click();
		const catalog = (await (await request.get(`${WORKER}/api/tokens`, { headers: browserApiHeaders })).json()).data;
		queryId = catalog.find((entry: { label: string }) => entry.label === label).id;
		expect(JSON.stringify(catalog)).not.toContain(token);
		const read = async (params = "") => {
			const response = await request.get(`${INGEST}/api/v1/query${params}`, { headers: agentHeaders(token) });
			expect(response.status()).toBe(200);
			return (await response.json()).data as QueryPage;
		};
		const all = await read();
		expect(all.items.some((item) => item.kind === "post" && item.post.watchlistId === watchlists[1].id)).toBe(true);
		expect(all.items.some((item) => item.kind === "article" && item.article.channelId === channels[1].id)).toBe(true);
		for (const kind of ["query", "watchlist", "channel"]) {
			await page.getByRole("button", { name: `Copy ${kind} agent guide`, exact: true }).click();
			const copied = await page.evaluate(() => (window as typeof window & { copiedGuide: string }).copiedGuide);
			expect(copied).toContain("Authorization: Bearer <environment value>");
			expect(copied).not.toContain(token);
			expect(copied).not.toContain(producer.token);
			await page.getByRole("button", { name: `View ${kind} agent guide`, exact: true }).click();
			await expect(page.getByRole("region", { name: `${kind === "query" ? "Query" : kind === "channel" ? "Channel" : "Watchlist"} token management` }).locator("pre")).toHaveText(copied);
			await page.getByRole("button", { name: `View ${kind} agent guide`, exact: true }).click();
		}
		await page.getByRole("button", { name: `Edit ${label}`, exact: true }).click();
		dialog = page.getByRole("dialog");
		await dialog.getByLabel("Read access", { exact: true }).click();
		await page.getByRole("option", { name: "Selected sources only", exact: true }).click();
		await expect(dialog.getByRole("button", { name: "Save changes" })).toBeDisabled();
		for (const [name, source] of [["Watchlists", watchlists[0]], ["Channels", channels[0]]] as const) {
			await dialog.getByRole("button", { name, exact: true }).click();
			await page.getByRole("option", { name: source.name, exact: true }).click();
			await page.keyboard.press("Escape");
		}
		await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
		await expect(page.getByRole("button", { name: `Edit ${label}`, exact: true })).toBeFocused();
		const selected = await read();
		expect(selected.items).toHaveLength(2);
		expect(selected.items.map((item) => item.kind).sort()).toEqual(["article", "post"]);
		const first = await read("?limit=1&order=asc");
		expect(first.items[0].kind).toBe("article");
		expect(first.nextCursor).toBeTruthy();
		const second = await read(`?limit=1&order=asc&cursor=${encodeURIComponent(first.nextCursor!)}`);
		expect(second.items[0].kind).toBe("post");
		expect(second.nextCursor).toBeNull();
		const articles = (await (await request.get(`${WORKER}/api/channels/${channels[0].id}/articles`, { headers: browserApiHeaders })).json()).data;
		expect(articles.items[0].isRead).toBe(false);
		expect((await request.post(`${INGEST}/api/v1/ingest/articles`, { headers: agentHeaders(token), data: {} })).status()).toBe(403);
		await page.reload();
		const row = page.getByRole("table", { name: "Query tokens", exact: true }).getByRole("row").filter({ hasText: label });
		await expect(row.getByText("1 watchlists · 1 channels", { exact: true }).filter({ visible: true })).toBeVisible();
		await page.getByRole("button", { name: `Revoke ${label}`, exact: true }).click();
		await page.getByRole("alertdialog").getByRole("button", { name: "Revoke", exact: true }).click();
		await expect(page.getByRole("button", { name: `Revoke ${label}`, exact: true })).toHaveCount(0);
		expect((await request.get(`${INGEST}/api/v1/query`, { headers: agentHeaders(token) })).status()).toBe(401);
	} finally {
		if (queryId) await request.delete(`${WORKER}/api/query-tokens/${queryId}`, { headers: browserApiHeaders });
		await request.delete(`${WORKER}/api/push-tokens/${producer.id}`, { headers: browserApiHeaders });
		for (const source of watchlists) await request.delete(`${WORKER}/api/watchlists/${source.id}`, { headers: browserApiHeaders });
		for (const source of channels) await request.delete(`${WORKER}/api/channels/${source.id}`, { headers: browserApiHeaders });
	}
});
