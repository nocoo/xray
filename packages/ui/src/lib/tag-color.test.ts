import { describe, expect, test } from "vitest";
import { generateTagColor } from "./tag-color";

describe("generateTagColor", () => {
	test("stable hsl", () => {
		const a = generateTagColor("News");
		const b = generateTagColor("  news  ");
		expect(a).toBe(b);
		expect(a).toMatch(/^hsl\(\d+, 70%, 45%\)$/);
	});
});
