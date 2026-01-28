import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { TwitterAPIClient } from "../scripts/lib/api";
import type { Config } from "../scripts/lib/types";

const mockConfig: Config = {
  api: {
    api_key: "test-api-key",
    base_url: "https://api.tweapi.io",
    cookie: "test-cookie",
  },
  settings: {
    max_tweets_per_user: 20,
  },
  classification: {
    interests: ["AI"],
    filter_retweets_without_comment: true,
  },
};

const mockConfigNoCookie: Config = {
  ...mockConfig,
  api: {
    api_key: "test-api-key",
    base_url: "https://api.tweapi.io",
  },
};

const mockTweetDetailsResponse = {
  code: 201,
  msg: "ok",
  data: {
    id: "2015179265155952807",
    url: "https://x.com/zhengli/status/2015179265155952807",
    fullText: "Test tweet content",
    createdAt: "2026-01-24T21:45:51.000Z",
    lang: "zh",
    bookmarkCount: 0,
    likeCount: 5,
    retweetCount: 2,
    replyCount: 1,
    quoteCount: 0,
    viewCount: 181,
    conversationId: "2015179265155952807",
    tweetBy: {
      id: "19098925",
      userName: "zhengli",
      fullName: "Zheng Li",
      profileImage: "https://pbs.twimg.com/profile_images/test.png",
      followersCount: 183,
      followingsCount: 737,
      statusesCount: 697,
      likeCount: 18,
      isVerified: true,
      createdAt: "2009-01-17T03:08:25.000Z",
    },
    entities: {
      hashtags: [],
      mentionedUsers: [],
      urls: [],
    },
    media: [
      {
        id: "2015179039233748992",
        type: "PHOTO" as const,
        url: "https://pbs.twimg.com/media/test.jpg",
      },
    ],
  },
};

const mockUserInfoResponse = {
  code: 201,
  msg: "ok",
  data: {
    id: "19098925",
    userName: "zhengli",
    fullName: "Zheng Li",
    description: "Test description",
    location: "Seattle",
    profileImage: "https://pbs.twimg.com/profile_images/test.png",
    profileBanner: "https://pbs.twimg.com/profile_banners/test",
    followersCount: 183,
    followingsCount: 737,
    statusesCount: 697,
    likeCount: 18,
    isVerified: true,
    createdAt: "2009-01-17T03:08:25.000Z",
  },
};

const mockTweetListResponse = {
  code: 201,
  msg: "ok",
  data: {
    list: [mockTweetDetailsResponse.data],
    next: "cursor123",
  },
};

const mockUserListResponse = {
  code: 201,
  msg: "ok",
  data: {
    list: [mockUserInfoResponse.data],
    next: "cursor123",
  },
};

const mockListsResponse = {
  code: 201,
  msg: "ok",
  data: {
    list: [
      {
        id: "1578456227805564928",
        name: "AI / Robotic",
        description: "AI Experts, Scientists & Companies",
        memberCount: 113,
        subscriberCount: 4613,
        createdAt: "2022-10-07T18:44:25.000Z",
        createdBy: "1723331",
        isFollowing: true,
        isMember: false,
      },
    ],
    next: null,
  },
};

const mockEmptyListResponse = {
  code: 201,
  msg: "ok",
  data: {
    list: [],
  },
};

