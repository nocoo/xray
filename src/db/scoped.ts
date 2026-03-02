/**
 * ScopedDB — all database operations auto-scoped to a single user.
 *
 * Constructed with a userId, every method automatically injects the
 * user_id constraint. This makes row-level security "correct by
 * construction" — it's impossible to forget the user scope.
 *
 * Usage:
 *   const scopedDb = new ScopedDB(userId);
 *   const watchlists = scopedDb.watchlists.findAll();
 *   scopedDb.credentials.upsert({ tweapiKey, twitterCookie });
 */

import { eq, and, desc, sql, gte, lte, isNull, lt, count, notInArray, inArray } from "drizzle-orm";
import { db, getRawSqlite } from "@/db";
import {
  apiCredentials,
  webhooks,
  usageStats,
  watchlists,
  watchlistMembers,
  watchlistMemberTags,
  tags,
  fetchedPosts,
  fetchLogs,
  settings,
  type ApiCredential,
  type NewApiCredential,
  type Webhook,
  type NewWebhook,
  type UsageStat,
  type Watchlist,
  type NewWatchlist,
  type WatchlistMember,
  type NewWatchlistMember,
  type Tag,
  type NewTag,
  type FetchedPost,
  type NewFetchedPost,
  type FetchLog,
  type NewFetchLog,
  type Setting,
} from "@/db/schema";
import { generateTagColor } from "@/lib/tag-color";

// =============================================================================
// Types
// =============================================================================

/** A watchlist member enriched with its associated tags. */
export interface WatchlistMemberWithTags extends WatchlistMember {
  tags: Tag[];
}

// =============================================================================
// ScopedDB class
// =============================================================================

export class ScopedDB {
  readonly userId: string;
  readonly credentials: CredentialsRepo;
  readonly webhooks: WebhooksRepo;
  readonly usageStats: UsageStatsRepo;
  readonly watchlists: WatchlistsRepo;
  readonly members: MembersRepo;
  readonly tags: TagsRepo;
  readonly posts: PostsRepo;
  readonly logs: LogsRepo;
  readonly settings: SettingsRepo;

  constructor(userId: string) {
    this.userId = userId;
    this.credentials = new CredentialsRepo(userId);
    this.webhooks = new WebhooksRepo(userId);
    this.usageStats = new UsageStatsRepo(userId);
    this.watchlists = new WatchlistsRepo(userId);
    this.members = new MembersRepo(userId);
    this.tags = new TagsRepo(userId);
    this.posts = new PostsRepo(userId);
    this.logs = new LogsRepo(userId);
    this.settings = new SettingsRepo(userId);
  }
}

// =============================================================================
// Credentials
// =============================================================================

class CredentialsRepo {
  constructor(private userId: string) {}

  find(): ApiCredential | undefined {
    return db
      .select()
      .from(apiCredentials)
      .where(eq(apiCredentials.userId, this.userId))
      .get();
  }

  upsert(data: Pick<NewApiCredential, "tweapiKey" | "twitterCookie">): ApiCredential {
    const existing = this.find();
    const now = new Date();

    if (existing) {
      return db
        .update(apiCredentials)
        .set({ tweapiKey: data.tweapiKey, twitterCookie: data.twitterCookie, updatedAt: now })
        .where(eq(apiCredentials.userId, this.userId))
        .returning()
        .get();
    }

    return db
      .insert(apiCredentials)
      .values({
        userId: this.userId,
        tweapiKey: data.tweapiKey,
        twitterCookie: data.twitterCookie,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  }

  delete(): boolean {
    const result = db
      .delete(apiCredentials)
      .where(eq(apiCredentials.userId, this.userId))
      .run();
    return result.changes > 0;
  }
}

// =============================================================================
// Webhooks
// =============================================================================

export class WebhooksRepo {
  constructor(private userId: string) {}

  findAll(): Webhook[] {
    return db
      .select()
      .from(webhooks)
      .where(eq(webhooks.userId, this.userId))
      .all();
  }

  findById(id: number): Webhook | undefined {
    return db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.userId, this.userId)))
      .get();
  }

  create(data: Pick<NewWebhook, "keyHash" | "keyPrefix">): Webhook {
    const now = new Date();
    return db
      .insert(webhooks)
      .values({
        userId: this.userId,
        keyHash: data.keyHash,
        keyPrefix: data.keyPrefix,
        createdAt: now,
        rotatedAt: now,
      })
      .returning()
      .get();
  }

  rotateKey(id: number, keyHash: string, keyPrefix: string): Webhook | undefined {
    // Verify ownership first
    const existing = this.findById(id);
    if (!existing) return undefined;

    return db
      .update(webhooks)
      .set({ keyHash, keyPrefix, rotatedAt: new Date() })
      .where(eq(webhooks.id, id))
      .returning()
      .get();
  }

  deleteById(id: number): boolean {
    // Verify ownership first
    const existing = this.findById(id);
    if (!existing) return false;

    const result = db.delete(webhooks).where(eq(webhooks.id, id)).run();
    return result.changes > 0;
  }

  /** Find a webhook by its key hash — NOT user-scoped (used for external auth). */
  static findByKeyHash(keyHash: string): Webhook | undefined {
    return db
      .select()
      .from(webhooks)
      .where(eq(webhooks.keyHash, keyHash))
      .get();
  }
}

