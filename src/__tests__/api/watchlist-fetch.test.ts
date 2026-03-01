import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users, watchlistMembers } from "@/db/schema";
import * as watchlistsRepo from "@/db/repositories/watchlists";
import * as fetchedPostsRepo from "@/db/repositories/fetched-posts";
import * as settingsRepo from "@/db/repositories/settings";

// =============================================================================
// Setup: E2E_SKIP_AUTH + MOCK_PROVIDER for all API route tests
// =============================================================================

const USER_ID = "e2e-test-user";
let watchlistId: number;

function ctx(id?: number) {
  return { params: Promise.resolve({ id: String(id ?? watchlistId) }) };
}

beforeEach(() => {
  createTestDb();
  process.env.E2E_SKIP_AUTH = "true";
  process.env.MOCK_PROVIDER = "true";
  db.insert(users)
    .values({ id: USER_ID, name: "E2E Test User", email: "e2e@test.com" })
    .run();
  // Create a default watchlist for all tests
  const wl = watchlistsRepo.create({ userId: USER_ID, name: "Test WL" });
  watchlistId = wl.id;
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
      watchlistId,
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
    watchlistId,
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

// =============================================================================
// POST /api/watchlists/[id]/fetch
// =============================================================================

describe("POST /api/watchlists/[id]/fetch", () => {
  test("returns 0 when no watchlist members", async () => {
    const { POST } = await import("@/app/api/watchlists/[id]/fetch/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx());
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

    const { POST } = await import("@/app/api/watchlists/[id]/fetch/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const events = await parseSSE(res);

    // Should have 2 progress events + 1 done event (plus possible posts events)
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
    const posts = fetchedPostsRepo.findByWatchlistId(watchlistId);
    expect(posts.length).toBeGreaterThan(0);
  });

  test("deduplicates on second fetch (SSE stream)", async () => {
    seedMember("testuser1");

    const { POST } = await import("@/app/api/watchlists/[id]/fetch/route");

    // First fetch
    const res1 = await POST(new Request("http://localhost", { method: "POST" }), ctx());
    const events1 = await parseSSE(res1);
    const done1 = events1.find((e) => e.event === "done")!.data as { newPosts: number };
    expect(done1.newPosts).toBeGreaterThan(0);

    // Second fetch — same tweets, should be deduped
    const res2 = await POST(new Request("http://localhost", { method: "POST" }), ctx());
    const events2 = await parseSSE(res2);
    const done2 = events2.find((e) => e.event === "done")!.data as { newPosts: number };
    expect(done2.newPosts).toBe(0);
  });

  test("purges old posts during fetch (SSE stream)", async () => {
    const member = seedMember("testuser1");

    // Pre-seed an old post (older than 7 days max retention)
    fetchedPostsRepo.insertMany([{
      userId: USER_ID,
      watchlistId,
      memberId: member.id,
      tweetId: "very-old-tweet",
      twitterUsername: "testuser1",
      text: "Old tweet content",
      tweetJson: JSON.stringify({ id: "very-old-tweet", text: "Old tweet content" }),
      tweetCreatedAt: "2025-01-01T00:00:00.000Z",
    }]);

    expect(fetchedPostsRepo.countByWatchlistId(watchlistId)).toBe(1);

    const { POST } = await import("@/app/api/watchlists/[id]/fetch/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }), ctx());
    const events = await parseSSE(res);
    const done = events.find((e) => e.event === "done")!.data as { purged: number };

    expect(done.purged).toBe(1);
  });
});

// =============================================================================
// GET /api/watchlists/[id]/settings
// =============================================================================

describe("GET /api/watchlists/[id]/settings", () => {
  test("returns default interval of 0 and retention of 1", async () => {
    const { GET } = await import("@/app/api/watchlists/[id]/settings/route");
    const res = await GET(new Request("http://localhost"), ctx());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.fetchIntervalMinutes).toBe(0);
    expect(body.data.retentionDays).toBe(1);
  });

  test("returns saved settings after PUT", async () => {
    const { PUT, GET } = await import("@/app/api/watchlists/[id]/settings/route");

    await PUT(
      new Request("http://localhost/api/watchlists/1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fetchIntervalMinutes: 30, retentionDays: 7 }),
      }),
      ctx(),
    );

    const res = await GET(new Request("http://localhost"), ctx());
    const body = await res.json();
    expect(body.data.fetchIntervalMinutes).toBe(30);
    expect(body.data.retentionDays).toBe(7);
  });
});

// =============================================================================
// PUT /api/watchlists/[id]/settings
// =============================================================================

describe("PUT /api/watchlists/[id]/settings", () => {
  test("sets a valid interval", async () => {
    const { PUT } = await import("@/app/api/watchlists/[id]/settings/route");
    const res = await PUT(
      new Request("http://localhost/api/watchlists/1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fetchIntervalMinutes: 60 }),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.fetchIntervalMinutes).toBe(60);
  });

  test("sets a valid retention", async () => {
    const { PUT } = await import("@/app/api/watchlists/[id]/settings/route");
    const res = await PUT(
      new Request("http://localhost/api/watchlists/1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays: 3 }),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.retentionDays).toBe(3);
  });

  test("rejects invalid interval", async () => {
    const { PUT } = await import("@/app/api/watchlists/[id]/settings/route");
    const res = await PUT(
      new Request("http://localhost/api/watchlists/1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fetchIntervalMinutes: 7 }),
      }),
      ctx(),
    );
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("Invalid interval");
  });

  test("rejects invalid retention", async () => {
    const { PUT } = await import("@/app/api/watchlists/[id]/settings/route");
    const res = await PUT(
      new Request("http://localhost/api/watchlists/1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays: 5 }),
      }),
      ctx(),
    );
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("Invalid retention");
  });

  test("rejects when no fields provided", async () => {
    const { PUT } = await import("@/app/api/watchlists/[id]/settings/route");
    const res = await PUT(
      new Request("http://localhost/api/watchlists/1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("At least one of");
  });

  test("rejects invalid JSON", async () => {
    const { PUT } = await import("@/app/api/watchlists/[id]/settings/route");
    const res = await PUT(
      new Request("http://localhost/api/watchlists/1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });

  test("accepts 0 to disable auto-fetch", async () => {
    const { PUT } = await import("@/app/api/watchlists/[id]/settings/route");
    const res = await PUT(
      new Request("http://localhost/api/watchlists/1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fetchIntervalMinutes: 0 }),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.fetchIntervalMinutes).toBe(0);
  });
});

// =============================================================================
// GET /api/watchlists/[id]/posts
// =============================================================================

describe("GET /api/watchlists/[id]/posts", () => {
  test("returns empty list when no posts", async () => {
    const { GET } = await import("@/app/api/watchlists/[id]/posts/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/watchlists/1/posts"),
      ctx(),
    );
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

    const { GET } = await import("@/app/api/watchlists/[id]/posts/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/watchlists/1/posts"),
      ctx(),
    );
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

    const { GET } = await import("@/app/api/watchlists/[id]/posts/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest(`http://localhost/api/watchlists/1/posts?memberId=${m1.id}`),
      ctx(),
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

    const { GET } = await import("@/app/api/watchlists/[id]/posts/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/watchlists/1/posts?limit=2"),
      ctx(),
    );

    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });

  test("returns 400 for invalid memberId", async () => {
    const { GET } = await import("@/app/api/watchlists/[id]/posts/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(
      new NextRequest("http://localhost/api/watchlists/1/posts?memberId=abc"),
      ctx(),
    );
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// POST /api/watchlists/[id]/translate
// =============================================================================

// Mock generateText for translate route tests
const mockGenerateText = mock(() =>
  Promise.resolve({ text: "模拟翻译" }),
);
mock.module("ai", () => ({
  generateText: mockGenerateText,
}));

describe("POST /api/watchlists/[id]/translate", () => {
  beforeEach(() => {
    mockGenerateText.mockClear();
    mockGenerateText.mockImplementation(() =>
      Promise.resolve({ text: "模拟翻译" }),
    );
  });

  test("returns 0 when no untranslated posts", async () => {
    const { POST } = await import("@/app/api/watchlists/[id]/translate/route");
    const res = await POST(
      new Request("http://localhost/api/watchlists/1/translate", {
        method: "POST",
      }),
      ctx(),
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

    const { POST } = await import("@/app/api/watchlists/[id]/translate/route");
    const res = await POST(
      new Request("http://localhost/api/watchlists/1/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.translated).toBe(2);
    expect(body.data.remaining).toBe(0);

    // Verify translations are persisted
    const posts = fetchedPostsRepo.findByWatchlistId(watchlistId);
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

    const { POST } = await import("@/app/api/watchlists/[id]/translate/route");
    const res = await POST(
      new Request("http://localhost/api/watchlists/1/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 2 }),
      }),
      ctx(),
    );

    const body = await res.json();
    expect(body.data.translated).toBe(2);
    expect(body.data.remaining).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Single-post mode
  // ---------------------------------------------------------------------------

  test("translates a single post by postId", async () => {
    settingsRepo.upsert(USER_ID, "ai.provider", "minimax");
    settingsRepo.upsert(USER_ID, "ai.apiKey", "test-key");
    settingsRepo.upsert(USER_ID, "ai.model", "MiniMax-M2.5");

    const member = seedMember("testuser");
    seedPost(member.id, "t1", "testuser");
    seedPost(member.id, "t2", "testuser");

    const posts = fetchedPostsRepo.findByWatchlistId(watchlistId);
    const targetPost = posts.find((p) => p.tweetId === "t1")!;

    const { POST } = await import("@/app/api/watchlists/[id]/translate/route");
    const res = await POST(
      new Request("http://localhost/api/watchlists/1/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: targetPost.id }),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.translated).toBe(1);
    expect(body.data.remaining).toBe(1); // t2 still untranslated
    expect(body.data.translatedText).toBe("模拟翻译");

    // Verify persisted
    const updated = fetchedPostsRepo.findById(targetPost.id)!;
    expect(updated.translatedText).toBe("模拟翻译");
    expect(updated.translatedAt).not.toBeNull();
  });

  test("returns 404 for non-existent postId", async () => {
    const { POST } = await import("@/app/api/watchlists/[id]/translate/route");
    const res = await POST(
      new Request("http://localhost/api/watchlists/1/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: 99999 }),
      }),
      ctx(),
    );
    expect(res.status).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // Stream mode
  // ---------------------------------------------------------------------------

  test("stream mode returns SSE with per-post translation events", async () => {
    settingsRepo.upsert(USER_ID, "ai.provider", "minimax");
    settingsRepo.upsert(USER_ID, "ai.apiKey", "test-key");
    settingsRepo.upsert(USER_ID, "ai.model", "MiniMax-M2.5");

    const member = seedMember("testuser");
    seedPost(member.id, "t1", "testuser");
    seedPost(member.id, "t2", "testuser");

    const { POST } = await import("@/app/api/watchlists/[id]/translate/route");
    const res = await POST(
      new Request("http://localhost/api/watchlists/1/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream: true }),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const events = await parseSSE(res);

    // Should have 2 translated events + 1 done event
    const translatedEvents = events.filter((e) => e.event === "translated");
    expect(translatedEvents).toHaveLength(2);

    // Each translated event has postId, translatedText, current, total
    for (const te of translatedEvents) {
      const d = te.data as {
        postId: number;
        translatedText: string;
        commentText: string;
        current: number;
        total: number;
      };
      expect(d.postId).toBeGreaterThan(0);
      expect(d.translatedText).toBe("模拟翻译");
      expect(d.commentText).toBe(""); // mock has no markers, fallback = empty
      expect(d.total).toBe(2);
    }

    // Verify current increments
    const t1 = translatedEvents[0]!.data as { current: number };
    const t2 = translatedEvents[1]!.data as { current: number };
    expect(t1.current).toBe(1);
    expect(t2.current).toBe(2);

    // Done event
    const doneEvent = events.find((e) => e.event === "done");
    expect(doneEvent).toBeDefined();
    const d = doneEvent!.data as {
      translated: number;
      errors: string[];
      remaining: number;
    };
    expect(d.translated).toBe(2);
    expect(d.errors).toEqual([]);
    expect(d.remaining).toBe(0);

    // Verify translations are persisted in DB
    const posts = fetchedPostsRepo.findByWatchlistId(watchlistId);
    for (const post of posts) {
      expect(post.translatedText).toBe("模拟翻译");
      expect(post.translatedAt).not.toBeNull();
    }
  });

  test("stream mode returns JSON when no untranslated posts", async () => {
    const { POST } = await import("@/app/api/watchlists/[id]/translate/route");
    const res = await POST(
      new Request("http://localhost/api/watchlists/1/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream: true }),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);

    // Empty case returns JSON even in stream mode
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.translated).toBe(0);
  });

  test("stream mode emits error events for failed translations", async () => {
    settingsRepo.upsert(USER_ID, "ai.provider", "minimax");
    settingsRepo.upsert(USER_ID, "ai.apiKey", "test-key");
    settingsRepo.upsert(USER_ID, "ai.model", "MiniMax-M2.5");

    const member = seedMember("testuser");
    seedPost(member.id, "t1", "testuser");

    // Make generateText fail
    mockGenerateText.mockImplementation(() =>
      Promise.reject(new Error("API rate limit exceeded")),
    );

    const { POST } = await import("@/app/api/watchlists/[id]/translate/route");
    const res = await POST(
      new Request("http://localhost/api/watchlists/1/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream: true }),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const events = await parseSSE(res);

    // Should have 1 error event + 1 done event
    const errorEvents = events.filter((e) => e.event === "error");
    expect(errorEvents).toHaveLength(1);

    const errData = errorEvents[0]!.data as {
      postId: number;
      error: string;
      current: number;
      total: number;
    };
    expect(errData.error).toContain("API rate limit exceeded");
    expect(errData.current).toBe(1);
    expect(errData.total).toBe(1);

    // Done event reflects the error
    const doneEvent = events.find((e) => e.event === "done");
    const d = doneEvent!.data as {
      translated: number;
      errors: string[];
      remaining: number;
    };
    expect(d.translated).toBe(0);
    expect(d.errors).toHaveLength(1);
    expect(d.remaining).toBe(1); // still untranslated

    // Verify post was NOT updated in DB
    const posts = fetchedPostsRepo.findByWatchlistId(watchlistId);
    expect(posts[0]!.translatedText).toBeNull();
  });

  test("stream mode respects limit parameter", async () => {
    settingsRepo.upsert(USER_ID, "ai.provider", "minimax");
    settingsRepo.upsert(USER_ID, "ai.apiKey", "test-key");
    settingsRepo.upsert(USER_ID, "ai.model", "MiniMax-M2.5");

    const member = seedMember("testuser");
    for (let i = 0; i < 5; i++) {
      seedPost(member.id, `t${i}`, "testuser");
    }

    const { POST } = await import("@/app/api/watchlists/[id]/translate/route");
    const res = await POST(
      new Request("http://localhost/api/watchlists/1/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream: true, limit: 2 }),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);

    const events = await parseSSE(res);
    const translatedEvents = events.filter((e) => e.event === "translated");
    expect(translatedEvents).toHaveLength(2);

    const doneEvent = events.find((e) => e.event === "done");
    const d = doneEvent!.data as { translated: number; remaining: number };
    expect(d.translated).toBe(2);
    expect(d.remaining).toBe(3);
  });
});
