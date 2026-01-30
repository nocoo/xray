import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { extractTopics, buildCompetitorOutput } from "../agent/research/competitor-watch";
import type { Tweet } from "../scripts/lib/types";
import { TwitterAPIClient } from "../scripts/lib/api";
import type { Config } from "../scripts/lib/types";

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

// Mock tweets for competitor
const mockCompetitorTweets = {
  code: 201,
  msg: "ok",
  data: {
    list: [
      {
        id: "1",
        url: "https://x.com/competitor/status/1",
        fullText: "Excited to announce our new #AI product! #innovation #tech",
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        lang: "en",
        bookmarkCount: 10,
        likeCount: 500,
        retweetCount: 100,
        replyCount: 50,
        quoteCount: 20,
        viewCount: 25000,
        conversationId: "1",
        tweetBy: {
          id: "1",
          userName: "competitor",
          fullName: "Competitor Inc",
          profileImage: "https://example.com/c.jpg",
          followersCount: 100000,
          followingsCount: 100,
          statusesCount: 1000,
          likeCount: 100,
          isVerified: true,
          createdAt: "2020-01-01T00:00:00.000Z",
        },
        entities: { hashtags: ["AI", "innovation", "tech"], mentionedUsers: [], urls: [] },
      },
      {
        id: "2",
        url: "https://x.com/competitor/status/2",
        fullText: "Check out our latest blog post about #MachineLearning #AI",
        createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), // 8 hours ago
        lang: "en",
        bookmarkCount: 5,
        likeCount: 300,
        retweetCount: 60,
        replyCount: 30,
        quoteCount: 10,
        viewCount: 15000,
        conversationId: "2",
        tweetBy: {
          id: "1",
          userName: "competitor",
          fullName: "Competitor Inc",
          profileImage: "https://example.com/c.jpg",
          followersCount: 100000,
          followingsCount: 100,
          statusesCount: 1000,
          likeCount: 100,
          isVerified: true,
          createdAt: "2020-01-01T00:00:00.000Z",
        },
        entities: { hashtags: ["MachineLearning", "AI"], mentionedUsers: [], urls: [] },
      },
      {
        id: "3",
        url: "https://x.com/competitor/status/3",
        fullText: "Great feedback from our users! Thanks for the support #community",
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 24 hours ago
        lang: "en",
        bookmarkCount: 8,
        likeCount: 800,
        retweetCount: 150,
        replyCount: 80,
        quoteCount: 30,
        viewCount: 40000,
        conversationId: "3",
        tweetBy: {
          id: "1",
          userName: "competitor",
          fullName: "Competitor Inc",
          profileImage: "https://example.com/c.jpg",
          followersCount: 100000,
          followingsCount: 100,
          statusesCount: 1000,
          likeCount: 100,
          isVerified: true,
          createdAt: "2020-01-01T00:00:00.000Z",
        },
        entities: { hashtags: ["community"], mentionedUsers: [], urls: [] },
      },
    ],
  },
};

// Mock old tweets (outside time range)
const mockOldTweets = {
  code: 201,
  msg: "ok",
  data: {
    list: [
      {
        id: "100",
        url: "https://x.com/competitor/status/100",
        fullText: "Old tweet from last week #AI",
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 48 hours ago
        lang: "en",
        bookmarkCount: 1,
        likeCount: 10,
        retweetCount: 2,
        replyCount: 1,
        quoteCount: 0,
        viewCount: 500,
        conversationId: "100",
        tweetBy: {
          id: "1",
          userName: "competitor",
          fullName: "Competitor Inc",
          profileImage: "https://example.com/c.jpg",
          followersCount: 100000,
          followingsCount: 100,
          statusesCount: 1000,
          likeCount: 100,
          isVerified: true,
          createdAt: "2020-01-01T00:00:00.000Z",
        },
        entities: { hashtags: ["AI"], mentionedUsers: [], urls: [] },
      },
    ],
  },
};

