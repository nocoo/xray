import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { tags, type Tag, type NewTag } from "@/db/schema";
import { generateTagColor } from "@/lib/tag-color";

// =============================================================================
// Tags Repository — per-user tag management
// =============================================================================

/** Find all tags belonging to a specific user. */
export function findByUserId(userId: string): Tag[] {
  return db.select().from(tags).where(eq(tags.userId, userId)).all();
}

/** Find a tag by ID and user ID (ownership check). */
export function findByIdAndUserId(
  id: number,
  userId: string
): Tag | undefined {
  return db
    .select()
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .get();
}

/** Find a tag by name and user ID (for deduplication). */
export function findByNameAndUserId(
  name: string,
  userId: string
): Tag | undefined {
  return db
    .select()
    .from(tags)
    .where(and(eq(tags.name, name), eq(tags.userId, userId)))
    .get();
}

/**
 * Create a tag. Color is auto-generated from the name via stable hash.
 * Returns existing tag if one with the same name already exists (idempotent).
 */
export function create(
  data: Pick<NewTag, "userId" | "name">
): Tag {
  const trimmed = data.name.trim();
  const existing = findByNameAndUserId(trimmed, data.userId);
  if (existing) return existing;

  const color = generateTagColor(trimmed);
  return db
    .insert(tags)
    .values({
      userId: data.userId,
      name: trimmed,
      color,
    })
    .returning()
    .get();
}

/** Delete a tag by ID. Returns true if deleted. */
export function deleteById(id: number): boolean {
  const result = db.delete(tags).where(eq(tags.id, id)).run();
  return result.changes > 0;
}
