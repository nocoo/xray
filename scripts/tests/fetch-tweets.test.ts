import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  deduplicateTweets,
  filterTweetsByTimeRange,
  fetchAllTweets,
} from "../fetch-tweets";
import type { Tweet } from "../lib/types";
import { useTestDB, useRealDB, resetDB } from "../lib/db";

describe("fetch-tweets", () => {
  describe("deduplicateTweets", () => {
    test("should remove duplicate tweets by id", () => {
      const tweets: Tweet[] = [
        createMockTweet("1", "First tweet"),
        createMockTweet("2", "Second tweet"),
        createMockTweet("1", "First tweet duplicate"),
        createMockTweet("3", "Third tweet"),
        createMockTweet("2", "Second tweet duplicate"),
      ];

      const result = deduplicateTweets(tweets);

      expect(result).toHaveLength(3);
      expect(result.map((t) => t.id)).toEqual(["1", "2", "3"]);
    });

    test("should return empty array for empty input", () => {
      const result = deduplicateTweets([]);
      expect(result).toEqual([]);
    });

    test("should return single tweet as-is", () => {
      const tweets: Tweet[] = [createMockTweet("1", "Only tweet")];
      const result = deduplicateTweets(tweets);
      expect(result).toEqual(tweets);
    });

    test("should preserve first occurrence order", () => {
      const tweets: Tweet[] = [
        createMockTweet("1", "First"),
        createMockTweet("2", "Second"),
        createMockTweet("3", "Third"),
      ];

      const result = deduplicateTweets(tweets);
      expect(result.map((t) => t.id)).toEqual(["1", "2", "3"]);
    });

    test("should handle all duplicates", () => {
      const tweets: Tweet[] = [
        createMockTweet("1", "Tweet 1"),
        createMockTweet("1", "Duplicate 1"),
        createMockTweet("1", "Duplicate 2"),
      ];

      const result = deduplicateTweets(tweets);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    test("should handle large number of tweets", () => {
      const tweets: Tweet[] = [];
      for (let i = 0; i < 1000; i++) {
        tweets.push(createMockTweet(`${i % 100}`, `Tweet ${i}`));
      }

      const result = deduplicateTweets(tweets);

      expect(result).toHaveLength(100);
    });
  });

  describe("filterTweetsByTimeRange", () => {
    test("should include tweets within time range", () => {
      const from = "2026-01-26T10:00:00.000Z";
      const to = "2026-01-26T14:00:00.000Z";

      const tweets: Tweet[] = [
        createMockTweet("1", "Before", "2026-01-26T09:00:00.000Z"),
        createMockTweet("2", "Inside 1", "2026-01-26T10:00:00.000Z"),
        createMockTweet("3", "Inside 2", "2026-01-26T11:00:00.000Z"),
        createMockTweet("4", "Inside 3", "2026-01-26T12:00:00.000Z"),
        createMockTweet("5", "Inside 4", "2026-01-26T13:00:00.000Z"),
        createMockTweet("6", "Inside 5", "2026-01-26T14:00:00.000Z"),
        createMockTweet("7", "After", "2026-01-26T15:00:00.000Z"),
      ];

      const result = filterTweetsByTimeRange(tweets, from, to);

      expect(result).toHaveLength(5);
      expect(result.map((t) => t.id)).toEqual(["2", "3", "4", "5", "6"]);
    });

    test("should return empty array when no tweets in range", () => {
      const from = "2026-01-26T10:00:00.000Z";
      const to = "2026-01-26T11:00:00.000Z";

      const tweets: Tweet[] = [
        createMockTweet("1", "Before", "2026-01-26T09:00:00.000Z"),
        createMockTweet("2", "After", "2026-01-26T12:00:00.000Z"),
      ];

      const result = filterTweetsByTimeRange(tweets, from, to);

      expect(result).toEqual([]);
    });

    test("should handle empty input array", () => {
      const from = "2026-01-26T10:00:00.000Z";
      const to = "2026-01-26T11:00:00.000Z";

      const result = filterTweetsByTimeRange([], from, to);

      expect(result).toEqual([]);
    });

    test("should be inclusive of range boundaries", () => {
      const from = "2026-01-26T10:00:00.000Z";
      const to = "2026-01-26T14:00:00.000Z";

      const tweets: Tweet[] = [
        createMockTweet("1", "Boundary start", "2026-01-26T10:00:00.000Z"),
        createMockTweet("2", "Boundary end", "2026-01-26T14:00:00.000Z"),
      ];

      const result = filterTweetsByTimeRange(tweets, from, to);

      expect(result).toHaveLength(2);
    });

    test("should handle 4-hour time range", () => {
      const now = new Date("2026-01-26T12:00:00.000Z");
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

      const from = fourHoursAgo.toISOString();
      const to = now.toISOString();

      const tweets: Tweet[] = [
        createMockTweet("1", "4 hours ago", fourHoursAgo.toISOString()),
        createMockTweet("2", "3 hours ago", new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()),
        createMockTweet("3", "2 hours ago", new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()),
        createMockTweet("4", "1 hour ago", new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString()),
        createMockTweet("5", "now", now.toISOString()),
        createMockTweet("6", "4 hours 1 sec ago", new Date(fourHoursAgo.getTime() - 1000).toISOString()),
      ];

      const result = filterTweetsByTimeRange(tweets, from, to);

      expect(result).toHaveLength(5);
      expect(result.map((t) => t.id)).toEqual(["1", "2", "3", "4", "5"]);
    });
  });

  describe("fetchAllTweets integration", () => {
    beforeEach(() => {
      useTestDB();
      resetDB();
    });

    afterEach(() => {
      useRealDB();
    });

    test("should return error when watchlist is empty", async () => {
      const result = await fetchAllTweets({});

      expect(result.success).toBe(false);
      expect(result.error).toBe("EMPTY_WATCHLIST");
      expect(result.message).toContain("Watchlist is empty");
    });
  });

  describe("time range edge cases", () => {
    test("should handle tweets exactly at time boundaries", () => {
      const from = "2026-01-26T10:00:00.000Z";
      const to = "2026-01-26T14:00:00.000Z";

      const tweets: Tweet[] = [
        createMockTweet("1", "Start boundary", "2026-01-26T10:00:00.000Z"),
        createMockTweet("2", "End boundary", "2026-01-26T14:00:00.000Z"),
        createMockTweet("3", "Mid boundary", "2026-01-26T12:00:00.000Z"),
      ];

      const result = filterTweetsByTimeRange(tweets, from, to);

      expect(result).toHaveLength(3);
    });

    test("should handle timezone differences correctly", () => {
      const from = "2026-01-26T00:00:00.000Z";
      const to = "2026-01-26T23:59:59.999Z";

      const tweets: Tweet[] = [
        createMockTweet("1", "UTC time", "2026-01-26T12:00:00.000Z"),
      ];

      const result = filterTweetsByTimeRange(tweets, from, to);

      expect(result).toHaveLength(1);
    });

    test("should handle microsecond precision", () => {
      const from = "2026-01-26T10:00:00.000Z";
      const to = "2026-01-26T14:00:00.000Z";

      const tweets: Tweet[] = [
        createMockTweet("1", "With microseconds", "2026-01-26T12:00:00.123456Z"),
      ];

      const result = filterTweetsByTimeRange(tweets, from, to);

      expect(result).toHaveLength(1);
    });
  });

  describe("ordering and stability", () => {
    test("filterTweetsByTimeRange should preserve original order", () => {
      const from = "2026-01-26T00:00:00.000Z";
      const to = "2026-01-26T23:59:59.999Z";

      const tweets: Tweet[] = [
        createMockTweet("1", "Tweet 1", "2026-01-26T10:00:00.000Z"),
        createMockTweet("2", "Tweet 2", "2026-01-26T14:00:00.000Z"),
        createMockTweet("3", "Tweet 3", "2026-01-26T12:00:00.000Z"),
      ];

      const result = filterTweetsByTimeRange(tweets, from, to);

      expect(result[0].id).toBe("1");
      expect(result[1].id).toBe("2");
      expect(result[2].id).toBe("3");
    });

    test("should handle tweets with same timestamp", () => {
      const timestamp = "2026-01-26T12:00:00.000Z";
      const tweets: Tweet[] = [
        createMockTweet("1", "Tweet 1", timestamp),
        createMockTweet("2", "Tweet 2", timestamp),
        createMockTweet("3", "Tweet 3", timestamp),
      ];

      const result = deduplicateTweets(tweets);

      expect(result).toHaveLength(3);
    });
  });

  describe("no deadlocks - async behavior", () => {
    test("should complete without hanging", async () => {
      const tweets: Tweet[] = [];
      for (let i = 0; i < 100; i++) {
        tweets.push(createMockTweet(`${i}`, `Tweet ${i}`));
      }

      const startTime = Date.now();
      const result = deduplicateTweets(tweets);
      const elapsed = Date.now() - startTime;

      expect(result).toHaveLength(100);
      expect(elapsed).toBeLessThan(100);
    });

    test("filterTweetsByTimeRange should complete quickly", async () => {
      const tweets: Tweet[] = [];
      for (let i = 0; i < 1000; i++) {
        tweets.push(createMockTweet(`${i}`, `Tweet ${i}`, "2026-01-26T12:00:00.000Z"));
      }

      const startTime = Date.now();
      const result = filterTweetsByTimeRange(tweets, "2026-01-26T00:00:00.000Z", "2026-01-26T23:59:59.999Z");
      const elapsed = Date.now() - startTime;

      expect(result).toHaveLength(1000);
      expect(elapsed).toBeLessThan(100);
    });
  });
});

function createMockTweet(id: string, text: string, createdAt?: string): Tweet {
  return {
    id,
    text,
    author: {
      id: `author-${id}`,
      username: `user${id}`,
      name: `User ${id}`,
    },
    created_at: createdAt || new Date().toISOString(),
    url: `https://x.com/i/status/${id}`,
    metrics: {
      retweet_count: 0,
      like_count: 0,
      reply_count: 0,
      quote_count: 0,
      view_count: 0,
      bookmark_count: 0,
    },
    is_retweet: false,
    is_quote: false,
    is_reply: false,
  };
}
