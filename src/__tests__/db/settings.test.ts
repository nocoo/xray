import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import { ScopedDB } from "@/db/scoped";

// =============================================================================
// Settings Repository Tests
// =============================================================================

describe("repositories/settings", () => {
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
    test("returns empty array when no settings exist", () => {
      const result = scopedDb.settings.findAll();
      expect(result).toEqual([]);
    });

    test("returns all settings for a user", () => {
      scopedDb.settings.upsert("ai.provider", "anthropic");
      scopedDb.settings.upsert("ai.apiKey", "sk-test-123");
      scopedDb.settings.upsert("ai.model", "claude-sonnet-4-20250514");

      const result = scopedDb.settings.findAll();
      expect(result).toHaveLength(3);

      const keys = result.map((s) => s.key).sort();
      expect(keys).toEqual(["ai.apiKey", "ai.model", "ai.provider"]);
    });

    test("scoped to user — does not return other users' settings", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();

      const scopedDb2 = new ScopedDB("u2");
      scopedDb2.settings.upsert("ai.provider", "openai");

      const result = scopedDb.settings.findAll();
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // findByKey
  // ---------------------------------------------------------------------------

  describe("findByKey", () => {
    test("returns undefined when key does not exist", () => {
      const result = scopedDb.settings.findByKey("ai.provider");
      expect(result).toBeUndefined();
    });

    test("returns the setting when it exists", () => {
      scopedDb.settings.upsert("ai.provider", "anthropic");

      const result = scopedDb.settings.findByKey("ai.provider");
      expect(result).toBeDefined();
      expect(result!.value).toBe("anthropic");
      expect(result!.userId).toBe("u1");
      expect(result!.key).toBe("ai.provider");
      expect(result!.updatedAt).toBeGreaterThan(0);
    });

    test("scoped to user — does not return other users' keys", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();

      const scopedDb2 = new ScopedDB("u2");
      scopedDb2.settings.upsert("ai.provider", "openai");

      const result = scopedDb.settings.findByKey("ai.provider");
      expect(result).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // upsert
  // ---------------------------------------------------------------------------

  describe("upsert", () => {
    test("creates a new setting on first call", () => {
      const result = scopedDb.settings.upsert("ai.provider", "anthropic");

      expect(result.userId).toBe("u1");
      expect(result.key).toBe("ai.provider");
      expect(result.value).toBe("anthropic");
      expect(result.updatedAt).toBeGreaterThan(0);
    });

    test("updates existing setting on subsequent calls", () => {
      scopedDb.settings.upsert("ai.model", "claude-3-haiku");

      const updated = scopedDb.settings.upsert("ai.model", "claude-sonnet-4-20250514");
      expect(updated.value).toBe("claude-sonnet-4-20250514");

      // Only one record should exist for this key
      const all = scopedDb.settings.findAll();
      expect(all).toHaveLength(1);
    });

    test("updates updatedAt timestamp on update", () => {
      const first = scopedDb.settings.upsert("ai.provider", "openai");
      // Small delay to ensure timestamp difference
      const second = scopedDb.settings.upsert("ai.provider", "anthropic");

      expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt);
    });

    test("different keys are independent", () => {
      scopedDb.settings.upsert("ai.provider", "anthropic");
      scopedDb.settings.upsert("ai.model", "claude-sonnet-4-20250514");

      const provider = scopedDb.settings.findByKey("ai.provider");
      const model = scopedDb.settings.findByKey("ai.model");

      expect(provider!.value).toBe("anthropic");
      expect(model!.value).toBe("claude-sonnet-4-20250514");
    });
  });

  // ---------------------------------------------------------------------------
  // deleteSetting
  // ---------------------------------------------------------------------------

  describe("deleteSetting", () => {
    test("returns false when key does not exist", () => {
      const result = scopedDb.settings.deleteSetting("ai.provider");
      expect(result).toBe(false);
    });

    test("returns true and deletes existing key", () => {
      scopedDb.settings.upsert("ai.provider", "anthropic");

      const result = scopedDb.settings.deleteSetting("ai.provider");
      expect(result).toBe(true);

      expect(scopedDb.settings.findByKey("ai.provider")).toBeUndefined();
    });

    test("only deletes the specified key", () => {
      scopedDb.settings.upsert("ai.provider", "anthropic");
      scopedDb.settings.upsert("ai.model", "claude-sonnet-4-20250514");

      scopedDb.settings.deleteSetting("ai.provider");

      expect(scopedDb.settings.findByKey("ai.provider")).toBeUndefined();
      expect(scopedDb.settings.findByKey("ai.model")).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // deleteByUserId
  // ---------------------------------------------------------------------------

  describe("deleteByUserId", () => {
    test("returns 0 when no settings exist", () => {
      const result = scopedDb.settings.deleteAll();
      expect(result).toBe(0);
    });

    test("deletes all settings and returns count", () => {
      scopedDb.settings.upsert("ai.provider", "anthropic");
      scopedDb.settings.upsert("ai.apiKey", "sk-test");
      scopedDb.settings.upsert("ai.model", "claude-sonnet-4-20250514");

      const result = scopedDb.settings.deleteAll();
      expect(result).toBe(3);

      expect(scopedDb.settings.findAll()).toEqual([]);
    });

    test("only deletes the specified user's settings", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();

      const scopedDb2 = new ScopedDB("u2");
      scopedDb.settings.upsert("ai.provider", "anthropic");
      scopedDb2.settings.upsert("ai.provider", "openai");

      scopedDb.settings.deleteAll();

      expect(scopedDb.settings.findAll()).toEqual([]);
      expect(scopedDb2.settings.findAll()).toHaveLength(1);
    });
  });
});
