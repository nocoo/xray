import { describe, expect, test } from "vitest";
import {
	parseGroupBody,
	parseIdParam,
	parseMemberCreateBody,
	parseMemberPatchBody,
	parseTagBody,
	parseWatchlistBody,
} from "./http.js";

describe("http parsers — branch matrix", () => {
	test("parseIdParam undefined", () => {
		expect(parseIdParam(undefined)).toBeNull();
	});

	test("watchlist create/patch edges", () => {
		expect(parseWatchlistBody(null, "create").ok).toBe(false);
		expect(parseWatchlistBody({ name: null }, "create").ok).toBe(false);
		expect(parseWatchlistBody({ name: 1 }, "create").ok).toBe(false);
		expect(parseWatchlistBody({ name: "x".repeat(200) }, "create").ok).toBe(false);
		expect(parseWatchlistBody({ name: "   " }, "create").ok).toBe(false);
		expect(parseWatchlistBody({ name: "a", description: null }, "create").ok).toBe(true);
		expect(parseWatchlistBody({ name: "a", description: "  " }, "create").ok).toBe(true);
		expect(parseWatchlistBody({ name: "a", icon: 1 }, "create").ok).toBe(false);
		expect(parseWatchlistBody({ name: "a", translateEnabled: "yes" }, "create").ok).toBe(false);
		const full = parseWatchlistBody(
			{ name: "n", description: "d", icon: "eye", translateEnabled: true },
			"create",
		);
		expect(full.ok).toBe(true);
		const patch = parseWatchlistBody({ description: null }, "patch");
		expect(patch.ok).toBe(true);
		expect(parseWatchlistBody({ name: "n" }, "patch").ok).toBe(true);
		expect(parseWatchlistBody({ icon: "x" }, "patch").ok).toBe(true);
		expect(parseWatchlistBody({ translateEnabled: false }, "patch").ok).toBe(true);
	});

	test("group create/patch edges", () => {
		expect(parseGroupBody(null, "create").ok).toBe(false);
		expect(parseGroupBody({ name: "   " }, "create").ok).toBe(false);
		expect(parseGroupBody({ name: "g", description: null, icon: "users" }, "create").ok).toBe(true);
		expect(parseGroupBody({}, "patch").ok).toBe(false);
		expect(parseGroupBody({ name: "g" }, "patch").ok).toBe(true);
		expect(parseGroupBody({ description: "d" }, "patch").ok).toBe(true);
		expect(parseGroupBody({ icon: "i" }, "patch").ok).toBe(true);
		expect(parseGroupBody({ name: 1 }, "create").ok).toBe(false);
	});

	test("member create/patch edges", () => {
		expect(parseMemberCreateBody(null).ok).toBe(false);
		expect(parseMemberCreateBody({ sourceType: "x.com" }).ok).toBe(false);
		expect(parseMemberCreateBody({ sourceType: "x.com", handle: "   " }).ok).toBe(false);
		expect(
			parseMemberCreateBody({
				sourceType: "x.com",
				handle: "a",
				displayName: null,
				note: null,
				externalAuthorId: null,
				tagIds: [1, 2],
			}).ok,
		).toBe(true);
		expect(
			parseMemberCreateBody({
				sourceType: "x.com",
				handle: "a",
				tagIds: Array.from({ length: 51 }, (_, i) => i + 1),
			}).ok,
		).toBe(false);
		expect(parseMemberCreateBody({ sourceType: "x.com", handle: "a", tagIds: [0] }).ok).toBe(false);
		expect(parseMemberCreateBody({ sourceType: "x.com", handle: "a", displayName: 1 }).ok).toBe(
			false,
		);
		expect(parseMemberPatchBody(null).ok).toBe(false);
		expect(parseMemberPatchBody({ note: "n" }).ok).toBe(true);
		expect(parseMemberPatchBody({ displayName: null }).ok).toBe(true);
		expect(parseMemberPatchBody({ tagIds: [3] }).ok).toBe(true);
		expect(parseMemberPatchBody({ note: 1 }).ok).toBe(false);
	});

	test("tag body edges", () => {
		expect(parseTagBody(null).ok).toBe(false);
		expect(parseTagBody({ name: "   " }).ok).toBe(false);
		expect(parseTagBody({ name: "t", color: "  " }).ok).toBe(true);
		expect(parseTagBody({ name: "t", color: "#fff" }).ok).toBe(true);
		expect(parseTagBody({ name: "t", color: 1 }).ok).toBe(false);
	});
});
