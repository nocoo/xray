import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users, watchlistMembers } from "@/db/schema";
import * as fetchedPostsRepo from "@/db/repositories/fetched-posts";
import * as settingsRepo from "@/db/repositories/settings";

// =============================================================================
// Setup: E2E_SKIP_AUTH + MOCK_PROVIDER for all API route tests
// =============================================================================

const USER_ID = "e2e-test-user";

beforeEach(() => {
  createTestDb();
  process.env.E2E_SKIP_AUTH = "true";
  process.env.MOCK_PROVIDER = "true";
  db.insert(users)
    .values({ id: USER_ID, name: "E2E Test User", email: "e2e@test.com" })
    .run();
});

afterEach(() => {
  closeDb();
  delete process.env.E2E_SKIP_AUTH;
  delete process.env.MOCK_PROVIDER;
});

// =============================================================================
// Helpers
// =============================================================================

function seedMember(username: string) {
  return db
    .insert(watchlistMembers)
    .values({
      userId: USER_ID,
      twitterUsername: username,
      note: null,
      addedAt: new Date(),
    })
    .returning()
    .get();
}

function seedPost(memberId: number, tweetId: string, username: string) {
  fetchedPostsRepo.insertMany([{
    userId: USER_ID,
    memberId,
    tweetId,
    twitterUsername: username,
    text: `Tweet ${tweetId} text`,
    tweetJson: JSON.stringify({
      id: tweetId,
      text: `Tweet ${tweetId} text`,
      created_at: "2026-01-15T12:00:00.000Z",
    }),
    tweetCreatedAt: "2026-01-15T12:00:00.000Z",
  }]);
}

/** Parse all SSE events from a text/event-stream Response body. */
async function parseSSE(res: Response): Promise<{ event: string; data: unknown }[]> {
  const text = await res.text();
  const events: { event: string; data: unknown }[] = [];
  for (const block of text.split("\n\n")) {
    if (!block.trim()) continue;
    let event = "";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (event && data) {
      events.push({ event, data: JSON.parse(data) });
    }
  }
  return events;
}

/** Extract the "done" event payload from an SSE response. */
async function parseDoneEvent(res: Response) {
  const events = await parseSSE(res);
  const done = events.find((e) => e.event === "done");
  return done?.data as {
    fetched: number;
    newPosts: number;
    skippedOld: number;
    purged: number;
    errors: string[];
  } | undefined;
}

// =============================================================================
// POST /api/watchlist/fetch
// =============================================================================

describe("POST /api/watchlist/fetch", () => {
  test("returns 0 when no watchlist members", async () => {
    const { POST } = await import("@/app/api/watchlist/fetch/route");
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.fetched).toBe(0);
    expect(body.data.newPosts).toBe(0);
    expect(body.data.skippedOld).toBe(0);
    expect(body.data.purged).toBe(0);
  });

  test("fetches tweets for watchlist members (SSE stream)", async () => {
    seedMember("testuser1");
    seedMember("testuser2");

    const { POST } = await import("@/app/api/watchlist/fetch/route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const events = await parseSSE(res);

    // Should have 2 progress events + 1 done event
    const progressEvents = events.filter((e) => e.event === "progress");
    expect(progressEvents).toHaveLength(2);

    // Progress events carry per-member info
    const p1 = progressEvents[0]!.data as { current: number; total: number; username: string };
    expect(p1.current).toBe(1);
    expect(p1.total).toBe(2);

    const p2 = progressEvents[1]!.data as { current: number; total: number; username: string };
    expect(p2.current).toBe(2);
    expect(p2.total).toBe(2);

    // Done event
    const doneEvent = events.find((e) => e.event === "done");
    expect(doneEvent).toBeDefined();
    const d = doneEvent!.data as { fetched: number; newPosts: number; errors: string[]; skippedOld: number; purged: number };
    expect(d.fetched).toBe(2);
    expect(d.newPosts).toBeGreaterThan(0);
    expect(d.errors).toEqual([]);
    expect(d.skippedOld).toBe(0); // mock tweets are "now"
    expect(d.purged).toBe(0);

    // Verify posts were stored
    const posts = fetchedPostsRepo.findByUserId(USER_ID);
    expect(posts.length).toBeGreaterThan(0);
  });

  test("deduplicates on second fetch (SSE stream)", async () => {
    seedMember("testuser1");

    const { POST } = await import("@/app/api/watchlist/fetch/route");

    // First fetch
    const res1 = await POST();
    const events1 = await parseSSE(res1);
    const done1 = events1.find((e) => e.event === "done")!.data as { newPosts: number };
    expect(done1.newPosts).toBeGreaterThan(0);

    // Second fetch — same tweets, should be deduped
    const res2 = await POST();
    const events2 = await parseSSE(res2);
    const done2 = events2.find((e) => e.event === "done")!.data as { newPosts: number };
    expect(done2.newPosts).toBe(0);
  });

  test("purges old posts during fetch (SSE stream)", async () => {
    const member = seedMember("testuser1");

    // Pre-seed an old post (older than 7 days max retention)
    fetchedPostsRepo.insertMany([{
      userId: USER_ID,
      memberId: member.id,
      tweetId: "very-old-tweet",
      twitterUsername: "testuser1",
      text: "Old tweet content",
      tweetJson: JSON.stringify({ id: "very-old-tweet", text: "Old tweet content" }),
      tweetCreatedAt: "2025-01-01T00:00:00.000Z",
    }]);

    expect(fetchedPostsRepo.countByUserId(USER_ID)).toBe(1);

    const { POST } = await import("@/app/api/watchlist/fetch/route");
    const res = await POST();
    const events = await parseSSE(res);
    const done = events.find((e) => e.event === "done")!.data as { purged: number };

    expect(done.purged).toBe(1);
  });
});

