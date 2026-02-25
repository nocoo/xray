import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { TweAPIProvider } from "@/lib/twitter/tweapi-provider";
import {
  UpstreamError,
  AuthRequiredError,
  TimeoutError,
  ProviderError,
} from "@/lib/twitter/errors";

// =============================================================================
// Test fixtures
// =============================================================================

const BASE_CONFIG = {
  apiKey: "test-api-key",
  baseUrl: "https://api.tweapi.io",
};

const MOCK_AUTHOR = {
  id: "123",
  userName: "testuser",
  fullName: "Test User",
  description: "A test user",
  location: "Internet",
  profileImage: "https://example.com/pic.jpg",
  profileBanner: "https://example.com/banner.jpg",
  followersCount: 100,
  followingsCount: 50,
  statusesCount: 200,
  likeCount: 500,
  isVerified: true,
  createdAt: "2020-01-01T00:00:00.000Z",
};

const MOCK_TWEET = {
  id: "tweet-1",
  url: "https://x.com/testuser/status/tweet-1",
  fullText: "Hello world",
  createdAt: "2025-01-01T12:00:00.000Z",
  lang: "en",
  bookmarkCount: 5,
  likeCount: 10,
  retweetCount: 3,
  replyCount: 2,
  quoteCount: 1,
  viewCount: 100,
  conversationId: "conv-1",
  tweetBy: MOCK_AUTHOR,
  entities: { hashtags: [], mentionedUsers: [], urls: [] },
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// =============================================================================
// Tests
// =============================================================================

describe("TweAPIProvider", () => {
  const originalFetch = globalThis.fetch;
  let provider: TweAPIProvider;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() => Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: {} })));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    provider = new TweAPIProvider(BASE_CONFIG);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ---------------------------------------------------------------------------
  // Constructor & config
  // ---------------------------------------------------------------------------

  describe("constructor", () => {
    test("uses default timeout of 30000ms", () => {
      // Implicitly tested - constructor doesn't throw
      expect(provider).toBeDefined();
    });

    test("accepts custom timeout", () => {
      const p = new TweAPIProvider({ ...BASE_CONFIG, timeoutMs: 5000 });
      expect(p).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Core HTTP helpers
  // ---------------------------------------------------------------------------

  describe("_fetch (via public methods)", () => {
    test("sends correct headers for POST requests", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 201,
            msg: "ok",
            data: MOCK_AUTHOR,
          }),
        ),
      );

      await provider.getUserInfo("testuser");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.tweapi.io/v1/twitter/user/info");
      expect(init!.method).toBe("POST");
      expect(init!.headers["x-api-key"]).toBe("test-api-key");
      expect(init!.headers["content-type"]).toBe("application/json");
    });

    test("sends correct headers for GET requests", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 200,
            msg: "ok",
            data: { remaining: 100, total: 1000 },
          }),
        ),
      );

      await provider.getCredits();

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.tweapi.io/v1/credits");
      expect(init!.method).toBe("GET");
      expect(init!.headers["x-api-key"]).toBe("test-api-key");
    });

    test("throws UpstreamError on non-ok HTTP response", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response("Server Error", { status: 500, statusText: "Internal Server Error" }),
        ),
      );

      await expect(provider.getUserInfo("testuser")).rejects.toThrow(UpstreamError);
      try {
        await provider.getUserInfo("testuser");
      } catch (err) {
        expect((err as UpstreamError).statusCode).toBe(500);
        expect((err as UpstreamError).message).toContain("500");
      }
    });

    test("throws UpstreamError when API returns unexpected code", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 400,
            msg: "Bad request",
            data: null,
          }),
        ),
      );

      await expect(provider.getUserInfo("testuser")).rejects.toThrow(UpstreamError);
      try {
        await provider.getUserInfo("testuser");
      } catch (err) {
        expect((err as UpstreamError).statusCode).toBe(502);
        expect((err as UpstreamError).message).toContain("Bad request");
      }
    });

    test("throws TimeoutError when request takes too long", async () => {
      const slowProvider = new TweAPIProvider({ ...BASE_CONFIG, timeoutMs: 50 });

      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(jsonResponse({ code: 201, msg: "ok", data: MOCK_AUTHOR })), 200)),
      );

      await expect(slowProvider.getUserInfo("testuser")).rejects.toThrow(TimeoutError);
    });

    test("throws ProviderError on network failure", async () => {
      mockFetch.mockImplementation(() => Promise.reject(new TypeError("fetch failed")));

      await expect(provider.getUserInfo("testuser")).rejects.toThrow(ProviderError);
      try {
        await provider.getUserInfo("testuser");
      } catch (err) {
        expect((err as ProviderError).message).toContain("fetch failed");
      }
    });

    test("re-throws ProviderError subclasses as-is", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(new Response("", { status: 403, statusText: "Forbidden" })),
      );

      await expect(provider.getUserInfo("testuser")).rejects.toThrow(UpstreamError);
    });
  });

  // ---------------------------------------------------------------------------
  // Public tweet endpoints
  // ---------------------------------------------------------------------------

  describe("fetchUserTweets", () => {
    test("returns normalized tweets on success", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 201,
            msg: "ok",
            data: { list: [MOCK_TWEET] },
          }),
        ),
      );

      const tweets = await provider.fetchUserTweets("testuser");
      expect(tweets).toHaveLength(1);
      expect(tweets[0]!.id).toBe("tweet-1");
      expect(tweets[0]!.text).toBe("Hello world");
      expect(tweets[0]!.author.username).toBe("testuser");
    });

    test("returns empty array when data.list is missing", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: {} })),
      );

      const tweets = await provider.fetchUserTweets("testuser");
      expect(tweets).toEqual([]);
    });

    test("passes count option in request body", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: { list: [] } })),
      );

      await provider.fetchUserTweets("testuser", { count: 50 });
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.count).toBe(50);
    });

    test("defaults count to 20", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: { list: [] } })),
      );

      await provider.fetchUserTweets("testuser");
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.count).toBe(20);
    });
  });

  describe("searchTweets", () => {
    test("returns normalized tweets on success", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 201,
            msg: "ok",
            data: { list: [MOCK_TWEET, MOCK_TWEET] },
          }),
        ),
      );

      const tweets = await provider.searchTweets("test query");
      expect(tweets).toHaveLength(2);
    });

    test("returns empty array when data.list is missing", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: {} })),
      );

      const tweets = await provider.searchTweets("test query");
      expect(tweets).toEqual([]);
    });

    test("passes count and sort_by_top options", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: { list: [] } })),
      );

      await provider.searchTweets("test", { count: 10, sort_by_top: true });
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.words).toBe("test");
      expect(body.count).toBe(10);
      expect(body.sortByTop).toBe(true);
    });

    test("omits optional fields when not provided", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: { list: [] } })),
      );

      await provider.searchTweets("test");
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.words).toBe("test");
      expect(body.count).toBeUndefined();
      expect(body.sortByTop).toBeUndefined();
    });
  });

  describe("getUserInfo", () => {
    test("returns normalized user info", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({ code: 201, msg: "ok", data: MOCK_AUTHOR }),
        ),
      );

      const user = await provider.getUserInfo("testuser");
      expect(user.username).toBe("testuser");
      expect(user.name).toBe("Test User");
      expect(user.followers_count).toBe(100);
    });
  });

  describe("getTweetDetails", () => {
    test("returns normalized tweet", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({ code: 201, msg: "ok", data: MOCK_TWEET }),
        ),
      );

      const tweet = await provider.getTweetDetails("tweet-1");
      expect(tweet.id).toBe("tweet-1");
      expect(tweet.text).toBe("Hello world");
    });

    test("sends correct URL in body", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: MOCK_TWEET })),
      );

      await provider.getTweetDetails("12345");
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.url).toBe("https://x.com/i/status/12345");
    });
  });

  describe("getTweetReplies", () => {
    test("returns normalized replies", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 201,
            msg: "ok",
            data: { list: [MOCK_TWEET] },
          }),
        ),
      );

      const replies = await provider.getTweetReplies("tweet-1");
      expect(replies).toHaveLength(1);
    });

    test("returns empty array when no replies", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: {} })),
      );

      const replies = await provider.getTweetReplies("tweet-1");
      expect(replies).toEqual([]);
    });
  });

  describe("searchUserTweets", () => {
    test("sends correct body with userUrl and words", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: { list: [] } })),
      );

      await provider.searchUserTweets("elonmusk", "SpaceX");
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.userUrl).toBe("https://x.com/elonmusk");
      expect(body.words).toBe("SpaceX");
    });

    test("returns empty array when no results", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: {} })),
      );

      const tweets = await provider.searchUserTweets("user", "query");
      expect(tweets).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // User content endpoints (API Key only)
  // ---------------------------------------------------------------------------

  describe("getUserTimeline", () => {
    test("returns normalized tweets", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({ code: 201, msg: "ok", data: { list: [MOCK_TWEET] } }),
        ),
      );

      const tweets = await provider.getUserTimeline("testuser");
      expect(tweets).toHaveLength(1);
    });

    test("returns empty array when no data", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: {} })),
      );

      const tweets = await provider.getUserTimeline("testuser");
      expect(tweets).toEqual([]);
    });
  });

  describe("getUserReplies", () => {
    test("returns normalized tweets", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({ code: 201, msg: "ok", data: { list: [MOCK_TWEET] } }),
        ),
      );

      const tweets = await provider.getUserReplies("testuser");
      expect(tweets).toHaveLength(1);
    });

    test("returns empty array when no data", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: {} })),
      );

      expect(await provider.getUserReplies("testuser")).toEqual([]);
    });
  });

  describe("getUserHighlights", () => {
    test("returns normalized tweets", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({ code: 201, msg: "ok", data: { list: [MOCK_TWEET] } }),
        ),
      );

      const tweets = await provider.getUserHighlights("testuser");
      expect(tweets).toHaveLength(1);
    });

    test("returns empty array when no data", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: {} })),
      );

      expect(await provider.getUserHighlights("testuser")).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // User connections endpoints
  // ---------------------------------------------------------------------------

  describe("getUserFollowers", () => {
    test("returns normalized user list", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 201,
            msg: "ok",
            data: { list: [MOCK_AUTHOR] },
          }),
        ),
      );

      const users = await provider.getUserFollowers("testuser");
      expect(users).toHaveLength(1);
      expect(users[0]!.username).toBe("testuser");
    });

    test("returns empty array when no data", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: {} })),
      );

      expect(await provider.getUserFollowers("testuser")).toEqual([]);
    });
  });

  describe("getUserFollowing", () => {
    test("returns normalized user list", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 201,
            msg: "ok",
            data: { list: [MOCK_AUTHOR] },
          }),
        ),
      );

      const users = await provider.getUserFollowing("testuser");
      expect(users).toHaveLength(1);
    });

    test("returns empty array when no data", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: {} })),
      );

      expect(await provider.getUserFollowing("testuser")).toEqual([]);
    });
  });

  describe("getUserAffiliates", () => {
    test("returns normalized user list", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 201,
            msg: "ok",
            data: { list: [MOCK_AUTHOR] },
          }),
        ),
      );

      const users = await provider.getUserAffiliates("testuser");
      expect(users).toHaveLength(1);
    });

    test("returns empty array when no data", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: {} })),
      );

      expect(await provider.getUserAffiliates("testuser")).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Authenticated endpoints (cookie required)
  // ---------------------------------------------------------------------------

  describe("requireCookie", () => {
    test("throws AuthRequiredError when no cookie is set", async () => {
      await expect(provider.getUserAnalytics()).rejects.toThrow(AuthRequiredError);
      await expect(provider.getUserBookmarks()).rejects.toThrow(AuthRequiredError);
      await expect(provider.getUserLikes()).rejects.toThrow(AuthRequiredError);
      await expect(provider.getUserLists()).rejects.toThrow(AuthRequiredError);
      await expect(provider.getInbox()).rejects.toThrow(AuthRequiredError);
      await expect(provider.getConversation("conv-1")).rejects.toThrow(AuthRequiredError);
    });
  });

  describe("getUserAnalytics", () => {
    test("returns normalized analytics with cookie", async () => {
      const authProvider = new TweAPIProvider({ ...BASE_CONFIG, cookie: "auth_token=abc" });

      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 201,
            msg: "ok",
            data: {
              createdAt: "2025-01-01",
              followers: 1000,
              impressions: 5000,
              profileVisits: 200,
              engagements: 300,
            },
          }),
        ),
      );

      const analytics = await authProvider.getUserAnalytics();
      expect(analytics.followers).toBe(1000);
      expect(analytics.impressions).toBe(5000);
    });

    test("sends cookie in request body", async () => {
      const authProvider = new TweAPIProvider({ ...BASE_CONFIG, cookie: "auth_token=abc" });

      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 201,
            msg: "ok",
            data: {
              createdAt: "2025-01-01",
              followers: 0,
              impressions: 0,
              profileVisits: 0,
              engagements: 0,
            },
          }),
        ),
      );

      await authProvider.getUserAnalytics();
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.cookie).toBe("auth_token=abc");
    });
  });

  describe("getUserBookmarks", () => {
    test("returns normalized bookmarks with cookie", async () => {
      const authProvider = new TweAPIProvider({ ...BASE_CONFIG, cookie: "auth_token=abc" });

      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 201,
            msg: "ok",
            data: { list: [MOCK_TWEET] },
          }),
        ),
      );

      const bookmarks = await authProvider.getUserBookmarks();
      expect(bookmarks).toHaveLength(1);
    });

    test("returns empty array when no bookmarks", async () => {
      const authProvider = new TweAPIProvider({ ...BASE_CONFIG, cookie: "auth_token=abc" });

      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: {} })),
      );

      expect(await authProvider.getUserBookmarks()).toEqual([]);
    });
  });

  describe("getUserLikes", () => {
    test("returns normalized likes with cookie", async () => {
      const authProvider = new TweAPIProvider({ ...BASE_CONFIG, cookie: "auth_token=abc" });

      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 201,
            msg: "ok",
            data: { list: [MOCK_TWEET] },
          }),
        ),
      );

      const likes = await authProvider.getUserLikes();
      expect(likes).toHaveLength(1);
    });

    test("returns empty array when no likes", async () => {
      const authProvider = new TweAPIProvider({ ...BASE_CONFIG, cookie: "auth_token=abc" });

      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: {} })),
      );

      expect(await authProvider.getUserLikes()).toEqual([]);
    });
  });

  describe("getUserLists", () => {
    test("returns normalized lists with cookie", async () => {
      const authProvider = new TweAPIProvider({ ...BASE_CONFIG, cookie: "auth_token=abc" });

      const mockList = {
        id: "list-1",
        name: "My List",
        description: "A test list",
        memberCount: 10,
        subscriberCount: 5,
        createdAt: "2025-01-01",
        createdBy: "testuser",
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 201,
            msg: "ok",
            data: { list: [mockList] },
          }),
        ),
      );

      const lists = await authProvider.getUserLists();
      expect(lists).toHaveLength(1);
      expect(lists[0]!.name).toBe("My List");
    });

    test("returns empty array when no lists", async () => {
      const authProvider = new TweAPIProvider({ ...BASE_CONFIG, cookie: "auth_token=abc" });

      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: {} })),
      );

      expect(await authProvider.getUserLists()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Messages endpoints (cookie required)
  // ---------------------------------------------------------------------------

  describe("getInbox", () => {
    test("returns normalized inbox items with cookie", async () => {
      const authProvider = new TweAPIProvider({ ...BASE_CONFIG, cookie: "auth_token=abc" });

      const mockInboxItem = {
        conversationId: "conv-1",
        lastMessage: {
          id: "msg-1",
          text: "Hello!",
          senderId: "123",
          recipientId: "456",
          createdAt: "2025-01-01T12:00:00.000Z",
        },
        participants: [MOCK_AUTHOR],
        unreadCount: 2,
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 201,
            msg: "ok",
            data: { list: [mockInboxItem] },
          }),
        ),
      );

      const inbox = await authProvider.getInbox();
      expect(inbox).toHaveLength(1);
      expect(inbox[0]!.conversation_id).toBe("conv-1");
    });

    test("returns empty array when no messages", async () => {
      const authProvider = new TweAPIProvider({ ...BASE_CONFIG, cookie: "auth_token=abc" });

      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: 201, msg: "ok", data: {} })),
      );

      expect(await authProvider.getInbox()).toEqual([]);
    });
  });

  describe("getConversation", () => {
    test("returns normalized conversation with cookie", async () => {
      const authProvider = new TweAPIProvider({ ...BASE_CONFIG, cookie: "auth_token=abc" });

      const mockConversation = {
        conversationId: "conv-1",
        messages: [
          {
            id: "msg-1",
            text: "Hello!",
            senderId: "123",
            recipientId: "456",
            createdAt: "2025-01-01T12:00:00.000Z",
          },
        ],
        participants: [MOCK_AUTHOR],
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 201,
            msg: "ok",
            data: mockConversation,
          }),
        ),
      );

      const conversation = await authProvider.getConversation("conv-1");
      expect(conversation.conversation_id).toBe("conv-1");
      expect(conversation.messages).toHaveLength(1);
    });

    test("sends conversationId in body", async () => {
      const authProvider = new TweAPIProvider({ ...BASE_CONFIG, cookie: "auth_token=abc" });

      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 201,
            msg: "ok",
            data: {
              conversationId: "conv-42",
              messages: [],
              participants: [],
            },
          }),
        ),
      );

      await authProvider.getConversation("conv-42");
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.conversationId).toBe("conv-42");
      expect(body.cookie).toBe("auth_token=abc");
    });
  });

  // ---------------------------------------------------------------------------
  // Credits endpoints (GET, API Key only)
  // ---------------------------------------------------------------------------

  describe("getCredits", () => {
    test("returns normalized credits", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 200,
            msg: "ok",
            data: { remaining: 500, total: 1000, expiresAt: "2026-12-31" },
          }),
        ),
      );

      const credits = await provider.getCredits();
      expect(credits.remaining).toBe(500);
      expect(credits.total).toBe(1000);
    });

    test("uses GET method", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 200,
            msg: "ok",
            data: { remaining: 0, total: 0 },
          }),
        ),
      );

      await provider.getCredits();
      const [, init] = mockFetch.mock.calls[0]!;
      expect(init!.method).toBe("GET");
    });
  });

  describe("getCreditsUsage", () => {
    test("returns normalized usage records", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 200,
            msg: "ok",
            data: {
              list: [
                { date: "2025-01-01", endpoint: "/v1/tweet", creditsUsed: 10, requestCount: 5 },
              ],
            },
          }),
        ),
      );

      const usage = await provider.getCreditsUsage();
      expect(usage).toHaveLength(1);
      expect(usage[0]!.endpoint).toBe("/v1/tweet");
    });

    test("uses GET method", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            code: 200,
            msg: "ok",
            data: { list: [] },
          }),
        ),
      );

      await provider.getCreditsUsage();
      const [, init] = mockFetch.mock.calls[0]!;
      expect(init!.method).toBe("GET");
    });
  });
});
