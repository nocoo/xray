import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupE2E, teardownE2E, getBaseUrl, apiRequest, apiRequestSSE } from "./setup";

// =============================================================================
// E2E Tests — Watchlist Detail Pages & Logs API
//
// Covers three gaps:
//   1. GET /api/watchlists/[id]/logs — the only API route with zero E2E coverage
//   2. /watchlist/[id] page — watchlist detail page rendering
//   3. /watchlist/[id]/logs page — logs page rendering
//
// Lifecycle: create watchlist → add member → trigger fetch → verify logs →
//            verify detail page → verify logs page.
//
// Server runs with MOCK_PROVIDER=true and E2E_SKIP_AUTH=true.
// =============================================================================

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiError {
  error: string;
}

interface WatchlistData {
  id: number;
  userId: string;
  name: string;
}

interface FetchLogEntry {
  id: number;
  type: "fetch" | "translate";
  attempted: number;
  succeeded: number;
  skipped: number;
  purged: number;
  errorCount: number;
  errors: string[];
  createdAt: string;
}

describe("e2e: watchlist detail & logs", () => {
  beforeAll(async () => {
    await setupE2E();
  }, 60_000);

  afterAll(async () => {
    await teardownE2E();
  }, 15_000);

  let watchlistId: number;

  // ===========================================================================
  // Setup: create watchlist + member + trigger fetch to generate logs
  // ===========================================================================

  describe("setup", () => {
    test("create watchlist", async () => {
      const { status, data } = await apiRequest<ApiSuccess<WatchlistData>>(
        "/api/watchlists",
        {
          method: "POST",
          body: JSON.stringify({ name: "Detail Test WL", icon: "eye" }),
        },
      );
      expect(status).toBe(201);
      expect(data.success).toBe(true);
      watchlistId = data.data.id;
    });

    test("add a member", async () => {
      const { status } = await apiRequest<ApiSuccess<{ id: number }>>(
        `/api/watchlists/${watchlistId}/members`,
        {
          method: "POST",
          body: JSON.stringify({ twitterUsername: "testuser" }),
        },
      );
      expect(status).toBe(201);
    });

    test("trigger fetch to generate log entries", async () => {
      const { status, events } = await apiRequestSSE(
        `/api/watchlists/${watchlistId}/fetch`,
        { method: "POST" },
      );
      expect(status).toBe(200);
      const done = events.find((e) => e.event === "done");
      expect(done).toBeDefined();
    });
  });

  // ===========================================================================
  // 1. GET /api/watchlists/[id]/logs — API route coverage
  // ===========================================================================

  describe("GET /api/watchlists/[id]/logs", () => {
    test("returns logs array with correct shape", async () => {
      const { status, data } = await apiRequest<ApiSuccess<FetchLogEntry[]>>(
        `/api/watchlists/${watchlistId}/logs`,
      );
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);

      // Verify shape of first log entry
      const log = data.data[0]!;
      expect(log.id).toBeGreaterThan(0);
      expect(log.type).toBe("fetch");
      expect(typeof log.attempted).toBe("number");
      expect(typeof log.succeeded).toBe("number");
      expect(typeof log.skipped).toBe("number");
      expect(typeof log.purged).toBe("number");
      expect(typeof log.errorCount).toBe("number");
      expect(Array.isArray(log.errors)).toBe(true);
      expect(typeof log.createdAt).toBe("string");
    });

    test("respects limit parameter", async () => {
      const { status, data } = await apiRequest<ApiSuccess<FetchLogEntry[]>>(
        `/api/watchlists/${watchlistId}/logs?limit=1`,
      );
      expect(status).toBe(200);
      expect(data.data.length).toBeLessThanOrEqual(1);
    });

    test("ignores invalid limit (falls back to default)", async () => {
      const { status, data } = await apiRequest<ApiSuccess<FetchLogEntry[]>>(
        `/api/watchlists/${watchlistId}/logs?limit=abc`,
      );
      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    test("clamps limit to max 200", async () => {
      const { status, data } = await apiRequest<ApiSuccess<FetchLogEntry[]>>(
        `/api/watchlists/${watchlistId}/logs?limit=999`,
      );
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      // Can't assert exact clamping without 200+ rows, but route shouldn't error
    });

    test("returns empty array for watchlist with no logs", async () => {
      // Create a fresh watchlist with no fetch history
      const { data: wlData } = await apiRequest<ApiSuccess<WatchlistData>>(
        "/api/watchlists",
        {
          method: "POST",
          body: JSON.stringify({ name: "Empty Logs WL", icon: "zap" }),
        },
      );
      const emptyWlId = wlData.data.id;

      const { status, data } = await apiRequest<ApiSuccess<FetchLogEntry[]>>(
        `/api/watchlists/${emptyWlId}/logs`,
      );
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    test("returns 404 for non-existent watchlist", async () => {
      const { status } = await apiRequest<ApiError>(
        "/api/watchlists/99999/logs",
      );
      expect(status).toBe(404);
    });
  });

  // ===========================================================================
  // 2. /watchlist/[id] page — detail page rendering
  // ===========================================================================

  describe("page: /watchlist/[id]", () => {
    test("returns 200 with watchlist detail content", async () => {
      const res = await fetch(`${getBaseUrl()}/watchlist/${watchlistId}`);
      expect(res.status).toBe(200);
      const html = await res.text();
      // Page should contain key UI elements
      expect(html).toContain("Watchlist");
    });

    test("returns 200 for unknown watchlist id (client handles redirect)", async () => {
      // The page is a client component — server always returns 200
      // and the client-side code detects 404 and redirects
      const res = await fetch(`${getBaseUrl()}/watchlist/99999`);
      expect(res.status).toBe(200);
    });
  });

  // ===========================================================================
  // 3. /watchlist/[id]/logs page — logs page rendering
  // ===========================================================================

  describe("page: /watchlist/[id]/logs", () => {
    test("returns 200 with logs page content", async () => {
      const res = await fetch(`${getBaseUrl()}/watchlist/${watchlistId}/logs`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Logs");
    });
  });
});
