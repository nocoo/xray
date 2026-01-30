import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { TwitterAPIClient } from "../scripts/lib/api";
import type { Config } from "../scripts/lib/types";

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

// Mock search response
const mockSearchResponse = {
  code: 201,
  msg: "ok",
  data: {
    list: [
      {
        id: "1",
        url: "https://x.com/user1/status/1",
        fullText: "This is amazing! I love this great innovation!",
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
          userName: "happyuser",
          fullName: "Happy User",
          profileImage: "https://example.com/h.jpg",
          followersCount: 10000,
          followingsCount: 100,
          statusesCount: 100,
          likeCount: 100,
          isVerified: true,
          createdAt: "2020-01-01T00:00:00.000Z",
        },
        entities: { hashtags: [], mentionedUsers: [], urls: [] },
      },
      {
        id: "2",
        url: "https://x.com/user2/status/2",
        fullText: "This is terrible. The worst experience ever. I hate it.",
        createdAt: "2026-01-30T09:00:00.000Z",
        lang: "en",
        bookmarkCount: 5,
        likeCount: 200,
        retweetCount: 40,
        replyCount: 30,
        quoteCount: 10,
        viewCount: 20000,
        conversationId: "2",
        tweetBy: {
          id: "2",
          userName: "angryuser",
          fullName: "Angry User",
          profileImage: "https://example.com/a.jpg",
          followersCount: 5000,
          followingsCount: 200,
          statusesCount: 200,
          likeCount: 200,
          isVerified: false,
          createdAt: "2019-01-01T00:00:00.000Z",
        },
        entities: { hashtags: [], mentionedUsers: [], urls: [] },
      },
      {
        id: "3",
        url: "https://x.com/user3/status/3",
        fullText: "Just announced our new product today. Check it out!",
        createdAt: "2026-01-30T08:00:00.000Z",
        lang: "en",
        bookmarkCount: 3,
        likeCount: 100,
        retweetCount: 20,
        replyCount: 10,
        quoteCount: 5,
        viewCount: 10000,
        conversationId: "3",
        tweetBy: {
          id: "3",
          userName: "neutraluser",
          fullName: "Neutral User",
          profileImage: "https://example.com/n.jpg",
          followersCount: 8000,
          followingsCount: 300,
          statusesCount: 300,
          likeCount: 300,
          isVerified: true,
          createdAt: "2018-01-01T00:00:00.000Z",
        },
        entities: { hashtags: [], mentionedUsers: [], urls: [] },
      },
      {
        id: "4",
        url: "https://x.com/user4/status/4",
        fullText: "Breaking news: market crash! Investors panic as prices fall",
        createdAt: "2026-01-30T07:00:00.000Z",
        lang: "en",
        bookmarkCount: 20,
        likeCount: 800,
        retweetCount: 200,
        replyCount: 100,
        quoteCount: 50,
        viewCount: 100000,
        conversationId: "4",
        tweetBy: {
          id: "4",
          userName: "newsuser",
          fullName: "News User",
          profileImage: "https://example.com/nw.jpg",
          followersCount: 50000,
          followingsCount: 100,
          statusesCount: 500,
          likeCount: 500,
          isVerified: true,
          createdAt: "2017-01-01T00:00:00.000Z",
        },
        entities: { hashtags: [], mentionedUsers: [], urls: [] },
      },
    ],
  },
};

// Import the analyzeSentiment function
async function getAnalyzeSentiment() {
  const module = await import("../agent/research/sentiment-analysis");
  return module.analyzeSentiment || module;
}

