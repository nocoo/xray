import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import * as watchlistsRepo from "@/db/repositories/watchlists";
import * as fetchLogsRepo from "@/db/repositories/fetch-logs";

// =============================================================================
// Helpers
// =============================================================================

function seedUser(id = "u1") {
  db.insert(users)
    .values({ id, name: "Test User", email: `${id}@example.com` })
    .run();
}

function seedWatchlist(userId = "u1", name = "Default") {
  return watchlistsRepo.create({ userId, name });
}

// =============================================================================
// Tests
// =============================================================================

describe("fetch-logs repository", () => {
  let wlId: number;

  beforeEach(() => {
    createTestDb();
    seedUser("u1");
    wlId = seedWatchlist("u1").id;
  });

  afterEach(() => {
    closeDb();
  });

  // ── insert ──

  test("insert creates a log entry and returns it", () => {
    const log = fetchLogsRepo.insert({
      userId: "u1",
      watchlistId: wlId,
      type: "fetch",
      attempted: 10,
      succeeded: 5,
      skipped: 3,
      purged: 2,
      errorCount: 2,
      errors: JSON.stringify(["@user1: timeout", "@user2: rate limit"]),
    });

    expect(log.id).toBeGreaterThan(0);
    expect(log.watchlistId).toBe(wlId);
    expect(log.type).toBe("fetch");
    expect(log.attempted).toBe(10);
    expect(log.succeeded).toBe(5);
    expect(log.skipped).toBe(3);
    expect(log.purged).toBe(2);
    expect(log.errorCount).toBe(2);
    expect(log.errors).toBe(JSON.stringify(["@user1: timeout", "@user2: rate limit"]));
    expect(log.createdAt).toBeTruthy();
  });

  test("insert with null errors when no errors", () => {
    const log = fetchLogsRepo.insert({
      userId: "u1",
      watchlistId: wlId,
      type: "translate",
      attempted: 5,
      succeeded: 5,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    expect(log.errors).toBeNull();
    expect(log.errorCount).toBe(0);
  });

  // ── findByWatchlistId ──

  test("findByWatchlistId returns logs in newest-first order", () => {
    fetchLogsRepo.insert({
      userId: "u1",
      watchlistId: wlId,
      type: "fetch",
      attempted: 5,
      succeeded: 3,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    fetchLogsRepo.insert({
      userId: "u1",
      watchlistId: wlId,
      type: "translate",
      attempted: 10,
      succeeded: 8,
      skipped: 0,
      purged: 0,
      errorCount: 2,
      errors: JSON.stringify(["error1", "error2"]),
    });

    const logs = fetchLogsRepo.findByWatchlistId(wlId);
    expect(logs).toHaveLength(2);
    // Newest first — translate was inserted second (higher id)
    expect(logs[0]!.id).toBeGreaterThan(logs[1]!.id);
  });

  test("findByWatchlistId respects limit", () => {
    for (let i = 0; i < 5; i++) {
      fetchLogsRepo.insert({
        userId: "u1",
        watchlistId: wlId,
        type: "fetch",
        attempted: i,
        succeeded: i,
        skipped: 0,
        purged: 0,
        errorCount: 0,
        errors: null,
      });
    }

    const logs = fetchLogsRepo.findByWatchlistId(wlId, 3);
    expect(logs).toHaveLength(3);
  });

  test("findByWatchlistId scoped to watchlist", () => {
    const wl2 = seedWatchlist("u1", "Second");

    fetchLogsRepo.insert({
      userId: "u1",
      watchlistId: wlId,
      type: "fetch",
      attempted: 1,
      succeeded: 1,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    fetchLogsRepo.insert({
      userId: "u1",
      watchlistId: wl2.id,
      type: "translate",
      attempted: 2,
      succeeded: 2,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    const wl1Logs = fetchLogsRepo.findByWatchlistId(wlId);
    expect(wl1Logs).toHaveLength(1);
    expect(wl1Logs[0]!.type).toBe("fetch");

    const wl2Logs = fetchLogsRepo.findByWatchlistId(wl2.id);
    expect(wl2Logs).toHaveLength(1);
    expect(wl2Logs[0]!.type).toBe("translate");
  });

  // ── findById ──

  test("findById returns a specific log entry", () => {
    const inserted = fetchLogsRepo.insert({
      userId: "u1",
      watchlistId: wlId,
      type: "fetch",
      attempted: 10,
      succeeded: 7,
      skipped: 2,
      purged: 1,
      errorCount: 1,
      errors: JSON.stringify(["@foo: bar"]),
    });

    const found = fetchLogsRepo.findById(inserted.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(inserted.id);
    expect(found!.attempted).toBe(10);
  });

  test("findById returns undefined for non-existent id", () => {
    const found = fetchLogsRepo.findById(999);
    expect(found).toBeUndefined();
  });

  // ── countByWatchlistId ──

  test("countByWatchlistId returns correct count", () => {
    expect(fetchLogsRepo.countByWatchlistId(wlId)).toBe(0);

    fetchLogsRepo.insert({
      userId: "u1",
      watchlistId: wlId,
      type: "fetch",
      attempted: 1,
      succeeded: 1,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    fetchLogsRepo.insert({
      userId: "u1",
      watchlistId: wlId,
      type: "translate",
      attempted: 1,
      succeeded: 1,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    expect(fetchLogsRepo.countByWatchlistId(wlId)).toBe(2);
  });

  test("countByWatchlistId scoped to watchlist", () => {
    const wl2 = seedWatchlist("u1", "Second");

    fetchLogsRepo.insert({
      userId: "u1",
      watchlistId: wlId,
      type: "fetch",
      attempted: 1,
      succeeded: 1,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    fetchLogsRepo.insert({
      userId: "u1",
      watchlistId: wl2.id,
      type: "fetch",
      attempted: 1,
      succeeded: 1,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    expect(fetchLogsRepo.countByWatchlistId(wlId)).toBe(1);
    expect(fetchLogsRepo.countByWatchlistId(wl2.id)).toBe(1);
  });

  // ── deleteByWatchlistId ──

  test("deleteByWatchlistId removes all logs for a watchlist", () => {
    fetchLogsRepo.insert({
      userId: "u1",
      watchlistId: wlId,
      type: "fetch",
      attempted: 1,
      succeeded: 1,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    fetchLogsRepo.insert({
      userId: "u1",
      watchlistId: wlId,
      type: "translate",
      attempted: 1,
      succeeded: 1,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    const deleted = fetchLogsRepo.deleteByWatchlistId(wlId);
    expect(deleted).toBe(2);
    expect(fetchLogsRepo.countByWatchlistId(wlId)).toBe(0);
  });

  test("deleteByWatchlistId does not affect other watchlists", () => {
    const wl2 = seedWatchlist("u1", "Second");

    fetchLogsRepo.insert({
      userId: "u1",
      watchlistId: wlId,
      type: "fetch",
      attempted: 1,
      succeeded: 1,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    fetchLogsRepo.insert({
      userId: "u1",
      watchlistId: wl2.id,
      type: "fetch",
      attempted: 1,
      succeeded: 1,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    fetchLogsRepo.deleteByWatchlistId(wlId);
    expect(fetchLogsRepo.countByWatchlistId(wlId)).toBe(0);
    expect(fetchLogsRepo.countByWatchlistId(wl2.id)).toBe(1);
  });

  // ── cascade: deleting watchlist cascades to logs ──

  test("deleting watchlist cascades to fetch logs", () => {
    fetchLogsRepo.insert({
      userId: "u1",
      watchlistId: wlId,
      type: "fetch",
      attempted: 1,
      succeeded: 1,
      skipped: 0,
      purged: 0,
      errorCount: 0,
      errors: null,
    });

    watchlistsRepo.deleteById(wlId);
    expect(fetchLogsRepo.countByWatchlistId(wlId)).toBe(0);
  });
});
