import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupE2E, teardownE2E, getBaseUrl, apiRequest } from "./setup";

// =============================================================================
// E2E Tests — Watchlist & Tags Module (Multi-Watchlist)
//
// Verifies the full CRUD lifecycle for watchlists, members, and tags via the
// live API, plus page-level smoke tests. Tests run sequentially because
// later assertions depend on data created by earlier ones.
//
// Server runs with MOCK_PROVIDER=true and E2E_SKIP_AUTH=true.
// =============================================================================

interface TagData {
  id: number;
  name: string;
  color: string;
  userId: string;
  createdAt: string;
}

interface WatchlistData {
  id: number;
  userId: string;
  name: string;
  description: string | null;
  icon: string;
  translateEnabled: number;
  createdAt: string;
}

interface WatchlistMemberData {
  id: number;
  twitterUsername: string;
  note: string | null;
  addedAt: string;
  tags: TagData[];
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiError {
  error: string;
}

describe("e2e: watchlist & tags", () => {
  beforeAll(async () => {
    await setupE2E();
  }, 60_000);

  afterAll(async () => {
    await teardownE2E();
  }, 15_000);

  // Track IDs created during the test run for sequential assertions
  let watchlistId: number;
  let tagAlphaId: number;
  let tagBetaId: number;
  let memberElonId: number;
  let memberJackId: number;

  /** Helper: member API path scoped to the test watchlist. */
  function membersPath(query = ""): string {
    return `/api/watchlists/${watchlistId}/members${query}`;
  }

  // ===========================================================================
  // Watchlists API — Create the primary watchlist for subsequent tests
  // ===========================================================================

  describe("watchlists API", () => {
    test("GET /api/watchlists returns empty list initially", async () => {
      const { status, data } = await apiRequest<ApiSuccess<WatchlistData[]>>(
        "/api/watchlists",
      );
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeInstanceOf(Array);
      expect(data.data.length).toBe(0);
    });

    test("POST /api/watchlists creates a watchlist", async () => {
      const { status, data } = await apiRequest<ApiSuccess<WatchlistData>>(
        "/api/watchlists",
        {
          method: "POST",
          body: JSON.stringify({ name: "E2E Test Watchlist", icon: "eye" }),
        },
      );
      expect(status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe("E2E Test Watchlist");
      expect(data.data.icon).toBe("eye");
      expect(data.data.id).toBeGreaterThan(0);
      watchlistId = data.data.id;
    });

    test("POST /api/watchlists rejects empty name", async () => {
      const { status, data } = await apiRequest<ApiError>("/api/watchlists", {
        method: "POST",
        body: JSON.stringify({ name: "" }),
      });
      expect(status).toBe(400);
      expect(data.error).toBeDefined();
    });

    test("PUT /api/watchlists updates name", async () => {
      const { status, data } = await apiRequest<ApiSuccess<WatchlistData>>(
        "/api/watchlists",
        {
          method: "PUT",
          body: JSON.stringify({ id: watchlistId, name: "Renamed Watchlist" }),
        },
      );
      expect(status).toBe(200);
      expect(data.data.name).toBe("Renamed Watchlist");
    });

    test("GET /api/watchlists returns the watchlist", async () => {
      const { status, data } = await apiRequest<ApiSuccess<WatchlistData[]>>(
        "/api/watchlists",
      );
      expect(status).toBe(200);
      expect(data.data.length).toBe(1);
      expect(data.data[0]!.id).toBe(watchlistId);
    });
  });

  // ===========================================================================
  // Tags API — CRUD (tags are user-global, not watchlist-scoped)
  // ===========================================================================

  describe("tags API", () => {
    test("GET /api/tags returns empty list initially", async () => {
      const { status, data } = await apiRequest<ApiSuccess<TagData[]>>(
        "/api/tags",
      );
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeInstanceOf(Array);
      expect(data.data.length).toBe(0);
    });

    test("POST /api/tags creates a tag", async () => {
      const { status, data } = await apiRequest<ApiSuccess<TagData>>(
        "/api/tags",
        {
          method: "POST",
          body: JSON.stringify({ name: "alpha" }),
        },
      );
      expect(status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe("alpha");
      expect(data.data.color).toMatch(/^hsl\(/);
      expect(data.data.id).toBeGreaterThan(0);
      tagAlphaId = data.data.id;
    });

    test("POST /api/tags is idempotent for same name", async () => {
      const { status, data } = await apiRequest<ApiSuccess<TagData>>(
        "/api/tags",
        {
          method: "POST",
          body: JSON.stringify({ name: "alpha" }),
        },
      );
      // Idempotent — returns the existing tag, still 201
      expect(status).toBe(201);
      expect(data.data.id).toBe(tagAlphaId);
    });

    test("POST /api/tags creates a second tag", async () => {
      const { status, data } = await apiRequest<ApiSuccess<TagData>>(
        "/api/tags",
        {
          method: "POST",
          body: JSON.stringify({ name: "beta" }),
        },
      );
      expect(status).toBe(201);
      expect(data.data.name).toBe("beta");
      tagBetaId = data.data.id;
      expect(tagBetaId).not.toBe(tagAlphaId);
    });

    test("POST /api/tags rejects empty name", async () => {
      const { status, data } = await apiRequest<ApiError>("/api/tags", {
        method: "POST",
        body: JSON.stringify({ name: "" }),
      });
      expect(status).toBe(400);
      expect(data.error).toBeDefined();
    });

    test("GET /api/tags returns both tags", async () => {
      const { status, data } = await apiRequest<ApiSuccess<TagData[]>>(
        "/api/tags",
      );
      expect(status).toBe(200);
      expect(data.data.length).toBe(2);
      const names = data.data.map((t) => t.name).sort();
      expect(names).toEqual(["alpha", "beta"]);
    });
  });

  // ===========================================================================
  // Members API — CRUD (scoped to watchlist)
  // ===========================================================================

  describe("members API", () => {
    test("GET members returns empty list initially", async () => {
      const { status, data } = await apiRequest<
        ApiSuccess<WatchlistMemberData[]>
      >(membersPath());
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeInstanceOf(Array);
      expect(data.data.length).toBe(0);
    });

    // -------------------------------------------------------------------------
    // Create members
    // -------------------------------------------------------------------------

    test("POST members creates a member without tags", async () => {
      const { status, data } = await apiRequest<
        ApiSuccess<WatchlistMemberData>
      >(membersPath(), {
        method: "POST",
        body: JSON.stringify({
          twitterUsername: "elonmusk",
          note: "CEO of everything",
        }),
      });
      expect(status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.twitterUsername).toBe("elonmusk");
      expect(data.data.note).toBe("CEO of everything");
      expect(data.data.tags).toBeInstanceOf(Array);
      expect(data.data.tags.length).toBe(0);
      memberElonId = data.data.id;
    });

    test("POST members creates a member with tags", async () => {
      const { status, data } = await apiRequest<
        ApiSuccess<WatchlistMemberData>
      >(membersPath(), {
        method: "POST",
        body: JSON.stringify({
          twitterUsername: "@jack",
          tagIds: [tagAlphaId, tagBetaId],
        }),
      });
      expect(status).toBe(201);
      expect(data.data.twitterUsername).toBe("jack"); // @ stripped
      expect(data.data.tags.length).toBe(2);
      memberJackId = data.data.id;
    });

    test("POST members rejects duplicate username", async () => {
      const { status, data } = await apiRequest<ApiError>(membersPath(), {
        method: "POST",
        body: JSON.stringify({ twitterUsername: "elonmusk" }),
      });
      expect(status).toBe(409);
      expect(data.error).toContain("already in this watchlist");
    });

    test("POST members rejects empty username", async () => {
      const { status, data } = await apiRequest<ApiError>(membersPath(), {
        method: "POST",
        body: JSON.stringify({ twitterUsername: "" }),
      });
      expect(status).toBe(400);
      expect(data.error).toBeDefined();
    });

    // -------------------------------------------------------------------------
    // Read
    // -------------------------------------------------------------------------

    test("GET members returns both members with tags", async () => {
      const { status, data } = await apiRequest<
        ApiSuccess<WatchlistMemberData[]>
      >(membersPath());
      expect(status).toBe(200);
      expect(data.data.length).toBe(2);

      const elon = data.data.find((m) => m.twitterUsername === "elonmusk");
      const jack = data.data.find((m) => m.twitterUsername === "jack");

      expect(elon).toBeDefined();
      expect(elon?.note).toBe("CEO of everything");
      expect(elon?.tags.length).toBe(0);

      expect(jack).toBeDefined();
      expect(jack?.tags.length).toBe(2);
    });

    // -------------------------------------------------------------------------
    // Update
    // -------------------------------------------------------------------------

    test("PUT members updates note", async () => {
      const { status, data } = await apiRequest<
        ApiSuccess<WatchlistMemberData>
      >(membersPath(), {
        method: "PUT",
        body: JSON.stringify({
          id: memberElonId,
          note: "Updated note",
        }),
      });
      expect(status).toBe(200);
      expect(data.data.note).toBe("Updated note");
    });

    test("PUT members updates tags", async () => {
      const { status, data } = await apiRequest<
        ApiSuccess<WatchlistMemberData>
      >(membersPath(), {
        method: "PUT",
        body: JSON.stringify({
          id: memberElonId,
          tagIds: [tagAlphaId],
        }),
      });
      expect(status).toBe(200);
      expect(data.data.tags.length).toBe(1);
      expect(data.data.tags[0]?.name).toBe("alpha");
    });

    test("PUT members clears note with null", async () => {
      const { status, data } = await apiRequest<
        ApiSuccess<WatchlistMemberData>
      >(membersPath(), {
        method: "PUT",
        body: JSON.stringify({
          id: memberElonId,
          note: null,
        }),
      });
      expect(status).toBe(200);
      expect(data.data.note).toBeNull();
    });

    test("PUT members rejects missing id", async () => {
      const { status, data } = await apiRequest<ApiError>(membersPath(), {
        method: "PUT",
        body: JSON.stringify({ note: "no id" }),
      });
      expect(status).toBe(400);
      expect(data.error).toBeDefined();
    });

    test("PUT members returns 404 for non-existent id", async () => {
      const { status, data } = await apiRequest<ApiError>(membersPath(), {
        method: "PUT",
        body: JSON.stringify({ id: 99999, note: "ghost" }),
      });
      expect(status).toBe(404);
      expect(data.error).toContain("not found");
    });

    // -------------------------------------------------------------------------
    // Delete
    // -------------------------------------------------------------------------

    test("DELETE members removes a member", async () => {
      const { status, data } = await apiRequest<
        ApiSuccess<{ deleted: boolean }>
      >(membersPath(`?id=${memberJackId}`), {
        method: "DELETE",
      });
      expect(status).toBe(200);
      expect(data.data.deleted).toBe(true);

      // Verify it's gone
      const list = await apiRequest<ApiSuccess<WatchlistMemberData[]>>(
        membersPath(),
      );
      expect(list.data.data.length).toBe(1);
      expect(list.data.data[0]?.twitterUsername).toBe("elonmusk");
    });

    test("DELETE members returns 404 for non-existent id", async () => {
      const { status, data } = await apiRequest<ApiError>(
        membersPath("?id=99999"),
        { method: "DELETE" },
      );
      expect(status).toBe(404);
      expect(data.error).toContain("not found");
    });

    test("DELETE members rejects missing id param", async () => {
      const { status, data } = await apiRequest<ApiError>(membersPath(), {
        method: "DELETE",
      });
      expect(status).toBe(400);
      expect(data.error).toBeDefined();
    });
  });

  // ===========================================================================
  // Tag deletion cascades
  // ===========================================================================

  describe("tag deletion", () => {
    test("deleting a tag removes it from members", async () => {
      // First, verify elon still has tag alpha
      const before = await apiRequest<ApiSuccess<WatchlistMemberData[]>>(
        membersPath(),
      );
      const elonBefore = before.data.data.find(
        (m) => m.twitterUsername === "elonmusk",
      );
      expect(elonBefore!.tags.length).toBe(1);
      expect(elonBefore!.tags[0]?.id).toBe(tagAlphaId);

      // Delete tag alpha
      const { status } = await apiRequest<ApiSuccess<{ deleted: boolean }>>(
        `/api/tags?id=${tagAlphaId}`,
        { method: "DELETE" },
      );
      expect(status).toBe(200);

      // Verify tag is removed from member
      const after = await apiRequest<ApiSuccess<WatchlistMemberData[]>>(
        membersPath(),
      );
      const elonAfter = after.data.data.find(
        (m) => m.twitterUsername === "elonmusk",
      );
      expect(elonAfter!.tags.length).toBe(0);

      // Verify tag is gone from tags list
      const tags = await apiRequest<ApiSuccess<TagData[]>>("/api/tags");
      expect(tags.data.data.find((t) => t.id === tagAlphaId)).toBeUndefined();
    });

    test("DELETE /api/tags returns 404 for non-existent id", async () => {
      const { status, data } = await apiRequest<ApiError>(
        `/api/tags?id=99999`,
        { method: "DELETE" },
      );
      expect(status).toBe(404);
      expect(data.error).toContain("not found");
    });
  });

  // ===========================================================================
  // Watchlist deletion
  // ===========================================================================

  describe("watchlist deletion", () => {
    test("DELETE /api/watchlists removes a watchlist", async () => {
      // Create a throwaway watchlist
      const { data: created } = await apiRequest<ApiSuccess<WatchlistData>>(
        "/api/watchlists",
        {
          method: "POST",
          body: JSON.stringify({ name: "To Delete" }),
        },
      );
      const tempId = created.data.id;

      const { status, data } = await apiRequest<
        ApiSuccess<{ deleted: boolean }>
      >(`/api/watchlists?id=${tempId}`, { method: "DELETE" });
      expect(status).toBe(200);
      expect(data.data.deleted).toBe(true);

      // Verify it's gone (only the original watchlist remains)
      const list = await apiRequest<ApiSuccess<WatchlistData[]>>(
        "/api/watchlists",
      );
      expect(list.data.data.find((w) => w.id === tempId)).toBeUndefined();
    });

    test("DELETE /api/watchlists returns 404 for non-existent id", async () => {
      const { status, data } = await apiRequest<ApiError>(
        `/api/watchlists?id=99999`,
        { method: "DELETE" },
      );
      expect(status).toBe(404);
      expect(data.error).toContain("not found");
    });

    test("DELETE /api/watchlists rejects missing id", async () => {
      const { status, data } = await apiRequest<ApiError>("/api/watchlists", {
        method: "DELETE",
      });
      expect(status).toBe(400);
      expect(data.error).toBeDefined();
    });
  });

  // ===========================================================================
  // Page integration
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