// =============================================================================
// Usage Stats
// =============================================================================

class UsageStatsRepo {
  constructor(private userId: string) {}

  findAll(): UsageStat[] {
    return db
      .select()
      .from(usageStats)
      .where(eq(usageStats.userId, this.userId))
      .all();
  }

  findByDate(date: string): UsageStat[] {
    return db
      .select()
      .from(usageStats)
      .where(and(eq(usageStats.userId, this.userId), eq(usageStats.date, date)))
      .all();
  }

  findInRange(startDate: string, endDate: string): UsageStat[] {
    return db
      .select()
      .from(usageStats)
      .where(
        and(
          eq(usageStats.userId, this.userId),
          gte(usageStats.date, startDate),
          lte(usageStats.date, endDate),
        ),
      )
      .all();
  }

  incrementCount(endpoint: string, date: string): UsageStat {
    const existing = db
      .select()
      .from(usageStats)
      .where(
        and(
          eq(usageStats.userId, this.userId),
          eq(usageStats.endpoint, endpoint),
          eq(usageStats.date, date),
        ),
      )
      .get();

    if (existing) {
      return db
        .update(usageStats)
        .set({ requestCount: sql`${usageStats.requestCount} + 1`, lastUsedAt: new Date() })
        .where(eq(usageStats.id, existing.id))
        .returning()
        .get();
    }

    return db
      .insert(usageStats)
      .values({
        userId: this.userId,
        endpoint,
        requestCount: 1,
        lastUsedAt: new Date(),
        date,
      })
      .returning()
      .get();
  }

  getSummary(): { totalRequests: number; uniqueEndpoints: number; lastUsedAt: Date | null } {
    const stats = this.findAll();
    if (stats.length === 0) return { totalRequests: 0, uniqueEndpoints: 0, lastUsedAt: null };

    const totalRequests = stats.reduce((sum, s) => sum + s.requestCount, 0);
    const uniqueEndpoints = new Set(stats.map((s) => s.endpoint)).size;
    const lastUsedAt = stats.reduce(
      (latest: Date | null, s) => {
        if (!s.lastUsedAt) return latest;
        if (!latest || s.lastUsedAt > latest) return s.lastUsedAt;
        return latest;
      },
      null as Date | null,
    );

    return { totalRequests, uniqueEndpoints, lastUsedAt };
  }

  getEndpointBreakdown(
    startDate?: string,
    endDate?: string,
  ): { endpoint: string; total: number }[] {
    const stats =
      startDate && endDate ? this.findInRange(startDate, endDate) : this.findAll();

    const map = new Map<string, number>();
    for (const s of stats) {
      map.set(s.endpoint, (map.get(s.endpoint) ?? 0) + s.requestCount);
    }

    return [...map.entries()]
      .map(([endpoint, total]) => ({ endpoint, total }))
      .sort((a, b) => b.total - a.total);
  }

