import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import { ScopedDB } from "@/db/scoped";

// Mock NextAuth's auth() so we can exercise the real (non-E2E) auth branch.
const mockAuth = mock<() => Promise<unknown>>(() => Promise.resolve(null));
mock.module("@/auth", () => ({
  auth: mockAuth,
}));

beforeEach(() => {
  createTestDb();
  delete process.env.E2E_SKIP_AUTH;
  mockAuth.mockReset();
});

afterEach(() => {
  closeDb();
  delete process.env.E2E_SKIP_AUTH;
});

describe("requireAuth", () => {
  test("returns 401 when no session", async () => {
    mockAuth.mockImplementation(() => Promise.resolve(null));
    const { requireAuth } = await import("@/lib/api-helpers");
    const result = await requireAuth();
    expect(result.error).toBeDefined();
    expect(result.db).toBeUndefined();
    const res = result.error!;
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("returns 401 when session has no user id", async () => {
    mockAuth.mockImplementation(() =>
      Promise.resolve({ user: { email: "x@y.z" } }),
    );
    const { requireAuth } = await import("@/lib/api-helpers");
    const result = await requireAuth();
    expect(result.error).toBeDefined();
    expect(result.error!.status).toBe(401);
  });

  test("returns scoped db on authenticated session", async () => {
    db.insert(users).values({ id: "real-user", email: "r@u.com" }).run();
    mockAuth.mockImplementation(() =>
      Promise.resolve({ user: { id: "real-user", email: "r@u.com" } }),
    );
    const { requireAuth } = await import("@/lib/api-helpers");
    const result = await requireAuth();
    expect(result.error).toBeUndefined();
    expect(result.db).toBeInstanceOf(ScopedDB);
  });

  test("bypasses auth with E2E_SKIP_AUTH=true and seeds user", async () => {
    process.env.E2E_SKIP_AUTH = "true";
    const { requireAuth } = await import("@/lib/api-helpers");
    const result = await requireAuth();
    expect(result.db).toBeInstanceOf(ScopedDB);
    expect(mockAuth).not.toHaveBeenCalled();
  });
});

describe("requireAuthWithWatchlist", () => {
  beforeEach(() => {
    process.env.E2E_SKIP_AUTH = "true";
  });

  test("returns 400 for invalid watchlist ID", async () => {
    const { requireAuthWithWatchlist } = await import("@/lib/api-helpers");
    const result = await requireAuthWithWatchlist(
      Promise.resolve({ id: "not-a-number" }),
    );
    expect(result.error).toBeDefined();
    expect(result.error!.status).toBe(400);
    const body = await result.error!.json();
    expect(body.error).toMatch(/Invalid watchlist/);
  });

  test("returns 404 when watchlist does not exist", async () => {
    const { requireAuthWithWatchlist } = await import("@/lib/api-helpers");
    const result = await requireAuthWithWatchlist(
      Promise.resolve({ id: "9999" }),
    );
    expect(result.error).toBeDefined();
    expect(result.error!.status).toBe(404);
  });

  test("returns db + watchlistId on success", async () => {
    const { requireAuth } = await import("@/lib/api-helpers");
    const { db: scopedDb } = await requireAuth();
    const wl = scopedDb!.watchlists.create({ name: "My List" });

    const { requireAuthWithWatchlist } = await import("@/lib/api-helpers");
    const result = await requireAuthWithWatchlist(
      Promise.resolve({ id: String(wl.id) }),
    );
    expect(result.error).toBeUndefined();
    expect(result.watchlistId).toBe(wl.id);
  });

  test("propagates unauthorized when no session (non-E2E)", async () => {
    delete process.env.E2E_SKIP_AUTH;
    mockAuth.mockImplementation(() => Promise.resolve(null));
    const { requireAuthWithWatchlist } = await import("@/lib/api-helpers");
    const result = await requireAuthWithWatchlist(
      Promise.resolve({ id: "1" }),
    );
    expect(result.error!.status).toBe(401);
  });

  test("accepts plain (non-Promise) params", async () => {
    const { requireAuthWithWatchlist } = await import("@/lib/api-helpers");
    const result = await requireAuthWithWatchlist({ id: "not-a-number" });
    expect(result.error!.status).toBe(400);
  });
});

describe("requireAuthWithGroup", () => {
  beforeEach(() => {
    process.env.E2E_SKIP_AUTH = "true";
  });

  test("returns 400 for invalid group ID", async () => {
    const { requireAuthWithGroup } = await import("@/lib/api-helpers");
    const result = await requireAuthWithGroup(
      Promise.resolve({ id: "nope" }),
    );
    expect(result.error!.status).toBe(400);
    const body = await result.error!.json();
    expect(body.error).toMatch(/Invalid group/);
  });

  test("returns 404 when group does not exist", async () => {
    const { requireAuthWithGroup } = await import("@/lib/api-helpers");
    const result = await requireAuthWithGroup(
      Promise.resolve({ id: "9999" }),
    );
    expect(result.error!.status).toBe(404);
  });

  test("returns db + groupId on success", async () => {
    const { requireAuth } = await import("@/lib/api-helpers");
    const { db: scopedDb } = await requireAuth();
    const group = scopedDb!.groups.create({ name: "Alpha" });

    const { requireAuthWithGroup } = await import("@/lib/api-helpers");
    const result = await requireAuthWithGroup(
      Promise.resolve({ id: String(group.id) }),
    );
    expect(result.error).toBeUndefined();
    expect(result.groupId).toBe(group.id);
  });

  test("propagates unauthorized when no session (non-E2E)", async () => {
    delete process.env.E2E_SKIP_AUTH;
    mockAuth.mockImplementation(() => Promise.resolve(null));
    const { requireAuthWithGroup } = await import("@/lib/api-helpers");
    const result = await requireAuthWithGroup(
      Promise.resolve({ id: "1" }),
    );
    expect(result.error!.status).toBe(401);
  });
});

describe("sseMessage", () => {
  test("formats event name and JSON-encoded data", async () => {
    const { sseMessage } = await import("@/lib/api-helpers");
    const msg = sseMessage("progress", { current: 1, total: 3 });
    expect(msg).toBe("event: progress\ndata: {\"current\":1,\"total\":3}\n\n");
  });

  test("handles null and empty payloads", async () => {
    const { sseMessage } = await import("@/lib/api-helpers");
    expect(sseMessage("x", null)).toBe("event: x\ndata: null\n\n");
    expect(sseMessage("y", {})).toBe("event: y\ndata: {}\n\n");
  });
});
