import { describe, expect, test } from "vitest";
import { V2_NAV_GROUPS, V2_NAV_LABELS } from "./nav.js";

describe("V2_NAV", () => {
	test("includes core v2 surface labels", () => {
		for (const label of [
			"Dashboard",
			"Watchlists",
			"Groups",
			"zhe.to",
			"AI Settings",
			"Settings",
			"Push Tokens",
		]) {
			expect(V2_NAV_LABELS).toContain(label);
		}
	});

	test("excludes removed v1 nav", () => {
		const banned = [
			"Explore",
			"Tweets",
			"Analytics",
			"Bookmarks",
			"Usage",
			"Webhooks",
			"My Account",
		];
		for (const label of banned) {
			expect(V2_NAV_LABELS).not.toContain(label);
		}
	});

	test("groups are non-empty", () => {
		expect(V2_NAV_GROUPS.length).toBeGreaterThan(0);
		for (const g of V2_NAV_GROUPS) {
			expect(g.items.length).toBeGreaterThan(0);
		}
	});
});
