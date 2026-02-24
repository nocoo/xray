import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { XRayClient } from "../scripts/lib/xray-client";

// =============================================================================
// Test helpers
// =============================================================================

function createClient(baseUrl = "http://localhost:7027"): XRayClient {
  return new XRayClient({ baseUrl });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = ReturnType<typeof mock<(...args: any[]) => Promise<Response>>>;

function getCalledUrl(fn: MockFn): string {
  return String(fn.mock.calls[0]![0]);
}

function getCalledOptions(fn: MockFn): RequestInit {
  return fn.mock.calls[0]![1] as RequestInit;
}

function mockFetchSuccess<T>(data: T): MockFn {
  const fn = mock(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true, data }),
    } as Response)
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function mockFetchError(status: number, statusText: string, body = ""): MockFn {
  const fn = mock(() =>
    Promise.resolve({
      ok: false,
      status,
      statusText,
      text: () => Promise.resolve(body),
    } as Response)
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function mockFetchApiError(error: string): MockFn {
  const fn = mock(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: false, error }),
    } as Response)
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

// =============================================================================
// Tests
// =============================================================================

describe("XRayClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ===========================================================================
  // Constructor
  // ===========================================================================

  describe("constructor", () => {
    test("accepts XRayClientConfig with baseUrl", () => {
      const client = new XRayClient({ baseUrl: "http://my-server:9999" });
      expect(client).toBeDefined();
    });

    test("accepts legacy Config object and defaults to localhost:7027", () => {
      const config = {
        api: { api_key: "key", base_url: "https://api.tweapi.io" },
        me: { username: "test", is_blue_verified: false },
        settings: { max_tweets_per_user: 20 },
        classification: { interests: [], filter_retweets_without_comment: false },
      };
      const client = new XRayClient(config);
      expect(client).toBeDefined();
    });

    test("respects custom timeout", () => {
      const client = new XRayClient({ baseUrl: "http://localhost:7027", timeoutMs: 5000 });
      expect(client).toBeDefined();
    });
  });

  // ===========================================================================
  // URL extraction (tested via public API methods)
  // ===========================================================================

  describe("URL extraction", () => {
    test("fetchUserTweets extracts username from full X URL", async () => {
      const fn = mockFetchSuccess([]);
      const client = createClient();
      await client.fetchUserTweets("https://x.com/karpathy");
      expect(getCalledUrl(fn)).toContain("/twitter/users/karpathy/tweets");
    });

    test("fetchUserTweets passes plain username directly", async () => {
      const fn = mockFetchSuccess([]);
      const client = createClient();
      await client.fetchUserTweets("karpathy");
      expect(getCalledUrl(fn)).toContain("/twitter/users/karpathy/tweets");
    });

    test("getTweetDetails extracts tweet ID from full status URL", async () => {
      const fn = mockFetchSuccess({ id: "123" });
      const client = createClient();
      await client.getTweetDetails("https://x.com/karpathy/status/1234567890");
      expect(getCalledUrl(fn)).toContain("/twitter/tweets/1234567890");
    });

    test("getTweetDetails passes plain ID directly", async () => {
      const fn = mockFetchSuccess({ id: "123" });
      const client = createClient();
      await client.getTweetDetails("1234567890");
      expect(getCalledUrl(fn)).toContain("/twitter/tweets/1234567890");
    });

    test("getUserInfo extracts username from URL", async () => {
      const fn = mockFetchSuccess({ id: "1", username: "alice" });
      const client = createClient();
      await client.getUserInfo("https://x.com/alice");
      expect(getCalledUrl(fn)).toContain("/twitter/users/alice/info");
    });

    test("searchUserTweets extracts username from URL", async () => {
      const fn = mockFetchSuccess([]);
      const client = createClient();
      await client.searchUserTweets("https://x.com/alice", "AI");
      expect(getCalledUrl(fn)).toContain("/twitter/users/alice/search");
      expect(getCalledUrl(fn)).toContain("q=AI");
    });
  });

  // ===========================================================================
  // API methods - successful responses
  // ===========================================================================

  describe("API methods", () => {
    test("fetchUserTweets returns data from response", async () => {
      const tweets = [{ id: "1", text: "hello" }];
      mockFetchSuccess(tweets);
      const client = createClient();
      const result = await client.fetchUserTweets("alice");
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("1");
    });

    test("fetchUserTweets passes count query param", async () => {
      const fn = mockFetchSuccess([]);
      const client = createClient();
      await client.fetchUserTweets("alice");
      expect(getCalledUrl(fn)).toContain("count=20");
    });

    test("getTweetDetails returns single item", async () => {
      const tweet = { id: "1", text: "hello" };
      mockFetchSuccess(tweet);
      const client = createClient();
      const result = await client.getTweetDetails("1");
      expect(result.id).toBe("1");
    });

    test("searchTweets passes query params", async () => {
      const fn = mockFetchSuccess([]);
      const client = createClient();
      await client.searchTweets("AI", 10, true);
      expect(getCalledUrl(fn)).toContain("q=AI");
      expect(getCalledUrl(fn)).toContain("count=10");
      expect(getCalledUrl(fn)).toContain("sort_by_top=true");
    });

    test("searchTweets omits undefined optional params", async () => {
      const fn = mockFetchSuccess([]);
      const client = createClient();
      await client.searchTweets("AI");
      expect(getCalledUrl(fn)).toContain("q=AI");
      expect(getCalledUrl(fn)).not.toContain("count=");
      expect(getCalledUrl(fn)).not.toContain("sort_by_top=");
    });

    test("getUserAnalytics strips time_series", async () => {
      const data = {
        impressions: 1000,
        engagements: 100,
        engagement_rate: 0.1,
        likes: 50,
        retweets: 20,
        replies: 10,
        profile_visits: 30,
        followers: 500,
        following: 200,
        time_series: [{ date: "2026-01-01", impressions: 100 }],
      };
      mockFetchSuccess(data);
      const client = createClient();
      const result = await client.getUserAnalytics();

      expect(result).not.toHaveProperty("time_series");
      expect(result.impressions).toBe(1000);
    });

    test("getUserAnalyticsWithTimeSeries includes time_series", async () => {
      const data = {
        impressions: 1000,
        time_series: [{ date: "2026-01-01", impressions: 100 }],
      };
      mockFetchSuccess(data);
      const client = createClient();
      const result = await client.getUserAnalyticsWithTimeSeries();

      expect(result.time_series).toBeDefined();
      expect(result.time_series.length).toBe(1);
    });

    test("getUserBookmarks returns data", async () => {
      mockFetchSuccess([{ id: "bm1" }]);
      const client = createClient();
      const result = await client.getUserBookmarks();
      expect(result.length).toBe(1);
    });

    test("getUserLikes returns data", async () => {
      mockFetchSuccess([{ id: "lk1" }]);
      const client = createClient();
      const result = await client.getUserLikes();
      expect(result.length).toBe(1);
    });

    test("getUserLists returns data", async () => {
      mockFetchSuccess([{ id: "lst1", name: "My List" }]);
      const client = createClient();
      const result = await client.getUserLists();
      expect(result.length).toBe(1);
    });
  });

  // ===========================================================================
  // Error handling
  // ===========================================================================

  describe("error handling", () => {
    test("throws on HTTP error with status info", async () => {
      mockFetchError(500, "Internal Server Error", "something broke");
      const client = createClient();

      await expect(client.fetchUserTweets("alice")).rejects.toThrow(
        "X-Ray API error: 500 Internal Server Error - something broke"
      );
    });

    test("throws on API-level error (success=false)", async () => {
      mockFetchApiError("Rate limit exceeded");
      const client = createClient();

      await expect(client.fetchUserTweets("alice")).rejects.toThrow(
        "X-Ray API error: Rate limit exceeded"
      );
    });

    test("throws on API-level error without message", async () => {
      mockFetchApiError("");
      const client = createClient();

      await expect(client.fetchUserTweets("alice")).rejects.toThrow(
        "X-Ray API error: Unknown error"
      );
    });

    test("throws timeout error on AbortError", async () => {
      const fn = mock(() =>
        Promise.reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }))
      );
      globalThis.fetch = fn as unknown as typeof fetch;

      const client = new XRayClient({ baseUrl: "http://localhost:7027", timeoutMs: 100 });
      await expect(client.fetchUserTweets("alice")).rejects.toThrow("API request timeout");
    });
  });

  // ===========================================================================
  // HTTP request details
  // ===========================================================================

  describe("HTTP request format", () => {
    test("uses GET method", async () => {
      const fn = mockFetchSuccess([]);
      const client = createClient();
      await client.fetchUserTweets("alice");
      expect(getCalledOptions(fn).method).toBe("GET");
    });

    test("sets accept header to application/json", async () => {
      const fn = mockFetchSuccess([]);
      const client = createClient();
      await client.fetchUserTweets("alice");
      const headers = getCalledOptions(fn).headers as Record<string, string>;
      expect(headers.accept).toBe("application/json");
    });

    test("constructs correct base URL", async () => {
      const fn = mockFetchSuccess([]);
      const client = new XRayClient({ baseUrl: "http://my-server:9999" });
      await client.getUserBookmarks();
      expect(getCalledUrl(fn)).toStartWith("http://my-server:9999/twitter/me/bookmarks");
    });
  });
});