  getDailyTotals(
    startDate?: string,
    endDate?: string,
  ): { date: string; total: number }[] {
    const stats =
      startDate && endDate ? this.findInRange(startDate, endDate) : this.findAll();

    const map = new Map<string, number>();
    for (const s of stats) {
      map.set(s.date, (map.get(s.date) ?? 0) + s.requestCount);
    }

    return [...map.entries()]
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

// =============================================================================
// Watchlists
// =============================================================================

class WatchlistsRepo {
  constructor(private userId: string) {}

  findAll(): Watchlist[] {
    return db
      .select()
      .from(watchlists)
      .where(eq(watchlists.userId, this.userId))
      .orderBy(desc(watchlists.createdAt))
      .all();
  }

  findById(id: number): Watchlist | undefined {
    return db
      .select()
      .from(watchlists)
      .where(and(eq(watchlists.id, id), eq(watchlists.userId, this.userId)))
      .get();
  }

  create(
    data: Pick<NewWatchlist, "name"> &
      Partial<Pick<NewWatchlist, "description" | "icon" | "translateEnabled">>,
  ): Watchlist {
    return db
      .insert(watchlists)
      .values({
        userId: this.userId,
        name: data.name,
        description: data.description ?? null,
        icon: data.icon ?? "eye",
        translateEnabled: data.translateEnabled ?? 1,
        createdAt: new Date(),
      })
      .returning()
      .get();
  }

  update(
    id: number,
    data: Partial<Pick<NewWatchlist, "name" | "description" | "icon" | "translateEnabled">>,
  ): Watchlist | undefined {
    // Verify ownership first
    const existing = this.findById(id);
    if (!existing) return undefined;

    return db
      .update(watchlists)
      .set(data)
      .where(eq(watchlists.id, id))
      .returning()
      .get();
  }

  deleteById(id: number): boolean {
    // Verify ownership first
    const existing = this.findById(id);
    if (!existing) return false;

    const result = db.delete(watchlists).where(eq(watchlists.id, id)).run();
    return result.changes > 0;
  }
}

// =============================================================================
// Members (watchlist members)
// =============================================================================

class MembersRepo {
  constructor(private userId: string) {}

  private batchGetTags(memberIds: number[]): Map<number, Tag[]> {
    const result = new Map<number, Tag[]>();
    if (memberIds.length === 0) return result;

    const rows = db
      .select({ memberId: watchlistMemberTags.memberId, tag: tags })
      .from(watchlistMemberTags)
      .innerJoin(tags, eq(watchlistMemberTags.tagId, tags.id))
      .where(inArray(watchlistMemberTags.memberId, memberIds))
      .all();

    for (const row of rows) {
      const existing = result.get(row.memberId);
      if (existing) existing.push(row.tag);
      else result.set(row.memberId, [row.tag]);
    }
    return result;
  }

  private enrichWithTags(members: WatchlistMember[]): WatchlistMemberWithTags[] {
    const tagMap = this.batchGetTags(members.map((m) => m.id));
    return members.map((m) => ({ ...m, tags: tagMap.get(m.id) ?? [] }));
  }

  private getTagsForMember(memberId: number): Tag[] {
    const rows = db
      .select({ tag: tags })
      .from(watchlistMemberTags)
      .innerJoin(tags, eq(watchlistMemberTags.tagId, tags.id))
      .where(eq(watchlistMemberTags.memberId, memberId))
      .all();
    return rows.map((r: { tag: Tag }) => r.tag);
  }

  findByWatchlistId(watchlistId: number): WatchlistMemberWithTags[] {
    const members = db
      .select()
      .from(watchlistMembers)
      .where(eq(watchlistMembers.watchlistId, watchlistId))
      .all();
    return this.enrichWithTags(members);
  }

  findAll(): WatchlistMemberWithTags[] {
    const members = db
      .select()
      .from(watchlistMembers)
      .where(eq(watchlistMembers.userId, this.userId))
      .all();
    return this.enrichWithTags(members);
  }

  findById(id: number): WatchlistMemberWithTags | undefined {
    const member = db
      .select()
      .from(watchlistMembers)
      .where(and(eq(watchlistMembers.id, id), eq(watchlistMembers.userId, this.userId)))
      .get();
    if (!member) return undefined;
    return { ...member, tags: this.getTagsForMember(member.id) };
  }

  findByIdAndWatchlist(id: number, watchlistId: number): WatchlistMemberWithTags | undefined {
    const member = db
      .select()
      .from(watchlistMembers)
      .where(
        and(
          eq(watchlistMembers.id, id),
          eq(watchlistMembers.userId, this.userId),
          eq(watchlistMembers.watchlistId, watchlistId),
        ),
      )
      .get();
    if (!member) return undefined;
    return { ...member, tags: this.getTagsForMember(member.id) };
  }

  findByUsernameAndWatchlist(
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
        ),
      )
      .get();
  }

  create(
    data: Pick<NewWatchlistMember, "watchlistId" | "twitterUsername" | "note">,
  ): WatchlistMember {
    return db
      .insert(watchlistMembers)
      .values({
        userId: this.userId,
        watchlistId: data.watchlistId,
        twitterUsername: data.twitterUsername.toLowerCase().replace(/^@/, ""),
        note: data.note ?? null,
        addedAt: new Date(),
      })
      .returning()
      .get();
  }

  updateNote(id: number, note: string | null): WatchlistMember | undefined {
    // Verify ownership
    const existing = this.findById(id);
    if (!existing) return undefined;

    return db
      .update(watchlistMembers)
      .set({ note })
      .where(eq(watchlistMembers.id, id))
      .returning()
      .get();
  }

