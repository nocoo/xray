import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import * as settingsRepo from "@/db/repositories/settings";

// =============================================================================
// Settings Repository Tests
// =============================================================================

describe("repositories/settings", () => {
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
    test("returns empty array when no settings exist", () => {
      const result = settingsRepo.findByUserId("u1");
      expect(result).toEqual([]);
    });

    test("returns all settings for a user", () => {
      settingsRepo.upsert("u1", "ai.provider", "anthropic");
      settingsRepo.upsert("u1", "ai.apiKey", "sk-test-123");
      settingsRepo.upsert("u1", "ai.model", "claude-sonnet-4-20250514");

      const result = settingsRepo.findByUserId("u1");
      expect(result).toHaveLength(3);

      const keys = result.map((s) => s.key).sort();
      expect(keys).toEqual(["ai.apiKey", "ai.model", "ai.provider"]);
    });

    test("scoped to user — does not return other users' settings", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();

      settingsRepo.upsert("u2", "ai.provider", "openai");

      const result = settingsRepo.findByUserId("u1");
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // findByKey
  // ---------------------------------------------------------------------------

  describe("findByKey", () => {
    test("returns undefined when key does not exist", () => {
      const result = settingsRepo.findByKey("u1", "ai.provider");
      expect(result).toBeUndefined();
    });

    test("returns the setting when it exists", () => {
      settingsRepo.upsert("u1", "ai.provider", "anthropic");

      const result = settingsRepo.findByKey("u1", "ai.provider");
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

      settingsRepo.upsert("u2", "ai.provider", "openai");

      const result = settingsRepo.findByKey("u1", "ai.provider");
      expect(result).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // upsert
  // ---------------------------------------------------------------------------

  describe("upsert", () => {
    test("creates a new setting on first call", () => {
      const result = settingsRepo.upsert("u1", "ai.provider", "anthropic");

      expect(result.userId).toBe("u1");
      expect(result.key).toBe("ai.provider");
      expect(result.value).toBe("anthropic");
      expect(result.updatedAt).toBeGreaterThan(0);
    });

    test("updates existing setting on subsequent calls", () => {
      settingsRepo.upsert("u1", "ai.model", "claude-3-haiku");

      const updated = settingsRepo.upsert("u1", "ai.model", "claude-sonnet-4-20250514");
      expect(updated.value).toBe("claude-sonnet-4-20250514");

      // Only one record should exist for this key
      const all = settingsRepo.findByUserId("u1");
      expect(all).toHaveLength(1);
    });

    test("updates updatedAt timestamp on update", () => {
      const first = settingsRepo.upsert("u1", "ai.provider", "openai");
      // Small delay to ensure timestamp difference
      const second = settingsRepo.upsert("u1", "ai.provider", "anthropic");

      expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt);
    });

    test("different keys are independent", () => {
      settingsRepo.upsert("u1", "ai.provider", "anthropic");
      settingsRepo.upsert("u1", "ai.model", "claude-sonnet-4-20250514");

      const provider = settingsRepo.findByKey("u1", "ai.provider");
      const model = settingsRepo.findByKey("u1", "ai.model");

      expect(provider!.value).toBe("anthropic");
      expect(model!.value).toBe("claude-sonnet-4-20250514");
    });
  });

  // ---------------------------------------------------------------------------
  // deleteSetting
  // ---------------------------------------------------------------------------

  describe("deleteSetting", () => {
    test("returns false when key does not exist", () => {
      const result = settingsRepo.deleteSetting("u1", "ai.provider");
      expect(result).toBe(false);
    });

    test("returns true and deletes existing key", () => {
      settingsRepo.upsert("u1", "ai.provider", "anthropic");

      const result = settingsRepo.deleteSetting("u1", "ai.provider");
      expect(result).toBe(true);

      expect(settingsRepo.findByKey("u1", "ai.provider")).toBeUndefined();
    });

    test("only deletes the specified key", () => {
      settingsRepo.upsert("u1", "ai.provider", "anthropic");
      settingsRepo.upsert("u1", "ai.model", "claude-sonnet-4-20250514");

      settingsRepo.deleteSetting("u1", "ai.provider");

      expect(settingsRepo.findByKey("u1", "ai.provider")).toBeUndefined();
      expect(settingsRepo.findByKey("u1", "ai.model")).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // deleteByUserId
  // ---------------------------------------------------------------------------

  describe("deleteByUserId", () => {
    test("returns 0 when no settings exist", () => {
      const result = settingsRepo.deleteByUserId("u1");
      expect(result).toBe(0);
    });

    test("deletes all settings and returns count", () => {
      settingsRepo.upsert("u1", "ai.provider", "anthropic");
      settingsRepo.upsert("u1", "ai.apiKey", "sk-test");
      settingsRepo.upsert("u1", "ai.model", "claude-sonnet-4-20250514");

      const result = settingsRepo.deleteByUserId("u1");
      expect(result).toBe(3);

      expect(settingsRepo.findByUserId("u1")).toEqual([]);
    });

    test("only deletes the specified user's settings", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();

      settingsRepo.upsert("u1", "ai.provider", "anthropic");
      settingsRepo.upsert("u2", "ai.provider", "openai");

      settingsRepo.deleteByUserId("u1");

      expect(settingsRepo.findByUserId("u1")).toEqual([]);
      expect(settingsRepo.findByUserId("u2")).toHaveLength(1);
    });
  });
});
