import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, initSchema, seedUser } from "@/db";
import { ScopedDB } from "@/db/scoped";
import { generateWebhookKey, hashWebhookKey, getKeyPrefix } from "@/lib/crypto";
import { authenticateWebhookKey } from "@/lib/twitter/webhook-auth";

// =============================================================================
// Setup
// =============================================================================

const TEST_USER_ID = "test-user-webhook-auth";

beforeEach(() => {
  createTestDb();
  initSchema();
  seedUser(TEST_USER_ID);
  seedUser("user-1");
  seedUser("user-2");
});

afterEach(() => {
  closeDb();
});

// =============================================================================
// Tests
// =============================================================================

describe("authenticateWebhookKey", () => {
  test("returns userId for valid key", () => {
    const scopedDb = new ScopedDB(TEST_USER_ID);
    const key = generateWebhookKey();
    const hash = hashWebhookKey(key);
    const prefix = getKeyPrefix(key);
    scopedDb.webhooks.create({ keyHash: hash, keyPrefix: prefix });

    const result = authenticateWebhookKey(key);
    expect(result).toEqual({ userId: TEST_USER_ID });
  });

  test("returns null for missing key", () => {
    const result = authenticateWebhookKey(undefined);
    expect(result).toBeNull();
  });

  test("returns null for empty key", () => {
    const result = authenticateWebhookKey("");
    expect(result).toBeNull();
  });

  test("returns null for invalid key", () => {
    const result = authenticateWebhookKey("invalid-key-that-does-not-exist");
    expect(result).toBeNull();
  });

  test("returns null for wrong key with correct prefix", () => {
    const scopedDb = new ScopedDB(TEST_USER_ID);
    const key = generateWebhookKey();
    const hash = hashWebhookKey(key);
    const prefix = getKeyPrefix(key);
    scopedDb.webhooks.create({ keyHash: hash, keyPrefix: prefix });

    // Different key, but could have same prefix by chance
    const wrongKey = generateWebhookKey();
    const result = authenticateWebhookKey(wrongKey);
    expect(result).toBeNull();
  });

  test("resolves correct user when multiple webhooks exist", () => {
    const db1 = new ScopedDB("user-1");
    const db2 = new ScopedDB("user-2");
    const key1 = generateWebhookKey();
    const key2 = generateWebhookKey();
    db1.webhooks.create({
      keyHash: hashWebhookKey(key1),
      keyPrefix: getKeyPrefix(key1),
    });
    db2.webhooks.create({
      keyHash: hashWebhookKey(key2),
      keyPrefix: getKeyPrefix(key2),
    });

    expect(authenticateWebhookKey(key1)).toEqual({ userId: "user-1" });
    expect(authenticateWebhookKey(key2)).toEqual({ userId: "user-2" });
  });
});
