/**
 * Fetched Posts repository.
 *
 * Manages cached tweets from auto-fetch with deduplication and translation state.
 * Deduplication is based on (user_id, tweet_id) — same tweet won't be stored twice
 * for the same user.
 */

import { eq, and, isNull, desc, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  fetchedPosts,
  type FetchedPost,
  type NewFetchedPost,
} from "@/db/schema";

// =============================================================================
// Queries
// =============================================================================

/** Find all fetched posts for a user, newest first. */
export function findByUserId(
  userId: string,
  limit = 200,
): FetchedPost[] {
  return db
    .select()
    .from(fetchedPosts)
    .where(eq(fetchedPosts.userId, userId))
    .orderBy(desc(fetchedPosts.fetchedAt))
    .limit(limit)
    .all();
}

/** Find posts for a specific watchlist member. */
export function findByMemberId(
  memberId: number,
  limit = 100,
): FetchedPost[] {
  return db
    .select()
    .from(fetchedPosts)
    .where(eq(fetchedPosts.memberId, memberId))
    .orderBy(desc(fetchedPosts.fetchedAt))
    .limit(limit)
    .all();
}

/** Check if a tweet already exists for this user (dedup). */
export function existsByTweetId(
  userId: string,
  tweetId: string,
): boolean {
  const row = db
    .select({ id: fetchedPosts.id })
    .from(fetchedPosts)
    .where(
      and(
        eq(fetchedPosts.userId, userId),
        eq(fetchedPosts.tweetId, tweetId),
      ),
    )
    .get();
  return !!row;
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
 * Insert a fetched post if it doesn't already exist (dedup by tweet_id + user_id).
 * Returns the inserted post, or null if it was a duplicate.
 */
export function insertIfNew(
  data: Omit<NewFetchedPost, "id" | "fetchedAt" | "translatedText" | "translatedAt">,
): FetchedPost | null {
  if (existsByTweetId(data.userId, data.tweetId)) {
    return null;
  }

  return db
    .insert(fetchedPosts)
    .values({
      ...data,
      fetchedAt: new Date(),
      translatedText: null,
      translatedAt: null,
    })
    .returning()
    .get();
}

/**
 * Insert multiple posts, skipping duplicates.
 * Returns count of newly inserted posts.
 */
export function insertMany(
  posts: Omit<NewFetchedPost, "id" | "fetchedAt" | "translatedText" | "translatedAt">[],
): number {
  let inserted = 0;
  for (const post of posts) {
    const result = insertIfNew(post);
    if (result) inserted++;
  }
  return inserted;
}

/** Update the translation for a post. */
export function updateTranslation(
  id: number,
  translatedText: string,
): FetchedPost | undefined {
  return db
    .update(fetchedPosts)
    .set({
      translatedText,
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
    .select({ id: fetchedPosts.id })
    .from(fetchedPosts)
    .where(eq(fetchedPosts.userId, userId))
    .all();
  return row.length;
}

/** Count untranslated posts for a user. */
export function countUntranslated(userId: string): number {
  const rows = db
    .select({ id: fetchedPosts.id })
    .from(fetchedPosts)
    .where(
      and(
        eq(fetchedPosts.userId, userId),
        isNull(fetchedPosts.translatedText),
      ),
    )
    .all();
  return rows.length;
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
