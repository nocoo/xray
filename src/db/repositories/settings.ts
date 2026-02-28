/**
 * Settings repository.
 *
 * Generic key-value store scoped per user.
 * Composite primary key: (user_id, key).
 */

import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { settings, type Setting } from "@/db/schema";

// =============================================================================
// Settings Repository
// =============================================================================

/**
 * Find all settings for a user.
 */
export function findByUserId(userId: string): Setting[] {
  return db
    .select()
    .from(settings)
    .where(eq(settings.userId, userId))
    .all();
}

/**
 * Find a single setting by user and key.
 */
export function findByKey(userId: string, key: string): Setting | undefined {
  return db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, key)))
    .get();
}

/**
 * Create or update a setting.
 */
export function upsert(userId: string, key: string, value: string): Setting {
  const existing = findByKey(userId, key);
  const now = Date.now();

  if (existing) {
    db.update(settings)
      .set({ value, updatedAt: now })
      .where(and(eq(settings.userId, userId), eq(settings.key, key)))
      .run();
    return findByKey(userId, key)!;
  }

  return db
    .insert(settings)
    .values({ userId, key, value, updatedAt: now })
    .returning()
    .get();
}

/**
 * Delete a single setting by key.
 * Returns true if a record was deleted.
 */
export function deleteSetting(userId: string, key: string): boolean {
  const result = db
    .delete(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, key)))
    .run();
  return result.changes > 0;
}

/**
 * Delete all settings for a user.
 * Returns the number of records deleted.
 */
export function deleteByUserId(userId: string): number {
  const result = db
    .delete(settings)
    .where(eq(settings.userId, userId))
    .run();
  return result.changes;
}
