import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupE2E, teardownE2E, getBaseUrl, apiRequest, apiRequestSSE } from "./setup";

// =============================================================================
// E2E Tests — Auto-Fetch & Translation Lifecycle (Multi-Watchlist)
//
// Verifies the full lifecycle:
//   1. Create watchlist → 2. Set fetch interval → 3. Add members →
//   4. Trigger fetch → 5. List posts → 6. Trigger translate → 7. Verify
//
// Server runs with MOCK_PROVIDER=true and E2E_SKIP_AUTH=true.
// Translation uses mock AI (no real API calls) — the translate endpoint
// will fail gracefully since no AI key is configured in E2E DB, which is
// acceptable: we verify the flow reaches the translate endpoint and handles
// the error correctly.
// =============================================================================

interface WatchlistData {
  id: number;
  userId: string;
  name: string;
  description: string | null;
  icon: string;
  translateEnabled: number;
  createdAt: string;
}

interface WatchlistSettingsData {
  fetchIntervalMinutes: number;
  retentionDays: number;
}

interface FetchResultData {
  fetched: number;
  newPosts: number;
  skippedOld: number;
  purged: number;
  errors: string[];
}

interface TranslateResultData {
  translated: number;
  errors: string[];
  remaining: number;
}

interface PostData {
  id: number;
  tweetId: string;
  twitterUsername: string;
  text: string;
  translatedText: string | null;
  translatedAt: string | null;
  tweetCreatedAt: string;
  fetchedAt: string;
  tweet: Record<string, unknown>;
}

