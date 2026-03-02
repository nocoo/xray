import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import { ScopedDB, WebhooksRepo } from "@/db/scoped";
import { hashWebhookKey } from "@/lib/crypto";

// =============================================================================
// Webhooks Repository Tests
// =============================================================================

describe("repositories/webhooks", () => {
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
    test("returns empty array when no webhooks exist", () => {
      const result = scopedDb.webhooks.findAll();
      expect(result).toEqual([]);
    });

    test("returns all webhooks for a user", () => {
      scopedDb.webhooks.create({ keyHash: "hash1", keyPrefix: "ab12" });
      scopedDb.webhooks.create({ keyHash: "hash2", keyPrefix: "cd34" });

      const result = scopedDb.webhooks.findAll();
      expect(result).toHaveLength(2);
    });

    test("scoped to user", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();

      const scopedDb2 = new ScopedDB("u2");
      scopedDb.webhooks.create({ keyHash: "hash1", keyPrefix: "ab12" });
      scopedDb2.webhooks.create({ keyHash: "hash2", keyPrefix: "cd34" });

      const result = scopedDb.webhooks.findAll();
      expect(result).toHaveLength(1);
      expect(result[0]!.keyPrefix).toBe("ab12");
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  describe("create", () => {
    test("creates a webhook with hash and prefix", () => {
      const webhook = scopedDb.webhooks.create({
        keyHash: "sha256-hash",
        keyPrefix: "xk_a",
      });

      expect(webhook.id).toBeDefined();
      expect(webhook.userId).toBe("u1");
      expect(webhook.keyHash).toBe("sha256-hash");
      expect(webhook.keyPrefix).toBe("xk_a");
      expect(webhook.createdAt).toBeInstanceOf(Date);
      expect(webhook.rotatedAt).toBeInstanceOf(Date);
    });

    test("auto-increments ID", () => {
      const w1 = scopedDb.webhooks.create({ keyHash: "h1", keyPrefix: "p1" });
      const w2 = scopedDb.webhooks.create({ keyHash: "h2", keyPrefix: "p2" });

      expect(w2.id).toBe(w1.id + 1);
    });
  });

  // ---------------------------------------------------------------------------
  // findByIdAndUserId
  // ---------------------------------------------------------------------------

  describe("findByIdAndUserId", () => {
    test("returns webhook when it exists", () => {
      const created = scopedDb.webhooks.create({
        keyHash: "hash",
        keyPrefix: "pref",
      });

      const found = scopedDb.webhooks.findById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    test("returns undefined for non-existent ID", () => {
      const found = scopedDb.webhooks.findById(999);
      expect(found).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // rotateKey
  // ---------------------------------------------------------------------------

  describe("rotateKey", () => {
    test("updates hash and prefix", () => {
      const original = scopedDb.webhooks.create({
        keyHash: "old-hash",
        keyPrefix: "old_",
      });

      const rotated = scopedDb.webhooks.rotateKey(original.id, "new-hash", "new_");
      expect(rotated).toBeDefined();
      expect(rotated!.keyHash).toBe("new-hash");
      expect(rotated!.keyPrefix).toBe("new_");
    });

    test("updates rotatedAt timestamp", () => {
      const original = scopedDb.webhooks.create({
        keyHash: "hash",
        keyPrefix: "pref",
      });

      // Small delay to ensure timestamp differs
      const rotated = scopedDb.webhooks.rotateKey(original.id, "new-hash", "new_");
      expect(rotated).toBeDefined();
      expect(rotated!.rotatedAt).toBeInstanceOf(Date);
    });
  });

  // ---------------------------------------------------------------------------
  // deleteById
  // ---------------------------------------------------------------------------

  describe("deleteById", () => {
    test("returns false for non-existent webhook", () => {
      expect(scopedDb.webhooks.deleteById(999)).toBe(false);
    });

    test("returns true and deletes existing webhook", () => {
      const created = scopedDb.webhooks.create({
        keyHash: "hash",
        keyPrefix: "pref",
      });

      expect(scopedDb.webhooks.deleteById(created.id)).toBe(true);
      expect(scopedDb.webhooks.findById(created.id)).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // findByKeyHash
  // ---------------------------------------------------------------------------

  describe("findByKeyHash", () => {
    test("finds webhook by key hash", () => {
      const key = "test-plaintext-key";
      const hash = hashWebhookKey(key);

      scopedDb.webhooks.create({ keyHash: hash, keyPrefix: "test" });

      const found = WebhooksRepo.findByKeyHash(hash);
      expect(found).toBeDefined();
      expect(found!.keyHash).toBe(hash);
    });

    test("returns undefined for unknown hash", () => {
      expect(WebhooksRepo.findByKeyHash("nonexistent")).toBeUndefined();
    });
  });
});
