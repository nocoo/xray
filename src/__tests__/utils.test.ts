import { describe, test, expect } from "bun:test";
import {
  cn,
  getAvatarColor,
  formatCount,
  formatTimeAgo,
  formatDate,
  estimateTweetHeight,
  pMap,
} from "../lib/utils";

describe("src/lib/utils", () => {
  describe("cn", () => {
    test("merges class names", () => {
      expect(cn("foo", "bar")).toBe("foo bar");
    });

    test("handles conditional classes", () => {
      expect(cn("base", false && "hidden", "visible")).toBe("base visible");
    });

    test("merges tailwind classes (twMerge)", () => {
      // twMerge deduplicates conflicting tailwind classes
      expect(cn("px-4", "px-8")).toBe("px-8");
    });

    test("handles empty input", () => {
      expect(cn()).toBe("");
    });

    test("handles undefined and null", () => {
      expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
    });

    test("handles array inputs via clsx", () => {
      expect(cn(["foo", "bar"])).toBe("foo bar");
    });

    test("handles object inputs via clsx", () => {
      expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz");
    });
  });

  describe("getAvatarColor", () => {
    test("returns a bg- tailwind class", () => {
      const color = getAvatarColor("testuser");
      expect(color).toMatch(/^bg-\w+-\d+$/);
    });

    test("returns consistent color for same name", () => {
      const color1 = getAvatarColor("alice");
      const color2 = getAvatarColor("alice");
      expect(color1).toBe(color2);
    });

    test("returns different colors for different names", () => {
      // With 16 colors, two different names are very likely to get different colors
      const colors = new Set<string>();
      for (const name of ["alice", "bob", "charlie", "dave", "eve", "frank"]) {
        colors.add(getAvatarColor(name));
      }
      // At least 3 distinct colors out of 6 names
      expect(colors.size).toBeGreaterThanOrEqual(3);
    });

    test("handles empty string", () => {
      const color = getAvatarColor("");
      expect(color).toMatch(/^bg-\w+-\d+$/);
    });

    test("handles special characters", () => {
      const color = getAvatarColor("@user!#$%");
      expect(color).toMatch(/^bg-\w+-\d+$/);
    });

    test("handles very long string", () => {
      const color = getAvatarColor("a".repeat(1000));
      expect(color).toMatch(/^bg-\w+-\d+$/);
    });
  });

  describe("formatCount", () => {
    test("formats millions", () => {
      expect(formatCount(1_500_000)).toBe("1.5M");
      expect(formatCount(1_000_000)).toBe("1.0M");
    });

    test("formats thousands", () => {
      expect(formatCount(1_200)).toBe("1.2K");
      expect(formatCount(1_000)).toBe("1.0K");
    });

    test("formats small numbers with locale string", () => {
      expect(formatCount(999)).toBe("999");
      expect(formatCount(0)).toBe("0");
    });
  });

  describe("formatTimeAgo", () => {
    test("returns 'just now' for recent dates", () => {
      const now = new Date().toISOString();
      expect(formatTimeAgo(now)).toBe("just now");
    });

    test("returns minutes ago", () => {
      const date = new Date(Date.now() - 5 * 60_000).toISOString();
      expect(formatTimeAgo(date)).toBe("5m ago");
    });

    test("returns hours ago", () => {
      const date = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
      expect(formatTimeAgo(date)).toBe("3h ago");
    });

    test("returns days ago", () => {
      const date = new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString();
      expect(formatTimeAgo(date)).toBe("5d ago");
    });

    test("returns months ago for 30+ days", () => {
      const date = new Date(Date.now() - 60 * 24 * 60 * 60_000).toISOString();
      expect(formatTimeAgo(date)).toBe("2mo ago");
    });

    test("returns years ago for 365+ days", () => {
      const date = new Date(Date.now() - 400 * 24 * 60 * 60_000).toISOString();
      expect(formatTimeAgo(date)).toBe("1y ago");
    });
  });

  describe("formatDate", () => {
    test("formats a valid ISO date", () => {
      const result = formatDate("2026-01-15T00:00:00Z");
      expect(result).toContain("Jan");
      expect(result).toContain("15");
      expect(result).toContain("2026");
    });

    test("returns original string on parse failure", () => {
      expect(formatDate("not-a-date")).toBe("Invalid Date");
    });
  });

  describe("estimateTweetHeight", () => {
    test("returns base height for minimal tweet", () => {
      expect(estimateTweetHeight({ text: "" })).toBe(100);
    });

    test("adds height for text length", () => {
      const h = estimateTweetHeight({ text: "a".repeat(120) });
      expect(h).toBe(100 + Math.ceil(120 / 60) * 20);
    });

    test("adds height for media", () => {
      const h = estimateTweetHeight({ text: "", media: [{}] });
      expect(h).toBe(300); // 100 base + 200 media
    });

    test("adds height for quoted tweet", () => {
      const h = estimateTweetHeight({ text: "", quoted_tweet: {} });
      expect(h).toBe(220); // 100 base + 120 quote
    });

    test("handles null text", () => {
      expect(estimateTweetHeight({ text: null })).toBe(100);
    });
  });

  describe("pMap", () => {
    test("maps items with concurrency limit", async () => {
      const items = [1, 2, 3, 4, 5];
      const results = await pMap(
        items,
        async (n) => n * 2,
        2,
      );
      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    test("preserves order", async () => {
      const items = [50, 10, 30, 20, 40];
      const results = await pMap(
        items,
        async (n) => {
          await new Promise((r) => setTimeout(r, n));
          return n;
        },
        3,
      );
      expect(results).toEqual([50, 10, 30, 20, 40]);
    });

    test("handles empty array", async () => {
      const results = await pMap([], async (n: number) => n, 5);
      expect(results).toEqual([]);
    });

    test("handles concurrency > items.length", async () => {
      const results = await pMap([1, 2], async (n) => n + 1, 10);
      expect(results).toEqual([2, 3]);
    });
  });
});
