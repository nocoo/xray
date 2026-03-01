import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, initSchema, seedUser } from "@/db";
import * as webhooksRepo from "@/db/repositories/webhooks";
import * as credentialsRepo from "@/db/repositories/credentials";
import * as usageStatsRepo from "@/db/repositories/usage-stats";
import { generateWebhookKey, hashWebhookKey, getKeyPrefix } from "@/lib/crypto";
import { withTwitterProvider } from "@/lib/twitter/route-handler";
import { NextRequest } from "next/server";

// =============================================================================
// Setup
// =============================================================================

const TEST_USER_ID = "test-user-route-handler";

function createRequest(
  url: string,
  options?: { webhookKey?: string; method?: string },
): NextRequest {
  const headers: Record<string, string> = {};
  if (options?.webhookKey) {
    headers["x-webhook-key"] = options.webhookKey;
  }
  return new NextRequest(new URL(url, "http://localhost:7027"), {
    method: options?.method ?? "GET",
    headers,
  });
}

function setupUserWithWebhook(): string {
  // Seed credentials for mock provider bypass
  credentialsRepo.upsert(TEST_USER_ID, {
    tweapiKey: "test-key",
    twitterCookie: "test-cookie",
  });
  // Create webhook and return key
  const key = generateWebhookKey();
  webhooksRepo.create({
    userId: TEST_USER_ID,
    keyHash: hashWebhookKey(key),
    keyPrefix: getKeyPrefix(key),
  });
  return key;
}

beforeEach(() => {
  createTestDb();
  initSchema();
  seedUser(TEST_USER_ID);
});

afterEach(() => {
  closeDb();
});

// =============================================================================
// Tests
// =============================================================================

describe("withTwitterProvider", () => {
  test("returns 401 when no webhook key provided", async () => {
    const req = createRequest("http://localhost:7027/api/twitter/test");
    const res = await withTwitterProvider(req, async () => {
      return Response.json({ success: true });
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("webhook");
  });

  test("returns 401 when invalid webhook key provided", async () => {
    const req = createRequest("http://localhost:7027/api/twitter/test", {
      webhookKey: "invalid-key",
    });
    const res = await withTwitterProvider(req, async () => {
      return Response.json({ success: true });
    });
    expect(res.status).toBe(401);
  });

  test("returns 503 when user has no API credentials", async () => {
    // Create webhook but no credentials
    const key = generateWebhookKey();
    webhooksRepo.create({
      userId: TEST_USER_ID,
      keyHash: hashWebhookKey(key),
      keyPrefix: getKeyPrefix(key),
    });

    const originalEnv = process.env.MOCK_PROVIDER;
    delete process.env.MOCK_PROVIDER;
    try {
      const req = createRequest("http://localhost:7027/api/twitter/test", {
        webhookKey: key,
      });
      const res = await withTwitterProvider(req, async () => {
        return Response.json({ success: true });
      });
      expect(res.status).toBe(503);
    } finally {
      process.env.MOCK_PROVIDER = originalEnv;
    }
  });

  test("calls handler with provider when MOCK_PROVIDER is set", async () => {
    const originalEnv = process.env.MOCK_PROVIDER;
    process.env.MOCK_PROVIDER = "true";
    try {
      const key = setupUserWithWebhook();
      const req = createRequest("http://localhost:7027/api/twitter/test", {
        webhookKey: key,
      });
      const res = await withTwitterProvider(req, async (provider, userId) => {
        expect(userId).toBe(TEST_USER_ID);
        expect(provider).toBeDefined();
        const info = await provider.getUserInfo("testuser");
        return Response.json({ success: true, data: info });
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.username).toBe("testuser");
    } finally {
      process.env.MOCK_PROVIDER = originalEnv;
    }
  });

  test("maps ProviderError to correct HTTP status", async () => {
    const originalEnv = process.env.MOCK_PROVIDER;
    process.env.MOCK_PROVIDER = "true";
    try {
      const key = setupUserWithWebhook();
      const req = createRequest("http://localhost:7027/api/twitter/test", {
        webhookKey: key,
      });

      // Import errors inside to avoid module-level side effects
      const { AuthRequiredError } = await import("@/lib/twitter/errors");

      const res = await withTwitterProvider(req, async () => {
        throw new AuthRequiredError("Cookie needed");
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("Cookie needed");
    } finally {
      process.env.MOCK_PROVIDER = originalEnv;
    }
  });

  test("maps unknown errors to 500", async () => {
    const originalEnv = process.env.MOCK_PROVIDER;
    process.env.MOCK_PROVIDER = "true";
    try {
      const key = setupUserWithWebhook();
      const req = createRequest("http://localhost:7027/api/twitter/test", {
        webhookKey: key,
      });
      const res = await withTwitterProvider(req, async () => {
        throw new Error("unexpected failure");
      });
      expect(res.status).toBe(500);
    } finally {
      process.env.MOCK_PROVIDER = originalEnv;
    }
  });

  test("tracks usage stats on successful request", async () => {
    const originalEnv = process.env.MOCK_PROVIDER;
    process.env.MOCK_PROVIDER = "true";
    try {
      const key = setupUserWithWebhook();
      const req = createRequest(
        "http://localhost:7027/api/twitter/users/testuser/tweets",
        { webhookKey: key },
      );
      const res = await withTwitterProvider(req, async (provider) => {
        const tweets = await provider.fetchUserTweets("testuser");
        return Response.json({ success: true, data: tweets });
      });
      expect(res.status).toBe(200);

      // Verify usage stats were recorded
      const stats = usageStatsRepo.findByUserId(TEST_USER_ID);
      expect(stats.length).toBe(1);
      expect(stats[0]!.endpoint).toBe(
        "/api/twitter/users/:username/tweets",
      );
      expect(stats[0]!.requestCount).toBe(1);
    } finally {
      process.env.MOCK_PROVIDER = originalEnv;
    }
  });

  test("does not track usage stats on failed request", async () => {
    const originalEnv = process.env.MOCK_PROVIDER;
    process.env.MOCK_PROVIDER = "true";
    try {
      const key = setupUserWithWebhook();
      const req = createRequest("http://localhost:7027/api/twitter/test", {
        webhookKey: key,
      });
      await withTwitterProvider(req, async () => {
        throw new Error("boom");
      });

      // No usage stats should be recorded
      const stats = usageStatsRepo.findByUserId(TEST_USER_ID);
      expect(stats.length).toBe(0);
    } finally {
      process.env.MOCK_PROVIDER = originalEnv;
    }
  });
});
