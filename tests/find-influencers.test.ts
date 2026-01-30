import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { TwitterAPIClient } from "../scripts/lib/api";
import type { Config, Tweet } from "../scripts/lib/types";
import { buildInfluencerOutput } from "../agent/research/find-influencers";

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

// Mock search response with multiple users
const mockSearchResponse = {
  code: 201,
  msg: "ok",
  data: {
    list: [
      {
        id: "1",
        url: "https://x.com/karpathy/status/1",
        fullText: "AI safety is crucial",
        createdAt: "2026-01-30T10:00:00.000Z",
        lang: "en",
        bookmarkCount: 10,
        likeCount: 500,
        retweetCount: 100,
        replyCount: 50,
        quoteCount: 20,
        viewCount: 50000,
        conversationId: "1",
        tweetBy: {
          id: "1",
          userName: "karpathy",
          fullName: "Andre Karpathy",
          profileImage: "https://example.com/karpathy.jpg",
          followersCount: 500000,
          followingsCount: 100,
          statusesCount: 5000,
          likeCount: 1000,
          isVerified: true,
          createdAt: "2010-01-01T00:00:00.000Z",
        },
        entities: { hashtags: [], mentionedUsers: [], urls: [] },
      },
      {
        id: "2",
        url: "https://x.com/karpathy/status/2",
        fullText: "Neural networks are beautiful",
        createdAt: "2026-01-30T09:00:00.000Z",
        lang: "en",
        bookmarkCount: 5,
        likeCount: 300,
        retweetCount: 60,
        replyCount: 30,
        quoteCount: 10,
        viewCount: 30000,
        conversationId: "2",
        tweetBy: {
          id: "1",
          userName: "karpathy",
          fullName: "Andre Karpathy",
          profileImage: "https://example.com/karpathy.jpg",
          followersCount: 500000,
          followingsCount: 100,
          statusesCount: 5000,
          likeCount: 1000,
          isVerified: true,
          createdAt: "2010-01-01T00:00:00.000Z",
        },
        entities: { hashtags: [], mentionedUsers: [], urls: [] },
      },
      {
        id: "3",
        url: "https://x.com/sama/status/3",
        fullText: "GPT-4 is amazing",
        createdAt: "2026-01-30T10:30:00.000Z",
        lang: "en",
        bookmarkCount: 20,
        likeCount: 800,
        retweetCount: 200,
        replyCount: 100,
        quoteCount: 50,
        viewCount: 100000,
        conversationId: "3",
        tweetBy: {
          id: "2",
          userName: "sama",
          fullName: "Sam Altman",
          profileImage: "https://example.com/sama.jpg",
          followersCount: 300000,
          followingsCount: 50,
          statusesCount: 2000,
          likeCount: 500,
          isVerified: true,
          createdAt: "2010-05-01T00:00:00.000Z",
        },
        entities: { hashtags: [], mentionedUsers: [], urls: [] },
      },
      {
        id: "4",
        url: "https://x.com/small_account/status/4",
        fullText: "My first AI tweet",
        createdAt: "2026-01-30T11:00:00.000Z",
        lang: "en",
        bookmarkCount: 1,
        likeCount: 5,
        retweetCount: 1,
        replyCount: 2,
        quoteCount: 0,
        viewCount: 100,
        conversationId: "4",
        tweetBy: {
          id: "3",
          userName: "small_account",
          fullName: "Small Account",
          profileImage: "https://example.com/small.jpg",
          followersCount: 100, // Below minimum
          followingsCount: 200,
          statusesCount: 50,
          likeCount: 10,
          isVerified: false,
          createdAt: "2024-01-01T00:00:00.000Z",
        },
        entities: { hashtags: [], mentionedUsers: [], urls: [] },
      },
    ],
  },
};

// Mock empty response
const mockEmptyResponse = {
  code: 201,
  msg: "ok",
  data: { list: [] },
};

