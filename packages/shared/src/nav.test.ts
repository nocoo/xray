import { describe, expect, test } from "vitest";
import { V2_NAV_GROUPS, V2_NAV_LABELS } from "./nav.js";

describe("V2_NAV", () => {
	test("includes core v2 surface labels", () => {
		for (const label of [
			"Dashboard",
			"All watchlists",
			"All groups",
			"All channels",
			"Channels",
			"zhe.to",
			"Settings",
		]) {
			expect(V2_NAV_LABELS).toContain(label);
		}
		const groupLabels = V2_NAV_GROUPS.map((g) => g.label);
		expect(groupLabels).toEqual(
			expect.arrayContaining(["Watchlists", "Groups", "Channels", "Dashboard", "Settings"]),
		);
		expect(V2_NAV_GROUPS.find((g) => g.label === "Channels")?.dynamic).toBe("channels");
		expect(
			V2_NAV_GROUPS.find((g) => g.label === "Settings")?.items.map((item) => item.label),
		).toEqual(["Channels", "Tags", "Settings"]);
		expect(V2_NAV_GROUPS.map((g) => g.label)).toEqual([
			"Dashboard",
			"Watchlists",
			"Groups",
			"Channels",
			"Integrations",
			"Settings",
		]);
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
			"AI Settings",
			"Push Tokens",
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
