import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupE2E, teardownE2E, getBaseUrl, seedWebhookKey } from "./setup";

// =============================================================================
// E2E Tests — Twitter API Routes
//
// Tests all migrated Twitter API routes against a real Next.js server
// running on port 17027 with MOCK_PROVIDER=true and E2E_SKIP_AUTH=true.
// =============================================================================

let webhookKey: string;

describe("e2e: twitter api routes", () => {
  beforeAll(async () => {
    await setupE2E();
    // Seed a webhook key directly into the E2E database
    webhookKey = seedWebhookKey();
  }, 60_000);

  afterAll(async () => {
    await teardownE2E();
  }, 15_000);

  // Helper to make authenticated requests
  function twitterRequest(
    path: string,
    key?: string,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (key) headers["x-webhook-key"] = key;
    return fetch(`${getBaseUrl()}${path}`, { headers });
  }

  // ---------------------------------------------------------------------------
  // User routes
  // ---------------------------------------------------------------------------

  describe("user routes", () => {
    test("GET /api/twitter/users/:username/tweets returns tweets", async () => {
      const res = await twitterRequest(
        "/api/twitter/users/testuser/tweets",
        webhookKey,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
    });

    test("GET /api/twitter/users/:username/tweets respects count", async () => {
      const res = await twitterRequest(
        "/api/twitter/users/testuser/tweets?count=3",
        webhookKey,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(3);
    });

    test("GET /api/twitter/users/:username/info returns user info", async () => {
      const res = await twitterRequest(
        "/api/twitter/users/testuser/info",
        webhookKey,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.username).toBe("testuser");
      expect(body.data.followers_count).toBeGreaterThan(0);
    });

    test("GET /api/twitter/users/:username/search returns results", async () => {
      const res = await twitterRequest(
        "/api/twitter/users/testuser/search?q=ai",
        webhookKey,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
    });

    test("GET /api/twitter/users/:username/search returns 400 without q", async () => {
      const res = await twitterRequest(
        "/api/twitter/users/testuser/search",
        webhookKey,
      );
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // Tweet routes
  // ---------------------------------------------------------------------------

  describe("tweet routes", () => {
    test("GET /api/twitter/tweets/search returns results", async () => {
      const res = await twitterRequest(
        "/api/twitter/tweets/search?q=ai+agents",
        webhookKey,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
    });

    test("GET /api/twitter/tweets/search returns 400 without q", async () => {
      const res = await twitterRequest(
        "/api/twitter/tweets/search",
        webhookKey,
      );
      expect(res.status).toBe(400);
    });

    test("GET /api/twitter/tweets/:id returns tweet details", async () => {
      const res = await twitterRequest(
        "/api/twitter/tweets/123456",
        webhookKey,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe("123456");
    });
  });

  // ---------------------------------------------------------------------------
  // Me routes
  // ---------------------------------------------------------------------------

  describe("me routes", () => {
    test("GET /api/twitter/me/analytics returns analytics", async () => {
      const res = await twitterRequest(
        "/api/twitter/me/analytics",
        webhookKey,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.impressions).toBeGreaterThan(0);
      expect(body.data.time_series).toBeArray();
    });

    test("GET /api/twitter/me/bookmarks returns bookmarks", async () => {
      const res = await twitterRequest(
        "/api/twitter/me/bookmarks",
        webhookKey,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
    });

    test("GET /api/twitter/me/likes returns likes", async () => {
      const res = await twitterRequest(
        "/api/twitter/me/likes",
        webhookKey,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
    });

    test("GET /api/twitter/me/lists returns lists", async () => {
      const res = await twitterRequest(
        "/api/twitter/me/lists",
        webhookKey,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Auth enforcement
  // ---------------------------------------------------------------------------

  describe("auth enforcement", () => {
    test("returns 401 without webhook key", async () => {
      const res = await twitterRequest(
        "/api/twitter/users/testuser/tweets",
      );
      expect(res.status).toBe(401);
    });

    test("returns 401 with invalid webhook key", async () => {
      const res = await twitterRequest(
        "/api/twitter/users/testuser/tweets",
        "invalid-key",
      );
      expect(res.status).toBe(401);
    });
  });
});
