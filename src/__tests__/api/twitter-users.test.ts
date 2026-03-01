import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, initSchema, seedUser } from "@/db";
import * as webhooksRepo from "@/db/repositories/webhooks";
import { generateWebhookKey, hashWebhookKey, getKeyPrefix } from "@/lib/crypto";
import { NextRequest } from "next/server";

// =============================================================================
// Setup
// =============================================================================

const TEST_USER_ID = "test-user-twitter-routes";
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

function makeRequest(
  url: string,
  key?: string,
): NextRequest {
  const headers: Record<string, string> = {};
  if (key) headers["x-webhook-key"] = key;
  return new NextRequest(new URL(url, "http://localhost:7027"), {
    method: "GET",
    headers,
  });
}

// =============================================================================
// User Tweets Route
// =============================================================================

describe("GET /api/twitter/users/[username]/tweets", () => {
  test("returns tweets for valid username", async () => {
    const { GET } = await import(
      "@/app/api/twitter/users/[username]/tweets/route"
    );
    const req = makeRequest(
      "http://localhost:7027/api/twitter/users/testuser/tweets",
      webhookKey,
    );
    const res = await GET(req, { params: Promise.resolve({ username: "testuser" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].author.username).toBe("testuser");
  });

  test("respects count query parameter", async () => {
    const { GET } = await import(
      "@/app/api/twitter/users/[username]/tweets/route"
    );
    const req = makeRequest(
      "http://localhost:7027/api/twitter/users/testuser/tweets?count=5",
      webhookKey,
    );
    const res = await GET(req, { params: Promise.resolve({ username: "testuser" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(5);
  });

  test("returns 401 without webhook key", async () => {
    const { GET } = await import(
      "@/app/api/twitter/users/[username]/tweets/route"
    );
    const req = makeRequest(
      "http://localhost:7027/api/twitter/users/testuser/tweets",
    );
    const res = await GET(req, { params: Promise.resolve({ username: "testuser" }) });
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// User Info Route
// =============================================================================

describe("GET /api/twitter/users/[username]/info", () => {
  test("returns user info", async () => {
    const { GET } = await import(
      "@/app/api/twitter/users/[username]/info/route"
    );
    const req = makeRequest(
      "http://localhost:7027/api/twitter/users/testuser/info",
      webhookKey,
    );
    const res = await GET(req, { params: Promise.resolve({ username: "testuser" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.username).toBe("testuser");
    expect(body.data.followers_count).toBeGreaterThan(0);
  });

  test("returns 401 without webhook key", async () => {
    const { GET } = await import(
      "@/app/api/twitter/users/[username]/info/route"
    );
    const req = makeRequest(
      "http://localhost:7027/api/twitter/users/testuser/info",
    );
    const res = await GET(req, { params: Promise.resolve({ username: "testuser" }) });
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// User Search Route
// =============================================================================

describe("GET /api/twitter/users/[username]/search", () => {
  test("returns search results for user tweets", async () => {
    const { GET } = await import(
      "@/app/api/twitter/users/[username]/search/route"
    );
    const req = makeRequest(
      "http://localhost:7027/api/twitter/users/testuser/search?q=ai",
      webhookKey,
    );
    const res = await GET(req, { params: Promise.resolve({ username: "testuser" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("returns 400 when q parameter is missing", async () => {
    const { GET } = await import(
      "@/app/api/twitter/users/[username]/search/route"
    );
    const req = makeRequest(
      "http://localhost:7027/api/twitter/users/testuser/search",
      webhookKey,
    );
    const res = await GET(req, { params: Promise.resolve({ username: "testuser" }) });
    expect(res.status).toBe(400);
  });

  test("returns 401 without webhook key", async () => {
    const { GET } = await import(
      "@/app/api/twitter/users/[username]/search/route"
    );
    const req = makeRequest(
      "http://localhost:7027/api/twitter/users/testuser/search?q=test",
    );
    const res = await GET(req, { params: Promise.resolve({ username: "testuser" }) });
    expect(res.status).toBe(401);
  });
});
