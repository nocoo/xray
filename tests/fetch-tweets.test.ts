import { describe, test, expect } from "bun:test";
import { deduplicateTweets, filterTweetsByTimeRange } from "../scripts/fetch-tweets";
import type { Tweet } from "../scripts/lib/types";

describe("fetch-tweets", () => {
  const createMockTweet = (id: string, createdAt: string): Tweet => ({
    id,
    text: `Tweet ${id}`,
    author: {
      id: "123",
      username: "testuser",
      name: "Test User",
    },
    created_at: createdAt,
    url: `https://x.com/testuser/status/${id}`,
    metrics: {
      retweet_count: 0,
      like_count: 0,
      reply_count: 0,
    },
    is_retweet: false,
    is_quote: false,
  });

  describe("deduplicateTweets", () => {
    test("removes duplicate tweets by ID", () => {
      const tweets: Tweet[] = [
        createMockTweet("1", "2026-01-21T10:00:00.000Z"),
        createMockTweet("2", "2026-01-21T09:00:00.000Z"),
        createMockTweet("1", "2026-01-21T10:00:00.000Z"), // duplicate
        createMockTweet("3", "2026-01-21T08:00:00.000Z"),
      ];

      const result = deduplicateTweets(tweets);

      expect(result).toHaveLength(3);
      expect(result.map((t) => t.id)).toEqual(["1", "2", "3"]);
    });

    test("preserves first occurrence", () => {
      const tweet1 = createMockTweet("1", "2026-01-21T10:00:00.000Z");
      tweet1.text = "First occurrence";

      const tweet1Dup = createMockTweet("1", "2026-01-21T10:00:00.000Z");
      tweet1Dup.text = "Duplicate";

      const result = deduplicateTweets([tweet1, tweet1Dup]);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("First occurrence");
    });

    test("handles empty array", () => {
      expect(deduplicateTweets([])).toEqual([]);
    });
  });

  describe("filterTweetsByTimeRange", () => {
    test("filters tweets within time range", () => {
      const tweets: Tweet[] = [
        createMockTweet("1", "2026-01-21T10:00:00.000Z"), // in range
        createMockTweet("2", "2026-01-20T10:00:00.000Z"), // in range
        createMockTweet("3", "2026-01-19T10:00:00.000Z"), // out of range
        createMockTweet("4", "2026-01-22T10:00:00.000Z"), // out of range (future)
      ];

      const result = filterTweetsByTimeRange(
        tweets,
        "2026-01-20T00:00:00.000Z",
        "2026-01-21T23:59:59.000Z"
      );

      expect(result).toHaveLength(2);
      expect(result.map((t) => t.id)).toEqual(["1", "2"]);
    });

    test("includes boundary dates", () => {
      const tweets: Tweet[] = [
        createMockTweet("1", "2026-01-21T00:00:00.000Z"), // exactly at start
        createMockTweet("2", "2026-01-21T23:59:59.000Z"), // exactly at end
      ];

      const result = filterTweetsByTimeRange(
        tweets,
        "2026-01-21T00:00:00.000Z",
        "2026-01-21T23:59:59.000Z"
      );

      expect(result).toHaveLength(2);
    });

    test("handles empty array", () => {
      expect(
        filterTweetsByTimeRange(
          [],
          "2026-01-20T00:00:00.000Z",
          "2026-01-21T23:59:59.000Z"
        )
      ).toEqual([]);
    });

    test("filters out tweets exactly at boundary when outside range", () => {
      const tweets: Tweet[] = [
        createMockTweet("1", "2026-01-19T23:59:59.999Z"), // 1ms before start
        createMockTweet("2", "2026-01-22T00:00:00.000Z"), // 1ms after end
      ];

      const result = filterTweetsByTimeRange(
        tweets,
        "2026-01-20T00:00:00.000Z",
        "2026-01-21T23:59:59.999Z"
      );

      expect(result).toHaveLength(0);
    });

    test("handles single tweet in range", () => {
      const tweets: Tweet[] = [
        createMockTweet("1", "2026-01-21T12:00:00.000Z"),
      ];

      const result = filterTweetsByTimeRange(
        tweets,
        "2026-01-21T00:00:00.000Z",
        "2026-01-21T23:59:59.000Z"
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });
  });
});
