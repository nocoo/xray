import { describe, expect, test } from "vitest";
import { columnsForWidth } from "./use-columns";

describe("columnsForWidth", () => {
	test("uses the feed container width, not the window", () => {
		expect(columnsForWidth(164)).toBe(1);
		expect(columnsForWidth(767)).toBe(1);
		expect(columnsForWidth(768)).toBe(2);
		expect(columnsForWidth(1024)).toBe(3);
		expect(columnsForWidth(1536)).toBe(4);
	});

	test("adds a column on tall screens only when already wide", () => {
		expect(columnsForWidth(1024, true)).toBe(3);
		expect(columnsForWidth(2048, true)).toBe(6);
		expect(columnsForWidth(2560, true)).toBe(6);
	});
});
