import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import * as credentialsRepo from "@/db/repositories/credentials";

// =============================================================================
// Credentials Repository Tests
// =============================================================================

describe("repositories/credentials", () => {
  beforeEach(() => {
    createTestDb();
    // Seed a user for FK references
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
    test("returns undefined when no credentials exist", () => {
      const result = credentialsRepo.findByUserId("u1");
      expect(result).toBeUndefined();
    });

    test("returns credentials when they exist", () => {
      credentialsRepo.upsert("u1", {
        tweapiKey: "key-123",
        twitterCookie: "cookie-abc",
      });

      const result = credentialsRepo.findByUserId("u1");
      expect(result).toBeDefined();
      expect(result!.tweapiKey).toBe("key-123");
      expect(result!.twitterCookie).toBe("cookie-abc");
    });

    test("scoped to user — does not return other users' credentials", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();

      credentialsRepo.upsert("u2", { tweapiKey: "other-key", twitterCookie: null });

      const result = credentialsRepo.findByUserId("u1");
      expect(result).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // upsert
  // ---------------------------------------------------------------------------

  describe("upsert", () => {
    test("creates new credentials on first call", () => {
      const result = credentialsRepo.upsert("u1", {
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
      credentialsRepo.upsert("u1", {
        tweapiKey: "key-v1",
        twitterCookie: "cookie-v1",
      });

      const updated = credentialsRepo.upsert("u1", {
        tweapiKey: "key-v2",
        twitterCookie: "cookie-v2",
      });

      expect(updated.tweapiKey).toBe("key-v2");
      expect(updated.twitterCookie).toBe("cookie-v2");

      // Only one record should exist
      const all = credentialsRepo.findByUserId("u1");
      expect(all).toBeDefined();
    });

    test("handles null credential values", () => {
      const result = credentialsRepo.upsert("u1", {
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
      const result = credentialsRepo.deleteByUserId("u1");
      expect(result).toBe(false);
    });

    test("returns true and deletes existing credentials", () => {
      credentialsRepo.upsert("u1", { tweapiKey: "key", twitterCookie: null });

      const result = credentialsRepo.deleteByUserId("u1");
      expect(result).toBe(true);

      // Verify deletion
      expect(credentialsRepo.findByUserId("u1")).toBeUndefined();
    });
  });
});
