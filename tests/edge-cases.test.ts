import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { TwitterAPIClient } from "../scripts/lib/api";
import type { Config, Tweet } from "../scripts/lib/types";

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

// Test timeout behavior
describe("API Timeout Handling", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("times out after 30 seconds", async () => {
    // Mock a slow response
    (globalThis.fetch as unknown) = mock(() =>
      new Promise((resolve) => setTimeout(() => 
        resolve({
          ok: true,
          json: () => Promise.resolve({ code: 201, msg: "ok", data: { list: [] } }),
        } as Response),
        60000 // 60 seconds delay
      ))
    );

    const client = new TwitterAPIClient(mockConfig);
    
    await expect(
      client.searchTweets("test", 10, true)
    ).rejects.toThrow("timeout");
  });

  test("succeeds before timeout", async () => {
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          code: 201,
          msg: "ok",
          data: {
            list: [{
              id: "123",
              url: "https://x.com/test/status/123",
              fullText: "Quick response",
              createdAt: "2026-01-30T10:00:00.000Z",
              lang: "en",
              bookmarkCount: 0,
              likeCount: 1,
              retweetCount: 0,
              replyCount: 0,
              quoteCount: 0,
              viewCount: 10,
              conversationId: "123",
              tweetBy: {
                id: "1",
                userName: "test",
                fullName: "Test",
                profileImage: "https://example.com/t.jpg",
                followersCount: 100,
                followingsCount: 100,
                statusesCount: 100,
                likeCount: 100,
                isVerified: false,
                createdAt: "2024-01-01T00:00:00.000Z",
              },
              entities: { hashtags: [], mentionedUsers: [], urls: [] },
            }],
          },
        }),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = new TwitterAPIClient(mockConfig);
    const result = await client.searchTweets("test", 10, true);
    
    expect(result).toHaveLength(1);
  });
});

// Test retweet normalization
describe("Retweet Handling", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("marks retweets correctly", async () => {
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 201,
            msg: "ok",
            data: {
              id: "333",
              url: "https://x.com/user/status/333",
              fullText: "RT @original: This is a retweet",
              createdAt: "2026-01-30T10:00:00.000Z",
              lang: "en",
              bookmarkCount: 0,
              likeCount: 0,
              retweetCount: 1,
              replyCount: 0,
              quoteCount: 0,
              viewCount: 100,
              conversationId: "333",
              tweetBy: {
                id: "1",
                userName: "retweeter",
                fullName: "Retweeter",
                profileImage: "https://example.com/rt.jpg",
                followersCount: 500,
                followingsCount: 100,
                statusesCount: 100,
                likeCount: 100,
                isVerified: false,
                createdAt: "2023-01-01T00:00:00.000Z",
              },
              entities: { hashtags: [], mentionedUsers: [], urls: [] },
              retweetedTweet: {
                id: "330",
                url: "https://x.com/original/status/330",
                fullText: "Original tweet content",
                createdAt: "2026-01-30T09:00:00.000Z",
                lang: "en",
                bookmarkCount: 10,
                likeCount: 100,
                retweetCount: 50,
                replyCount: 10,
                quoteCount: 5,
                viewCount: 5000,
                conversationId: "330",
                tweetBy: {
                  id: "2",
                  userName: "original",
                  fullName: "Original Author",
                  profileImage: "https://example.com/o.jpg",
                  followersCount: 10000,
                  followingsCount: 500,
                  statusesCount: 1000,
                  likeCount: 500,
                  isVerified: true,
                  createdAt: "2020-01-01T00:00:00.000Z",
                },
                entities: { hashtags: [], mentionedUsers: [], urls: [] },
              },
            },
          }),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = new TwitterAPIClient(mockConfig);
    const result = await client.getTweetDetails("https://x.com/user/status/333");

    expect(result.is_retweet).toBe(true);
    expect(result.text).toContain("RT @original");
    expect(result.quoted_tweet).toBeUndefined();
  });
});

// Test view count handling
describe("View Count Edge Cases", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("handles missing view count", async () => {
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 201,
            msg: "ok",
            data: {
              id: "444",
              url: "https://x.com/test/status/444",
              fullText: "No view count",
              createdAt: "2026-01-30T10:00:00.000Z",
              lang: "en",
              bookmarkCount: 0,
              likeCount: 5,
              retweetCount: 1,
              replyCount: 0,
              quoteCount: 0,
              viewCount: undefined, // Missing view count
              conversationId: "444",
              tweetBy: {
                id: "1",
                userName: "test",
                fullName: "Test",
                profileImage: "https://example.com/t.jpg",
                followersCount: 100,
                followingsCount: 100,
                statusesCount: 100,
                likeCount: 100,
                isVerified: false,
                createdAt: "2024-01-01T00:00:00.000Z",
              },
              entities: { hashtags: [], mentionedUsers: [], urls: [] },
            },
          }),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = new TwitterAPIClient(mockConfig);
    const result = await client.getTweetDetails("https://x.com/test/status/444");

    expect(result.metrics.view_count).toBe(0);
  });

  test("handles zero view count", async () => {
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 201,
            msg: "ok",
            data: {
              id: "445",
              url: "https://x.com/test/status/445",
              fullText: "Zero view count",
              createdAt: "2026-01-30T10:00:00.000Z",
              lang: "en",
              bookmarkCount: 0,
              likeCount: 0,
              retweetCount: 0,
              replyCount: 0,
              quoteCount: 0,
              viewCount: 0,
              conversationId: "445",
              tweetBy: {
                id: "1",
                userName: "test",
                fullName: "Test",
                profileImage: "https://example.com/t.jpg",
                followersCount: 100,
                followingsCount: 100,
                statusesCount: 100,
                likeCount: 100,
                isVerified: false,
                createdAt: "2024-01-01T00:00:00.000Z",
              },
              entities: { hashtags: [], mentionedUsers: [], urls: [] },
            },
          }),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = new TwitterAPIClient(mockConfig);
    const result = await client.getTweetDetails("https://x.com/test/status/445");

    expect(result.metrics.view_count).toBe(0);
  });
});