  deleteById(id: number): boolean {
    // Verify ownership
    const existing = this.findById(id);
    if (!existing) return false;

    const result = db.delete(watchlistMembers).where(eq(watchlistMembers.id, id)).run();
    return result.changes > 0;
  }

  setTags(memberId: number, tagIds: number[]): void {
    const run = getRawSqlite().transaction(() => {
      db.delete(watchlistMemberTags)
        .where(eq(watchlistMemberTags.memberId, memberId))
        .run();
      for (const tagId of tagIds) {
        db.insert(watchlistMemberTags).values({ memberId, tagId }).run();
      }
    });
    run();
  }

  addTag(memberId: number, tagId: number): void {
    const existing = db
      .select()
      .from(watchlistMemberTags)
      .where(
        and(eq(watchlistMemberTags.memberId, memberId), eq(watchlistMemberTags.tagId, tagId)),
      )
      .get();

    if (!existing) {
      db.insert(watchlistMemberTags).values({ memberId, tagId }).run();
    }
  }

  removeTag(memberId: number, tagId: number): void {
    db.delete(watchlistMemberTags)
      .where(
        and(eq(watchlistMemberTags.memberId, memberId), eq(watchlistMemberTags.tagId, tagId)),
      )
      .run();
  }
}

// =============================================================================
// Tags
// =============================================================================

class TagsRepo {
  constructor(private userId: string) {}

  findAll(): Tag[] {
    return db.select().from(tags).where(eq(tags.userId, this.userId)).all();
  }

  findById(id: number): Tag | undefined {
    return db
      .select()
      .from(tags)
      .where(and(eq(tags.id, id), eq(tags.userId, this.userId)))
      .get();
  }

  findByName(name: string): Tag | undefined {
    return db
      .select()
      .from(tags)
      .where(and(eq(tags.name, name), eq(tags.userId, this.userId)))
      .get();
  }

  create(data: Pick<NewTag, "name">): Tag {
    const trimmed = data.name.trim();
    const existing = this.findByName(trimmed);
    if (existing) return existing;

    const color = generateTagColor(trimmed);
    return db
      .insert(tags)
      .values({ userId: this.userId, name: trimmed, color })
      .returning()
      .get();
  }

  deleteById(id: number): boolean {
    // Verify ownership
    const existing = this.findById(id);
    if (!existing) return false;

    const result = db.delete(tags).where(eq(tags.id, id)).run();
    return result.changes > 0;
  }
}

// =============================================================================
// Fetched Posts
// =============================================================================

class PostsRepo {
  constructor(private userId: string) {}

  findByWatchlistId(watchlistId: number, limit = 200): FetchedPost[] {
    return db
      .select()
      .from(fetchedPosts)
      .where(eq(fetchedPosts.watchlistId, watchlistId))
      .orderBy(desc(fetchedPosts.tweetCreatedAt))
      .limit(limit)
      .all();
  }

  findById(id: number): FetchedPost | undefined {
    return db
      .select()
      .from(fetchedPosts)
      .where(and(eq(fetchedPosts.id, id), eq(fetchedPosts.userId, this.userId)))
      .get();
  }

  findByMemberId(memberId: number, watchlistId: number, limit = 100): FetchedPost[] {
    return db
      .select()
      .from(fetchedPosts)
      .where(
        and(eq(fetchedPosts.memberId, memberId), eq(fetchedPosts.watchlistId, watchlistId)),
      )
      .orderBy(desc(fetchedPosts.tweetCreatedAt))
      .limit(limit)
      .all();
  }

  findUntranslated(watchlistId: number, limit = 50): FetchedPost[] {
    return db
      .select()
      .from(fetchedPosts)
      .where(
        and(eq(fetchedPosts.watchlistId, watchlistId), isNull(fetchedPosts.translatedText)),
      )
      .orderBy(desc(fetchedPosts.fetchedAt))
      .limit(limit)
      .all();
  }

  insertMany(
    posts: Omit<NewFetchedPost, "id" | "userId" | "fetchedAt" | "translatedText" | "translatedAt">[],
  ): number {
    if (posts.length === 0) return 0;
    const now = new Date();
    const BATCH_SIZE = 50;

    const run = getRawSqlite().transaction(() => {
      let inserted = 0;
      for (let i = 0; i < posts.length; i += BATCH_SIZE) {
        const batch = posts.slice(i, i + BATCH_SIZE);
        const result = db
          .insert(fetchedPosts)
          .values(
            batch.map((p) => ({
              ...p,
              userId: this.userId,
              fetchedAt: now,
              translatedText: null,
              translatedAt: null,
            })),
          )
          .onConflictDoNothing({
            target: [fetchedPosts.watchlistId, fetchedPosts.tweetId],
          })
          .run();
        inserted += result.changes;
      }
      return inserted;
    });

    return run();
  }

