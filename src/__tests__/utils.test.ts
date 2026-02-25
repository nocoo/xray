import { describe, test, expect } from "bun:test";
import { cn, getAvatarColor } from "../lib/utils";

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
});
