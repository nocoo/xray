import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  setupNoAuthE2E,
  teardownNoAuthE2E,
  getNoAuthBaseUrl,
} from "./setup";

// =============================================================================
// E2E Tests — Auth Enforcement (No Auth Bypass)
//
// Verifies that all session-protected API routes return 401 when no
// authenticated session exists. Uses a SEPARATE vinext server instance
// on port 17029 WITHOUT E2E_SKIP_AUTH, so requests have no session.
//
// Server runs with MOCK_PROVIDER=true but WITHOUT E2E_SKIP_AUTH.
// =============================================================================

describe("e2e: auth enforcement (no-auth server)", () => {
  beforeAll(async () => {
    await setupNoAuthE2E();
  }, 60_000);

  afterAll(async () => {
    await teardownNoAuthE2E();
  }, 15_000);

  // ---------------------------------------------------------------------------
  // Explore API routes — all require session auth via withSessionProvider
  // ---------------------------------------------------------------------------

  describe("explore routes return 401 without session", () => {
    const exploreRoutes = [
      { path: "/api/explore/users?username=testuser", name: "explore/users" },
      { path: "/api/explore/users/tweets?username=testuser", name: "explore/users/tweets" },
      { path: "/api/explore/tweets?q=ai", name: "explore/tweets" },
      { path: "/api/explore/analytics", name: "explore/analytics" },
      { path: "/api/explore/bookmarks", name: "explore/bookmarks" },
      { path: "/api/explore/likes", name: "explore/likes" },
      { path: "/api/explore/lists", name: "explore/lists" },
      { path: "/api/explore/inbox", name: "explore/inbox" },
    ];

    for (const route of exploreRoutes) {
      test(`GET ${route.name} returns 401`, async () => {
        const res = await fetch(`${getNoAuthBaseUrl()}${route.path}`);
        expect(res.status).toBe(401);

        const json = await res.json();
        expect(json.error).toBe("Unauthorized");
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Other session-protected API routes
  // ---------------------------------------------------------------------------

  describe("other protected routes return 401 without session", () => {
    const protectedRoutes = [
      { path: "/api/usage", name: "usage" },
      { path: "/api/credentials", name: "credentials" },
      { path: "/api/webhooks", name: "webhooks" },
      { path: "/api/credits", name: "credits" },
      { path: "/api/credits/usage", name: "credits/usage" },
    ];

    for (const route of protectedRoutes) {
      test(`GET ${route.name} returns 401`, async () => {
        const res = await fetch(`${getNoAuthBaseUrl()}${route.path}`);
        expect(res.status).toBe(401);

        const json = await res.json();
        expect(json.error).toBe("Unauthorized");
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Public routes — should remain accessible
  // ---------------------------------------------------------------------------

  describe("public routes remain accessible", () => {
    test("GET /login returns 200", async () => {
      const res = await fetch(`${getNoAuthBaseUrl()}/login`);
      expect(res.status).toBe(200);
    });

    test("GET /api/auth/providers returns 200", async () => {
      const res = await fetch(`${getNoAuthBaseUrl()}/api/auth/providers`);
      expect(res.status).toBe(200);
    });

    test("GET /api/live returns 200", async () => {
      const res = await fetch(`${getNoAuthBaseUrl()}/api/live`);
      expect(res.status).toBe(200);
    });
  });
});
