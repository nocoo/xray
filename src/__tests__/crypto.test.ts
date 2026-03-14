import { describe, test, expect } from "bun:test";
import {
  generateWebhookKey,
  hashWebhookKey,
  getKeyPrefix,
  verifyWebhookKey,
  maskSecret,
} from "@/lib/crypto";

// =============================================================================
// Crypto Module Tests
// =============================================================================

describe("lib/crypto", () => {
  // ---------------------------------------------------------------------------
  // generateWebhookKey
  // ---------------------------------------------------------------------------

  describe("generateWebhookKey", () => {
    test("returns a 64-character hex string", () => {
      const key = generateWebhookKey();
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    test("generates unique keys", () => {
      const keys = new Set(Array.from({ length: 100 }, () => generateWebhookKey()));
      expect(keys.size).toBe(100);
    });
  });

  // ---------------------------------------------------------------------------
  // hashWebhookKey
  // ---------------------------------------------------------------------------

  describe("hashWebhookKey", () => {
    test("returns a 64-character hex SHA-256 hash", () => {
      const hash = hashWebhookKey("test-key");
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    test("is deterministic", () => {
      const hash1 = hashWebhookKey("same-key");
      const hash2 = hashWebhookKey("same-key");
      expect(hash1).toBe(hash2);
    });

    test("different inputs produce different hashes", () => {
      const hash1 = hashWebhookKey("key-1");
      const hash2 = hashWebhookKey("key-2");
      expect(hash1).not.toBe(hash2);
    });
  });

  // ---------------------------------------------------------------------------
  // getKeyPrefix
  // ---------------------------------------------------------------------------

  describe("getKeyPrefix", () => {
    test("returns first 4 characters", () => {
      expect(getKeyPrefix("abcdef123456")).toBe("abcd");
    });

    test("works with short strings", () => {
      expect(getKeyPrefix("ab")).toBe("ab");
    });
  });

  // ---------------------------------------------------------------------------
  // verifyWebhookKey
  // ---------------------------------------------------------------------------

  describe("verifyWebhookKey", () => {
    test("returns true for matching key and hash", () => {
      const key = generateWebhookKey();
      const hash = hashWebhookKey(key);

      expect(verifyWebhookKey(key, hash)).toBe(true);
    });

    test("returns false for non-matching key", () => {
      const key = generateWebhookKey();
      const hash = hashWebhookKey(key);

      expect(verifyWebhookKey("wrong-key-value", hash)).toBe(false);
    });

    test("returns false for tampered hash", () => {
      const key = generateWebhookKey();
      hashWebhookKey(key);
      const tampered = "0".repeat(64);

      expect(verifyWebhookKey(key, tampered)).toBe(false);
    });

    test("constant-time: handles length mismatch", () => {
      const key = generateWebhookKey();
      expect(verifyWebhookKey(key, "short")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // maskSecret
  // ---------------------------------------------------------------------------

  describe("maskSecret", () => {
    test("returns empty string for empty input", () => {
      expect(maskSecret("")).toBe("");
    });

    test("masks short strings completely", () => {
      expect(maskSecret("abc")).toBe("****");
      expect(maskSecret("12345678")).toBe("****");
    });

    test("keeps first 4 and last 4 chars for longer strings", () => {
      expect(maskSecret("abcdefghijkl")).toBe("abcd****ijkl");
    });

    test("masks API keys correctly", () => {
      const key = "sk-1234567890abcdef";
      const masked = maskSecret(key);
      expect(masked.startsWith("sk-1")).toBe(true);
      expect(masked.endsWith("cdef")).toBe(true);
      expect(masked).toContain("*");
    });
  });
});
