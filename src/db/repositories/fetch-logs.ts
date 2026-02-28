/**
 * Fetch Logs repository.
 *
 * Persists a record for every fetch or translate run, including
 * per-member error details so users can review failures.
 */

import { eq, desc, count } from "drizzle-orm";
import { db } from "@/db";
import { fetchLogs, type FetchLog, type NewFetchLog } from "@/db/schema";

// =============================================================================
// Queries
// =============================================================================

/** Get recent logs for a user, newest first. */
export function findByUserId(userId: string, limit = 50): FetchLog[] {
  return db
    .select()
    .from(fetchLogs)
    .where(eq(fetchLogs.userId, userId))
    .orderBy(desc(fetchLogs.createdAt), desc(fetchLogs.id))
    .limit(limit)
    .all();
}

/** Get a single log entry by id. */
export function findById(id: number): FetchLog | undefined {
  return db
    .select()
    .from(fetchLogs)
    .where(eq(fetchLogs.id, id))
    .get();
}

/** Count total logs for a user. */
export function countByUserId(userId: string): number {
  const row = db
    .select({ total: count() })
    .from(fetchLogs)
    .where(eq(fetchLogs.userId, userId))
    .get();
  return row?.total ?? 0;
}

// =============================================================================
// Mutations
// =============================================================================

/** Insert a new log entry. Returns the inserted row. */
export function insert(
  log: Omit<NewFetchLog, "id" | "createdAt">,
): FetchLog {
  return db
    .insert(fetchLogs)
    .values({
      ...log,
      createdAt: new Date(),
    })
    .returning()
    .get();
}

/** Delete all logs for a user. */
export function deleteByUserId(userId: string): number {
  const result = db
    .delete(fetchLogs)
    .where(eq(fetchLogs.userId, userId))
    .run();
  return result.changes;
}
