/**
 * Fetched Posts repository.
 *
 * Manages cached tweets from auto-fetch with deduplication and translation state.
 * Deduplication is enforced at the DB level via a UNIQUE index on (user_id, tweet_id)
 * combined with INSERT ... ON CONFLICT DO NOTHING for race-safe batch inserts.
 */

import { eq, and, isNull, desc, lt, count, notInArray } from "drizzle-orm";
import { db } from "@/db";
import {
  fetchedPosts,
  type FetchedPost,
  type NewFetchedPost,
} from "@/db/schema";

// =============================================================================
// Queries
// =============================================================================

/** Find all fetched posts for a user, newest tweet first. */
export function findByUserId(
  userId: string,
  limit = 200,
): FetchedPost[] {
  return db
    .select()
    .from(fetchedPosts)
    .where(eq(fetchedPosts.userId, userId))
    .orderBy(desc(fetchedPosts.tweetCreatedAt))
    .limit(limit)
    .all();
}

/** Find a single post by ID. */
export function findById(id: number): FetchedPost | undefined {
  return db
    .select()
    .from(fetchedPosts)
    .where(eq(fetchedPosts.id, id))
    .get();
}

/** Find posts for a specific watchlist member, newest tweet first. */
export function findByMemberId(
  memberId: number,
  limit = 100,
): FetchedPost[] {
  return db
    .select()
    .from(fetchedPosts)
    .where(eq(fetchedPosts.memberId, memberId))
    .orderBy(desc(fetchedPosts.tweetCreatedAt))
    .limit(limit)
    .all();
}

/** Find all posts that haven't been translated yet. */
export function findUntranslated(
  userId: string,
  limit = 50,
): FetchedPost[] {
  return db
    .select()
    .from(fetchedPosts)
    .where(
      and(
        eq(fetchedPosts.userId, userId),
        isNull(fetchedPosts.translatedText),
      ),
    )
    .orderBy(desc(fetchedPosts.fetchedAt))
    .limit(limit)
    .all();
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Batch-insert posts, silently skipping duplicates via ON CONFLICT DO NOTHING.
 * The UNIQUE index on (user_id, tweet_id) ensures no duplicates regardless of
 * concurrent requests. Returns the count of newly inserted rows.
 */
export function insertMany(
  posts: Omit<NewFetchedPost, "id" | "fetchedAt" | "translatedText" | "translatedAt">[],
): number {
  if (posts.length === 0) return 0;

  const now = new Date();
  let inserted = 0;

  // SQLite has a variable limit (~999), so batch in chunks of 50 to be safe
  // (each row has ~10 columns → 50 rows = 500 variables)
  const BATCH_SIZE = 50;
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    const result = db
      .insert(fetchedPosts)
      .values(
        batch.map((p) => ({
          ...p,
          fetchedAt: now,
          translatedText: null,
          translatedAt: null,
        })),
      )
      .onConflictDoNothing({
        target: [fetchedPosts.userId, fetchedPosts.tweetId],
      })
      .run();
    inserted += result.changes;
  }

  return inserted;
}

/** Update the translation and comment for a post. */
export function updateTranslation(
  id: number,
  translatedText: string,
  commentText: string,
  quotedTranslatedText?: string | null,
): FetchedPost | undefined {
  return db
    .update(fetchedPosts)
    .set({
      translatedText,
      commentText,
      quotedTranslatedText: quotedTranslatedText ?? null,
      translatedAt: new Date(),
    })
    .where(eq(fetchedPosts.id, id))
    .returning()
    .get();
}

/** Delete all fetched posts for a user. */
export function deleteByUserId(userId: string): number {
  const result = db
    .delete(fetchedPosts)
    .where(eq(fetchedPosts.userId, userId))
    .run();
  return result.changes;
}

/** Count all fetched posts for a user. */
export function countByUserId(userId: string): number {
  const row = db
    .select({ total: count() })
    .from(fetchedPosts)
    .where(eq(fetchedPosts.userId, userId))
    .get();
  return row?.total ?? 0;
}

/** Count untranslated posts for a user. */
export function countUntranslated(userId: string): number {
  const row = db
    .select({ total: count() })
    .from(fetchedPosts)
    .where(
      and(
        eq(fetchedPosts.userId, userId),
        isNull(fetchedPosts.translatedText),
      ),
    )
    .get();
  return row?.total ?? 0;
}

/**
 * Delete posts whose tweetCreatedAt is older than `cutoffIso`.
 * Used for retention policy — purge tweets beyond the max window.
 * @param userId - Scope deletion to this user
 * @param cutoffIso - ISO 8601 string; posts created before this are deleted
 * @returns Number of deleted rows
 */
export function purgeOlderThan(userId: string, cutoffIso: string): number {
  const result = db
    .delete(fetchedPosts)
    .where(
      and(
        eq(fetchedPosts.userId, userId),
        lt(fetchedPosts.tweetCreatedAt, cutoffIso),
      ),
    )
    .run();
  return result.changes;
}

/**
 * Delete posts for members that no longer exist in the watchlist.
 * Uses NOT IN to find orphaned posts whose memberId references a deleted member.
 * @param userId - Scope to this user
 * @param activeMemberIds - IDs of current watchlist members
 * @returns Number of deleted rows
 */
export function purgeOrphaned(userId: string, activeMemberIds: number[]): number {
  if (activeMemberIds.length === 0) {
    // No active members → delete all posts for this user
    const result = db
      .delete(fetchedPosts)
      .where(eq(fetchedPosts.userId, userId))
      .run();
    return result.changes;
  }
  const result = db
    .delete(fetchedPosts)
    .where(
      and(
        eq(fetchedPosts.userId, userId),
        notInArray(fetchedPosts.memberId, activeMemberIds),
      ),
    )
    .run();
  return result.changes;
}
