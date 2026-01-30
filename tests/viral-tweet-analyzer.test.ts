import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
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

// Mock viral tweets
const mockViralTweets = {
  code: 201,
  msg: "ok",
  data: {
    list: [
      {
        id: "1",
        url: "https://x.com/influencer/status/1",
        fullText: "BREAKING: Major announcement! Our new product is finally here! 🚀 #AI #Innovation #Launch",
        createdAt: "2026-01-30T10:00:00.000Z",
        lang: "en",
        bookmarkCount: 100,
        likeCount: 10000,
        retweetCount: 5000,
        replyCount: 2000,
        quoteCount: 500,
        viewCount: 500000,
        conversationId: "1",
        tweetBy: {
          id: "1",
          userName: "influencer",
          fullName: "Big Influencer",
          profileImage: "https://example.com/i.jpg",
          followersCount: 500000,
          followingsCount: 100,
          statusesCount: 1000,
          likeCount: 100,
          isVerified: true,
          createdAt: "2018-01-01T00:00:00.000Z",
        },
        entities: {
          hashtags: ["AI", "Innovation", "Launch"],
          mentionedUsers: [],
          urls: [],
        },
        media: [{ id: "m1", type: "PHOTO", url: "https://example.com/img.jpg" }],
      },
      {
        id: "2",
        url: "https://x.com/techblog/status/2",
        fullText: "Just published our deep dive into transformer architecture. Check it out!",
        createdAt: "2026-01-30T09:00:00.000Z",
        lang: "en",
        bookmarkCount: 50,
        likeCount: 2000,
        retweetCount: 400,
        replyCount: 150,
        quoteCount: 100,
        viewCount: 100000,
        conversationId: "2",
        tweetBy: {
          id: "2",
          userName: "techblog",
          fullName: "Tech Blog",
          profileImage: "https://example.com/tb.jpg",
          followersCount: 50000,
          followingsCount: 200,
          statusesCount: 2000,
          likeCount: 200,
          isVerified: true,
          createdAt: "2019-01-01T00:00:00.000Z",
        },
        entities: {
          hashtags: [],
          mentionedUsers: [],
          urls: ["https://blog.example.com/transformers"],
        },
      },
      {
        id: "3",
        url: "https://x.com/normaluser/status/3",
        fullText: "I think AI will change everything. What do you think?",
        createdAt: "2026-01-30T08:00:00.000Z",
        lang: "en",
        bookmarkCount: 5,
        likeCount: 100,
        retweetCount: 20,
        replyCount: 80,
        quoteCount: 10,
        viewCount: 5000,
        conversationId: "3",
        tweetBy: {
          id: "3",
          userName: "normaluser",
          fullName: "Normal User",
          profileImage: "https://example.com/n.jpg",
          followersCount: 500,
          followingsCount: 500,
          statusesCount: 100,
          likeCount: 100,
          isVerified: false,
          createdAt: "2023-01-01T00:00:00.000Z",
        },
        entities: { hashtags: [], mentionedUsers: [], urls: [] },
      },
    ],
  },
};

