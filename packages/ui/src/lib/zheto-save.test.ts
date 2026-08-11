import { describe, expect, test } from "vitest";
import { canSaveToZheto, xStatusUrl } from "./zheto-save";

describe("zheto save helpers", () => {
	test("canSaveToZheto requires https", () => {
		expect(canSaveToZheto("https://example.com/a")).toBe(true);
		expect(canSaveToZheto("http://example.com/a")).toBe(false);
		expect(canSaveToZheto(null)).toBe(false);
		expect(canSaveToZheto("not-a-url")).toBe(false);
	});

	test("xStatusUrl", () => {
		expect(xStatusUrl("123")).toBe("https://x.com/i/status/123");
	});
});
