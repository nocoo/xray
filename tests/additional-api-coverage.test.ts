import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { TwitterAPIClient } from "../scripts/lib/api";
import type { Config, Tweet, UserInfo } from "../scripts/lib/types";

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

// Mock responses
const mockUserFollowersResponse = {
  code: 201,
  msg: "ok",
  data: {
    list: [
      {
        id: "101",
        userName: "follower1",
        fullName: "Follower One",
        description: "Tech enthusiast",
        location: "SF",
        profileImage: "https://example.com/f1.jpg",
        followersCount: 5000,
        followingsCount: 200,
        statusesCount: 1000,
        likeCount: 500,
        isVerified: false,
        createdAt: "2022-01-01T00:00:00.000Z",
      },
      {
        id: "102",
        userName: "follower2",
        fullName: "Follower Two",
        description: "AI researcher",
        location: "NYC",
        profileImage: "https://example.com/f2.jpg",
        followersCount: 15000,
        followingsCount: 300,
        statusesCount: 2000,
        likeCount: 1000,
        isVerified: true,
        createdAt: "2021-01-01T00:00:00.000Z",
      },
    ],
    next: "cursor123",
  },
};

const mockUserFollowingResponse = {
  code: 201,
  msg: "ok",
  data: {
    list: [
      {
        id: "201",
        userName: "following1",
        fullName: "Following One",
        description: "ML Engineer",
        location: "Austin",
        profileImage: "https://example.com/g1.jpg",
        followersCount: 8000,
        followingsCount: 150,
        statusesCount: 800,
        likeCount: 300,
        isVerified: false,
        createdAt: "2023-01-01T00:00:00.000Z",
      },
    ],
  },
};

const mockHighlightsResponse = {
  code: 201,
  msg: "ok",
  data: {
    list: [
      {
        id: "901",
        url: "https://x.com/karpathy/status/901",
        fullText: "This is a highlight tweet about AI safety",
        createdAt: "2026-01-29T12:00:00.000Z",
        lang: "en",
        bookmarkCount: 100,
        likeCount: 5000,
        retweetCount: 1000,
        replyCount: 500,
        quoteCount: 200,
        viewCount: 200000,
        conversationId: "901",
        tweetBy: {
          id: "123",
          userName: "karpathy",
          fullName: "Andre Karpathy",
          profileImage: "https://example.com/k.jpg",
          followersCount: 500000,
          followingsCount: 100,
          statusesCount: 5000,
          likeCount: 1000,
          isVerified: true,
          createdAt: "2010-01-01T00:00:00.000Z",
        },
        entities: { hashtags: ["AI"], mentionedUsers: [], urls: [] },
      },
    ],
  },
};

const mockUserTimelineResponse = {
  code: 201,
  msg: "ok",
  data: {
    list: [
      {
        id: "801",
        url: "https://x.com/karpathy/status/801",
        fullText: "Recent tweet from timeline",
        createdAt: "2026-01-30T08:00:00.000Z",
        lang: "en",
        bookmarkCount: 10,
        likeCount: 200,
        retweetCount: 50,
        replyCount: 20,
        quoteCount: 10,
        viewCount: 10000,
        conversationId: "801",
        tweetBy: {
          id: "123",
          userName: "karpathy",
          fullName: "Andre Karpathy",
          profileImage: "https://example.com/k.jpg",
          followersCount: 500000,
          followingsCount: 100,
          statusesCount: 5000,
          likeCount: 1000,
          isVerified: true,
          createdAt: "2010-01-01T00:00:00.000Z",
        },
        entities: { hashtags: [], mentionedUsers: [], urls: [] },
      },
    ],
  },
};

