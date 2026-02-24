import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  apiCredentials,
  type ApiCredential,
  type NewApiCredential,
} from "@/db/schema";

// =============================================================================
// Credentials Repository
// =============================================================================

/**
 * Find credentials for a specific user.
 * Each user has at most one set of API credentials.
 */
export function findByUserId(userId: string): ApiCredential | undefined {
  return db
    .select()
    .from(apiCredentials)
    .where(eq(apiCredentials.userId, userId))
    .get();
}

/**
 * Create or update credentials for a user.
 * Uses upsert-like behavior: if credentials exist, update them; otherwise insert.
 */
export function upsert(
  userId: string,
  data: Pick<NewApiCredential, "tweapiKey" | "twitterCookie">
): ApiCredential {
  const existing = findByUserId(userId);
  const now = new Date();

  if (existing) {
    return db
      .update(apiCredentials)
      .set({
        tweapiKey: data.tweapiKey,
        twitterCookie: data.twitterCookie,
        updatedAt: now,
      })
      .where(eq(apiCredentials.userId, userId))
      .returning()
      .get();
  }

  return db
    .insert(apiCredentials)
    .values({
      userId,
      tweapiKey: data.tweapiKey,
      twitterCookie: data.twitterCookie,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

/**
 * Delete credentials for a user.
 * Returns true if a record was deleted.
 */
export function deleteByUserId(userId: string): boolean {
  const result = db
    .delete(apiCredentials)
    .where(eq(apiCredentials.userId, userId))
    .run();
  return result.changes > 0;
}