interface PostsListResponse {
  success: true;
  data: PostData[];
  meta: { total: number; untranslatedCount: number };
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiError {
  error: string;
}

describe("e2e: auto-fetch lifecycle", () => {
  beforeAll(async () => {
    await setupE2E();
  }, 60_000);

  afterAll(async () => {
    await teardownE2E();
  }, 15_000);

  // Track state across sequential tests
  let watchlistId: number;
  let memberAliceId: number;
  let memberBobId: number;

  /** Helper: build API path scoped to the test watchlist. */
  function wlPath(sub: string, query = ""): string {
    return `/api/watchlists/${watchlistId}/${sub}${query}`;
  }

  // ===========================================================================
  // 0. Create watchlist
  // ===========================================================================

  describe("create watchlist", () => {
    test("POST /api/watchlists creates the test watchlist", async () => {
      const { status, data } = await apiRequest<ApiSuccess<WatchlistData>>(
        "/api/watchlists",
        {
          method: "POST",
          body: JSON.stringify({
            name: "Auto-Fetch Test",
            icon: "zap",
          }),
        },
      );
      expect(status).toBe(201);
      expect(data.success).toBe(true);
      watchlistId = data.data.id;
      expect(watchlistId).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // 1. Settings — configure fetch interval
  // ===========================================================================

  describe("settings", () => {
    test("GET settings returns defaults (interval=0, retention=1)", async () => {
      const { status, data } = await apiRequest<ApiSuccess<WatchlistSettingsData>>(
        wlPath("settings"),
      );
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.fetchIntervalMinutes).toBe(0);
      expect(data.data.retentionDays).toBe(1);
    });

    test("PUT settings sets interval to 15", async () => {
      const { status, data } = await apiRequest<ApiSuccess<WatchlistSettingsData>>(
        wlPath("settings"),
        {
          method: "PUT",
          body: JSON.stringify({ fetchIntervalMinutes: 15 }),
        },
      );
      expect(status).toBe(200);
      expect(data.data.fetchIntervalMinutes).toBe(15);
    });

    test("PUT settings sets retention to 7 days", async () => {
      const { status, data } = await apiRequest<ApiSuccess<WatchlistSettingsData>>(
        wlPath("settings"),
        {
          method: "PUT",
          body: JSON.stringify({ retentionDays: 7 }),
        },
      );
      expect(status).toBe(200);
      expect(data.data.retentionDays).toBe(7);
    });

    test("PUT settings rejects invalid interval", async () => {
      const { status, data } = await apiRequest<ApiError>(
        wlPath("settings"),
        {
          method: "PUT",
          body: JSON.stringify({ fetchIntervalMinutes: 42 }),
        },
      );
      expect(status).toBe(400);
      expect(data.error).toContain("Invalid interval");
    });

    test("PUT settings rejects invalid retention", async () => {
      const { status, data } = await apiRequest<ApiError>(
        wlPath("settings"),
        {
          method: "PUT",
          body: JSON.stringify({ retentionDays: 5 }),
        },
      );
      expect(status).toBe(400);
      expect(data.error).toContain("Invalid retention");
    });

    test("GET settings reflects updated values", async () => {
      const { data } = await apiRequest<ApiSuccess<WatchlistSettingsData>>(
        wlPath("settings"),
      );
      expect(data.data.fetchIntervalMinutes).toBe(15);
      expect(data.data.retentionDays).toBe(7);
    });
  });

  // ===========================================================================
  // 2. Add watchlist members
  // ===========================================================================

  describe("add members", () => {
    test("POST members adds alice", async () => {
      const { status, data } = await apiRequest<
        ApiSuccess<{ id: number; twitterUsername: string }>
      >(wlPath("members"), {
        method: "POST",
        body: JSON.stringify({
          twitterUsername: "alice",
          note: "Test user A",
        }),
      });
      expect(status).toBe(201);
      expect(data.data.twitterUsername).toBe("alice");
      memberAliceId = data.data.id;
    });

    test("POST members adds bob", async () => {
      const { status, data } = await apiRequest<
        ApiSuccess<{ id: number; twitterUsername: string }>
      >(wlPath("members"), {
        method: "POST",
        body: JSON.stringify({
          twitterUsername: "bob",
          note: "Test user B",
        }),
      });
      expect(status).toBe(201);
      memberBobId = data.data.id;
    });
  });

  // ===========================================================================
  // 3. Trigger fetch
  // ===========================================================================

  describe("fetch tweets", () => {
    test("POST fetch retrieves tweets for all members (SSE)", async () => {
      const { status, events } = await apiRequestSSE(
        wlPath("fetch"),
        { method: "POST" },
      );
      expect(status).toBe(200);

      // Should have progress events + done event
      const progressEvents = events.filter((e) => e.event === "progress");
      expect(progressEvents.length).toBe(2); // alice + bob

      const done = events.find((e) => e.event === "done")!.data as FetchResultData;
      expect(done.fetched).toBe(2); // alice + bob
      expect(done.newPosts).toBeGreaterThan(0);
      expect(done.errors).toEqual([]);
      expect(done.skippedOld).toBe(0); // mock tweets are "now"
      expect(done.purged).toBe(0); // no old posts to purge
    });

    test("POST fetch deduplicates on second call (SSE)", async () => {
      const { events } = await apiRequestSSE(
        wlPath("fetch"),
        { method: "POST" },
      );
      const done = events.find((e) => e.event === "done")!.data as FetchResultData;
      // Mock provider returns deterministic IDs, so second fetch = 0 new
      expect(done.newPosts).toBe(0);
    });
  });

  // ===========================================================================
  // 4. List posts
  // ===========================================================================

  describe("list posts", () => {
    test("GET posts returns fetched posts", async () => {
      const { status, data } = await apiRequest<PostsListResponse>(
        wlPath("posts"),
      );
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);
      expect(data.meta.total).toBe(data.data.length);
      expect(data.meta.untranslatedCount).toBe(data.data.length);

      // Each post has parsed tweet object
      for (const post of data.data) {
        expect(post.tweetId).toBeDefined();
        expect(post.text).toBeDefined();
        expect(post.tweet).toBeDefined();
        expect(post.translatedText).toBeNull();
      }
    });

    test("GET posts filters by memberId", async () => {
      const { data: allPosts } = await apiRequest<PostsListResponse>(
        wlPath("posts"),
      );

      const { data: alicePosts } = await apiRequest<PostsListResponse>(
        wlPath("posts", `?memberId=${memberAliceId}`),
      );
      const { data: bobPosts } = await apiRequest<PostsListResponse>(
        wlPath("posts", `?memberId=${memberBobId}`),
      );

      expect(alicePosts.data.length).toBeGreaterThan(0);
      expect(bobPosts.data.length).toBeGreaterThan(0);
      expect(alicePosts.data.length + bobPosts.data.length).toBe(
        allPosts.data.length,
      );

      // All alice posts should have username "alice"
      for (const post of alicePosts.data) {
        expect(post.twitterUsername).toBe("alice");
      }
    });

    test("GET posts respects limit", async () => {
      const { data } = await apiRequest<PostsListResponse>(
        wlPath("posts", "?limit=1"),
      );
      expect(data.data.length).toBe(1);
    });
  });

  // ===========================================================================
  // 5. Trigger translation (graceful failure — no AI key in E2E)
  // ===========================================================================

  describe("translate", () => {
    test("POST translate handles missing AI config gracefully", async () => {
      // No AI settings configured in E2E DB — translation should fail gracefully
      const { status, data } = await apiRequest<ApiSuccess<TranslateResultData>>(
        wlPath("translate"),
        { method: "POST" },
      );
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      // All posts fail to translate (no AI key), but the endpoint succeeds
      expect(data.data.translated).toBe(0);
      expect(data.data.errors.length).toBeGreaterThan(0);
      expect(data.data.remaining).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // 6. Page smoke test
  // ===========================================================================

  describe("page integration", () => {
    test("GET /watchlist returns 200 with watchlist listing", async () => {
      const res = await fetch(`${getBaseUrl()}/watchlist`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Watchlist");
    });
  });
});
