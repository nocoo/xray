import { describe, expect, test } from "vitest";
import {
	applyMeasuredHeights,
	distributeColumns,
	pruneMeasuredHeights,
	resolveItemHeight,
} from "./feed-columns";

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

describe("measured heights", () => {
	test("resolveItemHeight prefers measured values", () => {
		const item = { id: 9 };
		expect(resolveItemHeight(item, () => 80, {})).toBe(80);
		expect(resolveItemHeight(item, () => 80, { 9: 240 })).toBe(240);
	});

	test("applyMeasuredHeights ignores no-ops and non-positive", () => {
		expect(
			applyMeasuredHeights({ 1: 10 }, [
				[1, 10.4],
				[2, 0],
			]),
		).toBeNull();
		expect(
			applyMeasuredHeights({ 1: 10 }, [
				[1, 40],
				[2, 12],
			]),
		).toEqual({ 1: 40, 2: 12 });
	});

	test("measured heights rebalance later cards onto the shorter column", () => {
		const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
		const est = () => 100;
		const before = distributeColumns(items, 2, (it) => resolveItemHeight(it, est, {}));
		expect(before[0]?.map((i) => i.id)).toEqual([1, 3]);
		const after = distributeColumns(items, 2, (it) => resolveItemHeight(it, est, { 1: 400 }));
		expect(after[0]?.map((i) => i.id)).toEqual([1]);
		expect(after[1]?.map((i) => i.id)).toEqual([2, 3]);
	});

	test("pruneMeasuredHeights drops ids that left the feed", () => {
		const prev = { 1: 10, 2: 20 };
		expect(pruneMeasuredHeights(prev, new Set([1, 2]))).toBe(prev);
		expect(pruneMeasuredHeights(prev, new Set([2]))).toEqual({ 2: 20 });
	});
});
