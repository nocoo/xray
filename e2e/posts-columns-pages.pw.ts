import { installExternalMedia } from "../fixtures/e2e";
import { expect, test } from "@playwright/test";
import { canonicalArticle } from "../fixtures/primitives";
import { BROWSER, browserApiHeaders, INGEST, requireWorker, WORKER } from "./helpers";

test.beforeEach(async ({ page }) => {
	await installExternalMedia(page);
});

test("real watchlist masonry pagination preserves earlier card positions", async ({
	page,
	request,
}) => {
	await requireWorker(request);
	await page.setViewportSize({ width: 1400, height: 800 });
	const created = await request.post(`${WORKER}/api/watchlists`, {
		headers: browserApiHeaders,
		data: { name: `Masonry ${crypto.randomUUID()}` },
	});
	expect(created.status()).toBe(201);
	const { id } = (await created.json()).data;
	const issued = await request.post(`${WORKER}/api/push-tokens`, {
		headers: browserApiHeaders,
		data: { label: "Masonry producer" },
	});
	expect(issued.status()).toBe(201);
	const key = (await issued.json()).data;
	try {
		const submittedAt = Date.now();
		const items = Array.from({ length: 60 }, (_, index) => {
			const item = canonicalArticle(
				`masonry-${index}`,
				`Observation ${index}: ` + "Keep the source beside the result. ".repeat(2 + (index % 5)),
			);
			item.body.title = `Masonry observation ${String(index).padStart(2, "0")}`;
			item.created_at = new Date(submittedAt - index * 1000).toISOString();
			return item;
		});
		for (const batch of [items.slice(0, 50), items.slice(50)]) {
			const pushed = await request.post(`${INGEST}/api/v1/ingest/push`, {
				headers: { host: "xray-ingest.worker.hexly.ai", authorization: `Bearer ${key.token}` },
				data: { watchlist_id: id, items: batch },
			});
			expect(pushed.ok()).toBe(true);
			expect((await pushed.json()).accepted).toBe(batch.length);
		}
		await page.goto(`${BROWSER}/watchlist/${id}`);
		const masonry = page.getByTestId("posts-masonry");
		const cards = page.getByTestId("posts-masonry-card");
		const scroll = page.getByTestId("posts-scroll");
		await expect(masonry).toBeVisible();
		await expect(cards).toHaveCount(50);
		expect(await page.getByTestId("posts-masonry-col").count()).toBeGreaterThan(1);
		await page.evaluate(() => document.fonts.ready);
		const positions = () =>
			masonry.evaluate((node) => {
				const scroller = node.closest('[data-testid="posts-scroll"]');
				if (!scroller) throw new Error("Missing timeline scroll container");
				const origin = scroller.getBoundingClientRect();
				return [...node.querySelectorAll('[data-testid="posts-masonry-card"]')].map((card) => {
					const rect = card.getBoundingClientRect();
					return {
						text: card.querySelector("h3")?.textContent ?? card.textContent,
						x: rect.x - origin.x,
						y: rect.y - origin.y + scroller.scrollTop,
					};
				});
			});
		await page.waitForTimeout(250);
		const before = await positions();
		await page.getByTestId("load-more-sentinel").scrollIntoViewIfNeeded();
		await expect(cards).toHaveCount(60);
		await expect(page.getByTestId("feed-end")).toBeVisible();
		await scroll.evaluate((node) => {
			node.scrollTop = 0;
		});
		await expect
			.poll(async () => {
				const after = await positions();
				return before
					.flatMap((old) => {
						const current = after.find((item) => item.text === old.text);
						return current && Math.abs(current.x - old.x) < 1 && Math.abs(current.y - old.y) < 1
							? []
							: [{ before: old, after: current }];
					})
					.slice(0, 3);
			})
			.toEqual([]);
	} finally {
		expect(
			(await request.delete(`${WORKER}/api/watchlists/${id}`, { headers: browserApiHeaders })).ok(),
		).toBe(true);
		expect(
			(
				await request.delete(`${WORKER}/api/push-tokens/${key.id}`, { headers: browserApiHeaders })
			).ok(),
		).toBe(true);
	}
});
