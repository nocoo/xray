// =============================================================================
// E2E Tests - Spawn real server process and hit HTTP endpoints
// Uses MOCK_PROVIDER=true so no real TweAPI calls are made.
// =============================================================================

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import type { Subprocess } from "bun";

let serverProcess: Subprocess;
const PORT = 13456; // Use non-standard port to avoid conflicts
const BASE_URL = `http://localhost:${PORT}`;

async function waitForServer(url: string, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await Bun.sleep(100);
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

beforeAll(async () => {
  serverProcess = Bun.spawn(["bun", "run", "src/index.ts"], {
    cwd: import.meta.dir + "/../..",
    env: {
      ...process.env,
      PORT: String(PORT),
      MOCK_PROVIDER: "true",
      CONFIG_PATH: "/nonexistent/config.json", // force mock, no real config needed
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  await waitForServer(BASE_URL);
});

afterAll(() => {
  serverProcess?.kill();
});

// Helper
async function get(path: string) {
  const res = await fetch(`${BASE_URL}${path}`);
  const body = await res.json();
  return { status: res.status, body };
}

// =============================================================================
// Health & Infrastructure
// =============================================================================

describe("E2E: Infrastructure", () => {
  test("GET /health returns 200", async () => {
    const { status, body } = await get("/health");
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
  });

  test("GET /doc returns valid OpenAPI spec", async () => {
    const { status, body } = await get("/doc");
    expect(status).toBe(200);
    expect(body.openapi).toBe("3.0.0");
    expect(body.info.title).toBe("X-Ray API");
    expect(Object.keys(body.paths).length).toBeGreaterThan(0);
  });

  test("GET /ui returns Swagger UI HTML", async () => {
    const res = await fetch(`${BASE_URL}/ui`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("GET /nonexistent returns 404", async () => {
    const { status, body } = await get("/nonexistent");
    expect(status).toBe(404);
    expect(body.success).toBe(false);
  });
});

// =============================================================================
// Twitter User Routes
// =============================================================================

describe("E2E: Twitter Users", () => {
  test("GET /twitter/users/:username/tweets returns tweets", async () => {
    const { status, body } = await get("/twitter/users/testuser/tweets");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    // Verify tweet shape
    const tweet = body.data[0];
    expect(tweet.id).toBeDefined();
    expect(tweet.text).toBeDefined();
    expect(tweet.author).toBeDefined();
    expect(tweet.author.username).toBe("testuser");
    expect(tweet.metrics).toBeDefined();
    expect(typeof tweet.metrics.like_count).toBe("number");
  });

  test("GET /twitter/users/:username/tweets?count=3 respects count", async () => {
    const { status, body } = await get("/twitter/users/testuser/tweets?count=3");
    expect(status).toBe(200);
    expect(body.data).toHaveLength(3);
  });

  test("GET /twitter/users/:username/info returns user profile", async () => {
    const { status, body } = await get("/twitter/users/alice/info");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.username).toBe("alice");
    expect(body.data.name).toBeDefined();
    expect(typeof body.data.followers_count).toBe("number");
    expect(typeof body.data.following_count).toBe("number");
    expect(typeof body.data.is_verified).toBe("boolean");
  });

  test("GET /twitter/users/:username/search returns search results", async () => {
    const { status, body } = await get("/twitter/users/alice/search?q=test");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Twitter Tweet Routes
// =============================================================================

describe("E2E: Twitter Tweets", () => {
  test("GET /twitter/tweets/search returns results", async () => {
    const { status, body } = await get("/twitter/tweets/search?q=AI");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET /twitter/tweets/:id returns tweet details", async () => {
    const { status, body } = await get("/twitter/tweets/987654321");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("987654321");
    expect(body.data.text).toBeDefined();
    expect(body.data.author).toBeDefined();
  });
});

// =============================================================================
// Twitter Me (Authenticated) Routes
// =============================================================================

describe("E2E: Twitter Me", () => {
  test("GET /twitter/me/analytics returns analytics with time series", async () => {
    const { status, body } = await get("/twitter/me/analytics");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.data.impressions).toBe("number");
    expect(typeof body.data.engagement_rate).toBe("number");
    expect(Array.isArray(body.data.time_series)).toBe(true);
    expect(body.data.time_series.length).toBeGreaterThan(0);
  });

  test("GET /twitter/me/bookmarks returns bookmarked tweets", async () => {
    const { status, body } = await get("/twitter/me/bookmarks");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET /twitter/me/likes returns liked tweets", async () => {
    const { status, body } = await get("/twitter/me/likes");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET /twitter/me/lists returns subscribed lists", async () => {
    const { status, body } = await get("/twitter/me/lists");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0].name).toBeDefined();
    expect(typeof body.data[0].member_count).toBe("number");
  });
});

// =============================================================================
// Validation (real HTTP)
// =============================================================================

describe("E2E: Request Validation", () => {
  test("rejects invalid username via real HTTP", async () => {
    const { status, body } = await get("/twitter/users/inv@lid/tweets");
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  test("rejects missing query param via real HTTP", async () => {
    const { status } = await get("/twitter/tweets/search");
    expect(status).toBe(400);
  });

  test("rejects count out of range via real HTTP", async () => {
    const { status } = await get("/twitter/users/alice/tweets?count=200");
    expect(status).toBe(400);
  });
});
