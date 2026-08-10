import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupE2E, teardownE2E, getBaseUrl, seedWebhookKey } from "./setup";

// =============================================================================
// E2E Tests — Tweets Module (Phase 2)
//
// Tests tweet search page, tweet detail page, and new API routes.
// Server runs with MOCK_PROVIDER=true and E2E_SKIP_AUTH=true.
// =============================================================================

let webhookKey: string;

describe("e2e: tweets module", () => {
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

  describe("tweets search page", () => {
    test("GET /tweets returns 200 with search UI (no longer Coming Soon)", async () => {
      const { status, html } = await fetchPage("/tweets");
      expect(status).toBe(200);
      expect(html).toContain("Tweets");
      expect(html).toContain("Search tweets");
      expect(html).not.toContain("Coming Soon");
    });
  });

  describe("tweet detail page", () => {
    test("GET /tweets/mock-123 returns 200 with tweet detail", async () => {
      const { status, html } = await fetchPage("/tweets/mock-123");
      expect(status).toBe(200);
      expect(html).toContain("Tweets"); // breadcrumb
      expect(html).not.toContain("Coming Soon");
    });
  });

  // ---------------------------------------------------------------------------
  // Webhook API routes
  // ---------------------------------------------------------------------------

  describe("webhook api: tweet replies", () => {
    test("GET /api/twitter/tweets/:id/replies returns replies", async () => {
      const res = await apiRequest("/api/twitter/tweets/123456/replies");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
      for (const reply of body.data) {
        expect(reply.is_reply).toBe(true);
        expect(reply.reply_to_id).toBe("123456");
      }
    });

    test("GET /api/twitter/tweets/:id/replies returns 401 without key", async () => {
      const res = await fetch(
        `${getBaseUrl()}/api/twitter/tweets/123456/replies`,
        { headers: { "Content-Type": "application/json" } },
      );
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Explore API routes (session-based)
  // ---------------------------------------------------------------------------

  describe("explore api: tweet detail + replies", () => {
    test("GET /api/explore/tweets/:id returns tweet + replies", async () => {
      const res = await fetch(
        `${getBaseUrl()}/api/explore/tweets/123456`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.tweet).toBeDefined();
      expect(body.data.tweet.id).toBe("123456");
      expect(body.data.replies).toBeArray();
      expect(body.data.replies.length).toBeGreaterThan(0);
    });
  });
});
