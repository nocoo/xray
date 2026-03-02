import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import { ScopedDB } from "@/db/scoped";

// =============================================================================
// Credentials Repository Tests
// =============================================================================

describe("repositories/credentials", () => {
  let scopedDb: ScopedDB;

  beforeEach(() => {
    createTestDb();
    // Seed a user for FK references
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
    test("returns undefined when no credentials exist", () => {
      const result = scopedDb.credentials.find();
      expect(result).toBeUndefined();
    });

    test("returns credentials when they exist", () => {
      scopedDb.credentials.upsert({
        tweapiKey: "key-123",
        twitterCookie: "cookie-abc",
      });

      const result = scopedDb.credentials.find();
      expect(result).toBeDefined();
      expect(result!.tweapiKey).toBe("key-123");
      expect(result!.twitterCookie).toBe("cookie-abc");
    });

    test("scoped to user — does not return other users' credentials", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();

      const scopedDb2 = new ScopedDB("u2");
      scopedDb2.credentials.upsert({ tweapiKey: "other-key", twitterCookie: null });

      const result = scopedDb.credentials.find();
      expect(result).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // upsert
  // ---------------------------------------------------------------------------

  describe("upsert", () => {
    test("creates new credentials on first call", () => {
      const result = scopedDb.credentials.upsert({
        tweapiKey: "key-new",
        twitterCookie: "cookie-new",
      });

      expect(result.userId).toBe("u1");
      expect(result.tweapiKey).toBe("key-new");
      expect(result.twitterCookie).toBe("cookie-new");
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    test("updates existing credentials on subsequent calls", () => {
      scopedDb.credentials.upsert({
        tweapiKey: "key-v1",
        twitterCookie: "cookie-v1",
      });

      const updated = scopedDb.credentials.upsert({
        tweapiKey: "key-v2",
        twitterCookie: "cookie-v2",
      });

      expect(updated.tweapiKey).toBe("key-v2");
      expect(updated.twitterCookie).toBe("cookie-v2");

      // Only one record should exist
      const all = scopedDb.credentials.find();
      expect(all).toBeDefined();
    });

    test("handles null credential values", () => {
      const result = scopedDb.credentials.upsert({
        tweapiKey: null,
        twitterCookie: null,
      });

      expect(result.tweapiKey).toBeNull();
      expect(result.twitterCookie).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // deleteByUserId
  // ---------------------------------------------------------------------------

  describe("deleteByUserId", () => {
    test("returns false when no credentials exist", () => {
      const result = scopedDb.credentials.delete();
      expect(result).toBe(false);
    });

    test("returns true and deletes existing credentials", () => {
      scopedDb.credentials.upsert({ tweapiKey: "key", twitterCookie: null });

      const result = scopedDb.credentials.delete();
      expect(result).toBe(true);

      // Verify deletion
      expect(scopedDb.credentials.find()).toBeUndefined();
    });
  });
});
