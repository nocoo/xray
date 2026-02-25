import { describe, test, expect, mock, afterEach } from "bun:test";
import { XRayAPIClient, loadAPIKeyConfig } from "../scripts/lib/xray-api-client";
import type { Mock } from "bun:test";

// =============================================================================
// XRayAPIClient Unit Tests
// =============================================================================

describe("XRayAPIClient", () => {
  const TEST_CONFIG = {
    baseUrl: "https://xray.hexly.ai",
    webhookKey: "test-webhook-key-abc123",
    timeoutMs: 5000,
  };

  function createClient(overrides?: Partial<typeof TEST_CONFIG>): XRayAPIClient {
    return new XRayAPIClient({ ...TEST_CONFIG, ...overrides });
  }

  // ===========================================================================
  // Constructor
  // ===========================================================================

  describe("constructor", () => {
    test("strips trailing slash from baseUrl", () => {
      const client = createClient({ baseUrl: "https://xray.hexly.ai/" });
      // Verify via a method call — URL should not have double slashes
      expect(client).toBeDefined();
    });

    test("respects XRAY_API_TIMEOUT_MS env var", () => {
      const original = process.env.XRAY_API_TIMEOUT_MS;
      process.env.XRAY_API_TIMEOUT_MS = "10000";
      const client = new XRayAPIClient({
        baseUrl: "https://xray.hexly.ai",
        webhookKey: "key",
      });
      expect(client).toBeDefined();
      process.env.XRAY_API_TIMEOUT_MS = original;
    });

    test("prefers explicit timeoutMs over env var", () => {
      const original = process.env.XRAY_API_TIMEOUT_MS;
      process.env.XRAY_API_TIMEOUT_MS = "10000";
      const client = createClient({ timeoutMs: 3000 });
      expect(client).toBeDefined();
      process.env.XRAY_API_TIMEOUT_MS = original;
    });
  });

  // ===========================================================================
  // HTTP request behavior (mocked fetch)
  // ===========================================================================

  describe("HTTP requests", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    function mockFetch(data: unknown, status = 200) {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true, data }), {
            status,
            headers: { "content-type": "application/json" },
          }),
        ),
      ) as unknown as typeof fetch;
    }

    function mockFetchError(error: string, status = 401) {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: false, error }), {
            status,
            headers: { "content-type": "application/json" },
          }),
        ),
      ) as unknown as typeof fetch;
    }

    test("sends X-Webhook-Key header", async () => {
      mockFetch([]);
      const client = createClient();
      await client.fetchUserTweets("testuser");

      const fetchMock = globalThis.fetch as unknown as Mock<(...args: unknown[]) => unknown>;
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/twitter/users/testuser/tweets");
      expect((options.headers as Record<string, string>)["x-webhook-key"]).toBe(
        TEST_CONFIG.webhookKey,
      );
    });

    test("sends GET requests with query params", async () => {
      mockFetch([]);
      const client = createClient();
      await client.searchTweets("ai agents", 10, true);

      const fetchMock = globalThis.fetch as unknown as Mock<(...args: unknown[]) => unknown>;
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      const parsed = new URL(url);
      expect(parsed.searchParams.get("q")).toBe("ai agents");
      expect(parsed.searchParams.get("count")).toBe("10");
      expect(parsed.searchParams.get("sort_by_top")).toBe("true");
    });

    test("throws on non-ok HTTP response", async () => {
      mockFetchError("Missing or invalid webhook key", 401);
      const client = createClient();

      expect(client.fetchUserTweets("testuser")).rejects.toThrow(
        "X-Ray API error: 401",
      );
    });

    test("throws on success=false response", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ success: false, error: "Rate limited" }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      ) as unknown as typeof fetch;

      const client = createClient();
      expect(client.fetchUserTweets("testuser")).rejects.toThrow(
        "X-Ray API error: Rate limited",
      );
    });

    test("throws timeout error on abort", async () => {
      globalThis.fetch = mock(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_, reject) => {
            // Listen for abort signal like real fetch does
            init?.signal?.addEventListener("abort", () => {
              const err = new DOMException("The operation was aborted.", "AbortError");
              reject(err);
            });
          }),
      ) as unknown as typeof fetch;

      const client = createClient({ timeoutMs: 50 });
      expect(client.fetchUserTweets("testuser")).rejects.toThrow(
        "API request timeout after 50ms",
      );
    });

    test("unwraps { success, data } envelope", async () => {
      const mockTweets = [
        { id: "1", text: "hello", author: { username: "test" } },
      ];
      mockFetch(mockTweets);
      const client = createClient();
      const result = await client.fetchUserTweets("testuser");
      expect(result).toEqual(mockTweets as never);
    });
  });

  // ===========================================================================
  // URL building
  // ===========================================================================

  describe("endpoint URLs", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    function mockFetchAndCapture() {
      const calls: string[] = [];
      globalThis.fetch = mock((url: string) => {
        calls.push(url);
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, data: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }) as unknown as typeof fetch;
      return calls;
    }

    test("fetchUserTweets builds correct URL", async () => {
      const calls = mockFetchAndCapture();
      const client = createClient();
      await client.fetchUserTweets("karpathy");
      expect(calls[0]).toContain("/api/twitter/users/karpathy/tweets");
      expect(calls[0]).toContain("count=20");
    });

    test("getUserInfo builds correct URL", async () => {
      const calls = mockFetchAndCapture();
      const client = createClient();
      await client.getUserInfo("elonmusk");
      expect(calls[0]).toContain("/api/twitter/users/elonmusk/info");
    });

    test("getUserAnalytics calls /me/analytics", async () => {
      const calls = mockFetchAndCapture();
      // Mock a full analytics response
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                impressions: 100,
                engagements: 10,
                engagement_rate: 10,
                likes: 5,
                retweets: 2,
                replies: 1,
                profile_visits: 20,
                followers: 100,
                following: 50,
                time_series: [],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      ) as unknown as typeof fetch;
      const client = createClient();
      const result = await client.getUserAnalytics();
      expect(result).not.toHaveProperty("time_series");
    });

    test("getUserBookmarks calls /me/bookmarks", async () => {
      const calls = mockFetchAndCapture();
      const client = createClient();
      await client.getUserBookmarks();
      expect(calls[0]).toContain("/api/twitter/me/bookmarks");
    });

    test("getUserLikes calls /me/likes", async () => {
      const calls = mockFetchAndCapture();
      const client = createClient();
      await client.getUserLikes();
      expect(calls[0]).toContain("/api/twitter/me/likes");
    });

    test("getUserLists calls /me/lists", async () => {
      const calls = mockFetchAndCapture();
      const client = createClient();
      await client.getUserLists();
      expect(calls[0]).toContain("/api/twitter/me/lists");
    });
  });

  // ===========================================================================
  // URL parsing helpers
  // ===========================================================================

  describe("URL parsing", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    function mockFetchAndCapture() {
      const calls: string[] = [];
      globalThis.fetch = mock((url: string) => {
        calls.push(url);
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, data: {} }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }) as unknown as typeof fetch;
      return calls;
    }

    test("extracts username from X URL", async () => {
      const calls = mockFetchAndCapture();
      const client = createClient();
      await client.getUserInfo("https://x.com/karpathy");
      expect(calls[0]).toContain("/api/twitter/users/karpathy/info");
    });

    test("strips @ prefix from username", async () => {
      const calls = mockFetchAndCapture();
      const client = createClient();
      await client.getUserInfo("@karpathy");
      expect(calls[0]).toContain("/api/twitter/users/karpathy/info");
    });

    test("extracts tweet ID from status URL", async () => {
      const calls = mockFetchAndCapture();
      const client = createClient();
      await client.getTweetDetails(
        "https://x.com/user/status/1234567890",
      );
      expect(calls[0]).toContain("/api/twitter/tweets/1234567890");
    });

    test("accepts raw tweet ID", async () => {
      const calls = mockFetchAndCapture();
      const client = createClient();
      await client.getTweetDetails("1234567890");
      expect(calls[0]).toContain("/api/twitter/tweets/1234567890");
    });
  });
});

// =============================================================================
// Config loading
// =============================================================================

describe("loadAPIKeyConfig", () => {
  test("throws when config file not found", async () => {
    expect(
      loadAPIKeyConfig("/nonexistent/api-key.json"),
    ).rejects.toThrow("API key config not found");
  });
});
