import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createTestDb, closeDb, initSchema } from "@/db";
import * as webhooksRepo from "@/db/repositories/webhooks";
import { generateWebhookKey, hashWebhookKey, getKeyPrefix } from "@/lib/crypto";
import { authenticateWebhookKey } from "@/lib/twitter/webhook-auth";

// =============================================================================
// Setup
// =============================================================================

const TEST_USER_ID = "test-user-webhook-auth";

beforeEach(() => {
  createTestDb();
  initSchema();
});

afterEach(() => {
  closeDb();
});

// =============================================================================
// Tests
// =============================================================================

describe("authenticateWebhookKey", () => {
  test("returns userId for valid key", () => {
    const key = generateWebhookKey();
    const hash = hashWebhookKey(key);
    const prefix = getKeyPrefix(key);
    webhooksRepo.create({ userId: TEST_USER_ID, keyHash: hash, keyPrefix: prefix });

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
    const key = generateWebhookKey();
    const hash = hashWebhookKey(key);
    const prefix = getKeyPrefix(key);
    webhooksRepo.create({ userId: TEST_USER_ID, keyHash: hash, keyPrefix: prefix });

    // Different key, but could have same prefix by chance
    const wrongKey = generateWebhookKey();
    const result = authenticateWebhookKey(wrongKey);
    expect(result).toBeNull();
  });

  test("resolves correct user when multiple webhooks exist", () => {
    const key1 = generateWebhookKey();
    const key2 = generateWebhookKey();
    webhooksRepo.create({
      userId: "user-1",
      keyHash: hashWebhookKey(key1),
      keyPrefix: getKeyPrefix(key1),
    });
    webhooksRepo.create({
      userId: "user-2",
      keyHash: hashWebhookKey(key2),
      keyPrefix: getKeyPrefix(key2),
    });

    expect(authenticateWebhookKey(key1)).toEqual({ userId: "user-1" });
    expect(authenticateWebhookKey(key2)).toEqual({ userId: "user-2" });
  });
});
