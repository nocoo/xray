import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import * as usageStatsRepo from "@/db/repositories/usage-stats";

// =============================================================================
// Usage Stats Repository Tests
// =============================================================================

describe("repositories/usage-stats", () => {
  beforeEach(() => {
    createTestDb();
    db.insert(users)
      .values({ id: "u1", name: "Test User", email: "test@example.com" })
      .run();
  });

  afterEach(() => {
    closeDb();
  });

  // ---------------------------------------------------------------------------
  // findByUserId
  // ---------------------------------------------------------------------------

  describe("findByUserId", () => {
    test("returns empty array when no stats exist", () => {
      const result = usageStatsRepo.findByUserId("u1");
      expect(result).toEqual([]);
    });

    test("returns all stats for a user", () => {
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-24");
      usageStatsRepo.incrementCount("u1", "/api/users", "2026-02-24");

      const result = usageStatsRepo.findByUserId("u1");
      expect(result).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // findByUserIdAndDate
  // ---------------------------------------------------------------------------

  describe("findByUserIdAndDate", () => {
    test("returns stats for specific date", () => {
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-24");
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-25");

      const result = usageStatsRepo.findByUserIdAndDate("u1", "2026-02-24");
      expect(result).toHaveLength(1);
      expect(result[0]!.date).toBe("2026-02-24");
    });

    test("returns empty array for date with no stats", () => {
      const result = usageStatsRepo.findByUserIdAndDate("u1", "2026-01-01");
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // incrementCount
  // ---------------------------------------------------------------------------

  describe("incrementCount", () => {
    test("creates new record on first call", () => {
      const stat = usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-24");

      expect(stat.userId).toBe("u1");
      expect(stat.endpoint).toBe("/api/tweets");
      expect(stat.requestCount).toBe(1);
      expect(stat.date).toBe("2026-02-24");
      expect(stat.lastUsedAt).toBeInstanceOf(Date);
    });

    test("increments existing record on subsequent calls", () => {
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-24");
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-24");
      const stat = usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-24");

      expect(stat.requestCount).toBe(3);
    });

    test("creates separate records for different endpoints", () => {
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-24");
      usageStatsRepo.incrementCount("u1", "/api/users", "2026-02-24");

      const stats = usageStatsRepo.findByUserIdAndDate("u1", "2026-02-24");
      expect(stats).toHaveLength(2);
    });

    test("creates separate records for different dates", () => {
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-24");
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-25");

      const all = usageStatsRepo.findByUserId("u1");
      expect(all).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // getSummary
  // ---------------------------------------------------------------------------

  describe("getSummary", () => {
    test("returns zeros when no stats exist", () => {
      const summary = usageStatsRepo.getSummary("u1");
      expect(summary.totalRequests).toBe(0);
      expect(summary.uniqueEndpoints).toBe(0);
      expect(summary.lastUsedAt).toBeNull();
    });

    test("aggregates total requests across endpoints and dates", () => {
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-24");
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-24");
      usageStatsRepo.incrementCount("u1", "/api/users", "2026-02-24");
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-25");

      const summary = usageStatsRepo.getSummary("u1");
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
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-20");
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-22");
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-24");
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-26");

      const result = usageStatsRepo.findByUserIdInRange(
        "u1",
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
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-01-01");

      const result = usageStatsRepo.findByUserIdInRange(
        "u1",
        "2026-02-01",
        "2026-02-28",
      );
      expect(result).toEqual([]);
    });

    test("includes boundary dates", () => {
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-20");
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-25");

      const result = usageStatsRepo.findByUserIdInRange(
        "u1",
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
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-24");
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-24");
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-25");
      usageStatsRepo.incrementCount("u1", "/api/users", "2026-02-24");

      const breakdown = usageStatsRepo.getEndpointBreakdown("u1");
      expect(breakdown).toHaveLength(2);
      expect(breakdown[0]).toEqual({ endpoint: "/api/tweets", total: 3 });
      expect(breakdown[1]).toEqual({ endpoint: "/api/users", total: 1 });
    });

    test("filters by date range when provided", () => {
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-20");
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-24");
      usageStatsRepo.incrementCount("u1", "/api/users", "2026-02-24");

      const breakdown = usageStatsRepo.getEndpointBreakdown(
        "u1",
        "2026-02-23",
        "2026-02-25",
      );
      expect(breakdown).toHaveLength(2);
      // /api/tweets only has 1 in range (not 2)
      expect(breakdown[0]!.total).toBe(1);
    });

    test("returns empty array when no stats", () => {
      const breakdown = usageStatsRepo.getEndpointBreakdown("u1");
      expect(breakdown).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getDailyTotals
  // ---------------------------------------------------------------------------

  describe("getDailyTotals", () => {
    test("aggregates by date, sorted ascending", () => {
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-25");
      usageStatsRepo.incrementCount("u1", "/api/users", "2026-02-25");
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-24");

      const totals = usageStatsRepo.getDailyTotals("u1");
      expect(totals).toHaveLength(2);
      expect(totals[0]).toEqual({ date: "2026-02-24", total: 1 });
      expect(totals[1]).toEqual({ date: "2026-02-25", total: 2 });
    });

    test("filters by date range when provided", () => {
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-20");
      usageStatsRepo.incrementCount("u1", "/api/tweets", "2026-02-24");

      const totals = usageStatsRepo.getDailyTotals(
        "u1",
        "2026-02-23",
        "2026-02-25",
      );
      expect(totals).toHaveLength(1);
      expect(totals[0]).toEqual({ date: "2026-02-24", total: 1 });
    });

    test("returns empty array when no stats", () => {
      const totals = usageStatsRepo.getDailyTotals("u1");
      expect(totals).toEqual([]);
    });
  });
});
