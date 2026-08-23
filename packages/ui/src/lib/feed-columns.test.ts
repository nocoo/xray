import { describe, expect, test } from "vitest";
import { chunkFeedPages, feedColumnsPageStyle, ITEMS_PAGE_LIMIT } from "./feed-columns";

describe("feed-columns", () => {
	test("chunkFeedPages isolates appended pages so older membership cannot rebalance", () => {
		expect(chunkFeedPages([])).toEqual([]);
		expect(chunkFeedPages([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
		const first = Array.from({ length: ITEMS_PAGE_LIMIT }, (_, i) => i + 1);
		const second = Array.from({ length: ITEMS_PAGE_LIMIT }, (_, i) => i + 1 + ITEMS_PAGE_LIMIT);
		const before = chunkFeedPages(first);
		const after = chunkFeedPages([...first, ...second]);
		expect(before).toHaveLength(1);
		expect(after).toHaveLength(2);
		expect(after[0]).toEqual(before[0]);
		expect(after[1]).toEqual(second);
		expect(chunkFeedPages([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
	});

	test("feedColumnsPageStyle is a balanced multi-column box", () => {
		expect(feedColumnsPageStyle(3)).toEqual({
			columnCount: 3,
			columnFill: "balance",
			columnGap: "0.75rem",
		});
	});
});
