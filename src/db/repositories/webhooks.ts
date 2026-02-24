import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { webhooks, type Webhook, type NewWebhook } from "@/db/schema";

// =============================================================================
// Webhooks Repository
// =============================================================================

/** Find all webhooks for a specific user. */
export function findByUserId(userId: string): Webhook[] {
  return db
    .select()
    .from(webhooks)
    .where(eq(webhooks.userId, userId))
    .all();
}

/** Find a webhook by its ID and user ID (for ownership verification). */
export function findByIdAndUserId(
  id: number,
  userId: string
): Webhook | undefined {
  return db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)))
    .get();
}

/**
 * Create a new webhook record.
 * Stores only the hash and prefix — plaintext key is never persisted.
 */
export function create(
  data: Pick<NewWebhook, "userId" | "keyHash" | "keyPrefix">
): Webhook {
  const now = new Date();
  return db
    .insert(webhooks)
    .values({
      userId: data.userId,
      keyHash: data.keyHash,
      keyPrefix: data.keyPrefix,
      createdAt: now,
      rotatedAt: now,
    })
    .returning()
    .get();
}

/**
 * Update the key hash and prefix (used during rotation).
 * Also updates the rotatedAt timestamp.
 */
export function rotateKey(
  id: number,
  keyHash: string,
  keyPrefix: string
): Webhook | undefined {
  return db
    .update(webhooks)
    .set({
      keyHash,
      keyPrefix,
      rotatedAt: new Date(),
    })
    .where(eq(webhooks.id, id))
    .returning()
    .get();
}

/** Delete a webhook by ID. Returns true if a record was deleted. */
export function deleteById(id: number): boolean {
  const result = db.delete(webhooks).where(eq(webhooks.id, id)).run();
  return result.changes > 0;
}

/** Find a webhook by its key hash (for verification from external requests). */
export function findByKeyHash(keyHash: string): Webhook | undefined {
  return db
    .select()
    .from(webhooks)
    .where(eq(webhooks.keyHash, keyHash))
    .get();
}