describe("Competitor Watch Script", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("extractTopics function", () => {
    test("extracts hashtags from text", async () => {
      const { extractTopics } = await import("../agent/research/competitor-watch");
      
      const topics = extractTopics("Check out our new #AI product! #innovation");
      
      expect(topics).toEqual(["#ai", "#innovation"]);
    });

    test("returns empty array for no hashtags", async () => {
      const { extractTopics } = await import("../agent/research/competitor-watch");
      
      const topics = extractTopics("Just a regular tweet without hashtags");
      
      expect(topics).toEqual([]);
    });

    test("handles case insensitive hashtags", async () => {
      const { extractTopics } = await import("../agent/research/competitor-watch");
      
      const topics = extractTopics("#AI #MachineLearning #TECH");
      
      expect(topics).toEqual(["#ai", "#machinelearning", "#tech"]);
    });

    test("extracts multiple hashtags", async () => {
      const { extractTopics } = await import("../agent/research/competitor-watch");
      
      const topics = extractTopics("#AI #ML #DeepLearning #NLP #ComputerVision");
      
      expect(topics).toHaveLength(5);
    });

    test("handles empty text", async () => {
      const { extractTopics } = await import("../agent/research/competitor-watch");
      
      const topics = extractTopics("");
      
      expect(topics).toEqual([]);
    });

    test("handles text with only hashtags", async () => {
      const { extractTopics } = await import("../agent/research/competitor-watch");
      
      const topics = extractTopics("#AI #ML #AI #ML");
      
      expect(topics).toEqual(["#ai", "#ml", "#ai", "#ml"]);
    });
  });

  describe("buildCompetitorOutput", () => {
    test("builds summary for accounts", async () => {
      const tweetsByAccount: Record<string, Tweet[]> = {
        compA: [
          {
            id: "1",
            text: "hello",
            author: {
              id: "a",
              username: "compA",
              name: "Comp A",
              profile_image_url: "",
              followers_count: 0,
              is_verified: false,
            },
            created_at: "2026-01-30T10:00:00.000Z",
            url: "https://x.com/compA/status/1",
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
        ],
      };

      const output = buildCompetitorOutput({
        accounts: ["compA"],
        hours: 24,
        tweetsByAccount,
      });

      expect(output.summary[0].total).toBe(1);
      expect(output.summary[0].total_engagement).toBe(15);
      expect(output.query.hours).toBe(24);
    });
  });

  describe("fetchUserTweets API", () => {
    test("fetches user tweets successfully", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCompetitorTweets),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.fetchUserTweets("competitor");

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
      expect(result[0].author.username).toBe("competitor");
    });

    test("normalizes tweet data correctly", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCompetitorTweets),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.fetchUserTweets("competitor");
      
      const tweet = tweets[0];
      expect(tweet.id).toBe("1");
      expect(tweet.text).toContain("#AI");
      expect(tweet.metrics.like_count).toBe(500);
      expect(tweet.entities!.hashtags).toContain("AI");
    });
  });

  describe("Time filtering", () => {
    test("filters tweets within time range", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCompetitorTweets),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.fetchUserTweets("competitor");
      
      // All tweets in mockCompetitorTweets are within 24 hours
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000);
      const recentTweets = tweets.filter(t => new Date(t.created_at) >= cutoffTime);
      
      expect(recentTweets.length).toBe(3);
    });

    test("excludes old tweets outside time range", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            code: 201,
            msg: "ok",
            data: {
              list: [
                ...mockCompetitorTweets.data.list,
                ...mockOldTweets.data.list,
              ],
            },
          }),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.fetchUserTweets("competitor");
      
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000);
      const recentTweets = tweets.filter(t => new Date(t.created_at) >= cutoffTime);
      
      // Should include 3 recent tweets, exclude 1 old tweet
      expect(recentTweets.length).toBe(3);
    });
  });

  describe("Engagement calculation", () => {
    test("calculates engagement correctly", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCompetitorTweets),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.fetchUserTweets("competitor");
      
      // Tweet 1: 500 + 100*2 + 50 = 750
      const engagement1 = tweets[0].metrics.like_count + 
                         tweets[0].metrics.retweet_count * 2 + 
                         tweets[0].metrics.reply_count;
      expect(engagement1).toBe(750);
    });

    test("identifies top tweet by engagement", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCompetitorTweets),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.fetchUserTweets("competitor");
      
      let topTweet = { text: "", engagement: 0 };
      for (const tweet of tweets) {
        const engagement = tweet.metrics.like_count + 
                          tweet.metrics.retweet_count * 2 + 
                          tweet.metrics.reply_count;
        if (engagement > topTweet.engagement) {
          topTweet = { text: tweet.text, engagement };
        }
      }
      
      // Tweet 3 has 800 likes + 150*2 + 80 = 1180 (highest)
      expect(topTweet.engagement).toBe(1180);
      expect(topTweet.text).toContain("#community");
    });
  });

  describe("Statistics calculation", () => {
    test("calculates total engagement", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCompetitorTweets),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.fetchUserTweets("competitor");
      
      let totalEngagement = 0;
      for (const tweet of tweets) {
        totalEngagement += tweet.metrics.like_count + 
                          tweet.metrics.retweet_count * 2 + 
                          tweet.metrics.reply_count;
      }
      
      // Tweet 1: 750, Tweet 2: 450, Tweet 3: 1180 = 2380
      expect(totalEngagement).toBe(2380);
    });

    test("calculates average engagement", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCompetitorTweets),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.fetchUserTweets("competitor");
      
      let totalEngagement = 0;
      for (const tweet of tweets) {
        totalEngagement += tweet.metrics.like_count + 
                          tweet.metrics.retweet_count * 2 + 
                          tweet.metrics.reply_count;
      }
      const avgEngagement = Math.round(totalEngagement / tweets.length);
      
      // 2380 / 3 = 793.33 -> 793
      expect(avgEngagement).toBe(793);
    });
  });

  describe("Topic aggregation", () => {
    test("aggregates topics from all tweets", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCompetitorTweets),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.fetchUserTweets("competitor");
      
      const allTopics: string[] = [];
      for (const tweet of tweets) {
        allTopics.push(...extractTopics(tweet.text));
      }
      
      const uniqueTopics = [...new Set(allTopics)];
      
      expect(uniqueTopics).toContain("#ai");
      expect(uniqueTopics).toContain("#innovation");
      expect(uniqueTopics).toContain("#tech");
      expect(uniqueTopics).toContain("#machinelearning");
      expect(uniqueTopics).toContain("#community");
    });

    test("limits topics to specified count", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCompetitorTweets),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.fetchUserTweets("competitor");
      
      const allTopics: string[] = [];
      for (const tweet of tweets) {
        allTopics.push(...extractTopics(tweet.text));
      }
      const uniqueTopics = [...new Set(allTopics)].slice(0, 10);
      
      expect(uniqueTopics.length).toBeLessThanOrEqual(10);
    });
  });

  describe("Ranking and comparison", () => {
    test("sorts competitors by average engagement", async () => {
      const competitors = [
        { username: "compA", avgEngagement: 500 },
        { username: "compB", avgEngagement: 800 },
        { username: "compC", avgEngagement: 300 },
      ];
      
      const sorted = [...competitors].sort((a, b) => b.avgEngagement - a.avgEngagement);
      
      expect(sorted[0].username).toBe("compB");
      expect(sorted[1].username).toBe("compA");
      expect(sorted[2].username).toBe("compC");
    });

    test("identifies most active competitor", async () => {
      const competitors = [
        { username: "compA", tweetsCount: 5 },
        { username: "compB", tweetsCount: 12 },
        { username: "compC", tweetsCount: 3 },
      ];
      
      const mostActive = competitors.reduce((max, c) => 
        c.tweetsCount > max.tweetsCount ? c : max
      , competitors[0]);
      
      expect(mostActive.username).toBe("compB");
    });
  });

  describe("Error handling", () => {
    test("handles user with no tweets", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 201, msg: "ok", data: { list: [] } }),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.fetchUserTweets("newuser");
      
      expect(result).toEqual([]);
    });

    test("handles API errors gracefully", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      await expect(
        client.fetchUserTweets("nonexistent")
      ).rejects.toThrow("API error: 404 Not Found");
    });
  });
});
