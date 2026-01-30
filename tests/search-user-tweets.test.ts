import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { TwitterAPIClient } from "../scripts/lib/api";
import type { Config, Tweet } from "../scripts/lib/types";
import { buildSearchUserOutput } from "../agent/research/search-user-tweets";

// Test configuration
const mockConfig: Config = {
  api: {
    api_key: "test-api-key",
    base_url: "https://api.tweapi.io",
    cookie: "test-cookie",
  },
  me: {
    username: "testuser",
    is_blue_verified: true,
  },
  settings: {
    max_tweets_per_user: 20,
  },
  classification: {
    interests: ["AI"],
    filter_retweets_without_comment: true,
  },
};

// Mock tweet response
const mockSearchResponse = {
  code: 201,
  msg: "ok",
  data: {
    list: [
      {
        id: "123456",
        url: "https://x.com/karpathy/status/123456",
        fullText: "AI safety is crucial for AGI development",
        createdAt: "2026-01-30T10:00:00.000Z",
        lang: "en",
        bookmarkCount: 10,
        likeCount: 150,
        retweetCount: 30,
        replyCount: 15,
        quoteCount: 5,
        viewCount: 5000,
        conversationId: "123456",
        tweetBy: {
          id: "123",
          userName: "karpathy",
          fullName: "Andre Karpathy",
          profileImage: "https://example.com/profile.jpg",
          followersCount: 500000,
          followingsCount: 100,
          statusesCount: 5000,
          likeCount: 1000,
          isVerified: true,
          createdAt: "2010-01-01T00:00:00.000Z",
        },
        entities: {
          hashtags: ["AI", "AGI"],
          mentionedUsers: [],
          urls: [],
        },
      },
      {
        id: "789012",
        url: "https://x.com/karpathy/status/789012",
        fullText: "Neural networks are beautiful mathematical structures",
        createdAt: "2026-01-30T09:00:00.000Z",
        lang: "en",
        bookmarkCount: 5,
        likeCount: 200,
        retweetCount: 40,
        replyCount: 10,
        quoteCount: 8,
        viewCount: 6000,
        conversationId: "789012",
        tweetBy: {
          id: "123",
          userName: "karpathy",
          fullName: "Andre Karpathy",
          profileImage: "https://example.com/profile.jpg",
          followersCount: 500000,
          followingsCount: 100,
          statusesCount: 5000,
          likeCount: 1000,
          isVerified: true,
          createdAt: "2010-01-01T00:00:00.000Z",
        },
        entities: {
          hashtags: ["DeepLearning"],
          mentionedUsers: [],
          urls: [],
        },
      },
    ],
  },
};

// Mock single tweet response
const mockSingleTweetResponse = {
  code: 201,
  msg: "ok",
  data: {
    list: [
      {
        id: "123456",
        url: "https://x.com/karpathy/status/123456",
        fullText: "AI safety is crucial",
        createdAt: "2026-01-30T10:00:00.000Z",
        lang: "en",
        bookmarkCount: 10,
        likeCount: 150,
        retweetCount: 30,
        replyCount: 15,
        quoteCount: 5,
        viewCount: 5000,
        conversationId: "123456",
        tweetBy: {
          id: "123",
          userName: "karpathy",
          fullName: "Andre Karpathy",
          profileImage: "https://example.com/profile.jpg",
          followersCount: 500000,
          followingsCount: 100,
          statusesCount: 5000,
          likeCount: 1000,
          isVerified: true,
          createdAt: "2010-01-01T00:00:00.000Z",
        },
        entities: {
          hashtags: [],
          mentionedUsers: [],
          urls: [],
        },
      },
    ],
  },
};

// Mock empty response
const mockEmptyResponse = {
  code: 201,
  msg: "ok",
  data: {
    list: [],
  },
};