describe("Viral Tweet Analyzer Script", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("calculateViralityScore function", () => {
    test("calculates high score for viral tweet", async () => {
      const { calculateViralityScore } = await import("../agent/research/viral-tweet-analyzer");
      
      const score = calculateViralityScore({
        likes: 10000,
        retweets: 5000,
        replies: 2000,
        views: 500000,
        followers: 500000,
        hasMedia: true,
        hasLink: false,
        hasHashtags: 3,
      });
      
      expect(score).toBeGreaterThan(50);
    });

    test("calculates lower score for normal tweet", async () => {
      const { calculateViralityScore } = await import("../agent/research/viral-tweet-analyzer");
      
      const score = calculateViralityScore({
        likes: 100,
        retweets: 20,
        replies: 10,
        views: 5000,
        followers: 500,
        hasMedia: false,
        hasLink: false,
        hasHashtags: 0,
      });
      
      expect(score).toBeLessThan(50);
    });

    test("gives bonus for high RT ratio", async () => {
      const { calculateViralityScore } = await import("../agent/research/viral-tweet-analyzer");
      
      const highRTScore = calculateViralityScore({
        likes: 1000,
        retweets: 600, // 60% RT ratio
        replies: 100,
        views: 50000,
        followers: 10000,
        hasMedia: false,
        hasLink: false,
        hasHashtags: 0,
      });
      
      const lowRTScore = calculateViralityScore({
        likes: 1000,
        retweets: 50, // 5% RT ratio
        replies: 100,
        views: 50000,
        followers: 10000,
        hasMedia: false,
        hasLink: false,
        hasHashtags: 0,
      });
      
      expect(highRTScore).toBeGreaterThan(lowRTScore);
    });

    test("gives bonus for media", async () => {
      const { calculateViralityScore } = await import("../agent/research/viral-tweet-analyzer");
      
      const withMedia = calculateViralityScore({
        likes: 1000,
        retweets: 200,
        replies: 100,
        views: 50000,
        followers: 10000,
        hasMedia: true,
        hasLink: false,
        hasHashtags: 0,
      });
      
      const withoutMedia = calculateViralityScore({
        likes: 1000,
        retweets: 200,
        replies: 100,
        views: 50000,
        followers: 10000,
        hasMedia: false,
        hasLink: false,
        hasHashtags: 0,
      });
      
      expect(withMedia).toBeGreaterThan(withoutMedia);
    });

    test("handles zero views", async () => {
      const { calculateViralityScore } = await import("../agent/research/viral-tweet-analyzer");
      
      const score = calculateViralityScore({
        likes: 100,
        retweets: 20,
        replies: 10,
        views: 0,
        followers: 1000,
        hasMedia: false,
        hasLink: false,
        hasHashtags: 0,
      });
      
      expect(score).toBe(0); // Division by zero protection
    });
  });

  describe("identifyViralFactors function", () => {
    test("identifies high engagement rate", async () => {
      const { identifyViralFactors } = await import("../agent/research/viral-tweet-analyzer");
      
      const factors = identifyViralFactors({
        likes: 10000,
        retweets: 5000,
        replies: 2000,
        views: 100000, // 17% engagement rate
        followers: 500000,
        hasMedia: true,
        hasLink: false,
        hasHashtags: 3,
        text: "Great news!",
      });
      
      expect(factors.some(f => f.includes("engagement rate"))).toBe(true);
    });

    test("identifies high RT ratio", async () => {
      const { identifyViralFactors } = await import("../agent/research/viral-tweet-analyzer");
      
      const factors = identifyViralFactors({
        likes: 1000,
        retweets: 600, // 60% RT ratio
        replies: 100,
        views: 50000,
        followers: 10000,
        hasMedia: false,
        hasLink: false,
        hasHashtags: 0,
        text: "Check this out!",
      });
      
      expect(factors.some(f => f.includes("RT ratio") || f.includes("shareability"))).toBe(true);
    });

    test("identifies discussion-sparking content", async () => {
      const { identifyViralFactors } = await import("../agent/research/viral-tweet-analyzer");
      
      const factors = identifyViralFactors({
        likes: 100,
        retweets: 20,
        replies: 40, // 40% reply ratio
        views: 5000,
        followers: 500,
        hasMedia: false,
        hasLink: false,
        hasHashtags: 0,
        text: "What do you think about AI?",
      });
      
      expect(factors.some(f => f.includes("discussion") || f.includes("conversation"))).toBe(true);
    });

    test("identifies media presence", async () => {
      const { identifyViralFactors } = await import("../agent/research/viral-tweet-analyzer");
      
      const factors = identifyViralFactors({
        likes: 1000,
        retweets: 200,
        replies: 100,
        views: 50000,
        followers: 10000,
        hasMedia: true,
        hasLink: false,
        hasHashtags: 0,
        text: "Check out this image!",
      });
      
      expect(factors.some(f => f.includes("Visual content"))).toBe(true);
    });

    test("identifies hashtag usage", async () => {
      const { identifyViralFactors } = await import("../agent/research/viral-tweet-analyzer");
      
      const factors = identifyViralFactors({
        likes: 1000,
        retweets: 200,
        replies: 100,
        views: 50000,
        followers: 10000,
        hasMedia: false,
        hasLink: false,
        hasHashtags: 3,
        text: "Great #AI #ML #Tech news!",
      });
      
      expect(factors.some(f => f.includes("hashtag"))).toBe(true);
    });

    test("identifies text patterns", async () => {
      const { identifyViralFactors } = await import("../agent/research/viral-tweet-analyzer");
      
      const factors = identifyViralFactors({
        likes: 1000,
        retweets: 200,
        replies: 100,
        views: 50000,
        followers: 10000,
        hasMedia: false,
        hasLink: false,
        hasHashtags: 0,
        text: "BREAKING NEWS! Something amazing happened!",
      });
      
      expect(factors.some(f => f.includes("Breaking") || f.includes("exciting"))).toBe(true);
    });

    test("identifies question engagement", async () => {
      const { identifyViralFactors } = await import("../agent/research/viral-tweet-analyzer");
      
      const factors = identifyViralFactors({
        likes: 1000,
        retweets: 200,
        replies: 100,
        views: 50000,
        followers: 10000,
        hasMedia: false,
        hasLink: false,
        hasHashtags: 0,
        text: "What do you think about this?",
      });
      
      expect(factors.some(f => f.includes("Questions engage"))).toBe(true);
    });

    test("identifies large following", async () => {
      const { identifyViralFactors } = await import("../agent/research/viral-tweet-analyzer");
      
      const factors = identifyViralFactors({
        likes: 1000,
        retweets: 200,
        replies: 100,
        views: 50000,
        followers: 150000,
        hasMedia: false,
        hasLink: false,
        hasHashtags: 0,
        text: "Just a tweet",
      });
      
      expect(factors.some(f => f.includes("Large audience"))).toBe(true);
    });
  });

  describe("searchTweets API", () => {
    test("fetches tweets sorted by engagement", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockViralTweets),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.searchTweets("AI", 20, true);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
    });

    test("normalizes viral tweet data", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockViralTweets),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.searchTweets("AI", 20, true);
      
      const tweet = tweets[0];
      expect(tweet.id).toBe("1");
      expect(tweet.author.username).toBe("influencer");
      expect(tweet.metrics.like_count).toBe(10000);
      expect(tweet.metrics.view_count).toBe(500000);
      expect(tweet.media).toHaveLength(1);
    });
  });

  describe("Ranking and analysis", () => {
    test("ranks tweets by virality score", async () => {
      const { calculateViralityScore } = await import("../agent/research/viral-tweet-analyzer");
      
      const tweets = [
        { likes: 10000, retweets: 5000, replies: 2000, views: 500000, followers: 500000, hasMedia: true, hasLink: false, hasHashtags: 3, text: "Great!" },
        { likes: 100, retweets: 20, replies: 10, views: 5000, followers: 500, hasMedia: false, hasLink: false, hasHashtags: 0, text: "Ok" },
        { likes: 2000, retweets: 400, replies: 150, views: 100000, followers: 50000, hasMedia: false, hasLink: true, hasHashtags: 0, text: "Check this!" },
      ];
      
      const ranked = tweets.map((t, i) => ({
        id: i,
        score: calculateViralityScore(t),
      })).sort((a, b) => b.score - a.score);
      
      expect(ranked[0].id).toBe(0); // Most viral
      expect(ranked[2].id).toBe(1); // Least viral
    });

    test("calculates average virality correctly", async () => {
      const { calculateViralityScore } = await import("../agent/research/viral-tweet-analyzer");
      
      const tweets = [
        { likes: 10000, retweets: 5000, replies: 2000, views: 500000, followers: 500000, hasMedia: true, hasLink: false, hasHashtags: 3, text: "Great!" },
        { likes: 100, retweets: 20, replies: 10, views: 5000, followers: 500, hasMedia: false, hasLink: false, hasHashtags: 0, text: "Ok" },
      ];
      
      const scores = tweets.map(t => calculateViralityScore(t));
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      
      expect(avg).toBeGreaterThan(0);
    });

    test("aggregates common viral factors", async () => {
      const { identifyViralFactors } = await import("../agent/research/viral-tweet-analyzer");
      
      const tweets = [
        { likes: 10000, retweets: 5000, replies: 2000, views: 500000, followers: 500000, hasMedia: true, hasLink: false, hasHashtags: 3, text: "Great!" },
        { likes: 2000, retweets: 400, replies: 150, views: 100000, followers: 50000, hasMedia: true, hasLink: false, hasHashtags: 2, text: "Also great!" },
      ];
      
      const allFactors: string[] = [];
      for (const tweet of tweets) {
        allFactors.push(...identifyViralFactors(tweet));
      }
      
      const factorCounts = new Map<string, number>();
      for (const factor of allFactors) {
        factorCounts.set(factor, (factorCounts.get(factor) || 0) + 1);
      }
      
      // Media should be common
      expect(factorCounts.get("📸 Visual content")).toBe(2);
    });
  });

  describe("Edge cases", () => {
    test("handles tweet with no engagement", async () => {
      const { calculateViralityScore, identifyViralFactors } = await import("../agent/research/viral-tweet-analyzer");
      
      const score = calculateViralityScore({
        likes: 0,
        retweets: 0,
        replies: 0,
        views: 0,
        followers: 100,
        hasMedia: false,
        hasLink: false,
        hasHashtags: 0,
        text: "",
      });
      
      expect(score).toBe(0);
      
      const factors = identifyViralFactors({
        likes: 0,
        retweets: 0,
        replies: 0,
        views: 0,
        followers: 100,
        hasMedia: false,
        hasLink: false,
        hasHashtags: 0,
        text: "",
      });
      
      expect(factors.length).toBe(0);
    });

    test("handles very high engagement rate", async () => {
      const { calculateViralityScore } = await import("../agent/research/viral-tweet-analyzer");
      
      const score = calculateViralityScore({
        likes: 50000,
        retweets: 25000,
        replies: 10000,
        views: 100000, // 95% engagement rate
        followers: 1000000,
        hasMedia: true,
        hasLink: true,
        hasHashtags: 5,
        text: "INSANE!",
      });
      
      expect(score).toBeGreaterThan(100);
    });
  });
});
