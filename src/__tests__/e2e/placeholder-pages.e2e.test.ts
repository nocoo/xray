import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupE2E, teardownE2E, getBaseUrl } from "./setup";

// =============================================================================
// E2E Tests — Placeholder Pages (Phase 1)
//
// Verifies all new placeholder pages return 200 and contain expected content.
// Server runs with MOCK_PROVIDER=true and E2E_SKIP_AUTH=true.
// =============================================================================

describe("e2e: placeholder pages", () => {
  beforeAll(async () => {
    await setupE2E();
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

  // ---------------------------------------------------------------------------
  // Explore World pages
  // ---------------------------------------------------------------------------

  describe("explore world", () => {
    test("GET /tweets returns 200 with search UI", async () => {
      const { status, html } = await fetchPage("/tweets");
      expect(status).toBe(200);
      expect(html).toContain("Tweets");
      expect(html).toContain("Search tweets");
    });

    test("GET /tweets/123 returns 200 with tweet detail", async () => {
      const { status, html } = await fetchPage("/tweets/123");
      expect(status).toBe(200);
      expect(html).toContain("Tweets"); // breadcrumb
    });

    test("GET /users returns 200 with search UI", async () => {
      const { status, html } = await fetchPage("/users");
      expect(status).toBe(200);
      expect(html).toContain("Users");
      expect(html).toContain("Enter a username");
      expect(html).not.toContain("Coming Soon");
    });

    test("GET /users/elonmusk returns 200 with profile page", async () => {
      const { status, html } = await fetchPage("/users/elonmusk");
      expect(status).toBe(200);
      expect(html).toContain("elonmusk");
      expect(html).not.toContain("Coming Soon");
    });

    test("GET /users/elonmusk/connections returns 200 with tabs", async () => {
      const { status, html } = await fetchPage("/users/elonmusk/connections");
      expect(status).toBe(200);
      expect(html).toContain("Connections");
      expect(html).toContain("Followers");
      expect(html).not.toContain("Coming Soon");
    });
  });

  // ---------------------------------------------------------------------------
  // My Account pages
  // ---------------------------------------------------------------------------

  describe("my account", () => {
    test("GET /bookmarks returns 200 with functional page", async () => {
      const { status, html } = await fetchPage("/bookmarks");
      expect(status).toBe(200);
      expect(html).toContain("Bookmarks");
      expect(html).not.toContain("Coming Soon");
    });

    test("GET /likes returns 200 with functional page", async () => {
      const { status, html } = await fetchPage("/likes");
      expect(status).toBe(200);
      expect(html).toContain("Likes");
      expect(html).not.toContain("Coming Soon");
    });

    test("GET /lists returns 200 with functional page", async () => {
      const { status, html } = await fetchPage("/lists");
      expect(status).toBe(200);
      expect(html).toContain("Lists");
      expect(html).not.toContain("Coming Soon");
    });

    test("GET /messages returns 200 with functional inbox", async () => {
      const { status, html } = await fetchPage("/messages");
      expect(status).toBe(200);
      expect(html).toContain("Messages");
      expect(html).not.toContain("Coming Soon");
    });

    test("GET /messages/conv-123 returns 200 with functional conversation", async () => {
      const { status, html } = await fetchPage("/messages/conv-123");
      expect(status).toBe(200);
      expect(html).toContain("Conversation");
      expect(html).not.toContain("Coming Soon");
    });
  });

  // ---------------------------------------------------------------------------
  // Existing pages still work
  // ---------------------------------------------------------------------------

  describe("existing pages preserved", () => {
    test("GET / returns 200 (dashboard)", async () => {
      const { status } = await fetchPage("/");
      expect(status).toBe(200);
    });

    test("GET /analytics returns 200", async () => {
      const { status } = await fetchPage("/analytics");
      expect(status).toBe(200);
    });

    test("GET /usage returns 200", async () => {
      const { status } = await fetchPage("/usage");
      expect(status).toBe(200);
    });

    test("GET /settings returns 200", async () => {
      const { status } = await fetchPage("/settings");
      expect(status).toBe(200);
    });

    test("GET /explore returns 200 (preserved until Phase 5)", async () => {
      const { status } = await fetchPage("/explore");
      expect(status).toBe(200);
    });
  });
});
