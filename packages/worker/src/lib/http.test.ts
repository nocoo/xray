import { describe, expect, test } from "vitest";
import { parseIdParam } from "./http.js";

describe("parseIdParam", () => {
	test("accepts positive integers", () => {
		expect(parseIdParam("12")).toBe(12);
		expect(parseIdParam("0")).toBeNull();
		expect(parseIdParam("-1")).toBeNull();
		expect(parseIdParam("x")).toBeNull();
		expect(parseIdParam(undefined)).toBeNull();
	});
});
