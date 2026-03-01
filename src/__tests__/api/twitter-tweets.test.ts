import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, initSchema, seedUser } from "@/db";
import * as webhooksRepo from "@/db/repositories/webhooks";
import { generateWebhookKey, hashWebhookKey, getKeyPrefix } from "@/lib/crypto";
import { NextRequest } from "next/server";

// =============================================================================
// Setup
// =============================================================================

const TEST_USER_ID = "test-user-tweet-routes";
let webhookKey: string;

beforeEach(() => {
  createTestDb();
  initSchema();
  seedUser(TEST_USER_ID);
  process.env.MOCK_PROVIDER = "true";

  webhookKey = generateWebhookKey();
  webhooksRepo.create({
    userId: TEST_USER_ID,
    keyHash: hashWebhookKey(webhookKey),
    keyPrefix: getKeyPrefix(webhookKey),
  });
});

afterEach(() => {
  closeDb();
  delete process.env.MOCK_PROVIDER;
});

function makeRequest(url: string, key?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (key) headers["x-webhook-key"] = key;
  return new NextRequest(new URL(url, "http://localhost:7027"), {
    method: "GET",
    headers,
  });
}

// =============================================================================
// Tweet Search Route
// =============================================================================

describe("GET /api/twitter/tweets/search", () => {
  test("returns search results for query", async () => {
    const { GET } = await import("@/app/api/twitter/tweets/search/route");
    const req = makeRequest(
      "http://localhost:7027/api/twitter/tweets/search?q=ai+agents",
      webhookKey,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("respects count parameter", async () => {
    const { GET } = await import("@/app/api/twitter/tweets/search/route");
    const req = makeRequest(
      "http://localhost:7027/api/twitter/tweets/search?q=test&count=5",
      webhookKey,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(5);
  });

  test("returns 400 when q parameter is missing", async () => {
    const { GET } = await import("@/app/api/twitter/tweets/search/route");
    const req = makeRequest(
      "http://localhost:7027/api/twitter/tweets/search",
      webhookKey,
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  test("returns 401 without webhook key", async () => {
    const { GET } = await import("@/app/api/twitter/tweets/search/route");
    const req = makeRequest(
      "http://localhost:7027/api/twitter/tweets/search?q=test",
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// Tweet Details Route
// =============================================================================

describe("GET /api/twitter/tweets/[id]", () => {
  test("returns tweet details for valid id", async () => {
    const { GET } = await import("@/app/api/twitter/tweets/[id]/route");
    const req = makeRequest(
      "http://localhost:7027/api/twitter/tweets/123456",
      webhookKey,
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: "123456" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("123456");
  });

  test("returns 401 without webhook key", async () => {
    const { GET } = await import("@/app/api/twitter/tweets/[id]/route");
    const req = makeRequest(
      "http://localhost:7027/api/twitter/tweets/123456",
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: "123456" }),
    });
    expect(res.status).toBe(401);
  });
});
