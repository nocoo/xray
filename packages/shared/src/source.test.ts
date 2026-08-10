import { describe, expect, test } from "vitest";
import { isSourceType, SOURCE_TYPE_LABELS, SOURCE_TYPES } from "./source.js";

describe("SOURCE_TYPES", () => {
	test("mvp sources are x.com and custom", () => {
		expect([...SOURCE_TYPES]).toEqual(["x.com", "custom"]);
		expect(SOURCE_TYPE_LABELS["x.com"]).toBe("x.com");
		expect(SOURCE_TYPE_LABELS.custom).toBe("custom");
	});

	test("isSourceType guards", () => {
		expect(isSourceType("x.com")).toBe(true);
		expect(isSourceType("custom")).toBe(true);
		expect(isSourceType("twitter")).toBe(false);
		expect(isSourceType("")).toBe(false);
	});
});
