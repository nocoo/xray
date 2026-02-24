import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, db } from "@/db";
import { users } from "@/db/schema";
import * as webhooksRepo from "@/db/repositories/webhooks";
import { hashWebhookKey } from "@/lib/crypto";

// =============================================================================
// Webhooks Repository Tests
// =============================================================================

describe("repositories/webhooks", () => {
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
    test("returns empty array when no webhooks exist", () => {
      const result = webhooksRepo.findByUserId("u1");
      expect(result).toEqual([]);
    });

    test("returns all webhooks for a user", () => {
      webhooksRepo.create({ userId: "u1", keyHash: "hash1", keyPrefix: "ab12" });
      webhooksRepo.create({ userId: "u1", keyHash: "hash2", keyPrefix: "cd34" });

      const result = webhooksRepo.findByUserId("u1");
      expect(result).toHaveLength(2);
    });

    test("scoped to user", () => {
      db.insert(users)
        .values({ id: "u2", email: "other@example.com" })
        .run();

      webhooksRepo.create({ userId: "u1", keyHash: "hash1", keyPrefix: "ab12" });
      webhooksRepo.create({ userId: "u2", keyHash: "hash2", keyPrefix: "cd34" });

      const result = webhooksRepo.findByUserId("u1");
      expect(result).toHaveLength(1);
      expect(result[0]!.keyPrefix).toBe("ab12");
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  describe("create", () => {
    test("creates a webhook with hash and prefix", () => {
      const webhook = webhooksRepo.create({
        userId: "u1",
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
      const w1 = webhooksRepo.create({ userId: "u1", keyHash: "h1", keyPrefix: "p1" });
      const w2 = webhooksRepo.create({ userId: "u1", keyHash: "h2", keyPrefix: "p2" });

      expect(w2.id).toBe(w1.id + 1);
    });
  });

  // ---------------------------------------------------------------------------
  // findByIdAndUserId
  // ---------------------------------------------------------------------------

  describe("findByIdAndUserId", () => {
    test("returns webhook when it exists", () => {
      const created = webhooksRepo.create({
        userId: "u1",
        keyHash: "hash",
        keyPrefix: "pref",
      });

      const found = webhooksRepo.findByIdAndUserId(created.id, "u1");
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    test("returns undefined for non-existent ID", () => {
      const found = webhooksRepo.findByIdAndUserId(999, "u1");
      expect(found).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // rotateKey
  // ---------------------------------------------------------------------------

  describe("rotateKey", () => {
    test("updates hash and prefix", () => {
      const original = webhooksRepo.create({
        userId: "u1",
        keyHash: "old-hash",
        keyPrefix: "old_",
      });

      const rotated = webhooksRepo.rotateKey(original.id, "new-hash", "new_");
      expect(rotated).toBeDefined();
      expect(rotated!.keyHash).toBe("new-hash");
      expect(rotated!.keyPrefix).toBe("new_");
    });

    test("updates rotatedAt timestamp", () => {
      const original = webhooksRepo.create({
        userId: "u1",
        keyHash: "hash",
        keyPrefix: "pref",
      });

      // Small delay to ensure timestamp differs
      const rotated = webhooksRepo.rotateKey(original.id, "new-hash", "new_");
      expect(rotated).toBeDefined();
      expect(rotated!.rotatedAt).toBeInstanceOf(Date);
    });
  });

  // ---------------------------------------------------------------------------
  // deleteById
  // ---------------------------------------------------------------------------

  describe("deleteById", () => {
    test("returns false for non-existent webhook", () => {
      expect(webhooksRepo.deleteById(999)).toBe(false);
    });

    test("returns true and deletes existing webhook", () => {
      const created = webhooksRepo.create({
        userId: "u1",
        keyHash: "hash",
        keyPrefix: "pref",
      });

      expect(webhooksRepo.deleteById(created.id)).toBe(true);
      expect(webhooksRepo.findByIdAndUserId(created.id, "u1")).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // findByKeyHash
  // ---------------------------------------------------------------------------

  describe("findByKeyHash", () => {
    test("finds webhook by key hash", () => {
      const key = "test-plaintext-key";
      const hash = hashWebhookKey(key);

      webhooksRepo.create({ userId: "u1", keyHash: hash, keyPrefix: "test" });

      const found = webhooksRepo.findByKeyHash(hash);
      expect(found).toBeDefined();
      expect(found!.keyHash).toBe(hash);
    });

    test("returns undefined for unknown hash", () => {
      expect(webhooksRepo.findByKeyHash("nonexistent")).toBeUndefined();
    });
  });
});
