import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import { ScopedDB } from "@/db/scoped";

// =============================================================================
// Usage Stats Repository Tests
// =============================================================================

describe("repositories/usage-stats", () => {
  let scopedDb: ScopedDB;

  beforeEach(() => {
    createTestDb();
    db.insert(users)
      .values({ id: "u1", name: "Test User", email: "test@example.com" })
      .run();
    scopedDb = new ScopedDB("u1");
  });

  afterEach(() => {
    closeDb();
  });

  // ---------------------------------------------------------------------------
  // findByUserId
  // ---------------------------------------------------------------------------

  describe("findByUserId", () => {
    test("returns empty array when no stats exist", () => {
      const result = scopedDb.usageStats.findAll();
      expect(result).toEqual([]);
    });

    test("returns all stats for a user", () => {
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-24");
      scopedDb.usageStats.incrementCount("/api/users", "2026-02-24");

      const result = scopedDb.usageStats.findAll();
      expect(result).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // findByUserIdAndDate
  // ---------------------------------------------------------------------------

  describe("findByUserIdAndDate", () => {
    test("returns stats for specific date", () => {
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-24");
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-25");

      const result = scopedDb.usageStats.findByDate("2026-02-24");
      expect(result).toHaveLength(1);
      expect(result[0]!.date).toBe("2026-02-24");
    });

    test("returns empty array for date with no stats", () => {
      const result = scopedDb.usageStats.findByDate("2026-01-01");
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // incrementCount
  // ---------------------------------------------------------------------------

  describe("incrementCount", () => {
    test("creates new record on first call", () => {
      const stat = scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-24");

      expect(stat.userId).toBe("u1");
      expect(stat.endpoint).toBe("/api/tweets");
      expect(stat.requestCount).toBe(1);
      expect(stat.date).toBe("2026-02-24");
      expect(stat.lastUsedAt).toBeInstanceOf(Date);
    });

    test("increments existing record on subsequent calls", () => {
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-24");
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-24");
      const stat = scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-24");

      expect(stat.requestCount).toBe(3);
    });

    test("creates separate records for different endpoints", () => {
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-24");
      scopedDb.usageStats.incrementCount("/api/users", "2026-02-24");

      const stats = scopedDb.usageStats.findByDate("2026-02-24");
      expect(stats).toHaveLength(2);
    });

    test("creates separate records for different dates", () => {
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-24");
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-25");

      const all = scopedDb.usageStats.findAll();
      expect(all).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // getSummary
  // ---------------------------------------------------------------------------

  describe("getSummary", () => {
    test("returns zeros when no stats exist", () => {
      const summary = scopedDb.usageStats.getSummary();
      expect(summary.totalRequests).toBe(0);
      expect(summary.uniqueEndpoints).toBe(0);
      expect(summary.lastUsedAt).toBeNull();
    });

    test("aggregates total requests across endpoints and dates", () => {
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-24");
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-24");
      scopedDb.usageStats.incrementCount("/api/users", "2026-02-24");
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-25");

      const summary = scopedDb.usageStats.getSummary();
      expect(summary.totalRequests).toBe(4);
      expect(summary.uniqueEndpoints).toBe(2);
      expect(summary.lastUsedAt).toBeInstanceOf(Date);
    });
  });

  // ---------------------------------------------------------------------------
  // findByUserIdInRange
  // ---------------------------------------------------------------------------

  describe("findByUserIdInRange", () => {
    test("returns stats within inclusive date range", () => {
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-20");
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-22");
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-24");
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-26");

      const result = scopedDb.usageStats.findInRange(
        "2026-02-21",
        "2026-02-25",
      );
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.date).sort()).toEqual([
        "2026-02-22",
        "2026-02-24",
      ]);
    });

    test("returns empty array when no stats in range", () => {
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-01-01");

      const result = scopedDb.usageStats.findInRange(
        "2026-02-01",
        "2026-02-28",
      );
      expect(result).toEqual([]);
    });

    test("includes boundary dates", () => {
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-20");
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-25");

      const result = scopedDb.usageStats.findInRange(
        "2026-02-20",
        "2026-02-25",
      );
      expect(result).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // getEndpointBreakdown
  // ---------------------------------------------------------------------------

  describe("getEndpointBreakdown", () => {
    test("aggregates by endpoint, sorted descending", () => {
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-24");
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-24");
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-25");
      scopedDb.usageStats.incrementCount("/api/users", "2026-02-24");

      const breakdown = scopedDb.usageStats.getEndpointBreakdown();
      expect(breakdown).toHaveLength(2);
      expect(breakdown[0]).toEqual({ endpoint: "/api/tweets", total: 3 });
      expect(breakdown[1]).toEqual({ endpoint: "/api/users", total: 1 });
    });

    test("filters by date range when provided", () => {
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-20");
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-24");
      scopedDb.usageStats.incrementCount("/api/users", "2026-02-24");

      const breakdown = scopedDb.usageStats.getEndpointBreakdown(
        "2026-02-23",
        "2026-02-25",
      );
      expect(breakdown).toHaveLength(2);
      // /api/tweets only has 1 in range (not 2)
      expect(breakdown[0]!.total).toBe(1);
    });

    test("returns empty array when no stats", () => {
      const breakdown = scopedDb.usageStats.getEndpointBreakdown();
      expect(breakdown).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getDailyTotals
  // ---------------------------------------------------------------------------

  describe("getDailyTotals", () => {
    test("aggregates by date, sorted ascending", () => {
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-25");
      scopedDb.usageStats.incrementCount("/api/users", "2026-02-25");
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-24");

      const totals = scopedDb.usageStats.getDailyTotals();
      expect(totals).toHaveLength(2);
      expect(totals[0]).toEqual({ date: "2026-02-24", total: 1 });
      expect(totals[1]).toEqual({ date: "2026-02-25", total: 2 });
    });

    test("filters by date range when provided", () => {
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-20");
      scopedDb.usageStats.incrementCount("/api/tweets", "2026-02-24");

      const totals = scopedDb.usageStats.getDailyTotals(
        "2026-02-23",
        "2026-02-25",
      );
      expect(totals).toHaveLength(1);
      expect(totals[0]).toEqual({ date: "2026-02-24", total: 1 });
    });

    test("returns empty array when no stats", () => {
      const totals = scopedDb.usageStats.getDailyTotals();
      expect(totals).toEqual([]);
    });
  });
});