const mockUserRepliesResponse = {
  code: 201,
  msg: "ok",
  data: {
    list: [
      {
        id: "701",
        url: "https://x.com/karpathy/status/701",
        fullText: "Reply to another tweet",
        createdAt: "2026-01-30T07:00:00.000Z",
        lang: "en",
        bookmarkCount: 5,
        likeCount: 100,
        retweetCount: 20,
        replyCount: 10,
        quoteCount: 5,
        viewCount: 5000,
        conversationId: "700",
        tweetBy: {
          id: "123",
          userName: "karpathy",
          fullName: "Andre Karpathy",
          profileImage: "https://example.com/k.jpg",
          followersCount: 500000,
          followingsCount: 100,
          statusesCount: 5000,
          likeCount: 1000,
          isVerified: true,
          createdAt: "2010-01-01T00:00:00.000Z",
        },
        entities: { hashtags: [], mentionedUsers: [], urls: [] },
        replyTo: "700",
      },
    ],
  },
};

const mockUserAffiliatesResponse = {
  code: 201,
  msg: "ok",
  data: {
    list: [
      {
        id: "301",
        userName: "affiliate1",
        fullName: "Affiliate One",
        profileImage: "https://example.com/a1.jpg",
        followersCount: 10000,
        followingsCount: 500,
        statusesCount: 3000,
        likeCount: 2000,
        isVerified: true,
        createdAt: "2019-01-01T00:00:00.000Z",
      },
    ],
  },
};

