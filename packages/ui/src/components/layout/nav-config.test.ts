import { describe, expect, test } from "vitest";
import { getV2NavGroups, isActivePath } from "./nav-config";

describe("nav-config", () => {
	test("v2 groups expose expected labels and dynamic sections", () => {
		const groups = getV2NavGroups();
		const labels = groups.flatMap((g) => g.items.map((i) => i.label));
		expect(labels).toEqual(
			expect.arrayContaining([
				"Dashboard",
				"All watchlists",
				"All groups",
				"zhe.to",
				"AI Settings",
				"Settings",
				"Push Tokens",
			]),
		);
		expect(groups.find((g) => g.label === "Watchlists")?.dynamic).toBe("watchlists");
		expect(groups.find((g) => g.label === "Groups")?.dynamic).toBe("groups");
		expect(labels).not.toContain("Explore");
		expect(labels).not.toContain("Usage");
	});

	test("isActivePath matches nested routes", () => {
		expect(isActivePath("/", "/")).toBe(true);
		expect(isActivePath("/watchlist/1", "/watchlist")).toBe(true);
		expect(isActivePath("/groups", "/watchlist")).toBe(false);
	});
});