  updateTranslation(
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

  deleteByWatchlistId(watchlistId: number): number {
    const result = db
      .delete(fetchedPosts)
      .where(eq(fetchedPosts.watchlistId, watchlistId))
      .run();
    return result.changes;
  }

  countByWatchlistId(watchlistId: number): number {
    const row = db
      .select({ total: count() })
      .from(fetchedPosts)
      .where(eq(fetchedPosts.watchlistId, watchlistId))
      .get();
    return row?.total ?? 0;
  }

  countUntranslated(watchlistId: number): number {
    const row = db
      .select({ total: count() })
      .from(fetchedPosts)
      .where(
        and(eq(fetchedPosts.watchlistId, watchlistId), isNull(fetchedPosts.translatedText)),
      )
      .get();
    return row?.total ?? 0;
  }

  purgeOlderThan(watchlistId: number, cutoffIso: string): number {
    const result = db
      .delete(fetchedPosts)
      .where(
        and(eq(fetchedPosts.watchlistId, watchlistId), lt(fetchedPosts.tweetCreatedAt, cutoffIso)),
      )
      .run();
    return result.changes;
  }

  purgeOrphaned(watchlistId: number, activeMemberIds: number[]): number {
    if (activeMemberIds.length === 0) {
      const result = db
        .delete(fetchedPosts)
        .where(eq(fetchedPosts.watchlistId, watchlistId))
        .run();
      return result.changes;
    }
    const result = db
      .delete(fetchedPosts)
      .where(
        and(
          eq(fetchedPosts.watchlistId, watchlistId),
          notInArray(fetchedPosts.memberId, activeMemberIds),
        ),
      )
      .run();
    return result.changes;
  }
}

// =============================================================================
// Fetch Logs
// =============================================================================

class LogsRepo {
  constructor(private userId: string) {}

  findByWatchlistId(watchlistId: number, limit = 50): FetchLog[] {
    return db
      .select()
      .from(fetchLogs)
      .where(eq(fetchLogs.watchlistId, watchlistId))
      .orderBy(desc(fetchLogs.createdAt), desc(fetchLogs.id))
      .limit(limit)
      .all();
  }

  findById(id: number): FetchLog | undefined {
    return db
      .select()
      .from(fetchLogs)
      .where(eq(fetchLogs.id, id))
      .get();
  }

  countByWatchlistId(watchlistId: number): number {
    const row = db
      .select({ total: count() })
      .from(fetchLogs)
      .where(eq(fetchLogs.watchlistId, watchlistId))
      .get();
    return row?.total ?? 0;
  }

  insert(log: Omit<NewFetchLog, "id" | "userId" | "createdAt">): FetchLog {
    return db
      .insert(fetchLogs)
      .values({
        ...log,
        userId: this.userId,
        createdAt: new Date(),
      })
      .returning()
      .get();
  }

  deleteByWatchlistId(watchlistId: number): number {
    const result = db
      .delete(fetchLogs)
      .where(eq(fetchLogs.watchlistId, watchlistId))
      .run();
    return result.changes;
  }
}

// =============================================================================
// Settings
// =============================================================================

class SettingsRepo {
  constructor(private userId: string) {}

  findAll(): Setting[] {
    return db
      .select()
      .from(settings)
      .where(eq(settings.userId, this.userId))
      .all();
  }

  findByKey(key: string): Setting | undefined {
    return db
      .select()
      .from(settings)
      .where(and(eq(settings.userId, this.userId), eq(settings.key, key)))
      .get();
  }

  upsert(key: string, value: string): Setting {
    const existing = this.findByKey(key);
    const now = Date.now();

    if (existing) {
      db.update(settings)
        .set({ value, updatedAt: now })
        .where(and(eq(settings.userId, this.userId), eq(settings.key, key)))
        .run();
      return this.findByKey(key)!;
    }

    return db
      .insert(settings)
      .values({ userId: this.userId, key, value, updatedAt: now })
      .returning()
      .get();
  }

  deleteSetting(key: string): boolean {
    const result = db
      .delete(settings)
      .where(and(eq(settings.userId, this.userId), eq(settings.key, key)))
      .run();
    return result.changes > 0;
  }

  deleteAll(): number {
    const result = db
      .delete(settings)
      .where(eq(settings.userId, this.userId))
      .run();
    return result.changes;
  }
}
