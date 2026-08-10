import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupE2E, teardownE2E, getBaseUrl } from "./setup";

// =============================================================================
// E2E Tests — Credits Module (Phase 5)
//
// Verifies credits API routes and page integration.
// Server runs with MOCK_PROVIDER=true and E2E_SKIP_AUTH=true.
// =============================================================================

describe("e2e: credits module", () => {
  beforeAll(async () => {
    await setupE2E();
  }, 60_000);

  afterAll(async () => {
    await teardownE2E();
  }, 15_000);

  // ---------------------------------------------------------------------------
  // API routes
  // ---------------------------------------------------------------------------

  describe("credits API", () => {
    test("GET /api/credits returns 200 with credits balance", async () => {
      const res = await fetch(`${getBaseUrl()}/api/credits`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();
      expect(json.data.remaining).toBeGreaterThan(0);
      expect(json.data.total).toBeGreaterThan(0);
      expect(json.data.remaining).toBeLessThanOrEqual(json.data.total);
    });

    test("GET /api/credits/usage returns 200 with usage records", async () => {
      const res = await fetch(`${getBaseUrl()}/api/credits/usage`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeInstanceOf(Array);
      expect(json.data.length).toBeGreaterThan(0);

      const record = json.data[0];
      expect(record.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(record.endpoint).toBeDefined();
      expect(record.credits_used).toBeGreaterThan(0);
      expect(record.request_count).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Page integration
  // ---------------------------------------------------------------------------

  describe("page integration", () => {
    test("GET /settings returns 200 with credits section", async () => {
      const res = await fetch(`${getBaseUrl()}/settings`);
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("TweAPI Credits");
      expect(html).toContain("Settings");
    });

    test("GET /usage returns 200 with credits usage panel", async () => {
      const res = await fetch(`${getBaseUrl()}/usage`);
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain("TweAPI Credits Usage");
      expect(html).toContain("API Usage");
    });
  });
});
