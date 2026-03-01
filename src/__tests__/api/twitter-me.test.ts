import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, initSchema, seedUser } from "@/db";
import * as webhooksRepo from "@/db/repositories/webhooks";
import { generateWebhookKey, hashWebhookKey, getKeyPrefix } from "@/lib/crypto";
import { NextRequest } from "next/server";

// =============================================================================
// Setup
// =============================================================================

const TEST_USER_ID = "test-user-me-routes";
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
// Analytics Route
// =============================================================================

describe("GET /api/twitter/me/analytics", () => {
  test("returns analytics data", async () => {
    const { GET } = await import("@/app/api/twitter/me/analytics/route");
    const req = makeRequest(
      "http://localhost:7027/api/twitter/me/analytics",
      webhookKey,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.impressions).toBeGreaterThan(0);
    expect(body.data.engagement_rate).toBeGreaterThan(0);
    expect(body.data.time_series).toBeArray();
    expect(body.data.time_series.length).toBeGreaterThan(0);
  });

  test("returns 401 without webhook key", async () => {
    const { GET } = await import("@/app/api/twitter/me/analytics/route");
    const req = makeRequest(
      "http://localhost:7027/api/twitter/me/analytics",
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// Bookmarks Route
// =============================================================================

describe("GET /api/twitter/me/bookmarks", () => {
  test("returns bookmarked tweets", async () => {
    const { GET } = await import("@/app/api/twitter/me/bookmarks/route");
    const req = makeRequest(
      "http://localhost:7027/api/twitter/me/bookmarks",
      webhookKey,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("returns 401 without webhook key", async () => {
    const { GET } = await import("@/app/api/twitter/me/bookmarks/route");
    const req = makeRequest(
      "http://localhost:7027/api/twitter/me/bookmarks",
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// Likes Route
// =============================================================================

describe("GET /api/twitter/me/likes", () => {
  test("returns liked tweets", async () => {
    const { GET } = await import("@/app/api/twitter/me/likes/route");
    const req = makeRequest(
      "http://localhost:7027/api/twitter/me/likes",
      webhookKey,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("returns 401 without webhook key", async () => {
    const { GET } = await import("@/app/api/twitter/me/likes/route");
    const req = makeRequest(
      "http://localhost:7027/api/twitter/me/likes",
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// Lists Route
// =============================================================================

describe("GET /api/twitter/me/lists", () => {
  test("returns user lists", async () => {
    const { GET } = await import("@/app/api/twitter/me/lists/route");
    const req = makeRequest(
      "http://localhost:7027/api/twitter/me/lists",
      webhookKey,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].name).toBeDefined();
    expect(body.data[0].member_count).toBeGreaterThan(0);
  });

  test("returns 401 without webhook key", async () => {
    const { GET } = await import("@/app/api/twitter/me/lists/route");
    const req = makeRequest(
      "http://localhost:7027/api/twitter/me/lists",
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
