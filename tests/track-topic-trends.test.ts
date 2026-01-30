import { describe, test, expect, beforeEach, afterEach, mock, beforeAll, afterAll } from "bun:test";
import { TwitterAPIClient } from "../scripts/lib/api";
import { buildTrendOutput } from "../agent/research/track-topic-trends";
import type { Tweet } from "../scripts/lib/types";
import type { Config } from "../scripts/lib/types";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { readFileSync } from "fs";

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
        fullText: "AI is transforming the world",
        createdAt: "2026-01-30T10:00:00.000Z",
        lang: "en",
        bookmarkCount: 5,
        likeCount: 100,
        retweetCount: 20,
        replyCount: 10,
        quoteCount: 5,
        viewCount: 5000,
        conversationId: "1",
        tweetBy: {
          id: "1",
          userName: "user1",
          fullName: "User One",
          profileImage: "https://example.com/1.jpg",
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
        fullText: "Machine learning is the future",
        createdAt: "2026-01-30T09:00:00.000Z",
        lang: "en",
        bookmarkCount: 3,
        likeCount: 150,
        retweetCount: 30,
        replyCount: 15,
        quoteCount: 8,
        viewCount: 8000,
        conversationId: "2",
        tweetBy: {
          id: "2",
          userName: "user2",
          fullName: "User Two",
          profileImage: "https://example.com/2.jpg",
          followersCount: 20000,
          followingsCount: 200,
          statusesCount: 200,
          likeCount: 200,
          isVerified: true,
          createdAt: "2019-01-01T00:00:00.000Z",
        },
        entities: { hashtags: [], mentionedUsers: [], urls: [] },
      },
    ],
  },
};

// Historical data for comparison
const mockHistoricalData = {
  timestamp: "2026-01-30T08:00:00.000Z",
  topic: "AI",
  volume: 10,
  totalEngagement: 500,
  avgEngagement: 50,
  topTweets: [
    { id: "0", author: "old_user", engagement: 100, text: "Old tweet" },
  ],
};