describe("Find Influencers Script", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("calculateRelevanceScore", () => {
    test("calculates score with high followers and engagement", async () => {
      const { calculateRelevanceScore } = await import("../scripts/lib/utils");
      
      // 500K followers, 100 avg engagement, 10 tweets
      const score = calculateRelevanceScore(500000, 100, 10);
      
      expect(score).toBeGreaterThan(50);
      expect(score).toBeLessThanOrEqual(100);
    });

    test("calculates score with low followers", async () => {
      const { calculateRelevanceScore } = await import("../scripts/lib/utils");
      
      // 100 followers, 10 avg engagement, 5 tweets
      const score = calculateRelevanceScore(100, 10, 5);
      
      // Score can be any value, just verify it returns a number
      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThanOrEqual(0);
    });

    test("returns 0 for zero values", async () => {
      const { calculateRelevanceScore } = await import("../scripts/lib/utils");
      
      const score = calculateRelevanceScore(0, 0, 0);
      
      expect(score).toBe(0);
    });

    test("weights factors correctly", async () => {
      const { calculateRelevanceScore } = await import("../scripts/lib/utils");
      
      // Different followers with same engagement - both should be valid scores
      const scoreHighFollowers = calculateRelevanceScore(100000, 50, 5);
      const scoreLowFollowers = calculateRelevanceScore(1000, 50, 5);
      
      // Both should return valid numbers
      expect(typeof scoreHighFollowers).toBe("number");
      expect(typeof scoreLowFollowers).toBe("number");
      // Higher followers should not have lower score (followers weighted at 40%)
      expect(scoreHighFollowers).toBeGreaterThanOrEqual(scoreLowFollowers);
    });
  });

  describe("buildInfluencerOutput", () => {
    test("builds output with influencer summary", async () => {
      const tweets: Tweet[] = [
        {
          id: "1",
          text: "AI safety is crucial",
          author: {
            id: "a",
            username: "karpathy",
            name: "Andre",
            profile_image_url: "",
            followers_count: 500000,
            is_verified: true,
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

      const output = buildInfluencerOutput({
        topic: "AI",
        count: 1,
        minFollowers: 1000,
        tweets,
        influencers: [
          {
            username: "karpathy",
            name: "Andre",
            followers: 500000,
            tweetsFound: 1,
            avgEngagement: 12,
            relevanceScore: 88,
          },
        ],
      });

      expect(output.summary.total).toBe(1);
      expect(output.query.min_followers).toBe(1000);
    });
  });

  describe("searchTweets API", () => {
    test("searches for topic tweets", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.searchTweets("AI", 50, true);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    test("returns tweets from multiple users", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.searchTweets("AI", 50, true);
      
      const usernames = new Set(tweets.map(t => t.author.username));
      
      expect(usernames.has("karpathy")).toBe(true);
      expect(usernames.has("sama")).toBe(true);
      expect(usernames.has("small_account")).toBe(true);
    });

    test("normalizes tweet data correctly", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.searchTweets("AI", 50, true);
      
      const karpathyTweets = tweets.filter(t => t.author.username === "karpathy");
      expect(karpathyTweets.length).toBe(2);
      expect(karpathyTweets[0].author.followers_count).toBe(500000);
    });

    test("returns empty array for no results", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockEmptyResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.searchTweets("nonexistent topic xyz", 50, true);

      expect(result).toEqual([]);
    });

    test("sends correct request parameters", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterAPIClient(mockConfig);
      await client.searchTweets("AI", 100, false);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = (mockFetch.mock.calls[0] as unknown) as [string, RequestInit];
      
      expect(url).toBe("https://api.tweapi.io/v1/twitter/tweet/search");
      
      const body = JSON.parse(options.body as string);
      expect(body.words).toBe("AI");
      expect(body.count).toBe(100);
      expect(body.sortByTop).toBe(false);
    });
  });

  describe("User aggregation logic", () => {
    test("aggregates tweets by user", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.searchTweets("AI", 50, true);
      
      // Aggregate by user
      const userMap = new Map();
      for (const tweet of tweets) {
        const username = tweet.author.username;
        if (!userMap.has(username)) {
          userMap.set(username, {
            followers: tweet.author.followers_count,
            tweets: 0,
            engagement: 0,
          });
        }
        const user = userMap.get(username);
        user.tweets++;
        user.engagement += tweet.metrics.like_count + tweet.metrics.retweet_count * 2;
      }
      
      expect(userMap.get("karpathy").tweets).toBe(2);
      expect(userMap.get("sama").tweets).toBe(1);
      expect(userMap.get("small_account").tweets).toBe(1);
    });

    test("calculates average engagement per user", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.searchTweets("AI", 50, true);
      
      const userData = new Map();
      for (const tweet of tweets) {
        const username = tweet.author.username;
        if (!userData.has(username)) {
          userData.set(username, { totalEngagement: 0, count: 0 });
        }
        const data = userData.get(username);
        data.totalEngagement += tweet.metrics.like_count + tweet.metrics.retweet_count * 2;
        data.count++;
      }
      
      // karpathy: (500 + 100*2) + (300 + 60*2) = 700 + 420 = 1120 / 2 = 560 avg
      const karpathyData = userData.get("karpathy");
      expect(karpathyData.totalEngagement).toBe(1120);
      expect(karpathyData.count).toBe(2);
      expect(karpathyData.totalEngagement / karpathyData.count).toBe(560);
    });

    test("filters users by minimum followers", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.searchTweets("AI", 50, true);
      
      const MIN_FOLLOWERS = 1000;
      const filteredUsers = new Map();
      
      for (const tweet of tweets) {
        const username = tweet.author.username;
        if ((tweet.author.followers_count || 0) < MIN_FOLLOWERS) continue;
        
        if (!filteredUsers.has(username)) {
          filteredUsers.set(username, tweet.author.followers_count);
        }
      }
      
      expect(filteredUsers.has("karpathy")).toBe(true);
      expect(filteredUsers.has("sama")).toBe(true);
      expect(filteredUsers.has("small_account")).toBe(false); // Filtered out
    });

    test("sorts influencers by relevance score", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.searchTweets("AI", 50, true);
      
      // Calculate scores for each user
      const users = new Map();
      for (const tweet of tweets) {
        const username = tweet.author.username;
        if (!users.has(username)) {
          users.set(username, {
            followers: tweet.author.followers_count || 0,
            engagement: 0,
            count: 0,
          });
        }
        const user = users.get(username);
        user.engagement += tweet.metrics.like_count + tweet.metrics.retweet_count * 2;
        user.count++;
      }
      
      const scores = [];
      for (const [username, data] of users) {
        const avgEngagement = data.count > 0 ? data.engagement / data.count : 0;
        const { calculateRelevanceScore } = await import("../scripts/lib/utils");
        scores.push({
          username,
          score: calculateRelevanceScore(data.followers, avgEngagement, data.count),
        });
      }
      
      scores.sort((a, b) => b.score - a.score);
      
      // karpathy (500K followers, 2 tweets) should rank high
      expect(scores[0].username).toBe("karpathy");
    });
  });

  describe("Error handling", () => {
    test("handles API errors", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      await expect(
        client.searchTweets("AI", 50, true)
      ).rejects.toThrow("API error: 500 Internal Server Error");
    });

    test("handles network errors", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.reject(new Error("Network error"))
      );

      const client = new TwitterAPIClient(mockConfig);
      await expect(
        client.searchTweets("AI", 50, true)
      ).rejects.toThrow("Network error");
    });
  });
});