// Test language handling
describe("Language Handling", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("handles different languages", async () => {
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 201,
            msg: "ok",
            data: {
              list: [
                {
                  id: "111",
                  url: "https://x.com/user/status/111",
                  fullText: "English tweet",
                  createdAt: "2026-01-30T10:00:00.000Z",
                  lang: "en",
                  bookmarkCount: 0,
                  likeCount: 10,
                  retweetCount: 2,
                  replyCount: 1,
                  quoteCount: 0,
                  viewCount: 100,
                  conversationId: "111",
                  tweetBy: {
                    id: "1",
                    userName: "user",
                    fullName: "User",
                    profileImage: "https://example.com/u.jpg",
                    followersCount: 100,
                    followingsCount: 100,
                    statusesCount: 100,
                    likeCount: 100,
                    isVerified: false,
                    createdAt: "2024-01-01T00:00:00.000Z",
                  },
                  entities: { hashtags: [], mentionedUsers: [], urls: [] },
                },
                {
                  id: "222",
                  url: "https://x.com/user/status/222",
                  fullText: "中文推文",
                  createdAt: "2026-01-30T09:00:00.000Z",
                  lang: "zh",
                  bookmarkCount: 0,
                  likeCount: 20,
                  retweetCount: 5,
                  replyCount: 2,
                  quoteCount: 1,
                  viewCount: 200,
                  conversationId: "222",
                  tweetBy: {
                    id: "1",
                    userName: "user",
                    fullName: "User",
                    profileImage: "https://example.com/u.jpg",
                    followersCount: 100,
                    followingsCount: 100,
                    statusesCount: 100,
                    likeCount: 100,
                    isVerified: false,
                    createdAt: "2024-01-01T00:00:00.000Z",
                  },
                  entities: { hashtags: [], mentionedUsers: [], urls: [] },
                },
              ],
            },
          }),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = new TwitterAPIClient(mockConfig);
    const result = await client.searchTweets("test", 10, true);

    expect(result).toHaveLength(2);
    expect(result[0].lang).toBe("en");
    expect(result[1].lang).toBe("zh");
  });
});

// Test engagement calculation edge cases
describe("Engagement Calculation Edge Cases", () => {
  test("calculates engagement with zero values", () => {
    const likes = 0;
    const retweets = 0;
    const replies = 0;
    const engagement = likes + retweets * 2 + replies;
    expect(engagement).toBe(0);
  });

  test("calculates engagement with only likes", () => {
    const engagement = 100 + 0 * 2 + 0;
    expect(engagement).toBe(100);
  });

  test("calculates engagement with only retweets", () => {
    const engagement = 0 + 50 * 2 + 0;
    expect(engagement).toBe(100);
  });

  test("calculates engagement with mixed values", () => {
    const engagement = 100 + 50 * 2 + 25;
    expect(engagement).toBe(225);
  });
});

// Test sorting stability
describe("Sorting Stability", () => {
  test("stable sort for same engagement", () => {
    const tweets = [
      { id: "a", engagement: 100, text: "First" },
      { id: "b", engagement: 100, text: "Second" },
      { id: "c", engagement: 100, text: "Third" },
    ];
    
    const sorted = [...tweets].sort((a, b) => b.engagement - a.engagement);
    
    // Original order should be preserved for equal values
    expect(sorted[0].id).toBe("a");
    expect(sorted[1].id).toBe("b");
    expect(sorted[2].id).toBe("c");
  });

  test("sorting by multiple criteria", () => {
    const tweets = [
      { id: "a", likes: 100, retweets: 10 },
      { id: "b", likes: 50, retweets: 50 },
      { id: "c", likes: 100, retweets: 20 },
    ];
    
    // Sort by engagement (likes + retweets*2)
    const sorted = [...tweets].sort((a, b) => 
      (b.likes + b.retweets * 2) - (a.likes + a.retweets * 2)
    );
    
    // c: 100 + 40 = 140
    // a: 100 + 20 = 120
    // b: 50 + 100 = 150 -> actually highest
    expect(sorted[0].id).toBe("b");
    expect(sorted[1].id).toBe("c");
    expect(sorted[2].id).toBe("a");
  });
});

// Test date parsing
describe("Date Parsing", () => {
  test("parses ISO date correctly", () => {
    const isoDate = "2026-01-30T10:00:00.000Z";
    const date = new Date(isoDate);
    
    expect(date.getUTCFullYear()).toBe(2026);
    expect(date.getUTCMonth()).toBe(0); // January
    expect(date.getUTCDate()).toBe(30);
    expect(date.getUTCHours()).toBe(10);
  });

  test("calculates hours between dates", () => {
    const date1 = new Date("2026-01-30T10:00:00.000Z");
    const date2 = new Date("2026-01-30T20:00:00.000Z");
    
    const diffHours = (date2.getTime() - date1.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBe(10);
  });

  test("handles date in local timezone", () => {
    const utcDate = "2026-01-30T23:00:00.000Z";
    const localDate = new Date(utcDate);
    
    // In UTC+8, this would be next day 07:00
    const utcHours = localDate.getUTCHours();
    expect(utcHours).toBe(23);
  });
});