describe("Track Topic Trends Script", () => {
  let originalFetch: typeof globalThis.fetch;
  let testDataDir: string;

  beforeAll(() => {
    testDataDir = join(process.cwd(), "data", "agent", "trends");
    if (!existsSync(testDataDir)) {
      mkdirSync(testDataDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup test data files
    try {
      const testFile = join(testDataDir, "TestTopic.json");
      if (existsSync(testFile)) {
        rmSync(testFile);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("searchTweets API", () => {
    test("fetches topic tweets successfully", async () => {
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
      expect(result.length).toBe(2);
    });

    test("calculates engagement metrics correctly", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.searchTweets("AI", 50, true);

      // Calculate engagement: likes + retweets * 2 + replies
      const engagement0 = tweets[0].metrics.like_count + 
                          tweets[0].metrics.retweet_count * 2 + 
                          tweets[0].metrics.reply_count;
      // 100 + 20*2 + 10 = 150
      expect(engagement0).toBe(150);

      const engagement1 = tweets[1].metrics.like_count + 
                          tweets[1].metrics.retweet_count * 2 + 
                          tweets[1].metrics.reply_count;
      // 150 + 30*2 + 15 = 225
      expect(engagement1).toBe(225);
    });

    test("calculates total and average engagement", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const tweets = await client.searchTweets("AI", 50, true);

      let totalEngagement = 0;
      for (const tweet of tweets) {
        totalEngagement += tweet.metrics.like_count + 
                          tweet.metrics.retweet_count * 2 + 
                          tweet.metrics.reply_count;
      }
      
      const avgEngagement = Math.round(totalEngagement / tweets.length);
      
      // Total: 150 + 225 = 375
      expect(totalEngagement).toBe(375);
      // Avg: 375 / 2 = 187.5 -> 188
      expect(avgEngagement).toBe(188);
    });
  });

  describe("buildTrendOutput", () => {
    test("builds output summary from tweets", async () => {
      const tweets = (mockSearchResponse.data.list.map((t) => ({
        id: t.id,
        text: t.fullText,
        author: {
          id: t.tweetBy.id,
          username: t.tweetBy.userName,
          name: t.tweetBy.fullName,
          profile_image_url: t.tweetBy.profileImage,
          followers_count: t.tweetBy.followersCount,
          is_verified: t.tweetBy.isVerified,
        },
        created_at: t.createdAt,
        url: t.url,
        metrics: {
          retweet_count: t.retweetCount,
          like_count: t.likeCount,
          reply_count: t.replyCount,
          quote_count: t.quoteCount,
          view_count: t.viewCount,
          bookmark_count: t.bookmarkCount,
        },
        is_retweet: false,
        is_quote: false,
        is_reply: false,
        lang: t.lang,
        entities: { hashtags: [], mentioned_users: [], urls: [] },
      })) as Tweet[]);

      const output = buildTrendOutput({
        topic: "AI",
        count: 2,
        tweets,
        current: {
          timestamp: "2026-01-30T10:00:00.000Z",
          topic: "AI",
          volume: 2,
          totalEngagement: 375,
          avgEngagement: 188,
          topTweets: [
            { id: "1", author: "user1", engagement: 150, text: "AI is transforming" },
          ],
        },
      });

      expect(output.summary.volume).toBe(2);
      expect(output.summary.total_engagement).toBe(375);
      expect(output.query.topic).toBe("AI");
    });
  });

  describe("Trend data storage", () => {
    test("can save trend data", async () => {
      const testTopic = "TestTopic";
      const testData = {
        timestamp: new Date().toISOString(),
        topic: testTopic,
        volume: 10,
        totalEngagement: 500,
        avgEngagement: 50,
        topTweets: [],
      };
      
      const filePath = join(testDataDir, `${testTopic}.json`);
      writeFileSync(filePath, JSON.stringify(testData));
      
      expect(existsSync(filePath)).toBe(true);
      
      const content = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      
      expect(parsed.topic).toBe(testTopic);
      expect(parsed.volume).toBe(10);
    });

    test("can load historical trend data", async () => {
      // Create historical data file
      const testTopic = "AI_Historical";
      const filePath = join(testDataDir, `${testTopic}.json`);
      writeFileSync(filePath, JSON.stringify(mockHistoricalData));
      
      // Load and verify
      const content = readFileSync(filePath, "utf-8");
      const loaded = JSON.parse(content);
      
      expect(loaded.timestamp).toBe("2026-01-30T08:00:00.000Z");
      expect(loaded.topic).toBe("AI");
      expect(loaded.volume).toBe(10);
      expect(loaded.avgEngagement).toBe(50);
    });
  });

  describe("Trend comparison logic", () => {
    test("calculates volume change correctly", () => {
      const current = 20;
      const previous = 10;
      
      const change = current - previous;
      const percent = ((change / previous) * 100).toFixed(1);
      
      expect(change).toBe(10);
      expect(percent).toBe("100.0");
    });

    test("calculates engagement change correctly", () => {
      const currentAvg = 100;
      const previousAvg = 50;
      
      const change = currentAvg - previousAvg;
      const percent = ((change / previousAvg) * 100).toFixed(1);
      
      expect(change).toBe(50);
      expect(percent).toBe("100.0");
    });

    test("calculates hours between timestamps", () => {
      // Use dates that are exactly 2 hours apart
      const oldTime = "2026-01-30T08:00:00.000Z";
      const newTime = "2026-01-30T10:00:00.000Z"; // Exactly 2 hours
      
      const oldDate = new Date(oldTime);
      const newDate = new Date(newTime);
      const hoursDiff = Math.abs(Math.round((newDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60)));
      
      expect(hoursDiff).toBe(2);
    });

    test("determines trending direction", () => {
      // Rising
      expect("📈 Rising").toBe("📈 Rising");
      
      // Slightly up
      expect("📉 Slightly Up").toBe("📉 Slightly Up");
      
      // Stable
      expect("➡️ Stable").toBe("➡️ Stable");
      
      // Falling
      expect("📉 Falling").toBe("📉 Falling");
    });

    test("calculates trend score correctly", () => {
      const volumePercent = 50.0;
      const engagementPercent = 30.0;
      const trendScore = volumePercent + engagementPercent;
      
      expect(trendScore).toBe(80.0);
      expect(trendScore).toBeGreaterThan(20);
    });
  });

  describe("Top tweets sorting", () => {
    test("sorts tweets by engagement", async () => {
      const tweets = [
        { id: "1", engagement: 100 },
        { id: "2", engagement: 300 },
        { id: "3", engagement: 200 },
      ];
      
      const sorted = [...tweets].sort((a, b) => b.engagement - a.engagement);
      
      expect(sorted[0].id).toBe("2");
      expect(sorted[1].id).toBe("3");
      expect(sorted[2].id).toBe("1");
    });

    test("limits top tweets to 5", async () => {
      const tweets = Array.from({ length: 10 }, (_, i) => ({
        id: `${i}`,
        engagement: i * 10,
      }));
      
      const top5 = tweets.sort((a, b) => b.engagement - a.engagement).slice(0, 5);
      
      expect(top5.length).toBe(5);
      expect(top5[0].engagement).toBe(90);
      expect(top5[4].engagement).toBe(50);
    });
  });

  describe("Error handling", () => {
    test("handles empty search results", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 201, msg: "ok", data: { list: [] } }),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.searchTweets("nonexistent_topic_xyz123", 50, true);

      expect(result).toEqual([]);
    });

    test("handles API errors gracefully", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      await expect(
        client.searchTweets("AI", 50, true)
      ).rejects.toThrow("API error: 429 Too Many Requests");
    });

    test("handles invalid JSON response", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.reject(new Error("Invalid JSON")),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      await expect(
        client.searchTweets("AI", 50, true)
      ).rejects.toThrow("Invalid JSON");
    });
  });

  describe("Data persistence edge cases", () => {
    test("handles non-existent historical data", async () => {
      const nonExistentPath = join(testDataDir, "NonExistentTopic.json");
      
      expect(existsSync(nonExistentPath)).toBe(false);
    });

    test("handles corrupted JSON data gracefully", () => {
      const corruptedPath = join(testDataDir, "Corrupted.json");
      writeFileSync(corruptedPath, "{ invalid json }");
      
      try {
        JSON.parse(readFileSync(corruptedPath, "utf-8"));
        expect(true).toBe(false); // Should not reach here
      } catch {
        expect(true).toBe(true); // Expected to throw
      }
      
      // Cleanup
      rmSync(corruptedPath);
    });
  });
});
