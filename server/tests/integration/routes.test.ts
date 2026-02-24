// =============================================================================
// Integration Tests - Twitter Routes
// Tests routes through app.request() with MockTwitterProvider injected.
// No real HTTP server, no real API calls.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { createTestApp } from "./helpers/test-app";

const { app } = createTestApp();

// Helper to make requests and parse JSON
async function get(path: string) {
  const res = await app.request(path);
  const body = await res.json();
  return { status: res.status, body };
}

// =============================================================================
// Health Check
// =============================================================================

describe("GET /health", () => {
  test("returns 200 with status ok", async () => {
    const { status, body } = await get("/health");
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });
});

// =============================================================================
// GET /twitter/users/:username/tweets
// =============================================================================

describe("GET /twitter/users/:username/tweets", () => {
  test("returns tweets for a valid username", async () => {
    const { status, body } = await get("/twitter/users/alice/tweets");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    // Mock returns tweets with the queried username
    expect(body.data[0].author.username).toBe("alice");
  });

  test("respects count query parameter", async () => {
    const { status, body } = await get("/twitter/users/alice/tweets?count=5");
    expect(status).toBe(200);
    expect(body.data).toHaveLength(5);
  });

  test("rejects invalid username (special chars)", async () => {
    const { status } = await get("/twitter/users/inv@lid/tweets");
    expect(status).toBe(400);
  });

  test("rejects count out of range", async () => {
    const { status } = await get("/twitter/users/alice/tweets?count=0");
    expect(status).toBe(400);
  });

  test("rejects count above max", async () => {
    const { status } = await get("/twitter/users/alice/tweets?count=101");
    expect(status).toBe(400);
  });
});

// =============================================================================
// GET /twitter/users/:username/info
// =============================================================================

describe("GET /twitter/users/:username/info", () => {
  test("returns user info for a valid username", async () => {
    const { status, body } = await get("/twitter/users/alice/info");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.username).toBe("alice");
    expect(body.data.name).toBeDefined();
    expect(body.data.followers_count).toBeGreaterThanOrEqual(0);
  });

  test("rejects username that is too long", async () => {
    const longName = "a".repeat(16);
    const { status } = await get(`/twitter/users/${longName}/info`);
    expect(status).toBe(400);
  });
});

// =============================================================================
// GET /twitter/users/:username/search
// =============================================================================

describe("GET /twitter/users/:username/search", () => {
  test("returns search results for user tweets", async () => {
    const { status, body } = await get("/twitter/users/alice/search?q=AI");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("rejects missing query parameter", async () => {
    const { status } = await get("/twitter/users/alice/search");
    expect(status).toBe(400);
  });

  test("rejects empty query parameter", async () => {
    const { status } = await get("/twitter/users/alice/search?q=");
    expect(status).toBe(400);
  });
});

// =============================================================================
// GET /twitter/tweets/search
// =============================================================================

describe("GET /twitter/tweets/search", () => {
  test("returns global search results", async () => {
    const { status, body } = await get("/twitter/tweets/search?q=blockchain");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("accepts count and sort_by_top parameters", async () => {
    const { status, body } = await get(
      "/twitter/tweets/search?q=AI&count=5&sort_by_top=true",
    );
    expect(status).toBe(200);
    expect(body.data).toHaveLength(5);
  });

  test("rejects missing query", async () => {
    const { status } = await get("/twitter/tweets/search");
    expect(status).toBe(400);
  });
});

// =============================================================================
// GET /twitter/tweets/:id
// =============================================================================

describe("GET /twitter/tweets/:id", () => {
  test("returns tweet details by ID", async () => {
    const { status, body } = await get("/twitter/tweets/1234567890");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("1234567890");
    expect(body.data.text).toBeDefined();
    expect(body.data.author).toBeDefined();
    expect(body.data.metrics).toBeDefined();
  });
});

// =============================================================================
// GET /twitter/me/analytics
// =============================================================================

describe("GET /twitter/me/analytics", () => {
  test("returns analytics data with time series", async () => {
    const { status, body } = await get("/twitter/me/analytics");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.impressions).toBeGreaterThanOrEqual(0);
    expect(body.data.engagement_rate).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(body.data.time_series)).toBe(true);
    // Mock returns 2 time series entries
    expect(body.data.time_series.length).toBeGreaterThan(0);
    expect(body.data.time_series[0].date).toBeDefined();
  });
});

// =============================================================================
// GET /twitter/me/bookmarks
// =============================================================================

describe("GET /twitter/me/bookmarks", () => {
  test("returns bookmarked tweets", async () => {
    const { status, body } = await get("/twitter/me/bookmarks");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// GET /twitter/me/likes
// =============================================================================

describe("GET /twitter/me/likes", () => {
  test("returns liked tweets", async () => {
    const { status, body } = await get("/twitter/me/likes");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

// =============================================================================
// GET /twitter/me/lists
// =============================================================================

describe("GET /twitter/me/lists", () => {
  test("returns subscribed lists", async () => {
    const { status, body } = await get("/twitter/me/lists");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0].name).toBeDefined();
    expect(body.data[0].member_count).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// OpenAPI Spec
// =============================================================================

describe("GET /doc", () => {
  test("returns OpenAPI spec", async () => {
    const { status, body } = await get("/doc");
    expect(status).toBe(200);
    expect(body.openapi).toBe("3.0.0");
    expect(body.info.title).toBe("X-Ray API");
    expect(body.paths).toBeDefined();
  });
});

// =============================================================================
// 404 handling
// =============================================================================

describe("404 Not Found", () => {
  test("returns 404 for unknown routes", async () => {
    const { status, body } = await get("/nonexistent/route");
    expect(status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toContain("Not found");
  });
});

// =============================================================================
// Swagger UI
// =============================================================================

describe("GET /ui", () => {
  test("returns Swagger UI HTML", async () => {
    const res = await app.request("/ui");
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("text/html");
  });
});

// =============================================================================
// Error handling (simulate provider error)
// =============================================================================

describe("Error handler", () => {
  test("provider errors are mapped to correct status codes", async () => {
    // We'll create a custom app with a provider that throws
    const { createApp } = await import("../../src/app");
    const { ProviderError } = await import("../../src/providers/types");

    const failingProvider = {
      fetchUserTweets: async () => { throw new ProviderError("Rate limited", 429); },
      searchTweets: async () => [],
      getUserInfo: async () => { throw new ProviderError("Not found", 404); },
      getTweetDetails: async () => { throw new Error("Unexpected crash"); },
      searchUserTweets: async () => [],
      getUserAnalytics: async () => { throw new ProviderError("Auth required", 401); },
      getUserBookmarks: async () => [],
      getUserLikes: async () => [],
      getUserLists: async () => [],
    };

    const failApp = createApp({ twitterProvider: failingProvider as any });

    // Test ProviderError with custom status
    const r1 = await failApp.request("/twitter/users/alice/tweets");
    expect(r1.status).toBe(429);
    const b1 = await r1.json();
    expect(b1.success).toBe(false);
    expect(b1.error).toBe("Rate limited");

    // Test ProviderError 404
    const r2 = await failApp.request("/twitter/users/bob/info");
    expect(r2.status).toBe(404);

    // Test unhandled Error → 500
    const r3 = await failApp.request("/twitter/tweets/123");
    expect(r3.status).toBe(500);
    const b3 = await r3.json();
    expect(b3.error).toBe("Internal server error");

    // Test 401
    const r4 = await failApp.request("/twitter/me/analytics");
    expect(r4.status).toBe(401);
  });
});
