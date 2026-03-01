/**
 * Watchlists repository.
 *
 * CRUD for named watchlist collections. Each user can have multiple watchlists,
 * each with its own icon, translate toggle, and member set.
 */

import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db";
import { watchlists, type Watchlist, type NewWatchlist } from "@/db/schema";

// =============================================================================
// Queries
// =============================================================================

/** Find all watchlists for a user, newest first. */
export function findByUserId(userId: string): Watchlist[] {
  return db
    .select()
    .from(watchlists)
    .where(eq(watchlists.userId, userId))
    .orderBy(desc(watchlists.createdAt))
    .all();
}

/** Find a watchlist by ID and user ID (ownership check). */
export function findByIdAndUserId(
  id: number,
  userId: string,
): Watchlist | undefined {
  return db
    .select()
    .from(watchlists)
    .where(and(eq(watchlists.id, id), eq(watchlists.userId, userId)))
    .get();
}

/** Find a watchlist by ID (no ownership check — use with caution). */
export function findById(id: number): Watchlist | undefined {
  return db
    .select()
    .from(watchlists)
    .where(eq(watchlists.id, id))
    .get();
}

// =============================================================================
// Mutations
// =============================================================================

/** Create a new watchlist. Returns the inserted row. */
export function create(
  data: Pick<NewWatchlist, "userId" | "name"> &
    Partial<Pick<NewWatchlist, "description" | "icon" | "translateEnabled">>,
): Watchlist {
  return db
    .insert(watchlists)
    .values({
      userId: data.userId,
      name: data.name,
      description: data.description ?? null,
      icon: data.icon ?? "eye",
      translateEnabled: data.translateEnabled ?? 1,
      createdAt: new Date(),
    })
    .returning()
    .get();
}

/** Update a watchlist's properties. Returns the updated row. */
export function update(
  id: number,
  data: Partial<Pick<NewWatchlist, "name" | "description" | "icon" | "translateEnabled">>,
): Watchlist | undefined {
  return db
    .update(watchlists)
    .set(data)
    .where(eq(watchlists.id, id))
    .returning()
    .get();
}

/** Delete a watchlist by ID. Returns true if deleted. CASCADE deletes members, posts, logs. */
export function deleteById(id: number): boolean {
  const result = db
    .delete(watchlists)
    .where(eq(watchlists.id, id))
    .run();
  return result.changes > 0;
}
