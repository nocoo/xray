import { describe, expect, test } from "vitest";
import {
	parseGroupBody,
	parseIdParam,
	parseMemberCreateBody,
	parseMemberPatchBody,
	parseTagBody,
	parseWatchlistBody,
} from "./http.js";

describe("parseIdParam", () => {
	test("accepts positive ints", () => {
		expect(parseIdParam("12")).toBe(12);
	});
	test("rejects junk", () => {
		expect(parseIdParam("0")).toBeNull();
		expect(parseIdParam("-1")).toBeNull();
		expect(parseIdParam("x")).toBeNull();
	});
});

describe("parseWatchlistBody", () => {
	test("create requires name", () => {
		expect(parseWatchlistBody({}, "create").ok).toBe(false);
		const r = parseWatchlistBody({ name: "  A  " }, "create");
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.name).toBe("A");
	});
	test("rejects non-string description", () => {
		const r = parseWatchlistBody({ name: "a", description: 1 }, "create");
		expect(r.ok).toBe(false);
	});
	test("patch empty fails", () => {
		expect(parseWatchlistBody({}, "patch").ok).toBe(false);
	});
});

describe("parseGroupBody", () => {
	test("create ok", () => {
		const r = parseGroupBody({ name: "g", icon: "users" }, "create");
		expect(r.ok).toBe(true);
	});
});

describe("parseMember bodies", () => {
	test("create requires handle+sourceType", () => {
		expect(parseMemberCreateBody({ handle: "a" }).ok).toBe(false);
		const r = parseMemberCreateBody({ sourceType: "x.com", handle: "Elon" });
		expect(r.ok).toBe(true);
	});
	test("rejects bad tagIds", () => {
		const r = parseMemberCreateBody({
			sourceType: "custom",
			handle: "h",
			tagIds: ["1"],
		});
		expect(r.ok).toBe(false);
	});
	test("patch empty fails", () => {
		expect(parseMemberPatchBody({}).ok).toBe(false);
	});
});

describe("parseTagBody", () => {
	test("defaults color", () => {
		const r = parseTagBody({ name: "t" });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.color).toContain("hsl");
	});
});
