import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupE2E, teardownE2E, getBaseUrl, apiRequest } from "./setup";

// =============================================================================
// E2E Tests — Auto-Fetch & Translation Lifecycle
//
// Verifies the full lifecycle:
//   1. Set fetch interval → 2. Add watchlist members → 3. Trigger fetch →
//   4. List posts → 5. Trigger translate → 6. Verify translated posts
//
// Server runs with MOCK_PROVIDER=true and E2E_SKIP_AUTH=true.
// Translation uses mock AI (no real API calls) — the translate endpoint
// will fail gracefully since no AI key is configured in E2E DB, which is
// acceptable: we verify the flow reaches the translate endpoint and handles
// the error correctly.
// =============================================================================

interface WatchlistSettingsData {
  fetchIntervalMinutes: number;
}

interface FetchResultData {
  fetched: number;
  newPosts: number;
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
  let memberAliceId: number;
  let memberBobId: number;

  // ===========================================================================
  // 1. Settings — configure fetch interval
  // ===========================================================================

  describe("settings", () => {
    test("GET /api/watchlist/settings returns default 0", async () => {
      const { status, data } = await apiRequest<ApiSuccess<WatchlistSettingsData>>(
        "/api/watchlist/settings",
      );
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.fetchIntervalMinutes).toBe(0);
    });

    test("PUT /api/watchlist/settings sets interval to 15", async () => {
      const { status, data } = await apiRequest<ApiSuccess<WatchlistSettingsData>>(
        "/api/watchlist/settings",
        {
          method: "PUT",
          body: JSON.stringify({ fetchIntervalMinutes: 15 }),
        },
      );
      expect(status).toBe(200);
      expect(data.data.fetchIntervalMinutes).toBe(15);
    });

    test("PUT /api/watchlist/settings rejects invalid interval", async () => {
      const { status, data } = await apiRequest<ApiError>(
        "/api/watchlist/settings",
        {
          method: "PUT",
          body: JSON.stringify({ fetchIntervalMinutes: 42 }),
        },
      );
      expect(status).toBe(400);
      expect(data.error).toContain("Invalid interval");
    });

    test("GET /api/watchlist/settings reflects updated value", async () => {
      const { data } = await apiRequest<ApiSuccess<WatchlistSettingsData>>(
        "/api/watchlist/settings",
      );
      expect(data.data.fetchIntervalMinutes).toBe(15);
    });
  });

  // ===========================================================================
  // 2. Add watchlist members
  // ===========================================================================

  describe("add members", () => {
    test("POST /api/watchlist adds alice", async () => {
      const { status, data } = await apiRequest<
        ApiSuccess<{ id: number; twitterUsername: string }>
      >("/api/watchlist", {
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

    test("POST /api/watchlist adds bob", async () => {
      const { status, data } = await apiRequest<
        ApiSuccess<{ id: number; twitterUsername: string }>
      >("/api/watchlist", {
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
    test("POST /api/watchlist/fetch retrieves tweets for all members", async () => {
      const { status, data } = await apiRequest<ApiSuccess<FetchResultData>>(
        "/api/watchlist/fetch",
        { method: "POST" },
      );
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.fetched).toBe(2); // alice + bob
      expect(data.data.newPosts).toBeGreaterThan(0);
      expect(data.data.errors).toEqual([]);
    });

    test("POST /api/watchlist/fetch deduplicates on second call", async () => {
      const { data } = await apiRequest<ApiSuccess<FetchResultData>>(
        "/api/watchlist/fetch",
        { method: "POST" },
      );
      // Mock provider returns deterministic IDs, so second fetch = 0 new
      expect(data.data.newPosts).toBe(0);
    });
  });

  // ===========================================================================
  // 4. List posts
  // ===========================================================================

  describe("list posts", () => {
    test("GET /api/watchlist/posts returns fetched posts", async () => {
      const { status, data } = await apiRequest<PostsListResponse>(
        "/api/watchlist/posts",
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

    test("GET /api/watchlist/posts filters by memberId", async () => {
      const { data: allPosts } = await apiRequest<PostsListResponse>(
        "/api/watchlist/posts",
      );

      const { data: alicePosts } = await apiRequest<PostsListResponse>(
        `/api/watchlist/posts?memberId=${memberAliceId}`,
      );
      const { data: bobPosts } = await apiRequest<PostsListResponse>(
        `/api/watchlist/posts?memberId=${memberBobId}`,
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

    test("GET /api/watchlist/posts respects limit", async () => {
      const { data } = await apiRequest<PostsListResponse>(
        "/api/watchlist/posts?limit=1",
      );
      expect(data.data.length).toBe(1);
    });
  });

  // ===========================================================================
  // 5. Trigger translation (graceful failure — no AI key in E2E)
  // ===========================================================================

  describe("translate", () => {
    test("POST /api/watchlist/translate handles missing AI config gracefully", async () => {
      // No AI settings configured in E2E DB — translation should fail gracefully
      const { status, data } = await apiRequest<ApiSuccess<TranslateResultData>>(
        "/api/watchlist/translate",
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
    test("GET /watchlist returns 200 with watchlist content", async () => {
      const res = await fetch(`${getBaseUrl()}/watchlist`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Watchlist");
    });
  });
});
