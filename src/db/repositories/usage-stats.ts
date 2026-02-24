import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { usageStats, type UsageStat, type NewUsageStat } from "@/db/schema";

// =============================================================================
// Usage Stats Repository
// =============================================================================

/** Get all usage stats for a user. */
export function findByUserId(userId: string): UsageStat[] {
  return db
    .select()
    .from(usageStats)
    .where(eq(usageStats.userId, userId))
    .all();
}

/** Get usage stats for a user on a specific date. */
export function findByUserIdAndDate(
  userId: string,
  date: string
): UsageStat[] {
  return db
    .select()
    .from(usageStats)
    .where(and(eq(usageStats.userId, userId), eq(usageStats.date, date)))
    .all();
}

/**
 * Increment the request count for a specific endpoint and date.
 * Creates the record if it doesn't exist.
 */
export function incrementCount(
  userId: string,
  endpoint: string,
  date: string
): UsageStat {
  const existing = db
    .select()
    .from(usageStats)
    .where(
      and(
        eq(usageStats.userId, userId),
        eq(usageStats.endpoint, endpoint),
        eq(usageStats.date, date)
      )
    )
    .get();

  if (existing) {
    return db
      .update(usageStats)
      .set({
        requestCount: sql`${usageStats.requestCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(usageStats.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(usageStats)
    .values({
      userId,
      endpoint,
      requestCount: 1,
      lastUsedAt: new Date(),
      date,
    })
    .returning()
    .get();
}

/**
 * Get summary stats for a user: total requests and unique endpoints.
 */
export function getSummary(userId: string): {
  totalRequests: number;
  uniqueEndpoints: number;
  lastUsedAt: Date | null;
} {
  const stats = findByUserId(userId);

  if (stats.length === 0) {
    return { totalRequests: 0, uniqueEndpoints: 0, lastUsedAt: null };
  }

  const totalRequests = stats.reduce((sum, s) => sum + s.requestCount, 0);
  const uniqueEndpoints = new Set(stats.map((s) => s.endpoint)).size;
  const lastUsedAt = stats.reduce(
    (latest: Date | null, s) => {
      if (!s.lastUsedAt) return latest;
      if (!latest || s.lastUsedAt > latest) return s.lastUsedAt;
      return latest;
    },
    null as Date | null
  );

  return { totalRequests, uniqueEndpoints, lastUsedAt };
}