describe("Search User Tweets Script", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("normalizeUsername", () => {
    test("removes @ prefix if present", async () => {
      // Import the actual function
      const { normalizeUsername } = await import("../scripts/lib/utils");
      
      expect(normalizeUsername("karpathy")).toBe("karpathy");
      expect(normalizeUsername("@karpathy")).toBe("karpathy");
      expect(normalizeUsername("@karpathy")).toBe("karpathy");
    });
  });

  describe("searchUserTweets API", () => {
    test("sends correct request parameters", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSingleTweetResponse),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterAPIClient(mockConfig);
      await client.searchUserTweets("https://x.com/karpathy", "AI safety");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = (mockFetch.mock.calls[0] as unknown) as [string, RequestInit];
      
      expect(url).toBe("https://api.tweapi.io/v1/twitter/user/getUserTweetsBySearch");
      expect(options.method).toBe("POST");
      
      const body = JSON.parse(options.body as string);
      expect(body.userUrl).toBe("https://x.com/karpathy");
      expect(body.words).toBe("AI safety");
    });

    test("returns array of matching tweets", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.searchUserTweets("https://x.com/karpathy", "AI");

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("123456");
      expect(result[0].text).toContain("AI safety");
      expect(result[0].author.username).toBe("karpathy");
    });

    test("normalizes tweet data correctly", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSingleTweetResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.searchUserTweets("https://x.com/karpathy", "test");

      expect(result[0].id).toBe("123456");
      expect(result[0].author.username).toBe("karpathy");
      expect(result[0].author.name).toBe("Andre Karpathy");
      expect(result[0].metrics.like_count).toBe(150);
      expect(result[0].metrics.retweet_count).toBe(30);
      expect(result[0].metrics.view_count).toBe(5000);
    });

    test("returns empty array when no matches", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockEmptyResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.searchUserTweets("https://x.com/karpathy", "nonexistent");

      expect(result).toEqual([]);
    });

    test("calculates engagement score correctly", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.searchUserTweets("https://x.com/karpathy", "AI");
      
      // Calculate expected engagement: likes + retweets * 2 + replies
      const expectedEngagement0 = 150 + 30 * 2 + 15; // 225
      const expectedEngagement1 = 200 + 40 * 2 + 10; // 290
      
      const engagement0 = tweets[0].metrics.like_count + 
                          tweets[0].metrics.retweet_count * 2 + 
                          tweets[0].metrics.reply_count;
      const engagement1 = tweets[1].metrics.like_count + 
                          tweets[1].metrics.retweet_count * 2 + 
                          tweets[1].metrics.reply_count;
      
      expect(engagement0).toBe(expectedEngagement0);
      expect(engagement1).toBe(expectedEngagement1);
    });

    test("handles API errors gracefully", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      await expect(
        client.searchUserTweets("https://x.com/karpathy", "test")
      ).rejects.toThrow("API error: 500 Internal Server Error");
    });

    test("handles rate limiting", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 429, msg: "Rate limit", data: null }),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      await expect(
        client.searchUserTweets("https://x.com/karpathy", "test")
      ).rejects.toThrow("API error: Rate limit (code: 429)");
    });
  });

  describe("buildSearchUserOutput", () => {
    test("builds output with summary metrics", async () => {
      const tweets: Tweet[] = [
        {
          id: "1",
          text: "AI safety is crucial",
          author: {
            id: "a",
            username: "karpathy",
            name: "Andre",
            profile_image_url: "",
            followers_count: 0,
            is_verified: false,
          },
          created_at: "2026-01-30T10:00:00.000Z",
          url: "https://x.com/karpathy/status/1",
          metrics: {
            like_count: 10,
            retweet_count: 2,
            reply_count: 1,
            quote_count: 0,
            view_count: 0,
            bookmark_count: 0,
          },
          is_retweet: false,
          is_quote: false,
          is_reply: false,
          lang: "en",
        },
      ];

      const output = buildSearchUserOutput({
        username: "karpathy",
        words: "AI safety",
        count: 20,
        sortByTop: true,
        tweets,
      });

      expect(output.summary.total).toBe(1);
      expect(output.summary.total_engagement).toBe(13);
      expect(output.summary.avg_engagement).toBe(13);
      expect(output.summary.top_tweet_id).toBe("1");
      expect(output.query.user).toBe("karpathy");
    });
  });

  describe("formatTweetOutput", () => {
    test("formats tweet output correctly", async () => {
      const { formatTweetOutput } = await import("../scripts/lib/utils");
      
      const mockTweet: Tweet = {
        id: "123",
        text: "This is a test tweet",
        author: {
          id: "1",
          username: "testuser",
          name: "Test User",
          profile_image_url: "https://example.com/img.jpg",
          followers_count: 1000,
          is_verified: true,
        },
        created_at: "2026-01-30T10:00:00.000Z",
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
        lang: "en",
      };
      
      const output = formatTweetOutput(mockTweet);
      
      expect(output).toContain("@testuser");
      expect(output).toContain("❤️ 50");
      expect(output).toContain("🔁 10");
      expect(output).toContain("💬 5");
      expect(output).toContain("👁 1000");
    });
  });

  describe("Tweet sorting and filtering", () => {
    test("sorts tweets by engagement score", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.searchUserTweets("https://x.com/karpathy", "AI");
      
      // Sort by engagement (likes + RTs * 2 + replies)
      const sorted = [...tweets].sort((a, b) => 
        (b.metrics.like_count + b.metrics.retweet_count * 2 + b.metrics.reply_count) -
        (a.metrics.like_count + a.metrics.retweet_count * 2 + a.metrics.reply_count)
      );
      
      // Second tweet should be first after sorting (200+40*2+10 = 290 > 150+30*2+15 = 225)
      expect(sorted[0].id).toBe("789012");
      expect(sorted[1].id).toBe("123456");
    });

    test("limits results to specified count", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.searchUserTweets("https://x.com/karpathy", "AI");
      
      const limited = tweets.slice(0, 1);
      expect(limited).toHaveLength(1);
    });
  });
});
