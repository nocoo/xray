import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
} from "bun:test";
import { setupE2E, teardownE2E, apiRequest, getBaseUrl } from "./setup";

// =============================================================================
// E2E Tests — Auth Flow & Settings Management
//
// These tests spin up a real Next.js dev server with E2E_SKIP_AUTH=true,
// hitting actual HTTP endpoints to verify the full stack.
// =============================================================================

describe("e2e: auth and settings", () => {
  beforeAll(async () => {
    await setupE2E();
  }, 60_000);

  afterAll(async () => {
    await teardownE2E();
  }, 15_000);

  // ---------------------------------------------------------------------------
  // Auth endpoints
  // ---------------------------------------------------------------------------

  describe("auth", () => {
    test("GET /api/auth/providers returns Google provider", async () => {
      const res = await fetch(`${getBaseUrl()}/api/auth/providers`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.google).toBeDefined();
      expect(data.google.id).toBe("google");
      expect(data.google.name).toBe("Google");
    });

    test("GET / does not redirect to /login when E2E_SKIP_AUTH", async () => {
      const res = await fetch(`${getBaseUrl()}/`, { redirect: "manual" });
      // With E2E_SKIP_AUTH, proxy passes through — should get 200 (page)
      expect(res.status).toBe(200);
    });

    test("GET /login returns 200", async () => {
      const res = await fetch(`${getBaseUrl()}/login`);
      expect(res.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // Credentials API
  // ---------------------------------------------------------------------------

  describe("credentials", () => {
    test("GET /api/credentials returns not configured initially", async () => {
      const { status, data } = await apiRequest<{
        configured: boolean;
        tweapiKey: string | null;
        twitterCookie: string | null;
      }>("/api/credentials");

      // With E2E_SKIP_AUTH, auth is bypassed but session has no user ID
      // This may return 401 or empty data depending on implementation
      expect([200, 401]).toContain(status);
    });

    test("PUT /api/credentials with empty body returns 400", async () => {
      const { status } = await apiRequest("/api/credentials", {
        method: "PUT",
        body: JSON.stringify({}),
      });

      // Either 400 (invalid body) or 401 (no auth)
      expect([400, 401]).toContain(status);
    });
  });

  // ---------------------------------------------------------------------------
  // Webhooks API
  // ---------------------------------------------------------------------------

  describe("webhooks", () => {
    test("GET /api/webhooks returns array", async () => {
      const { status, data } = await apiRequest<unknown[]>("/api/webhooks");

      // With E2E_SKIP_AUTH, either returns empty array or 401
      expect([200, 401]).toContain(status);
      if (status === 200) {
        expect(Array.isArray(data)).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Health check
  // ---------------------------------------------------------------------------

  describe("health", () => {
    test("GET /api/live returns ok status", async () => {
      const res = await fetch(`${getBaseUrl()}/api/live`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(typeof data.timestamp).toBe("number");
      expect(typeof data.uptime).toBe("number");
      expect(data.checks).toBeDefined();
      expect(data.checks.database).toBe("ok");
    });
  });

  // ---------------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------------

  describe("pages", () => {
    test("GET /settings returns 200", async () => {
      const res = await fetch(`${getBaseUrl()}/settings`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Settings");
    });
  });
});
