import { describe, expect, test } from "vitest";
import { distributeColumns } from "./feed-columns";

describe("distributeColumns", () => {
	test("appended items keep the previous prefix assignment", () => {
		const h = (n: number) => (n % 2 === 0 ? 200 : 80);
		const first = [1, 2, 3, 4, 5];
		const before = distributeColumns(first, 3, h);
		const after = distributeColumns([...first, 6, 7], 3, h);
		expect(after).toHaveLength(3);
		expect(after.map((col) => col.filter((id) => id <= 5))).toEqual(before);
		expect(after.flat().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});

	test("taller cards go into the current shortest column", () => {
		const cols = distributeColumns(
			[
				{ id: 1, h: 40 },
				{ id: 2, h: 40 },
				{ id: 3, h: 400 },
			],
			2,
			(item) => item.h,
		);
		expect(cols[0]?.map((i) => i.id)).toEqual([1, 3]);
		expect(cols[1]?.map((i) => i.id)).toEqual([2]);
	});

	test("invalid column count falls back to one column", () => {
		expect(distributeColumns([1, 2], 0, () => 10)).toEqual([[1, 2]]);
		expect(distributeColumns([1], Number.NaN, () => -5)).toEqual([[1]]);
	});
});
