import { describe, expect, it } from "bun:test";
import { navSections, allNavItems, isActive } from "@/components/layout/sidebar";

// =============================================================================
// Sidebar navigation structure tests
// =============================================================================

describe("sidebar navigation", () => {
  // ---------------------------------------------------------------------------
  // navSections structure
  // ---------------------------------------------------------------------------

  describe("navSections", () => {
    it("has 4 sections", () => {
      expect(navSections).toHaveLength(4);
    });

    it("section 0 has no title (top-level items)", () => {
      expect(navSections[0]!.title).toBeNull();
      expect(navSections[0]!.items.map((i) => i.label)).toEqual(["Dashboard"]);
    });

    it("section 1 is Explore World", () => {
      expect(navSections[1]!.title).toBe("Explore World");
      expect(navSections[1]!.items.map((i) => i.label)).toEqual([
        "Tweets",
        "Users",
      ]);
    });

    it("section 2 is My Account", () => {
      expect(navSections[2]!.title).toBe("My Account");
      expect(navSections[2]!.items.map((i) => i.label)).toEqual([
        "Analytics",
        "Watchlist",
        "Bookmarks",
        "Likes",
        "Lists",
        "Messages",
      ]);
    });

    it("section 3 has no title (utility items)", () => {
      expect(navSections[3]!.title).toBeNull();
      expect(navSections[3]!.items.map((i) => i.label)).toEqual([
        "Usage",
        "Settings",
      ]);
    });

    it("every item has an href, label, and icon", () => {
      for (const section of navSections) {
        for (const item of section.items) {
          expect(item.href).toBeTruthy();
          expect(item.label).toBeTruthy();
          expect(item.icon).toBeTruthy();
        }
      }
    });

    it("all hrefs are unique", () => {
      const hrefs = allNavItems.map((i) => i.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    });

    it("all hrefs start with /", () => {
      for (const item of allNavItems) {
        expect(item.href.startsWith("/")).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // allNavItems flattened helper
  // ---------------------------------------------------------------------------

  describe("allNavItems", () => {
    it("contains all items from all sections", () => {
      const totalItems = navSections.reduce(
        (sum, s) => sum + s.items.length,
        0,
      );
      expect(allNavItems).toHaveLength(totalItems);
    });

    it("includes expected nav items", () => {
      const labels = allNavItems.map((i) => i.label);
      expect(labels).toContain("Dashboard");
      expect(labels).toContain("Tweets");
      expect(labels).toContain("Users");
      expect(labels).toContain("Analytics");
      expect(labels).toContain("Bookmarks");
      expect(labels).toContain("Likes");
      expect(labels).toContain("Lists");
      expect(labels).toContain("Messages");
      expect(labels).toContain("Usage");
      expect(labels).toContain("Settings");
    });
  });

  // ---------------------------------------------------------------------------
  // isActive helper
  // ---------------------------------------------------------------------------

  describe("isActive", () => {
    it("returns true for exact match on /", () => {
      expect(isActive("/", "/")).toBe(true);
    });

    it("returns false for non-root paths when href is /", () => {
      expect(isActive("/tweets", "/")).toBe(false);
      expect(isActive("/settings", "/")).toBe(false);
    });

    it("returns true for exact match on non-root paths", () => {
      expect(isActive("/tweets", "/tweets")).toBe(true);
      expect(isActive("/users", "/users")).toBe(true);
      expect(isActive("/analytics", "/analytics")).toBe(true);
      expect(isActive("/messages", "/messages")).toBe(true);
    });

    it("returns true for child paths", () => {
      expect(isActive("/tweets/123", "/tweets")).toBe(true);
      expect(isActive("/users/elonmusk", "/users")).toBe(true);
      expect(isActive("/users/elonmusk/connections", "/users")).toBe(true);
      expect(isActive("/messages/conv-123", "/messages")).toBe(true);
    });

    it("returns false for unrelated paths", () => {
      expect(isActive("/tweets", "/users")).toBe(false);
      expect(isActive("/analytics", "/tweets")).toBe(false);
      expect(isActive("/settings", "/messages")).toBe(false);
    });

    it("returns false for partial prefix matches that are not path segments", () => {
      // /tweetsearch should NOT match /tweets
      expect(isActive("/tweetsearch", "/tweets")).toBe(false);
    });
  });
});
