import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
	ITEMS_PAGE_LIMIT,
	chunkFeedPages,
	feedColumnsPageStyle,
} from "../packages/ui/src/lib/feed-columns";

test("watchlist detail feed renders via PostsColumnsPages", () => {
	const src = readFileSync("packages/ui/src/views/watchlist-detail-page.tsx", "utf8");
	expect(src).toContain("PostsColumnsPages");
	expect(src).not.toMatch(/s\.items\.map\(/);
});

/**
 * Uses the production chunk + column style helpers. Appending page 2 must
 * not move page 1 cards (the P0 CSS columns rebalance).
 */
test("appending a second columns page leaves first-page card positions", async ({ page }) => {
	await page.setViewportSize({ width: 1200, height: 800 });
	const ids = Array.from({ length: ITEMS_PAGE_LIMIT * 2 }, (_, i) => i + 1);
	const pages = chunkFeedPages(ids);
	const style = feedColumnsPageStyle(3);
	await page.setContent(`<!doctype html>
<html>
  <head>
    <style>
      body { margin: 0; }
      .card {
        display: inline-block;
        width: 100%;
        break-inside: avoid;
        vertical-align: top;
        margin: 0 0 12px;
        background: #ccc;
      }
    </style>
  </head>
  <body>
    <div id="feed"></div>
  </body>
</html>`);

	await page.evaluate(
		({ pages: pageIds, style: pageStyle }) => {
			const feed = document.getElementById("feed");
			if (!feed) throw new Error("missing feed");
			const paint = (fromPage: number, toPage: number) => {
				for (let p = fromPage; p < toPage; p++) {
					const idsInPage = pageIds[p];
					if (!idsInPage) continue;
					const pageEl = document.createElement("div");
					pageEl.dataset.testid = "posts-columns-page";
					Object.assign(pageEl.style, {
						columnCount: String(pageStyle.columnCount),
						columnFill: pageStyle.columnFill,
						columnGap: pageStyle.columnGap,
					});
					for (const id of idsInPage) {
						const card = document.createElement("div");
						card.className = "card";
						card.dataset.id = String(id);
						card.style.height = `${80 + (id % 7) * 24}px`;
						card.textContent = String(id);
						pageEl.append(card);
					}
					feed.append(pageEl);
				}
			};
			paint(0, 1);
			(window as unknown as { __paintPages: typeof paint }).__paintPages = paint;
		},
		{ pages, style },
	);

	const first = page.locator('[data-id="1"]');
	const mid = page.locator(`[data-id="${Math.ceil(ITEMS_PAGE_LIMIT / 2)}"]`);
	const last = page.locator(`[data-id="${ITEMS_PAGE_LIMIT}"]`);
	const before = {
		first: await first.boundingBox(),
		mid: await mid.boundingBox(),
		last: await last.boundingBox(),
	};
	expect(before.first && before.mid && before.last).toBeTruthy();

	await page.evaluate(() => {
		(window as unknown as { __paintPages: (from: number, to: number) => void }).__paintPages(1, 2);
	});

	const after = {
		first: await first.boundingBox(),
		mid: await mid.boundingBox(),
		last: await last.boundingBox(),
	};
	expect(after.first?.y).toBe(before.first?.y);
	expect(after.mid?.y).toBe(before.mid?.y);
	expect(after.last?.y).toBe(before.last?.y);
	expect(after.first?.x).toBe(before.first?.x);
	expect(after.mid?.x).toBe(before.mid?.x);
	expect(after.last?.x).toBe(before.last?.x);
});
