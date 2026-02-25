import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupE2E, teardownE2E, getBaseUrl, seedWebhookKey } from "./setup";

// =============================================================================
// E2E Tests — My Account Module (Phase 4)
//
// Tests bookmarks, likes, lists, messages pages and all new API routes
// (webhook + explore) for cookie-required private endpoints.
// Server runs with MOCK_PROVIDER=true and E2E_SKIP_AUTH=true.
// =============================================================================

let webhookKey: string;

describe("e2e: my account module", () => {
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
  // Pages — Bookmarks / Likes / Lists
  // ---------------------------------------------------------------------------

  describe("bookmarks page", () => {
    test("GET /bookmarks returns 200 with functional page (no Coming Soon)", async () => {
      const { status, html } = await fetchPage("/bookmarks");
      expect(status).toBe(200);
      expect(html).toContain("Bookmarks");
      expect(html).not.toContain("Coming Soon");
    });
  });

  describe("likes page", () => {
    test("GET /likes returns 200 with functional page (no Coming Soon)", async () => {
      const { status, html } = await fetchPage("/likes");
      expect(status).toBe(200);
      expect(html).toContain("Likes");
      expect(html).not.toContain("Coming Soon");
    });
  });

  describe("lists page", () => {
    test("GET /lists returns 200 with functional page (no Coming Soon)", async () => {
      const { status, html } = await fetchPage("/lists");
      expect(status).toBe(200);
      expect(html).toContain("Lists");
      expect(html).not.toContain("Coming Soon");
    });
  });

  // ---------------------------------------------------------------------------
  // Pages — Messages
  // ---------------------------------------------------------------------------

  describe("messages inbox page", () => {
    test("GET /messages returns 200 with functional inbox (no Coming Soon)", async () => {
      const { status, html } = await fetchPage("/messages");
      expect(status).toBe(200);
      expect(html).toContain("Messages");
      expect(html).not.toContain("Coming Soon");
    });
  });

  describe("messages conversation page", () => {
    test("GET /messages/conv-mock-1 returns 200 with conversation UI", async () => {
      const { status, html } = await fetchPage("/messages/conv-mock-1");
      expect(status).toBe(200);
      expect(html).toContain("Conversation");
      expect(html).toContain("conv-mock-1");
      expect(html).not.toContain("Coming Soon");
    });
  });

  // ---------------------------------------------------------------------------
  // Explore API routes (session-based) — bookmarks/likes/lists
  // ---------------------------------------------------------------------------

  describe("explore api: bookmarks/likes/lists", () => {
    test("GET /api/explore/bookmarks returns tweets", async () => {
      const res = await fetch(`${getBaseUrl()}/api/explore/bookmarks`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
      // Each item should be a tweet
      expect(body.data[0].id).toBeDefined();
      expect(body.data[0].text).toBeDefined();
    });

    test("GET /api/explore/likes returns tweets", async () => {
      const res = await fetch(`${getBaseUrl()}/api/explore/likes`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data[0].id).toBeDefined();
    });

    test("GET /api/explore/lists returns lists", async () => {
      const res = await fetch(`${getBaseUrl()}/api/explore/lists`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data[0].id).toBeDefined();
      expect(body.data[0].name).toBeDefined();
      expect(body.data[0].member_count).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Explore API routes (session-based) — messages
  // ---------------------------------------------------------------------------

  describe("explore api: messages", () => {
    test("GET /api/explore/inbox returns inbox items", async () => {
      const res = await fetch(`${getBaseUrl()}/api/explore/inbox`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
      // Each inbox item should have conversation_id, last_message, participants
      const item = body.data[0];
      expect(item.conversation_id).toBeDefined();
      expect(item.last_message).toBeDefined();
      expect(item.last_message.id).toBeDefined();
      expect(item.last_message.text).toBeDefined();
      expect(item.participants).toBeArray();
      expect(item.participants.length).toBeGreaterThan(0);
    });

    test("GET /api/explore/messages/:conversationId returns conversation", async () => {
      const res = await fetch(
        `${getBaseUrl()}/api/explore/messages/conv-mock-1`,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.conversation_id).toBe("conv-mock-1");
      expect(body.data.messages).toBeArray();
      expect(body.data.messages.length).toBeGreaterThan(0);
      // Each message should have id, text, sender_id
      const msg = body.data.messages[0];
      expect(msg.id).toBeDefined();
      expect(msg.text).toBeDefined();
      expect(msg.sender_id).toBeDefined();
      expect(body.data.participants).toBeArray();
      expect(body.data.participants.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Webhook API routes — bookmarks/likes/lists
  // ---------------------------------------------------------------------------

  describe("webhook api: bookmarks/likes/lists", () => {
    test("GET /api/twitter/me/bookmarks returns tweets", async () => {
      const res = await apiRequest("/api/twitter/me/bookmarks");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
    });

    test("GET /api/twitter/me/likes returns tweets", async () => {
      const res = await apiRequest("/api/twitter/me/likes");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
    });

    test("GET /api/twitter/me/lists returns lists", async () => {
      const res = await apiRequest("/api/twitter/me/lists");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Webhook API routes — messages
  // ---------------------------------------------------------------------------

  describe("webhook api: messages", () => {
    test("GET /api/twitter/me/inbox returns inbox items", async () => {
      const res = await apiRequest("/api/twitter/me/inbox");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data[0].conversation_id).toBeDefined();
      expect(body.data[0].last_message).toBeDefined();
    });

    test("GET /api/twitter/me/messages/:conversationId returns conversation", async () => {
      const res = await apiRequest(
        "/api/twitter/me/messages/conv-mock-1",
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.conversation_id).toBe("conv-mock-1");
      expect(body.data.messages).toBeArray();
      expect(body.data.messages.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Auth enforcement — webhook routes require key
  // ---------------------------------------------------------------------------

  describe("webhook api: auth enforcement", () => {
    test("GET /api/twitter/me/inbox returns 401 without key", async () => {
      const res = await fetch(`${getBaseUrl()}/api/twitter/me/inbox`, {
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(401);
    });

    test("GET /api/twitter/me/messages/:id returns 401 without key", async () => {
      const res = await fetch(
        `${getBaseUrl()}/api/twitter/me/messages/conv-mock-1`,
        { headers: { "Content-Type": "application/json" } },
      );
      expect(res.status).toBe(401);
    });

    test("GET /api/twitter/me/bookmarks returns 401 without key", async () => {
      const res = await fetch(`${getBaseUrl()}/api/twitter/me/bookmarks`, {
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(401);
    });
  });
});