// =============================================================================
// GET /api/watchlist/settings
// =============================================================================

describe("GET /api/watchlist/settings", () => {
  test("returns default interval of 0 and retention of 1", async () => {
    const { GET } = await import("@/app/api/watchlist/settings/route");
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.fetchIntervalMinutes).toBe(0);
    expect(body.data.retentionDays).toBe(1);
  });

  test("returns saved settings after PUT", async () => {
    const { PUT, GET } = await import("@/app/api/watchlist/settings/route");

    await PUT(
      new Request("http://localhost/api/watchlist/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fetchIntervalMinutes: 30, retentionDays: 7 }),
      }),
    );

    const res = await GET();
    const body = await res.json();
    expect(body.data.fetchIntervalMinutes).toBe(30);
    expect(body.data.retentionDays).toBe(7);
  });
});

// =============================================================================
// PUT /api/watchlist/settings
// =============================================================================

describe("PUT /api/watchlist/settings", () => {
  test("sets a valid interval", async () => {
    const { PUT } = await import("@/app/api/watchlist/settings/route");
    const res = await PUT(
      new Request("http://localhost/api/watchlist/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fetchIntervalMinutes: 60 }),
      }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.fetchIntervalMinutes).toBe(60);
  });

  test("sets a valid retention", async () => {
    const { PUT } = await import("@/app/api/watchlist/settings/route");
    const res = await PUT(
      new Request("http://localhost/api/watchlist/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays: 3 }),
      }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.retentionDays).toBe(3);
  });

  test("rejects invalid interval", async () => {
    const { PUT } = await import("@/app/api/watchlist/settings/route");
    const res = await PUT(
      new Request("http://localhost/api/watchlist/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fetchIntervalMinutes: 7 }),
      }),
    );
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("Invalid interval");
  });

  test("rejects invalid retention", async () => {
    const { PUT } = await import("@/app/api/watchlist/settings/route");
    const res = await PUT(
      new Request("http://localhost/api/watchlist/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays: 5 }),
      }),
    );
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("Invalid retention");
  });

  test("rejects when no fields provided", async () => {
    const { PUT } = await import("@/app/api/watchlist/settings/route");
    const res = await PUT(
      new Request("http://localhost/api/watchlist/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("At least one of");
  });

  test("rejects invalid JSON", async () => {
    const { PUT } = await import("@/app/api/watchlist/settings/route");
    const res = await PUT(
      new Request("http://localhost/api/watchlist/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  test("accepts 0 to disable auto-fetch", async () => {
    const { PUT } = await import("@/app/api/watchlist/settings/route");
    const res = await PUT(
      new Request("http://localhost/api/watchlist/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fetchIntervalMinutes: 0 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.fetchIntervalMinutes).toBe(0);
  });
});

// =============================================================================
// GET /api/watchlist/posts
// =============================================================================

describe("GET /api/watchlist/posts", () => {
  test("returns empty list when no posts", async () => {
    const { GET } = await import("@/app/api/watchlist/posts/route");
    const req = new Request("http://localhost/api/watchlist/posts");
    // NextRequest needs to be constructed properly
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest(req.url));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
    expect(body.meta.untranslatedCount).toBe(0);
  });

  test("returns stored posts with parsed tweetJson", async () => {
    const member = seedMember("testuser");
    seedPost(member.id, "t1", "testuser");
    seedPost(member.id, "t2", "testuser");

    const { GET } = await import("@/app/api/watchlist/posts/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("http://localhost/api/watchlist/posts"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.meta.total).toBe(2);
    expect(body.meta.untranslatedCount).toBe(2);

    // tweetJson is parsed as `tweet`
    expect(body.data[0].tweet).toBeDefined();
    expect(body.data[0].tweet.id).toBeDefined();
  });

  test("filters by memberId", async () => {
    const m1 = seedMember("user1");
    const m2 = seedMember("user2");
    seedPost(m1.id, "t1", "user1");
    seedPost(m2.id, "t2", "user2");

    const { GET } = await import("@/app/api/watchlist/posts/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest(`http://localhost/api/watchlist/posts?memberId=${m1.id}`),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].twitterUsername).toBe("user1");
  });

  test("respects limit parameter", async () => {
    const member = seedMember("testuser");
    for (let i = 0; i < 5; i++) {
      seedPost(member.id, `t${i}`, "testuser");
    }

    const { GET } = await import("@/app/api/watchlist/posts/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/watchlist/posts?limit=2"),
    );

    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });

  test("returns 400 for invalid memberId", async () => {
    const { GET } = await import("@/app/api/watchlist/posts/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/watchlist/posts?memberId=abc"),
    );
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// POST /api/watchlist/translate
// =============================================================================

// Mock generateText for translate route tests
const mockGenerateText = mock(() =>
  Promise.resolve({ text: "模拟翻译" }),
);
mock.module("ai", () => ({
  generateText: mockGenerateText,
}));

describe("POST /api/watchlist/translate", () => {
  beforeEach(() => {
    mockGenerateText.mockClear();
    mockGenerateText.mockImplementation(() =>
      Promise.resolve({ text: "模拟翻译" }),
    );
  });

  test("returns 0 when no untranslated posts", async () => {
    const { POST } = await import("@/app/api/watchlist/translate/route");
    const res = await POST(
      new Request("http://localhost/api/watchlist/translate", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.translated).toBe(0);
    expect(body.data.remaining).toBe(0);
  });

  test("translates untranslated posts and persists results", async () => {
    // Seed AI settings
    settingsRepo.upsert(USER_ID, "ai.provider", "minimax");
    settingsRepo.upsert(USER_ID, "ai.apiKey", "test-key");
    settingsRepo.upsert(USER_ID, "ai.model", "MiniMax-M2.5");

    const member = seedMember("testuser");
    seedPost(member.id, "t1", "testuser");
    seedPost(member.id, "t2", "testuser");

    const { POST } = await import("@/app/api/watchlist/translate/route");
    const res = await POST(
      new Request("http://localhost/api/watchlist/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.translated).toBe(2);
    expect(body.data.remaining).toBe(0);

    // Verify translations are persisted
    const posts = fetchedPostsRepo.findByUserId(USER_ID);
    for (const post of posts) {
      expect(post.translatedText).toBe("模拟翻译");
      expect(post.translatedAt).not.toBeNull();
    }
  });

  test("respects limit parameter", async () => {
    settingsRepo.upsert(USER_ID, "ai.provider", "minimax");
    settingsRepo.upsert(USER_ID, "ai.apiKey", "test-key");
    settingsRepo.upsert(USER_ID, "ai.model", "MiniMax-M2.5");

    const member = seedMember("testuser");
    for (let i = 0; i < 5; i++) {
      seedPost(member.id, `t${i}`, "testuser");
    }

    const { POST } = await import("@/app/api/watchlist/translate/route");
    const res = await POST(
      new Request("http://localhost/api/watchlist/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 2 }),
      }),
    );

    const body = await res.json();
    expect(body.data.translated).toBe(2);
    expect(body.data.remaining).toBe(3);
  });
});
