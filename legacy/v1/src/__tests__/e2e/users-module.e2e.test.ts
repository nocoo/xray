import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupE2E, teardownE2E, getBaseUrl, seedWebhookKey } from "./setup";

// =============================================================================
// E2E Tests — Users Module (Phase 3)
//
// Tests user search page, user profile page, connections page, and all new
// API routes (webhook + explore) for user content and connections.
// Server runs with MOCK_PROVIDER=true and E2E_SKIP_AUTH=true.
// =============================================================================

let webhookKey: string;

describe("e2e: users module", () => {
  beforeAll(async () => {
    await setupE2E();
    webhookKey = seedWebhookKey();
  }, 60_000);

  afterAll(async () => {
    await teardownE2E();
  }, 15_000);

  /** Fetch a page and return status + HTML body. */
  async function fetchPage(path: string) {
    const res = await fetch(`${getBaseUrl()}${path}`);
    const html = await res.text();
    return { status: res.status, html };
  }

  /** Fetch a webhook-authenticated API route. */
  function apiRequest(path: string): Promise<Response> {
    return fetch(`${getBaseUrl()}${path}`, {
      headers: {
        "Content-Type": "application/json",
        "x-webhook-key": webhookKey,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------------

  describe("users search page", () => {
    test("GET /users returns 200 with search UI (no longer Coming Soon)", async () => {
      const { status, html } = await fetchPage("/users");
      expect(status).toBe(200);
      expect(html).toContain("Users");
      expect(html).toContain("Enter a username");
      expect(html).not.toContain("Coming Soon");
    });
  });

  describe("user profile page", () => {
    test("GET /users/elonmusk returns 200 with profile content", async () => {
      const { status, html } = await fetchPage("/users/elonmusk");
      expect(status).toBe(200);
      expect(html).toContain("elonmusk");
      // Tab labels should be present in the HTML
      expect(html).toContain("Recent");
      expect(html).toContain("Timeline");
      expect(html).toContain("Replies");
      expect(html).toContain("Highlights");
      expect(html).toContain("Search");
      expect(html).not.toContain("Coming Soon");
    });
  });

  describe("connections page", () => {
    test("GET /users/elonmusk/connections returns 200 with tabs", async () => {
      const { status, html } = await fetchPage("/users/elonmusk/connections");
      expect(status).toBe(200);
      expect(html).toContain("Connections");
      expect(html).toContain("Followers");
      expect(html).toContain("Following");
      expect(html).toContain("Affiliates");
      expect(html).not.toContain("Coming Soon");
    });
  });

  // ---------------------------------------------------------------------------
  // Webhook API routes — user content
  // ---------------------------------------------------------------------------

  describe("webhook api: user content", () => {
    test("GET /api/twitter/users/:username/timeline returns tweets", async () => {
      const res = await apiRequest("/api/twitter/users/elonmusk/timeline");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
      // Each item should be a tweet
      expect(body.data[0].id).toBeDefined();
      expect(body.data[0].text).toBeDefined();
    });

    test("GET /api/twitter/users/:username/replies returns tweets", async () => {
      const res = await apiRequest("/api/twitter/users/elonmusk/replies");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
    });

    test("GET /api/twitter/users/:username/highlights returns tweets", async () => {
      const res = await apiRequest("/api/twitter/users/elonmusk/highlights");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Webhook API routes — user connections
  // ---------------------------------------------------------------------------

  describe("webhook api: user connections", () => {
    test("GET /api/twitter/users/:username/followers returns user list", async () => {
      const res = await apiRequest("/api/twitter/users/elonmusk/followers");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
      // Each item should be a UserInfo
      expect(body.data[0].username).toBeDefined();
      expect(body.data[0].name).toBeDefined();
    });

    test("GET /api/twitter/users/:username/following returns user list", async () => {
      const res = await apiRequest("/api/twitter/users/elonmusk/following");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data[0].username).toBeDefined();
    });

    test("GET /api/twitter/users/:username/affiliates returns user list", async () => {
      const res = await apiRequest("/api/twitter/users/elonmusk/affiliates");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data[0].username).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Auth enforcement — webhook routes require key
  // ---------------------------------------------------------------------------

  describe("webhook api: auth enforcement", () => {
    test("GET /api/twitter/users/:username/timeline returns 401 without key", async () => {
      const res = await fetch(
        `${getBaseUrl()}/api/twitter/users/elonmusk/timeline`,
        { headers: { "Content-Type": "application/json" } },
      );
      expect(res.status).toBe(401);
    });

    test("GET /api/twitter/users/:username/followers returns 401 without key", async () => {
      const res = await fetch(
        `${getBaseUrl()}/api/twitter/users/elonmusk/followers`,
        { headers: { "Content-Type": "application/json" } },
      );
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Explore API routes (session-based) — user content
  // ---------------------------------------------------------------------------

  describe("explore api: user content", () => {
    test("GET /api/explore/users/timeline returns tweets", async () => {
      const res = await fetch(
        `${getBaseUrl()}/api/explore/users/timeline?username=elonmusk`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
    });

    test("GET /api/explore/users/replies returns tweets", async () => {
      const res = await fetch(
        `${getBaseUrl()}/api/explore/users/replies?username=elonmusk`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
    });

    test("GET /api/explore/users/highlights returns tweets", async () => {
      const res = await fetch(
        `${getBaseUrl()}/api/explore/users/highlights?username=elonmusk`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
    });
  });

  // ---------------------------------------------------------------------------
  // Explore API routes (session-based) — user connections
  // ---------------------------------------------------------------------------

  describe("explore api: user connections", () => {
    test("GET /api/explore/users/followers returns user list", async () => {
      const res = await fetch(
        `${getBaseUrl()}/api/explore/users/followers?username=elonmusk`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data[0].username).toBeDefined();
    });

    test("GET /api/explore/users/following returns user list", async () => {
      const res = await fetch(
        `${getBaseUrl()}/api/explore/users/following?username=elonmusk`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
    });

    test("GET /api/explore/users/affiliates returns user list", async () => {
      const res = await fetch(
        `${getBaseUrl()}/api/explore/users/affiliates?username=elonmusk`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
    });
  });

  // ---------------------------------------------------------------------------
  // Explore API routes — validation
  // ---------------------------------------------------------------------------

  describe("explore api: validation", () => {
    test("GET /api/explore/users/timeline without username returns 400", async () => {
      const res = await fetch(
        `${getBaseUrl()}/api/explore/users/timeline`,
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("username");
    });

    test("GET /api/explore/users/followers without username returns 400", async () => {
      const res = await fetch(
        `${getBaseUrl()}/api/explore/users/followers`,
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("username");
    });
  });
});
