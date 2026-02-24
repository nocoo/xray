import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  createTestDb,
  resetTestDb,
  closeDb,
  getRawSqlite,
  initSchema,
  getDb,
} from "@/db";

// =============================================================================
// Database Connection Management
// =============================================================================

describe("db/index", () => {
  beforeEach(() => {
    createTestDb();
  });

  afterEach(() => {
    closeDb();
  });

  // ---------------------------------------------------------------------------
  // createTestDb
  // ---------------------------------------------------------------------------

  describe("createTestDb", () => {
    test("creates an in-memory database", () => {
      const db = createTestDb();
      expect(db).toBeDefined();
    });

    test("creates schema tables automatically", () => {
      const raw = getRawSqlite();
      const tables = raw
        .query(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
        )
        .all()
        .map((r: { name: string }) => r.name);

      expect(tables).toContain("user");
      expect(tables).toContain("account");
      expect(tables).toContain("session");
      expect(tables).toContain("verificationToken");
      expect(tables).toContain("api_credentials");
      expect(tables).toContain("webhooks");
      expect(tables).toContain("usage_stats");
    });

    test("returns a new instance each call (closes previous)", () => {
      const db1 = createTestDb();
      const db2 = createTestDb();
      // Both should be valid Drizzle instances
      expect(db1).toBeDefined();
      expect(db2).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // initSchema — idempotent
  // ---------------------------------------------------------------------------

  describe("initSchema", () => {
    test("is idempotent — calling twice does not throw", () => {
      expect(() => initSchema()).not.toThrow();
      expect(() => initSchema()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // resetTestDb
  // ---------------------------------------------------------------------------

  describe("resetTestDb", () => {
    test("clears all data from tables", () => {
      const raw = getRawSqlite();

      // Insert a user
      raw
        .query(
          `INSERT INTO user (id, name, email) VALUES ('u1', 'Test User', 'test@example.com')`
        )
        .run();

      // Verify insertion
      const before = raw.query(`SELECT COUNT(*) as cnt FROM user`).get() as {
        cnt: number;
      };
      expect(before.cnt).toBe(1);

      // Reset
      resetTestDb();

      // Verify all data cleared
      const after = raw.query(`SELECT COUNT(*) as cnt FROM user`).get() as {
        cnt: number;
      };
      expect(after.cnt).toBe(0);
    });

    test("creates a new db if none exists", () => {
      closeDb();
      // Should not throw — creates a new in-memory DB internally
      expect(() => resetTestDb()).not.toThrow();
      // And the new DB should have tables
      const raw = getRawSqlite();
      const tables = raw
        .query(`SELECT name FROM sqlite_master WHERE type='table'`)
        .all();
      expect(tables.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getRawSqlite
  // ---------------------------------------------------------------------------

  describe("getRawSqlite", () => {
    test("returns the underlying SQLite driver", () => {
      const raw = getRawSqlite();
      expect(raw).toBeDefined();
      // Should support query()
      const result = raw.query("SELECT 1 as val").get() as { val: number };
      expect(result.val).toBe(1);
    });

    test("throws when no connection exists", () => {
      closeDb();
      expect(() => getRawSqlite()).toThrow(
        "No database connection. Call getDb() or createTestDb() first."
      );
    });
  });

  // ---------------------------------------------------------------------------
  // closeDb
  // ---------------------------------------------------------------------------

  describe("closeDb", () => {
    test("closes the connection gracefully", () => {
      closeDb();
      // After close, getRawSqlite should throw
      expect(() => getRawSqlite()).toThrow();
    });

    test("is idempotent — double close does not throw", () => {
      closeDb();
      expect(() => closeDb()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Production protection
  // ---------------------------------------------------------------------------

  describe("production guard", () => {
    test("blocks opening default production database in test env", () => {
      // getDb() without XRAY_DB set defaults to the protected database/xray.db
      const originalXrayDb = process.env.XRAY_DB;
      delete process.env.XRAY_DB;

      try {
        expect(() => getDb()).toThrow("BLOCKED");
      } finally {
        if (originalXrayDb !== undefined) {
          process.env.XRAY_DB = originalXrayDb;
        }
      }
    });
  });
});
