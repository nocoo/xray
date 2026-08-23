import { expect, test } from "@playwright/test";

/**
 * Browser contract for CSS multi-column feed pages: appending a second
 * balanced column box must not move cards that already belong to page 1.
 * Does not need the app worker.
 */
test("appending a second columns page leaves first-page card positions", async ({ page }) => {
	await page.setViewportSize({ width: 1200, height: 800 });
	await page.setContent(`<!doctype html>
<html>
  <head>
    <style>
      body { margin: 0; }
      .page { column-count: 3; column-fill: balance; column-gap: 12px; }
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

	await page.evaluate(() => {
		const feed = document.getElementById("feed");
		if (!feed) throw new Error("missing feed");
		const mkPage = (from: number, count: number) => {
			const pageEl = document.createElement("div");
			pageEl.className = "page";
			pageEl.dataset.page = String(from);
			for (let i = 0; i < count; i++) {
				const id = from + i;
				const card = document.createElement("div");
				card.className = "card";
				card.dataset.id = String(id);
				card.style.height = `${80 + (id % 7) * 24}px`;
				card.textContent = String(id);
				pageEl.append(card);
			}
			feed.append(pageEl);
		};
		mkPage(1, 50);
	});

	const first = page.locator('[data-id="1"]');
	const mid = page.locator('[data-id="25"]');
	const last = page.locator('[data-id="50"]');
	const before = {
		first: await first.boundingBox(),
		mid: await mid.boundingBox(),
		last: await last.boundingBox(),
	};
	expect(before.first && before.mid && before.last).toBeTruthy();

	await page.evaluate(() => {
		const feed = document.getElementById("feed");
		if (!feed) throw new Error("missing feed");
		const pageEl = document.createElement("div");
		pageEl.className = "page";
		for (let id = 51; id <= 100; id++) {
			const card = document.createElement("div");
			card.className = "card";
			card.dataset.id = String(id);
			card.style.height = `${80 + (id % 7) * 24}px`;
			card.textContent = String(id);
			pageEl.append(card);
		}
		feed.append(pageEl);
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
