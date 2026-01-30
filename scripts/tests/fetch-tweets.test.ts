import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { deduplicateTweets, fetchAllTweets } from "../fetch-tweets";
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


  describe("ordering and stability", () => {
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
