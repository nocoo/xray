import { describe, expect, test } from "vitest";
import {
	POST_TEXT_CLAMP_LINES,
	parseLineHeightPx,
	QUOTED_TEXT_CLAMP_LINES,
	resolveClampMaxHeight,
	textBlockOverflows,
} from "./expandable-text";

describe("expandable-text", () => {
	test("clamp line counts stay positive", () => {
		expect(POST_TEXT_CLAMP_LINES).toBeGreaterThan(0);
		expect(QUOTED_TEXT_CLAMP_LINES).toBeGreaterThan(0);
		expect(QUOTED_TEXT_CLAMP_LINES).toBeLessThan(POST_TEXT_CLAMP_LINES);
	});

	test("parseLineHeightPx reads px, unitless, and fallbacks", () => {
		expect(parseLineHeightPx("22.75px", 14)).toBe(22.75);
		expect(parseLineHeightPx("1.625", 14)).toBeCloseTo(22.75);
		expect(parseLineHeightPx("normal", 14)).toBeCloseTo(22.75);
		expect(parseLineHeightPx("0px", 14)).toBeCloseTo(22.75);
		expect(parseLineHeightPx("normal", 0)).toBe(0);
	});

	test("resolveClampMaxHeight rejects non-positive inputs", () => {
		expect(resolveClampMaxHeight(22, 6)).toBe(132);
		expect(resolveClampMaxHeight(0, 6)).toBe(0);
		expect(resolveClampMaxHeight(22, 0)).toBe(0);
		expect(resolveClampMaxHeight(Number.NaN, 6)).toBe(0);
		expect(resolveClampMaxHeight(22, Number.NaN)).toBe(0);
	});

	test("textBlockOverflows does not slice; only compares heights", () => {
		expect(textBlockOverflows(134, 132)).toBe(true);
		expect(textBlockOverflows(132, 132)).toBe(false);
		expect(textBlockOverflows(133, 132)).toBe(false);
		expect(textBlockOverflows(133, 0)).toBe(false);
		expect(textBlockOverflows(Number.NaN, 132)).toBe(false);
		expect(textBlockOverflows(200, Number.NaN)).toBe(false);
	});
});
