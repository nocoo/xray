import { describe, test, expect } from "bun:test";
import { deduplicateTweets } from "../scripts/fetch-tweets";
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
      quote_count: 0,
      view_count: 0,
      bookmark_count: 0,
    },
    is_retweet: false,
    is_quote: false,
    is_reply: false,
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

});
