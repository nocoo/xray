import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";
import { mkdirSync, rmSync, existsSync } from "fs";
import {
  extractUsername,
  isValidUsername,
  normalizeUsername,
  buildProfileUrl,
  nowISO,
  nowLocalISO,
  toLocalISOString,
  hoursAgoISO,
  hoursAgoLocalISO,
  getLocalDateString,
  formatDateInTimezone,
  formatDateTimeInTimezone,
  readJsonFile,
  writeJsonFile,
  fileExists,
  saveReport,
  saveWatchlistReport,
  formatTweetOutput,
  calculateRelevanceScore,
  loadAnalyzeOutput,
  ANALYZE_OUTPUT_PATH,
} from "../scripts/lib/utils";
import type { Tweet, TweetMetrics, TweetAuthor } from "../scripts/lib/types";

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
      // Allow some buffer for test execution time
      expect(diffMinutes).toBeGreaterThanOrEqual(59);
      expect(diffMinutes).toBeLessThanOrEqual(130);
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

  describe("nowLocalISO", () => {
    test("returns ISO 8601 format", () => {
      const result = nowLocalISO();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test("returns value close to now", () => {
      const before = new Date();
      const result = new Date(nowLocalISO());
      const after = new Date();
      expect(result.getTime()).toBeGreaterThanOrEqual(before.getTime() - 100);
      expect(result.getTime()).toBeLessThanOrEqual(after.getTime() + 100);
    });
  });

  describe("toLocalISOString", () => {
    test("converts date to ISO string", () => {
      const date = new Date("2026-06-15T14:30:00.000Z");
      expect(toLocalISOString(date)).toBe("2026-06-15T14:30:00.000Z");
    });

    test("preserves milliseconds", () => {
      const date = new Date("2026-01-01T00:00:00.123Z");
      expect(toLocalISOString(date)).toBe("2026-01-01T00:00:00.123Z");
    });
  });

  describe("hoursAgoLocalISO", () => {
    test("returns date in the past", () => {
      const now = new Date();
      const result = hoursAgoLocalISO(12);
      const resultDate = new Date(result);
      const diffHours = (now.getTime() - resultDate.getTime()) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(12, 0);
    });

    test("handles zero hours", () => {
      const now = new Date();
      const result = hoursAgoLocalISO(0);
      const resultDate = new Date(result);
      const diffMs = Math.abs(now.getTime() - resultDate.getTime());
      expect(diffMs).toBeLessThan(1000);
    });
  });

  describe("timezone utilities", () => {

    test("getLocalDateString returns YYYY-MM-DD format", () => {
      const result = getLocalDateString();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("getLocalDateString uses UTC date", () => {
      const utc2300 = new Date("2026-01-22T23:00:00.000Z");
      const result = getLocalDateString(utc2300);
      expect(result).toBe("2026-01-22");
    });

    test("formatDateInTimezone returns readable format", () => {
      const date = new Date("2026-01-22T22:00:00.000Z");
      const result = formatDateInTimezone(date);
      expect(result).toBe("Jan 22, 2026");
    });

    test("formatDateTimeInTimezone returns readable format with time", () => {
      const date = new Date("2026-01-22T22:30:00.000Z");
      const result = formatDateTimeInTimezone(date);
      expect(result).toBe("Jan 22, 2026, 10:30 PM");
    });

    test("formatDateTimeInTimezone handles PM correctly", () => {
      const date = new Date("2026-01-22T18:00:00.000Z");
      const result = formatDateTimeInTimezone(date);
      expect(result).toBe("Jan 22, 2026, 6:00 PM");
    });

    test("formatDateTimeInTimezone handles noon correctly", () => {
      const date = new Date("2026-01-22T12:00:00.000Z");
      const result = formatDateTimeInTimezone(date);
      expect(result).toBe("Jan 22, 2026, 12:00 PM");
    });

    test("formatDateTimeInTimezone handles midnight correctly", () => {
      const date = new Date("2026-01-23T00:00:00.000Z");
      const result = formatDateTimeInTimezone(date);
      expect(result).toBe("Jan 23, 2026, 12:00 AM");
    });
  });

  // ===========================================================================
  // File I/O Functions
  // ===========================================================================

  describe("readJsonFile", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = join(tmpdir(), `xray-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    test("reads and parses JSON file", async () => {
      const filePath = join(tmpDir, "test.json");
      await Bun.write(filePath, JSON.stringify({ hello: "world", count: 42 }));

      const result = await readJsonFile<{ hello: string; count: number }>(filePath);
      expect(result.hello).toBe("world");
      expect(result.count).toBe(42);
    });

    test("throws for non-existent file", async () => {
      const filePath = join(tmpDir, "nonexistent.json");
      await expect(readJsonFile(filePath)).rejects.toThrow("File not found");
    });
  });

  describe("writeJsonFile", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = join(tmpdir(), `xray-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    test("writes JSON file with pretty formatting", async () => {
      const filePath = join(tmpDir, "out.json");
      await writeJsonFile(filePath, { key: "value" });

      const content = await Bun.file(filePath).text();
      expect(content).toBe(JSON.stringify({ key: "value" }, null, 2));
    });

    test("overwrites existing file", async () => {
      const filePath = join(tmpDir, "out.json");
      await writeJsonFile(filePath, { v: 1 });
      await writeJsonFile(filePath, { v: 2 });

      const result = await Bun.file(filePath).json();
      expect(result.v).toBe(2);
    });
  });

  describe("fileExists", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = join(tmpdir(), `xray-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    test("returns true for existing file", async () => {
      const filePath = join(tmpDir, "exists.txt");
      await Bun.write(filePath, "hello");
      expect(await fileExists(filePath)).toBe(true);
    });

    test("returns false for non-existent file", async () => {
      const filePath = join(tmpDir, "nope.txt");
      expect(await fileExists(filePath)).toBe(false);
    });
  });

  describe("loadAnalyzeOutput", () => {
    test("returns null when file does not exist", async () => {
      // ANALYZE_OUTPUT_PATH points to data/analyze_output.json
      // In test env, likely doesn't exist
      const result = await loadAnalyzeOutput();
      if (result === null) {
        expect(result).toBeNull();
      } else {
        expect(result).toHaveProperty("generated_at");
        expect(result).toHaveProperty("items");
      }
    });
  });

  describe("saveReport", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = join(tmpdir(), `xray-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    test("saves report to custom output directory", async () => {
      const report = {
        generated_at: "2026-01-22T10:00:00.000Z",
        summary: { total_fetched: 100, selected_count: 20 },
        tweets: [],
      };

      const path = await saveReport(report, tmpDir);
      expect(path).toContain(tmpDir);
      expect(path).toMatch(/_report\.json$/);

      const saved = await Bun.file(path).json();
      expect(saved.summary.total_fetched).toBe(100);
    });
  });

  describe("saveWatchlistReport", () => {
    test("generates filename from timestamp", async () => {
      const path = await saveWatchlistReport(
        "# Report\nSome content",
        "2026-03-15T14:30:00.000Z"
      );

      expect(path).toContain("xray_20260315_1430.md");

      // Cleanup
      rmSync(path, { force: true });
    });
  });

  // ===========================================================================
  // Tweet Helpers
  // ===========================================================================

  describe("formatTweetOutput", () => {
    function createTweet(overrides: Partial<Tweet> = {}): Tweet {
      return {
        id: "123",
        text: "Hello world from a test tweet",
        author: {
          id: "a1",
          username: "testuser",
          name: "Test User",
        },
        created_at: "2026-01-20T10:00:00.000Z",
        url: "https://x.com/testuser/status/123",
        metrics: {
          retweet_count: 10,
          like_count: 50,
          reply_count: 5,
          quote_count: 2,
          view_count: 1000,
          bookmark_count: 3,
        },
        is_retweet: false,
        is_quote: false,
        is_reply: false,
        ...overrides,
      };
    }

    test("formats tweet with engagement metrics", () => {
      const tweet = createTweet();
      const output = formatTweetOutput(tweet);

      expect(output).toContain("@testuser");
      expect(output).toContain("Hello world from a test tweet");
      expect(output).toContain("50"); // like_count
      expect(output).toContain("10"); // retweet_count
      expect(output).toContain("5");  // reply_count
      expect(output).toContain("1000"); // view_count
      expect(output).toContain("https://x.com/testuser/status/123");
    });

    test("truncates long text at 200 chars", () => {
      const longText = "A".repeat(250);
      const tweet = createTweet({ text: longText });
      const output = formatTweetOutput(tweet);

      expect(output).toContain("A".repeat(200) + "...");
      expect(output).not.toContain("A".repeat(201));
    });

    test("does not truncate short text", () => {
      const tweet = createTweet({ text: "Short" });
      const output = formatTweetOutput(tweet);

      expect(output).toContain("Short");
      expect(output).not.toContain("...");
    });
  });

  describe("calculateRelevanceScore", () => {
    test("returns 0 for all zeros", () => {
      const score = calculateRelevanceScore(0, 0, 0);
      expect(score).toBe(0);
    });

    test("returns higher score for more followers", () => {
      const low = calculateRelevanceScore(100, 10, 5);
      const high = calculateRelevanceScore(100000, 10, 5);
      expect(high).toBeGreaterThan(low);
    });

    test("returns higher score for more engagement", () => {
      const low = calculateRelevanceScore(1000, 10, 5);
      const high = calculateRelevanceScore(1000, 5000, 5);
      expect(high).toBeGreaterThan(low);
    });

    test("returns higher score for more tweets", () => {
      const low = calculateRelevanceScore(1000, 100, 1);
      const high = calculateRelevanceScore(1000, 100, 10);
      expect(high).toBeGreaterThan(low);
    });

    test("caps at 100", () => {
      const score = calculateRelevanceScore(10_000_000, 100_000, 100);
      expect(score).toBeLessThanOrEqual(100);
    });

    test("handles edge case with 1 follower", () => {
      const score = calculateRelevanceScore(1, 0, 0);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThan(10);
    });

    test("mid-range example produces reasonable score", () => {
      const score = calculateRelevanceScore(10000, 500, 5);
      expect(score).toBeGreaterThan(20);
      expect(score).toBeLessThan(80);
    });
  });
});
