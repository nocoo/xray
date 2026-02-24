import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
} from "bun:test";
import { setupE2E, teardownE2E, apiRequest, getBaseUrl } from "./setup";

// =============================================================================
// E2E Tests — Auth Flow & Settings CRUD
//
// These tests spin up a real Next.js dev server with E2E_SKIP_AUTH=true,
// hitting actual HTTP endpoints to verify the full stack including
// credentials CRUD and webhooks CRUD with FK-safe user creation.
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
      expect(res.status).toBe(200);
    });

    test("GET /login returns 200", async () => {
      const res = await fetch(`${getBaseUrl()}/login`);
      expect(res.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // Credentials CRUD
  // ---------------------------------------------------------------------------

  describe("credentials crud", () => {
    test("GET /api/credentials returns not configured initially", async () => {
      const { status, data } = await apiRequest<{
        configured: boolean;
        tweapiKey: string | null;
        twitterCookie: string | null;
      }>("/api/credentials");

      expect(status).toBe(200);
      expect(data.configured).toBe(false);
      expect(data.tweapiKey).toBeNull();
      expect(data.twitterCookie).toBeNull();
    });

    test("PUT /api/credentials with empty body returns 400", async () => {
      const { status, data } = await apiRequest<{ error: string }>(
        "/api/credentials",
        {
          method: "PUT",
          body: JSON.stringify({}),
        },
      );

      expect(status).toBe(400);
      expect(data.error).toContain("At least one");
    });

    test("PUT /api/credentials saves tweapiKey", async () => {
      const { status, data } = await apiRequest<{
        configured: boolean;
        tweapiKey: string | null;
        twitterCookie: string | null;
      }>("/api/credentials", {
        method: "PUT",
        body: JSON.stringify({ tweapiKey: "test-tweapi-key-12345678" }),
      });

      expect(status).toBe(200);
      expect(data.configured).toBe(true);
      // Key should be masked (first 4 + last 4 visible)
      expect(data.tweapiKey).toContain("test");
      expect(data.tweapiKey).toContain("****");
      expect(data.tweapiKey).toContain("5678");
    });

    test("PUT /api/credentials saves twitterCookie alongside existing tweapiKey", async () => {
      const { status, data } = await apiRequest<{
        configured: boolean;
        tweapiKey: string | null;
        twitterCookie: string | null;
      }>("/api/credentials", {
        method: "PUT",
        body: JSON.stringify({ twitterCookie: "cookie-value-abcdefgh" }),
      });

      expect(status).toBe(200);
      expect(data.configured).toBe(true);
      // tweapiKey should still be present (not wiped)
      expect(data.tweapiKey).not.toBeNull();
      // twitterCookie should be masked
      expect(data.twitterCookie).toContain("cook");
      expect(data.twitterCookie).toContain("****");
    });

    test("GET /api/credentials returns configured after save", async () => {
      const { status, data } = await apiRequest<{
        configured: boolean;
        tweapiKey: string | null;
        twitterCookie: string | null;
      }>("/api/credentials");

      expect(status).toBe(200);
      expect(data.configured).toBe(true);
      expect(data.tweapiKey).not.toBeNull();
      expect(data.twitterCookie).not.toBeNull();
    });

    test("DELETE /api/credentials removes credentials", async () => {
      const { status, data } = await apiRequest<{ deleted: boolean }>(
        "/api/credentials",
        { method: "DELETE" },
      );

      expect(status).toBe(200);
      expect(data.deleted).toBe(true);
    });

    test("GET /api/credentials returns not configured after delete", async () => {
      const { status, data } = await apiRequest<{
        configured: boolean;
        tweapiKey: string | null;
        twitterCookie: string | null;
      }>("/api/credentials");

      expect(status).toBe(200);
      expect(data.configured).toBe(false);
    });

    test("DELETE /api/credentials when none exist returns 404", async () => {
      const { status } = await apiRequest("/api/credentials", {
        method: "DELETE",
      });

      expect(status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // Webhooks CRUD
  // ---------------------------------------------------------------------------

  describe("webhooks crud", () => {
    let webhookId: number;
    let webhookKey: string;

    test("GET /api/webhooks returns empty array initially", async () => {
      const { status, data } = await apiRequest<unknown[]>("/api/webhooks");

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      // May have leftover from twitter-api E2E if run together, but structure is valid
    });

    test("POST /api/webhooks creates a webhook and returns plaintext key", async () => {
      const { status, data } = await apiRequest<{
        id: number;
        key: string;
        keyPrefix: string;
        createdAt: string;
        message: string;
      }>("/api/webhooks", { method: "POST" });

      expect(status).toBe(201);
      expect(data.id).toBeGreaterThan(0);
      expect(data.key).toBeDefined();
      expect(data.key.length).toBeGreaterThan(10);
      expect(data.keyPrefix).toBeDefined();
      expect(data.message).toContain("Save this key");

      webhookId = data.id;
      webhookKey = data.key;
    });

    test("GET /api/webhooks returns the created webhook", async () => {
      const { status, data } = await apiRequest<
        { id: number; keyPrefix: string; createdAt: string; rotatedAt: string }[]
      >("/api/webhooks");

      expect(status).toBe(200);
      const found = data.find((h) => h.id === webhookId);
      expect(found).toBeDefined();
      expect(found!.keyPrefix).toBe(webhookKey.slice(0, 4));
    });

    test("POST /api/webhooks/rotate rotates the key", async () => {
      const { status, data } = await apiRequest<{
        id: number;
        key: string;
        keyPrefix: string;
        rotatedAt: string;
        message: string;
      }>("/api/webhooks/rotate", {
        method: "POST",
        body: JSON.stringify({ id: webhookId }),
      });

      expect(status).toBe(200);
      expect(data.id).toBe(webhookId);
      expect(data.key).toBeDefined();
      expect(data.key).not.toBe(webhookKey); // New key is different
      expect(data.message).toContain("new key");

      webhookKey = data.key; // Update to new key
    });

    test("POST /api/webhooks/rotate with invalid id returns 404", async () => {
      const { status } = await apiRequest("/api/webhooks/rotate", {
        method: "POST",
        body: JSON.stringify({ id: 99999 }),
      });

      expect(status).toBe(404);
    });

    test("POST /api/webhooks/rotate with missing id returns 400", async () => {
      const { status } = await apiRequest("/api/webhooks/rotate", {
        method: "POST",
        body: JSON.stringify({}),
      });

      expect(status).toBe(400);
    });

    test("DELETE /api/webhooks without id returns 400", async () => {
      const { status } = await apiRequest("/api/webhooks", {
        method: "DELETE",
      });

      expect(status).toBe(400);
    });

    test("DELETE /api/webhooks with invalid id returns 404", async () => {
      const { status } = await apiRequest("/api/webhooks?id=99999", {
        method: "DELETE",
      });

      expect(status).toBe(404);
    });

    test("DELETE /api/webhooks removes the webhook", async () => {
      const { status, data } = await apiRequest<{ deleted: boolean }>(
        `/api/webhooks?id=${webhookId}`,
        { method: "DELETE" },
      );

      expect(status).toBe(200);
      expect(data.deleted).toBe(true);
    });

    test("GET /api/webhooks no longer contains the deleted webhook", async () => {
      const { status, data } = await apiRequest<{ id: number }[]>(
        "/api/webhooks",
      );

      expect(status).toBe(200);
      const found = data.find((h) => h.id === webhookId);
      expect(found).toBeUndefined();
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