describe("Sentiment Analysis Script", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("analyzeSentiment function", () => {
    test("detects positive sentiment", async () => {
      const { analyzeSentiment } = await import("../agent/research/sentiment-analysis");
      
      const result = analyzeSentiment("This is amazing! I love this great innovation!", 500);
      
      expect(result.sentiment).toBe("positive");
      expect(result.score).toBeGreaterThan(0);
    });

    test("detects negative sentiment", async () => {
      const { analyzeSentiment } = await import("../agent/research/sentiment-analysis");
      
      const result = analyzeSentiment("This is terrible. The worst experience ever. I hate it.", 200);
      
      expect(result.sentiment).toBe("negative");
      expect(result.score).toBeGreaterThan(0);
    });

    test("detects neutral sentiment", async () => {
      const { analyzeSentiment } = await import("../agent/research/sentiment-analysis");
      
      const result = analyzeSentiment("Just announced our new product today. Check it out!", 100);
      
      expect(result.sentiment).toBe("neutral");
    });

    test("calculates engagement boost correctly", async () => {
      const { analyzeSentiment } = await import("../agent/research/sentiment-analysis");
      
      const lowEngagement = analyzeSentiment("Great news!", 100);
      const highEngagement = analyzeSentiment("Great news!", 1000);
      
      expect(highEngagement.score).toBeGreaterThan(lowEngagement.score);
    });

    test("handles case insensitive keywords", async () => {
      const { analyzeSentiment } = await import("../agent/research/sentiment-analysis");
      
      const upperResult = analyzeSentiment("THIS IS AMAZING!", 100);
      const mixedResult = analyzeSentiment("This Is AmAzInG!", 100);
      
      expect(upperResult.sentiment).toBe("positive");
      expect(mixedResult.sentiment).toBe("positive");
    });

    test("handles empty text", async () => {
      const { analyzeSentiment } = await import("../agent/research/sentiment-analysis");
      
      const result = analyzeSentiment("", 100);
      
      expect(result.sentiment).toBe("neutral");
    });

    test("handles text with only URLs", async () => {
      const { analyzeSentiment } = await import("../agent/research/sentiment-analysis");
      
      const result = analyzeSentiment("https://example.com", 100);
      
      expect(result.sentiment).toBe("neutral");
    });

    test("prioritizes negative over positive when both present", async () => {
      const { analyzeSentiment } = await import("../agent/research/sentiment-analysis");
      
      const result = analyzeSentiment("Great product but terrible support", 100);
      
      expect(result.sentiment).toBe("negative");
    });

    test("counts multiple positive keywords", async () => {
      const { analyzeSentiment } = await import("../agent/research/sentiment-analysis");
      
      const single = analyzeSentiment("Great product", 100);
      const multiple = analyzeSentiment("Great product amazing innovation excellent quality", 100);
      
      expect(multiple.score).toBeGreaterThan(single.score);
    });

    test("counts multiple negative keywords", async () => {
      const { analyzeSentiment } = await import("../agent/research/sentiment-analysis");
      
      const single = analyzeSentiment("Terrible experience", 100);
      const multiple = analyzeSentiment("Terrible awful horrible bad experience", 100);
      
      expect(multiple.score).toBeGreaterThan(single.score);
    });
  });

  describe("searchTweets API", () => {
    test("fetches tweets for analysis", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.searchTweets("test", 50, true);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(4);
    });

    test("calculates engagement for each tweet", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.searchTweets("test", 50, true);

      // engagement = likes + retweets * 2 + replies
      // Tweet 1: 500 + 100*2 + 50 = 750
      expect(tweets[0].metrics.like_count).toBe(500);
      expect(tweets[0].metrics.retweet_count).toBe(100);
      expect(tweets[0].metrics.reply_count).toBe(50);
    });
  });

  describe("Sentiment categorization", () => {
    test("categorizes all tweets correctly", async () => {
      const { analyzeSentiment } = await import("../agent/research/sentiment-analysis");
      
      const results = mockSearchResponse.data.list.map(t => {
        const engagement = t.likeCount + t.retweetCount * 2 + t.replyCount;
        return analyzeSentiment(t.fullText, engagement);
      });
      
      expect(results[0].sentiment).toBe("positive"); // "amazing", "love", "great"
      expect(results[1].sentiment).toBe("negative"); // "terrible", "worst", "hate"
      expect(results[2].sentiment).toBe("neutral");  // No keywords
      expect(results[3].sentiment).toBe("negative"); // "crash", "panic"
    });

    test("calculates category percentages", async () => {
      const { analyzeSentiment } = await import("../agent/research/sentiment-analysis");
      
      const results = mockSearchResponse.data.list.map(t => {
        const engagement = t.likeCount + t.retweetCount * 2 + t.replyCount;
        return analyzeSentiment(t.fullText, engagement);
      });
      
      const positive = results.filter(r => r.sentiment === "positive");
      const negative = results.filter(r => r.sentiment === "negative");
      const neutral = results.filter(r => r.sentiment === "neutral");
      
      expect(positive.length).toBe(1);
      expect(negative.length).toBe(2);
      expect(neutral.length).toBe(1);
    });
  });

  describe("Overall sentiment calculation", () => {
    test("calculates overall sentiment score correctly", async () => {
      const { analyzeSentiment } = await import("../agent/research/sentiment-analysis");
      
      const results = mockSearchResponse.data.list.map(t => {
        const engagement = t.likeCount + t.retweetCount * 2 + t.replyCount;
        return analyzeSentiment(t.fullText, engagement);
      });
      
      const positive = results.filter(r => r.sentiment === "positive").length;
      const negative = results.filter(r => r.sentiment === "negative").length;
      const neutral = results.filter(r => r.sentiment === "neutral").length;
      const total = results.length;
      
      const overallScore = (positive * 1 + neutral * 0 + negative * -1) / total;
      
      // (1 - 2 + 0) / 4 = -0.25
      expect(overallScore).toBe(-0.25);
    });

    test("determines sentiment label from score", async () => {
      const getLabel = (score: number): string => {
        if (score > 0.2) return "Positive";
        if (score > 0.1) return "Slightly Positive";
        if (score < -0.2) return "Negative";
        if (score < -0.1) return "Slightly Negative";
        return "Neutral";
      };
      
      expect(getLabel(0.5)).toBe("Positive");
      expect(getLabel(0.15)).toBe("Slightly Positive");
      expect(getLabel(-0.5)).toBe("Negative");
      expect(getLabel(-0.15)).toBe("Slightly Negative");
      expect(getLabel(0)).toBe("Neutral");
    });
  });

  describe("Edge cases", () => {
    test("handles all positive tweets", async () => {
      const { analyzeSentiment } = await import("../agent/research/sentiment-analysis");
      
      const allPositive = [
        analyzeSentiment("Great product! Love it!", 100),
        analyzeSentiment("Amazing experience!", 100),
        analyzeSentiment("Excellent service!", 100),
      ];
      
      const overallScore = allPositive.reduce((sum, r) => 
        sum + (r.sentiment === "positive" ? 1 : r.sentiment === "negative" ? -1 : 0), 0) / 3;
      
      expect(overallScore).toBe(1);
    });

    test("handles all negative tweets", async () => {
      const { analyzeSentiment } = await import("../agent/research/sentiment-analysis");
      
      const allNegative = [
        analyzeSentiment("Terrible product!", 100),
        analyzeSentiment("Hate this service!", 100),
        analyzeSentiment("Worst experience ever!", 100),
      ];
      
      const overallScore = allNegative.reduce((sum, r) => 
        sum + (r.sentiment === "positive" ? 1 : r.sentiment === "negative" ? -1 : 0), 0) / 3;
      
      expect(overallScore).toBe(-1);
    });

    test("handles single tweet", async () => {
      const { analyzeSentiment } = await import("../agent/research/sentiment-analysis");
      
      const result = analyzeSentiment("Great news!", 100);
      
      expect(result.sentiment).toBe("positive");
    });
  });
});
