import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupE2E, teardownE2E, getBaseUrl } from "./setup";

// =============================================================================
// E2E Tests — Standalone Pages (AI Settings & Webhooks)
//
// Covers two page gaps:
//   1. /ai-settings — dedicated AI configuration page
//   2. /webhooks — dedicated webhook management page
//
// These pages have their underlying APIs tested in ai-settings.e2e.test.ts
// and auth-settings.e2e.test.ts respectively, but the page rendering itself
// was untested.
//
// Server runs with MOCK_PROVIDER=true and E2E_SKIP_AUTH=true.
// =============================================================================

describe("e2e: standalone pages", () => {
  beforeAll(async () => {
    await setupE2E();
  }, 60_000);

  afterAll(async () => {
    await teardownE2E();
  }, 15_000);

  // ===========================================================================
  // /ai-settings page
  // ===========================================================================

  describe("page: /ai-settings", () => {
    test("returns 200 with AI settings content", async () => {
      const res = await fetch(`${getBaseUrl()}/ai-settings`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("AI Settings");
    });

    test("contains provider configuration section", async () => {
      const res = await fetch(`${getBaseUrl()}/ai-settings`);
      const html = await res.text();
      // The page should contain the AI Configuration section
      expect(html).toContain("AI Configuration");
    });
  });

  // ===========================================================================
  // /webhooks page
  // ===========================================================================

  describe("page: /webhooks", () => {
    test("returns 200 with webhooks content", async () => {
      const res = await fetch(`${getBaseUrl()}/webhooks`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Webhooks");
    });

    test("contains AI Agent Prompt section", async () => {
      const res = await fetch(`${getBaseUrl()}/webhooks`);
      const html = await res.text();
      expect(html).toContain("AI Agent Prompt");
    });
  });
});
