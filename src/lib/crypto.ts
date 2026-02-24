import { createHash, randomBytes } from "crypto";

// =============================================================================
// Webhook Key Cryptography
//
// Design:
// - Generate: crypto.randomBytes(32).toString('hex') → 64-char hex key
// - Store: Only SHA-256 hash + 4-char prefix in database
// - Verify: External request sends X-Webhook-Key header → hash and compare
// - Rotate: Generate new key → replace hash → return plaintext (shown once)
// =============================================================================

/** Generate a new webhook key. Returns the plaintext key (64 hex chars). */
export function generateWebhookKey(): string {
  return randomBytes(32).toString("hex");
}

/** Compute SHA-256 hash of a webhook key for storage. */
export function hashWebhookKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Extract the first 4 characters as a prefix for display. */
export function getKeyPrefix(key: string): string {
  return key.slice(0, 4);
}

/** Verify a plaintext key against a stored hash. */
export function verifyWebhookKey(key: string, storedHash: string): boolean {
  const hash = hashWebhookKey(key);
  // Constant-time comparison to prevent timing attacks
  if (hash.length !== storedHash.length) return false;
  let result = 0;
  for (let i = 0; i < hash.length; i++) {
    result |= hash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return result === 0;
}
