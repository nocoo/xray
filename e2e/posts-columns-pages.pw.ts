import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { distributeColumns } from "../packages/ui/src/lib/feed-columns";

test("watchlist detail feed renders via PostsColumnsPages", () => {
	const src = readFileSync("packages/ui/src/views/watchlist-detail-page.tsx", "utf8");
	expect(src).toContain("PostsColumnsPages");
	expect(src).toContain("estimateItemHeight");
	expect(src).not.toMatch(/s\.items\.map\(/);
});

test("appending masonry items leaves earlier card positions", async ({ page }) => {
	await page.setViewportSize({ width: 1200, height: 800 });
	const heightOf = (id: number) => 80 + (id % 7) * 24;
	const firstIds = Array.from({ length: 12 }, (_, i) => i + 1);
	const nextIds = Array.from({ length: 6 }, (_, i) => i + 13);
	const beforeCols = distributeColumns(firstIds, 3, heightOf);
	const afterCols = distributeColumns([...firstIds, ...nextIds], 3, heightOf);

	await page.setContent(`<!doctype html>
<html>
  <head>
    <style>
      body { margin: 0; }
      .feed { display: flex; align-items: flex-start; gap: 12px; }
      .col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
      .card { background: #ccc; }
    </style>
  </head>
  <body><div id="feed" class="feed"></div></body>
</html>`);

	await page.evaluate(
		({ cols }) => {
			const feed = document.getElementById("feed");
			if (!feed) throw new Error("missing feed");
			feed.replaceChildren();
			for (const col of cols) {
				const colEl = document.createElement("div");
				colEl.className = "col";
				for (const id of col) {
					const card = document.createElement("div");
					card.className = "card";
					card.dataset.id = String(id);
					card.style.height = `${80 + (id % 7) * 24}px`;
					card.textContent = String(id);
					colEl.append(card);
				}
				feed.append(colEl);
			}
		},
		{ cols: beforeCols },
	);

	const first = page.locator('[data-id="1"]');
	const mid = page.locator('[data-id="6"]');
	const last = page.locator('[data-id="12"]');
	const before = {
		first: await first.boundingBox(),
		mid: await mid.boundingBox(),
		last: await last.boundingBox(),
	};
	expect(before.first && before.mid && before.last).toBeTruthy();

	await page.evaluate(
		({ cols }) => {
			const feed = document.getElementById("feed");
			if (!feed) throw new Error("missing feed");
			feed.replaceChildren();
			for (const col of cols) {
				const colEl = document.createElement("div");
				colEl.className = "col";
				for (const id of col) {
					const card = document.createElement("div");
					card.className = "card";
					card.dataset.id = String(id);
					card.style.height = `${80 + (id % 7) * 24}px`;
					card.textContent = String(id);
					colEl.append(card);
				}
				feed.append(colEl);
			}
		},
		{ cols: afterCols },
	);

	const after = {
		first: await first.boundingBox(),
		mid: await mid.boundingBox(),
		last: await last.boundingBox(),
	};
	expect(after.first?.x).toBe(before.first?.x);
	expect(after.first?.y).toBe(before.first?.y);
	expect(after.mid?.x).toBe(before.mid?.x);
	expect(after.mid?.y).toBe(before.mid?.y);
	expect(after.last?.x).toBe(before.last?.x);
	expect(after.last?.y).toBe(before.last?.y);
});
