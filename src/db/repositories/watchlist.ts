import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  watchlistMembers,
  watchlistMemberTags,
  tags,
  type WatchlistMember,
  type NewWatchlistMember,
  type Tag,
} from "@/db/schema";

// =============================================================================
// Watchlist Members Repository
// =============================================================================

/** A watchlist member enriched with its associated tags. */
export interface WatchlistMemberWithTags extends WatchlistMember {
  tags: Tag[];
}

/** Find all members for a specific watchlist, with their tags. */
export function findByWatchlistId(watchlistId: number): WatchlistMemberWithTags[] {
  const members = db
    .select()
    .from(watchlistMembers)
    .where(eq(watchlistMembers.watchlistId, watchlistId))
    .all();

  return members.map((m: WatchlistMember) => ({
    ...m,
    tags: getTagsForMember(m.id),
  }));
}

/** Find all watchlist members for a user (across all watchlists), with their tags. */
export function findByUserId(userId: string): WatchlistMemberWithTags[] {
  const members = db
    .select()
    .from(watchlistMembers)
    .where(eq(watchlistMembers.userId, userId))
    .all();

  return members.map((m: WatchlistMember) => ({
    ...m,
    tags: getTagsForMember(m.id),
  }));
}

/** Find a watchlist member by ID and user ID (ownership check). */
export function findByIdAndUserId(
  id: number,
  userId: string
): WatchlistMemberWithTags | undefined {
  const member = db
    .select()
    .from(watchlistMembers)
    .where(
      and(eq(watchlistMembers.id, id), eq(watchlistMembers.userId, userId))
    )
    .get();

  if (!member) return undefined;
  return { ...member, tags: getTagsForMember(member.id) };
}

/** Find a watchlist member by ID, user ID, AND watchlist ID (full ownership check). */
export function findByIdUserAndWatchlist(
  id: number,
  userId: string,
  watchlistId: number,
): WatchlistMemberWithTags | undefined {
  const member = db
    .select()
    .from(watchlistMembers)
    .where(
      and(
        eq(watchlistMembers.id, id),
        eq(watchlistMembers.userId, userId),
        eq(watchlistMembers.watchlistId, watchlistId),
      )
    )
    .get();

  if (!member) return undefined;
  return { ...member, tags: getTagsForMember(member.id) };
}

/** Find a member by username within a specific watchlist (for deduplication). */
export function findByUsernameAndWatchlistId(
  twitterUsername: string,
  watchlistId: number,
): WatchlistMember | undefined {
  return db
    .select()
    .from(watchlistMembers)
    .where(
      and(
        eq(watchlistMembers.twitterUsername, twitterUsername.toLowerCase()),
        eq(watchlistMembers.watchlistId, watchlistId),
      )
    )
    .get();
}

/** Add a new member to a watchlist. */
export function create(
  data: Pick<NewWatchlistMember, "userId" | "watchlistId" | "twitterUsername" | "note">
): WatchlistMember {
  return db
    .insert(watchlistMembers)
    .values({
      userId: data.userId,
      watchlistId: data.watchlistId,
      twitterUsername: data.twitterUsername.toLowerCase().replace(/^@/, ""),
      note: data.note ?? null,
      addedAt: new Date(),
    })
    .returning()
    .get();
}

/** Update a watchlist member's note. */
export function updateNote(
  id: number,
  note: string | null
): WatchlistMember | undefined {
  return db
    .update(watchlistMembers)
    .set({ note })
    .where(eq(watchlistMembers.id, id))
    .returning()
    .get();
}

/** Delete a watchlist member by ID. Returns true if deleted. */
export function deleteById(id: number): boolean {
  const result = db
    .delete(watchlistMembers)
    .where(eq(watchlistMembers.id, id))
    .run();
  return result.changes > 0;
}

// =============================================================================
// Tag associations
// =============================================================================

/** Get all tags for a specific member. */
function getTagsForMember(memberId: number): Tag[] {
  const rows = db
    .select({ tag: tags })
    .from(watchlistMemberTags)
    .innerJoin(tags, eq(watchlistMemberTags.tagId, tags.id))
    .where(eq(watchlistMemberTags.memberId, memberId))
    .all();

  return rows.map((r: { tag: Tag }) => r.tag);
}

/** Set tags for a member (replace all existing). */
export function setTags(memberId: number, tagIds: number[]): void {
  // Remove all existing
  db.delete(watchlistMemberTags)
    .where(eq(watchlistMemberTags.memberId, memberId))
    .run();

  // Insert new associations
  for (const tagId of tagIds) {
    db.insert(watchlistMemberTags)
      .values({ memberId, tagId })
      .run();
  }
}

/** Add a single tag to a member. */
export function addTag(memberId: number, tagId: number): void {
  // Check if already exists
  const existing = db
    .select()
    .from(watchlistMemberTags)
    .where(
      and(
        eq(watchlistMemberTags.memberId, memberId),
        eq(watchlistMemberTags.tagId, tagId)
      )
    )
    .get();

  if (!existing) {
    db.insert(watchlistMemberTags)
      .values({ memberId, tagId })
      .run();
  }
}

/** Remove a single tag from a member. */
export function removeTag(memberId: number, tagId: number): void {
  db.delete(watchlistMemberTags)
    .where(
      and(
        eq(watchlistMemberTags.memberId, memberId),
        eq(watchlistMemberTags.tagId, tagId)
      )
    )
    .run();
}