describe("TwitterAPIClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("getTweetDetails", () => {
    test("sends correct request parameters", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTweetDetailsResponse),
        } as Response)
      );
      globalThis.fetch = mockFetch;

      const client = new TwitterAPIClient(mockConfig);
      await client.getTweetDetails("https://x.com/zhengli/status/123");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.tweapi.io/v1/twitter/tweet/details");
      expect(options.method).toBe("POST");
      expect(options.headers).toEqual({
        "x-api-key": "test-api-key",
        "content-type": "application/json",
      });
      expect(JSON.parse(options.body as string)).toEqual({
        url: "https://x.com/zhengli/status/123",
      });
    });

    test("normalizes response correctly", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTweetDetailsResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getTweetDetails("https://x.com/test/status/123");

      expect(result.id).toBe("2015179265155952807");
      expect(result.text).toBe("Test tweet content");
      expect(result.author.username).toBe("zhengli");
      expect(result.author.name).toBe("Zheng Li");
      expect(result.metrics.like_count).toBe(5);
      expect(result.metrics.retweet_count).toBe(2);
      expect(result.media).toHaveLength(1);
      expect(result.media![0].type).toBe("PHOTO");
    });

    test("handles API error response", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      await expect(
        client.getTweetDetails("https://x.com/test/status/123")
      ).rejects.toThrow("API error: 401 Unauthorized");
    });

    test("handles API business error", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 400,
              msg: "Invalid URL",
              data: null,
            }),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      await expect(
        client.getTweetDetails("invalid-url")
      ).rejects.toThrow("API error: Invalid URL (code: 400)");
    });
  });

  describe("getUserInfo", () => {
    test("sends correct request and normalizes response", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockUserInfoResponse),
        } as Response)
      );
      globalThis.fetch = mockFetch;

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getUserInfo("https://x.com/zhengli");

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.tweapi.io/v1/twitter/user/info");
      expect(JSON.parse(options.body as string)).toEqual({
        url: "https://x.com/zhengli",
      });

      expect(result.id).toBe("19098925");
      expect(result.username).toBe("zhengli");
      expect(result.name).toBe("Zheng Li");
      expect(result.followers_count).toBe(183);
      expect(result.following_count).toBe(737);
      expect(result.is_verified).toBe(true);
    });
  });

  describe("getTweetReplies", () => {
    test("returns array of tweets", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTweetListResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getTweetReplies("https://x.com/test/status/123");

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("2015179265155952807");
    });

    test("returns empty array when no data", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockEmptyListResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getTweetReplies("https://x.com/test/status/123");

      expect(result).toEqual([]);
    });
  });

  describe("searchTweets", () => {
    test("sends correct parameters with all options", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTweetListResponse),
        } as Response)
      );
      globalThis.fetch = mockFetch;

      const client = new TwitterAPIClient(mockConfig);
      await client.searchTweets("AI", 10, true);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(options.body as string)).toEqual({
        words: "AI",
        count: 10,
        sortByTop: true,
      });
    });

    test("sends only required parameters when optionals not provided", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTweetListResponse),
        } as Response)
      );
      globalThis.fetch = mockFetch;

      const client = new TwitterAPIClient(mockConfig);
      await client.searchTweets("AI");

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(options.body as string)).toEqual({
        words: "AI",
      });
    });
  });

  describe("getUserTimeline", () => {
    test("returns array of tweets", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTweetListResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getUserTimeline("https://x.com/zhengli");

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });
  });

  describe("getUserReplies", () => {
    test("returns array of tweets", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTweetListResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getUserReplies("https://x.com/zhengli");

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getUserFollowers", () => {
    test("returns array of user info", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockUserListResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getUserFollowers("https://x.com/zhengli");

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].username).toBe("zhengli");
    });
  });

  describe("getUserFollowing", () => {
    test("returns array of user info", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockUserListResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getUserFollowing("https://x.com/zhengli");

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getUserAffiliates", () => {
    test("returns array of user info", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockEmptyListResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getUserAffiliates("https://x.com/zhengli");

      expect(result).toEqual([]);
    });
  });

  describe("getUserHighlights", () => {
    test("returns array of tweets", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTweetListResponse),
        } as Response)
      );

      const client = new TwitterAPIClient(mockConfig);
      const result = await client.getUserHighlights("https://x.com/zhengli");

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("searchUserTweets", () => {
    test("sends correct parameters", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTweetListResponse),
        } as Response)
      );
      globalThis.fetch = mockFetch;

      const client = new TwitterAPIClient(mockConfig);
      await client.searchUserTweets("https://x.com/zhengli", "AI");

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.tweapi.io/v1/twitter/user/getUserTweetsBySearch");
      expect(JSON.parse(options.body as string)).toEqual({
        userUrl: "https://x.com/zhengli",
        words: "AI",
      });
    });
  });

  describe("Cookie-required APIs", () => {
    describe("getUserBookmarks", () => {
      test("throws error when cookie not configured", async () => {
        const client = new TwitterAPIClient(mockConfigNoCookie);
        await expect(client.getUserBookmarks()).rejects.toThrow(
          "Cookie is required for this API"
        );
      });

      test("sends cookie in request body", async () => {
        const mockFetch = mock(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockTweetListResponse),
          } as Response)
        );
        globalThis.fetch = mockFetch;

        const client = new TwitterAPIClient(mockConfig);
        await client.getUserBookmarks();

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://api.tweapi.io/v1/twitter/user/bookmarks");
        expect(JSON.parse(options.body as string)).toEqual({
          cookie: "test-cookie",
        });
      });
    });

    describe("getUserLikes", () => {
      test("throws error when cookie not configured", async () => {
        const client = new TwitterAPIClient(mockConfigNoCookie);
        await expect(client.getUserLikes()).rejects.toThrow(
          "Cookie is required for this API"
        );
      });
    });

    describe("getUserLists", () => {
      test("returns array of lists", async () => {
        globalThis.fetch = mock(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockListsResponse),
          } as Response)
        );

        const client = new TwitterAPIClient(mockConfig);
        const result = await client.getUserLists();

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("1578456227805564928");
        expect(result[0].name).toBe("AI / Robotic");
        expect(result[0].member_count).toBe(113);
      });

      test("throws error when cookie not configured", async () => {
        const client = new TwitterAPIClient(mockConfigNoCookie);
        await expect(client.getUserLists()).rejects.toThrow(
          "Cookie is required for this API"
        );
      });
    });

    describe("getUserAnalytics", () => {
      test("throws error when cookie not configured", async () => {
        const client = new TwitterAPIClient(mockConfigNoCookie);
        await expect(client.getUserAnalytics()).rejects.toThrow(
          "Cookie is required for this API"
        );
      });
    });

    describe("getInbox", () => {
      test("throws error when cookie not configured", async () => {
        const client = new TwitterAPIClient(mockConfigNoCookie);
        await expect(client.getInbox()).rejects.toThrow(
          "Cookie is required for this API"
        );
      });
    });
  });

  describe("fetchUserTweets (existing method)", () => {
    test("constructs URL correctly from username", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTweetListResponse),
        } as Response)
      );
      globalThis.fetch = mockFetch;

      const client = new TwitterAPIClient(mockConfig);
      await client.fetchUserTweets("testuser");

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.url).toBe("https://x.com/testuser");
      expect(body.showPost).toBe(true);
      expect(body.showReplies).toBe(false);
      expect(body.showLinks).toBe(true);
      expect(body.count).toBe(20);
    });
  });
});