describe("Additional API Coverage", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("getUserFollowers", () => {
    test("fetches user followers with pagination", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockUserFollowersResponse),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getUserFollowers("https://x.com/karpathy");

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].username).toBe("follower1");
      expect(result[1].username).toBe("follower2");
    });

    test("normalizes follower data correctly", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockUserFollowersResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getUserFollowers("https://x.com/karpathy");

      expect(result[0].followers_count).toBe(5000);
      expect(result[0].is_verified).toBe(false);
      expect(result[1].followers_count).toBe(15000);
      expect(result[1].is_verified).toBe(true);
    });

    test("returns empty array for users with no followers", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 201, msg: "ok", data: { list: [] } }),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getUserFollowers("https://x.com/newuser");

      expect(result).toEqual([]);
    });
  });

  describe("getUserFollowing", () => {
    test("fetches users that this account follows", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockUserFollowingResponse),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getUserFollowing("https://x.com/karpathy");

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].username).toBe("following1");
      expect(result[0].description).toBe("ML Engineer");
    });
  });

  describe("getUserHighlights", () => {
    test("fetches highlight tweets", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockHighlightsResponse),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getUserHighlights("https://x.com/karpathy");

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("901");
      expect(result[0].metrics.like_count).toBe(5000);
    });
  });

  describe("getUserTimeline", () => {
    test("fetches user timeline tweets", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockUserTimelineResponse),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getUserTimeline("https://x.com/karpathy");

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("801");
    });
  });

  describe("getUserReplies", () => {
    test("fetches user replies", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockUserRepliesResponse),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getUserReplies("https://x.com/karpathy");

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].is_reply).toBe(true);
      expect(result[0].reply_to_id).toBe("700");
    });
  });

  describe("getUserAffiliates", () => {
    test("fetches user affiliates", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockUserAffiliatesResponse),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getUserAffiliates("https://x.com/karpathy");

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].username).toBe("affiliate1");
    });

    test("returns empty array when no affiliates", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 201, msg: "ok", data: { list: [] } }),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getUserAffiliates("https://x.com/karpathy");

      expect(result).toEqual([]);
    });
  });

  describe("User Info completeness", () => {
    test("includes all user info fields", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 201,
              msg: "ok",
              data: {
                id: "999",
                userName: "completetest",
                fullName: "Complete Test",
                description: "Test user with all fields",
                location: "Test Location",
                profileImage: "https://example.com/profile.jpg",
                profileBanner: "https://example.com/banner.jpg",
                followersCount: 9999,
                followingsCount: 999,
                statusesCount: 9999,
                likeCount: 9999,
                isVerified: true,
                createdAt: "2025-01-01T00:00:00.000Z",
                pinnedTweet: "1234567890",
              },
            }),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getUserInfo("https://x.com/completetest");

      expect(result.username).toBe("completetest");
      expect(result.description).toBe("Test user with all fields");
      expect(result.location).toBe("Test Location");
      expect(result.profile_banner_url).toBe("https://example.com/banner.jpg");
      expect(result.pinned_tweet_id).toBe("1234567890");
    });
  });

  describe("Tweet with all media types", () => {
    test("handles photo media", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 201,
              msg: "ok",
              data: {
                id: "555",
                url: "https://x.com/test/status/555",
                fullText: "Check out this photo",
                createdAt: "2026-01-30T10:00:00.000Z",
                lang: "en",
                bookmarkCount: 0,
                likeCount: 10,
                retweetCount: 2,
                replyCount: 1,
                quoteCount: 0,
                viewCount: 100,
                conversationId: "555",
                tweetBy: {
                  id: "1",
                  userName: "testuser",
                  fullName: "Test User",
                  profileImage: "https://example.com/t.jpg",
                  followersCount: 100,
                  followingsCount: 100,
                  statusesCount: 100,
                  likeCount: 100,
                  isVerified: false,
                  createdAt: "2024-01-01T00:00:00.000Z",
                },
                entities: { hashtags: [], mentionedUsers: [], urls: [] },
                media: [
                  { id: "m1", type: "PHOTO", url: "https://example.com/photo.jpg", thumbnailUrl: "https://example.com/photo_thumb.jpg" },
                ],
              },
            }),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getTweetDetails("https://x.com/test/status/555");

      expect(result.media).toBeDefined();
      expect(result.media).toHaveLength(1);
      expect(result.media![0].type).toBe("PHOTO");
      expect(result.media![0].url).toBe("https://example.com/photo.jpg");
      expect(result.media![0].thumbnail_url).toBe("https://example.com/photo_thumb.jpg");
    });

    test("handles video media", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 201,
              msg: "ok",
              data: {
                id: "666",
                url: "https://x.com/test/status/666",
                fullText: "Check out this video",
                createdAt: "2026-01-30T10:00:00.000Z",
                lang: "en",
                bookmarkCount: 0,
                likeCount: 20,
                retweetCount: 5,
                replyCount: 2,
                quoteCount: 1,
                viewCount: 500,
                conversationId: "666",
                tweetBy: {
                  id: "1",
                  userName: "testuser",
                  fullName: "Test User",
                  profileImage: "https://example.com/t.jpg",
                  followersCount: 100,
                  followingsCount: 100,
                  statusesCount: 100,
                  likeCount: 100,
                  isVerified: false,
                  createdAt: "2024-01-01T00:00:00.000Z",
                },
                entities: { hashtags: [], mentionedUsers: [], urls: [] },
                media: [
                  { id: "m2", type: "VIDEO", url: "https://example.com/video.mp4" },
                ],
              },
            }),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getTweetDetails("https://x.com/test/status/666");

      expect(result.media).toBeDefined();
      expect(result.media![0].type).toBe("VIDEO");
    });

    test("handles multiple media types", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 201,
              msg: "ok",
              data: {
                id: "777",
                url: "https://x.com/test/status/777",
                fullText: "Multiple media",
                createdAt: "2026-01-30T10:00:00.000Z",
                lang: "en",
                bookmarkCount: 0,
                likeCount: 30,
                retweetCount: 10,
                replyCount: 5,
                quoteCount: 2,
                viewCount: 1000,
                conversationId: "777",
                tweetBy: {
                  id: "1",
                  userName: "testuser",
                  fullName: "Test User",
                  profileImage: "https://example.com/t.jpg",
                  followersCount: 100,
                  followingsCount: 100,
                  statusesCount: 100,
                  likeCount: 100,
                  isVerified: false,
                  createdAt: "2024-01-01T00:00:00.000Z",
                },
                entities: { hashtags: [], mentionedUsers: [], urls: [] },
                media: [
                  { id: "m3", type: "PHOTO", url: "https://example.com/photo1.jpg" },
                  { id: "m4", type: "PHOTO", url: "https://example.com/photo2.jpg" },
                  { id: "m5", type: "GIF", url: "https://example.com/animation.gif" },
                ],
              },
            }),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getTweetDetails("https://x.com/test/status/777");

      expect(result.media).toHaveLength(3);
      const types = result.media!.map(m => m.type);
      expect(types).toContain("PHOTO");
      expect(types).toContain("GIF");
    });
  });

  describe("Quote tweets", () => {
    test("handles quoted tweet", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 201,
              msg: "ok",
              data: {
                id: "888",
                url: "https://x.com/user/status/888",
                fullText: "I agree with this!",
                createdAt: "2026-01-30T10:00:00.000Z",
                lang: "en",
                bookmarkCount: 0,
                likeCount: 50,
                retweetCount: 10,
                replyCount: 5,
                quoteCount: 0,
                viewCount: 2000,
                conversationId: "888",
                tweetBy: {
                  id: "1",
                  userName: "quoter",
                  fullName: "Quoter",
                  profileImage: "https://example.com/q.jpg",
                  followersCount: 1000,
                  followingsCount: 100,
                  statusesCount: 100,
                  likeCount: 100,
                  isVerified: false,
                  createdAt: "2023-01-01T00:00:00.000Z",
                },
                entities: { hashtags: [], mentionedUsers: [], urls: [] },
                quoted: {
                  id: "880",
                  url: "https://x.com/original/status/880",
                  fullText: "Original tweet content",
                  createdAt: "2026-01-30T09:00:00.000Z",
                  lang: "en",
                  bookmarkCount: 10,
                  likeCount: 100,
                  retweetCount: 20,
                  replyCount: 10,
                  quoteCount: 5,
                  viewCount: 5000,
                  conversationId: "880",
                  tweetBy: {
                    id: "2",
                    userName: "original",
                    fullName: "Original Author",
                    profileImage: "https://example.com/o.jpg",
                    followersCount: 5000,
                    followingsCount: 200,
                    statusesCount: 500,
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

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getTweetDetails("https://x.com/user/status/888");

      expect(result.is_quote).toBe(true);
      expect(result.quoted_tweet).toBeDefined();
      expect(result.quoted_tweet!.id).toBe("880");
      expect(result.quoted_tweet!.author.username).toBe("original");
    });
  });

  describe("Entities parsing", () => {
    test("parses hashtags correctly", async () => {
      (globalThis.fetch as unknown) = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 201,
              msg: "ok",
              data: {
                id: "999",
                url: "https://x.com/test/status/999",
                fullText: "Testing #AI and #MachineLearning",
                createdAt: "2026-01-30T10:00:00.000Z",
                lang: "en",
                bookmarkCount: 0,
                likeCount: 5,
                retweetCount: 1,
                replyCount: 0,
                quoteCount: 0,
                viewCount: 100,
                conversationId: "999",
                tweetBy: {
                  id: "1",
                  userName: "testuser",
                  fullName: "Test User",
                  profileImage: "https://example.com/t.jpg",
                  followersCount: 100,
                  followingsCount: 100,
                  statusesCount: 100,
                  likeCount: 100,
                  isVerified: false,
                  createdAt: "2024-01-01T00:00:00.000Z",
                },
                entities: {
                  hashtags: ["AI", "MachineLearning"],
                  mentionedUsers: ["@otheruser"],
                  urls: ["https://example.com"],
                },
              },
            }),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getTweetDetails("https://x.com/test/status/999");

      expect(result.entities).toBeDefined();
      expect(result.entities!.hashtags).toEqual(["AI", "MachineLearning"]);
      expect(result.entities!.mentioned_users).toEqual(["@otheruser"]);
      expect(result.entities!.urls).toEqual(["https://example.com"]);
    });
  });
});
