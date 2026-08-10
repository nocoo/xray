import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupE2E, teardownE2E, getBaseUrl } from "./setup";

// =============================================================================
// E2E Tests — Explore API Routes
//
// Verifies the 4 session-authenticated explore API routes:
//   - GET /api/explore/users?username=...
//   - GET /api/explore/users/tweets?username=...&q=...&count=...
//   - GET /api/explore/tweets?q=...&count=...&sort_by_top=...
//   - GET /api/explore/analytics
//
// Server runs with MOCK_PROVIDER=true and E2E_SKIP_AUTH=true.
// =============================================================================

describe("e2e: explore api routes", () => {
  beforeAll(async () => {
    await setupE2E();
  }, 60_000);

  afterAll(async () => {
    await teardownE2E();
  }, 15_000);

  // ---------------------------------------------------------------------------
  // GET /api/explore/users
  // ---------------------------------------------------------------------------

  describe("GET /api/explore/users", () => {
    test("returns user info for a valid username", async () => {
      const res = await fetch(`${getBaseUrl()}/api/explore/users?username=testuser`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();
      expect(json.data.username).toBe("testuser");
      expect(json.data.name).toBe("Mock testuser");
      expect(json.data.followers_count).toBeGreaterThan(0);
      expect(json.data.following_count).toBeGreaterThan(0);
      expect(json.data.profile_image_url).toBeDefined();
    });

    test("returns 400 when username is missing", async () => {
      const res = await fetch(`${getBaseUrl()}/api/explore/users`);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("username");
    });

    test("returns 400 when username is empty", async () => {
      const res = await fetch(`${getBaseUrl()}/api/explore/users?username=`);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/explore/users/tweets
  // ---------------------------------------------------------------------------

  describe("GET /api/explore/users/tweets", () => {
    test("returns tweets for a valid username", async () => {
      const res = await fetch(`${getBaseUrl()}/api/explore/users/tweets?username=testuser`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeInstanceOf(Array);
      expect(json.data.length).toBeGreaterThan(0);

      const tweet = json.data[0];
      expect(tweet.id).toBeDefined();
      expect(tweet.text).toBeDefined();
      expect(tweet.author).toBeDefined();
      expect(tweet.author.username).toBe("testuser");
    });

    test("respects count parameter", async () => {
      const res = await fetch(`${getBaseUrl()}/api/explore/users/tweets?username=testuser&count=3`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(3);
    });

    test("searches within user tweets when q is provided", async () => {
      const res = await fetch(`${getBaseUrl()}/api/explore/users/tweets?username=testuser&q=ai`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeInstanceOf(Array);
      expect(json.data.length).toBeGreaterThan(0);

      // Mock provider includes query and username in tweet text
      const tweet = json.data[0];
      expect(tweet.text.toLowerCase()).toContain("ai");
    });

    test("returns 400 when username is missing", async () => {
      const res = await fetch(`${getBaseUrl()}/api/explore/users/tweets`);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("username");
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/explore/tweets
  // ---------------------------------------------------------------------------

  describe("GET /api/explore/tweets", () => {
    test("returns search results for a valid query", async () => {
      const res = await fetch(`${getBaseUrl()}/api/explore/tweets?q=ai+agents`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeInstanceOf(Array);
      expect(json.data.length).toBeGreaterThan(0);

      const tweet = json.data[0];
      expect(tweet.id).toBeDefined();
      expect(tweet.text).toBeDefined();
      expect(tweet.author).toBeDefined();
      expect(tweet.metrics).toBeDefined();
    });

    test("respects count and sort_by_top parameters", async () => {
      const res = await fetch(`${getBaseUrl()}/api/explore/tweets?q=ai&count=2&sort_by_top=true`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);
    });

    test("returns 400 when q is missing", async () => {
      const res = await fetch(`${getBaseUrl()}/api/explore/tweets`);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("q");
    });

    test("returns 400 when q is empty", async () => {
      const res = await fetch(`${getBaseUrl()}/api/explore/tweets?q=`);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/explore/analytics
  // ---------------------------------------------------------------------------

  describe("GET /api/explore/analytics", () => {
    test("returns analytics data with time series", async () => {
      const res = await fetch(`${getBaseUrl()}/api/explore/analytics`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();

      // Verify aggregate metrics
      expect(json.data.impressions).toBeGreaterThan(0);
      expect(json.data.engagements).toBeGreaterThan(0);
      expect(json.data.engagement_rate).toBeGreaterThan(0);
      expect(json.data.likes).toBeGreaterThan(0);
      expect(json.data.retweets).toBeGreaterThan(0);
      expect(json.data.replies).toBeGreaterThan(0);
      expect(json.data.followers).toBeGreaterThan(0);

      // Verify time series
      expect(json.data.time_series).toBeInstanceOf(Array);
      expect(json.data.time_series.length).toBeGreaterThan(0);

      const entry = json.data.time_series[0];
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof entry.impressions).toBe("number");
      expect(typeof entry.engagements).toBe("number");
    });
  });
});
