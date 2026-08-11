import { describe, expect, test } from "vitest";
import { cn, formatCount, formatTimeAgo, getAvatarColor } from "./utils";

describe("utils", () => {
	test("cn merges classes", () => {
		expect(cn("a", false && "b", "c")).toContain("a");
		expect(cn("px-2", "px-4")).toContain("px-4");
	});

	test("formatCount", () => {
		expect(formatCount(999)).toBe("999");
		expect(formatCount(1_200)).toBe("1.2K");
		expect(formatCount(1_500_000)).toBe("1.5M");
	});

	test("formatTimeAgo styles", () => {
		const now = Date.now();
		expect(formatTimeAgo(new Date(now - 30_000).toISOString(), "compact")).toBe("now");
		expect(formatTimeAgo(new Date(now - 5 * 60_000).toISOString(), "compact")).toBe("5m");
		expect(formatTimeAgo(new Date(now - 3 * 3600_000).toISOString(), "compact")).toBe("3h");
		expect(formatTimeAgo(new Date(now - 2 * 86400_000).toISOString(), "compact")).toBe("2d");
		expect(formatTimeAgo(new Date(now - 20 * 86400_000).toISOString(), "compact")).toMatch(
			/[A-Za-z]{3} \d+/,
		);

		expect(formatTimeAgo(new Date(now - 3600_000).toISOString(), "coarse")).toBe("today");
		expect(formatTimeAgo(new Date(now - 86400_000).toISOString(), "coarse")).toBe("1d ago");
		expect(formatTimeAgo(new Date(now - 10 * 86400_000).toISOString(), "coarse")).toBe("10d ago");
		expect(formatTimeAgo(new Date(now - 60 * 86400_000).toISOString(), "coarse")).toMatch(/mo ago/);
		expect(formatTimeAgo(new Date(now - 400 * 86400_000).toISOString(), "coarse")).toMatch(/y ago/);

		expect(formatTimeAgo(new Date(now - 30_000).toISOString())).toBe("just now");
		expect(formatTimeAgo(new Date(now - 5 * 60_000).toISOString())).toBe("5m ago");
		expect(formatTimeAgo(new Date(now - 3 * 3600_000).toISOString())).toBe("3h ago");
		expect(formatTimeAgo(new Date(now - 10 * 86400_000).toISOString())).toBe("10d ago");
		expect(formatTimeAgo(new Date(now - 60 * 86400_000).toISOString()).length).toBeGreaterThan(0);
	});

	test("getAvatarColor stable", () => {
		const a = getAvatarColor("alice");
		const b = getAvatarColor("alice");
		expect(a).toBe(b);
		expect(a).toMatch(/^bg-/);
	});
});
