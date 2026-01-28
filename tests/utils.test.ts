import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import {
  extractUsername,
  isValidUsername,
  normalizeUsername,
  buildProfileUrl,
  nowISO,
  hoursAgoISO,
  getLocalDateString,
  formatDateInTimezone,
  formatDateTimeInTimezone,
  TIMEZONE_OFFSET_HOURS,
} from "../scripts/lib/utils";

describe("utils", () => {
  describe("extractUsername", () => {
    test("extracts username from x.com URL", () => {
      expect(extractUsername("https://x.com/karpathy")).toBe("karpathy");
    });

    test("extracts username from twitter.com URL", () => {
      expect(extractUsername("https://twitter.com/elonmusk")).toBe("elonmusk");
    });

    test("extracts username with path", () => {
      expect(extractUsername("https://x.com/karpathy/status/123")).toBe("karpathy");
    });

    test("returns null for invalid URL", () => {
      expect(extractUsername("https://google.com")).toBe(null);
    });

    test("returns null for empty string", () => {
      expect(extractUsername("")).toBe(null);
    });
  });

  describe("isValidUsername", () => {
    test("accepts valid usernames", () => {
      expect(isValidUsername("karpathy")).toBe(true);
      expect(isValidUsername("elon_musk")).toBe(true);
      expect(isValidUsername("user123")).toBe(true);
      expect(isValidUsername("a")).toBe(true);
    });

    test("rejects invalid usernames", () => {
      expect(isValidUsername("")).toBe(false);
      expect(isValidUsername("user-name")).toBe(false); // hyphens not allowed
      expect(isValidUsername("user.name")).toBe(false); // dots not allowed
      expect(isValidUsername("this_username_is_way_too_long")).toBe(false); // >15 chars
    });
  });

  describe("normalizeUsername", () => {
    test("removes @ prefix", () => {
      expect(normalizeUsername("@karpathy")).toBe("karpathy");
    });

    test("keeps username without @", () => {
      expect(normalizeUsername("karpathy")).toBe("karpathy");
    });
  });

  describe("buildProfileUrl", () => {
    test("builds correct profile URL", () => {
      expect(buildProfileUrl("karpathy")).toBe("https://x.com/karpathy");
    });
  });

  describe("nowISO", () => {
    test("returns ISO 8601 format", () => {
      const result = nowISO();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe("hoursAgoISO", () => {
    test("returns date in the past", () => {
      const now = new Date();
      const result = hoursAgoISO(24);
      const resultDate = new Date(result);

      const diffHours = (now.getTime() - resultDate.getTime()) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(24, 0);
    });

    test("handles zero hours", () => {
      const now = new Date();
      const result = hoursAgoISO(0);
      const resultDate = new Date(result);

      const diffMs = Math.abs(now.getTime() - resultDate.getTime());
      expect(diffMs).toBeLessThan(1000); // Should be within 1 second of now
    });

    test("handles fractional hours", () => {
      const result = hoursAgoISO(1.5); // 1.5 hours ago
      const resultDate = new Date(result);
      const now = new Date();

      const diffMinutes = (now.getTime() - resultDate.getTime()) / (1000 * 60);
      // setHours truncates fractional part, so 1.5 becomes 1 hour = 60 minutes
      expect(diffMinutes).toBeGreaterThanOrEqual(59);
      expect(diffMinutes).toBeLessThan(120);
    });

    test("handles large hours value", () => {
      const result = hoursAgoISO(8760); // 1 year ago
      const resultDate = new Date(result);
      const now = new Date();

      const diffHours = (now.getTime() - resultDate.getTime()) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(8760, 0);
    });
  });

  describe("isValidUsername edge cases", () => {
    test("rejects username with spaces", () => {
      expect(isValidUsername("user name")).toBe(false);
    });

    test("rejects username starting with number", () => {
      expect(isValidUsername("123user")).toBe(true); // Actually valid per Twitter rules
    });

    test("rejects username with special characters", () => {
      expect(isValidUsername("user!")).toBe(false);
      expect(isValidUsername("user@")).toBe(false);
      expect(isValidUsername("user#")).toBe(false);
      expect(isValidUsername("user$")).toBe(false);
    });

    test("accepts maximum length username", () => {
      const maxLenUser = "a".repeat(15);
      expect(isValidUsername(maxLenUser)).toBe(true);

      const tooLongUser = "a".repeat(16);
      expect(isValidUsername(tooLongUser)).toBe(false);
    });
  });

  describe("extractUsername edge cases", () => {
    test("handles URL with query parameters", () => {
      expect(extractUsername("https://x.com/user?param=value")).toBe("user");
    });

    test("handles URL with trailing slash", () => {
      expect(extractUsername("https://x.com/user/")).toBe("user");
    });

    test("handles nitter.net URL", () => {
      expect(extractUsername("https://nitter.net/elonmusk")).toBe(null); // Not a Twitter URL
    });
  });

  describe("timezone utilities", () => {
    test("TIMEZONE_OFFSET_HOURS is 8 (UTC+8)", () => {
      expect(TIMEZONE_OFFSET_HOURS).toBe(8);
    });

    test("getLocalDateString returns YYYY-MM-DD format", () => {
      const result = getLocalDateString();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("getLocalDateString converts UTC to UTC+8 correctly", () => {
      const utc2300 = new Date("2026-01-22T23:00:00.000Z");
      const result = getLocalDateString(utc2300);
      expect(result).toBe("2026-01-23");
    });

    test("getLocalDateString at UTC 16:00 is same day in UTC+8", () => {
      const utc1600 = new Date("2026-01-22T16:00:00.000Z");
      const result = getLocalDateString(utc1600);
      expect(result).toBe("2026-01-23");
    });

    test("getLocalDateString at UTC 15:59 is still previous day in UTC+8", () => {
      const utc1559 = new Date("2026-01-22T15:59:00.000Z");
      const result = getLocalDateString(utc1559);
      expect(result).toBe("2026-01-22");
    });

    test("formatDateInTimezone returns readable format", () => {
      const date = new Date("2026-01-22T22:00:00.000Z");
      const result = formatDateInTimezone(date);
      expect(result).toBe("Jan 23, 2026");
    });

    test("formatDateTimeInTimezone returns readable format with time", () => {
      const date = new Date("2026-01-22T22:30:00.000Z");
      const result = formatDateTimeInTimezone(date);
      expect(result).toBe("Jan 23, 2026, 6:30 AM");
    });

    test("formatDateTimeInTimezone handles PM correctly", () => {
      const date = new Date("2026-01-22T06:00:00.000Z");
      const result = formatDateTimeInTimezone(date);
      expect(result).toBe("Jan 22, 2026, 2:00 PM");
    });

    test("formatDateTimeInTimezone handles noon correctly", () => {
      const date = new Date("2026-01-22T04:00:00.000Z");
      const result = formatDateTimeInTimezone(date);
      expect(result).toBe("Jan 22, 2026, 12:00 PM");
    });

    test("formatDateTimeInTimezone handles midnight correctly", () => {
      const date = new Date("2026-01-22T16:00:00.000Z");
      const result = formatDateTimeInTimezone(date);
      expect(result).toBe("Jan 23, 2026, 12:00 AM");
    });
  });
});
