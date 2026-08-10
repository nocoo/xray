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
import type { UserInfo } from "../../shared/types";
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
  twitterProfiles,
  groups,
  groupMembers,
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
  type TwitterProfile,
  type Group,
  type NewGroup,
  type GroupMember,
  type NewGroupMember,
} from "@/db/schema";
import { generateTagColor } from "@/lib/tag-color";

// =============================================================================
// Types
// =============================================================================

/** A watchlist member enriched with its associated tags. */
export interface WatchlistMemberWithTags extends WatchlistMember {
  tags: Tag[];
}

/** Profile snapshot attached to a member (from twitter_profiles LEFT JOIN). */
export interface MemberProfile {
  twitterId: string;
  displayName: string | null;
  description: string | null;
  profileImageUrl: string | null;
  profileBannerUrl: string | null;
  followersCount: number;
  followingCount: number;
  tweetCount: number;
  likeCount: number;
  isVerified: boolean;
  accountCreatedAt: string | null;
  lastTweetAt: string | null;
  snapshotAt: number | null;
}

/** Full member with tags + optional profile data. */
export interface WatchlistMemberFull extends WatchlistMemberWithTags {
  profile: MemberProfile | null;
}

/** A group member enriched with optional profile data. */
export interface GroupMemberFull extends GroupMember {
  profile: MemberProfile | null;
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
  readonly profiles: ProfilesRepo;
  readonly groups: GroupsRepo;
  readonly groupMembers: GroupMembersRepo;

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
    this.profiles = new ProfilesRepo();
    this.groups = new GroupsRepo(userId);
    this.groupMembers = new GroupMembersRepo(userId);
  }
}

// =============================================================================
// Twitter Profiles (global — not user-scoped)
// =============================================================================

/**
 * Shared profile cache for all Twitter users seen by the system.
 * NOT user-scoped — profiles are global and shared across all app users.
 */
export class ProfilesRepo {
  /** Convert a UserInfo from the Twitter API into DB column format. */
  private toRow(info: UserInfo): typeof twitterProfiles.$inferInsert {
    const now = Date.now();
    return {
      twitterId: info.id,
      username: info.username.toLowerCase(),
      displayName: info.name,
      description: info.description ?? null,
      location: info.location ?? null,
      profileImageUrl: info.profile_image_url,
      profileBannerUrl: info.profile_banner_url ?? null,
      followersCount: info.followers_count,
      followingCount: info.following_count,
      tweetCount: info.tweet_count,
      likeCount: info.like_count,
      isVerified: info.is_verified ? 1 : 0,
      accountCreatedAt: info.created_at,
      pinnedTweetId: info.pinned_tweet_id ?? null,
      snapshotAt: now,
      updatedAt: now,
    };
  }

  /** Convert a DB row back to UserInfo. */
  private toUserInfo(row: TwitterProfile): UserInfo {
    return {
      id: row.twitterId,
      username: row.username,
      name: row.displayName ?? row.username,
      description: row.description ?? undefined,
      location: row.location ?? undefined,
      profile_image_url: row.profileImageUrl ?? "",
      profile_banner_url: row.profileBannerUrl ?? undefined,
      followers_count: row.followersCount ?? 0,
      following_count: row.followingCount ?? 0,
      tweet_count: row.tweetCount ?? 0,
      like_count: row.likeCount ?? 0,
      is_verified: row.isVerified === 1,
      created_at: row.accountCreatedAt ?? "",
      pinned_tweet_id: row.pinnedTweetId ?? undefined,
    };
  }

  /** Insert or update a single profile from a UserInfo object. */
  upsert(info: UserInfo): TwitterProfile {
    const row = this.toRow(info);
    // INSERT OR REPLACE on PK (twitter_id)
    return db
      .insert(twitterProfiles)
      .values(row)
      .onConflictDoUpdate({
        target: twitterProfiles.twitterId,
        set: {
          username: row.username,
          displayName: row.displayName,
          description: row.description,
          location: row.location,
          profileImageUrl: row.profileImageUrl,
          profileBannerUrl: row.profileBannerUrl,
          followersCount: row.followersCount,
          followingCount: row.followingCount,
          tweetCount: row.tweetCount,
          likeCount: row.likeCount,
          isVerified: row.isVerified,
          accountCreatedAt: row.accountCreatedAt,
          pinnedTweetId: row.pinnedTweetId,
          snapshotAt: row.snapshotAt,
          updatedAt: row.updatedAt,
        },
      })
      .returning()
      .get();
  }

  /** Batch upsert multiple profiles. Wrapped in a transaction for performance. */
  batchUpsert(infos: UserInfo[]): TwitterProfile[] {
    if (infos.length === 0) return [];
    const results: TwitterProfile[] = [];
    const run = getRawSqlite().transaction(() => {
      for (const info of infos) {
        results.push(this.upsert(info));
      }
    });
    run();
    return results;
  }

  /** Find a profile by Twitter numeric ID. */
  findByTwitterId(twitterId: string): TwitterProfile | undefined {
    return db
      .select()
      .from(twitterProfiles)
      .where(eq(twitterProfiles.twitterId, twitterId))
      .get();
  }

  /** Find a profile by current username (case-insensitive). */
  findByUsername(username: string): TwitterProfile | undefined {
    return db
      .select()
      .from(twitterProfiles)
      .where(eq(twitterProfiles.username, username.toLowerCase()))
      .get();
  }

  /** Find multiple profiles by Twitter IDs. */
  findByIds(twitterIds: string[]): TwitterProfile[] {
    if (twitterIds.length === 0) return [];
    return db
      .select()
      .from(twitterProfiles)
      .where(inArray(twitterProfiles.twitterId, twitterIds))
      .all();
  }

  /** Find multiple profiles by usernames. */
  findByUsernames(usernames: string[]): TwitterProfile[] {
    if (usernames.length === 0) return [];
    const lower = usernames.map((u) => u.toLowerCase());
    return db
      .select()
      .from(twitterProfiles)
      .where(inArray(twitterProfiles.username, lower))
      .all();
  }

  /** Find all profiles. */
  findAll(): TwitterProfile[] {
    return db.select().from(twitterProfiles).all();
  }

  /** Update the last_tweet_at field for a profile by username. */
  updateLastTweetAt(username: string, lastTweetAt: string): void {
    db.update(twitterProfiles)
      .set({ lastTweetAt, updatedAt: Date.now() })
      .where(eq(twitterProfiles.username, username.toLowerCase()))
      .run();
  }

  /** Convert a profile row to UserInfo for API responses. */
  toInfo(row: TwitterProfile): UserInfo {
    return this.toUserInfo(row);
  }

  /** Convert multiple rows to UserInfo[]. */
  toInfos(rows: TwitterProfile[]): UserInfo[] {
    return rows.map((r) => this.toUserInfo(r));
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

  /** Batch-lookup profiles for members that have a twitter_id. */
  private batchGetProfiles(members: WatchlistMember[]): Map<number, MemberProfile> {
    const result = new Map<number, MemberProfile>();
    const twitterIds = members
      .filter((m) => m.twitterId)
      .map((m) => m.twitterId as string);
    if (twitterIds.length === 0) return result;

    const profiles: TwitterProfile[] = db
      .select()
      .from(twitterProfiles)
      .where(inArray(twitterProfiles.twitterId, twitterIds))
      .all();

    const profileMap = new Map(profiles.map((p: TwitterProfile) => [p.twitterId, p]));

    for (const m of members) {
      if (!m.twitterId) continue;
      const p = profileMap.get(m.twitterId);
      if (!p) continue;
      result.set(m.id, {
        twitterId: p.twitterId,
        displayName: p.displayName,
        description: p.description,
        profileImageUrl: p.profileImageUrl,
        profileBannerUrl: p.profileBannerUrl,
        followersCount: p.followersCount ?? 0,
        followingCount: p.followingCount ?? 0,
        tweetCount: p.tweetCount ?? 0,
        likeCount: p.likeCount ?? 0,
        isVerified: p.isVerified === 1,
        accountCreatedAt: p.accountCreatedAt,
        lastTweetAt: p.lastTweetAt ?? null,
        snapshotAt: p.snapshotAt ?? null,
      });
    }
    return result;
  }

  private enrichWithTags(members: WatchlistMember[]): WatchlistMemberWithTags[] {
    const tagMap = this.batchGetTags(members.map((m) => m.id));
    return members.map((m) => ({ ...m, tags: tagMap.get(m.id) ?? [] }));
  }

  /** Enrich members with both tags and profile data. */
  private enrichFull(members: WatchlistMember[]): WatchlistMemberFull[] {
    const tagMap = this.batchGetTags(members.map((m) => m.id));
    const profileMap = this.batchGetProfiles(members);
    return members.map((m) => ({
      ...m,
      tags: tagMap.get(m.id) ?? [],
      profile: profileMap.get(m.id) ?? null,
    }));
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

  /** Get a single member's profile. */
  private getProfileForMember(member: WatchlistMember): MemberProfile | null {
    if (!member.twitterId) return null;
    const p: TwitterProfile | undefined = db
      .select()
      .from(twitterProfiles)
      .where(eq(twitterProfiles.twitterId, member.twitterId))
      .get();
    if (!p) return null;
    return {
      twitterId: p.twitterId,
      displayName: p.displayName,
      description: p.description,
      profileImageUrl: p.profileImageUrl,
      profileBannerUrl: p.profileBannerUrl,
      followersCount: p.followersCount ?? 0,
      followingCount: p.followingCount ?? 0,
      tweetCount: p.tweetCount ?? 0,
      likeCount: p.likeCount ?? 0,
      isVerified: p.isVerified === 1,
      accountCreatedAt: p.accountCreatedAt,
      lastTweetAt: p.lastTweetAt ?? null,
      snapshotAt: p.snapshotAt ?? null,
    };
  }

  findByWatchlistId(watchlistId: number): WatchlistMemberFull[] {
    const members = db
      .select()
      .from(watchlistMembers)
      .where(eq(watchlistMembers.watchlistId, watchlistId))
      .all();
    return this.enrichFull(members);
  }

  findAll(): WatchlistMemberFull[] {
    const members = db
      .select()
      .from(watchlistMembers)
      .where(eq(watchlistMembers.userId, this.userId))
      .all();
    return this.enrichFull(members);
  }

  findById(id: number): WatchlistMemberFull | undefined {
    const member = db
      .select()
      .from(watchlistMembers)
      .where(and(eq(watchlistMembers.id, id), eq(watchlistMembers.userId, this.userId)))
      .get();
    if (!member) return undefined;
    return {
      ...member,
      tags: this.getTagsForMember(member.id),
      profile: this.getProfileForMember(member),
    };
  }

  findByIdAndWatchlist(id: number, watchlistId: number): WatchlistMemberFull | undefined {
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
    return {
      ...member,
      tags: this.getTagsForMember(member.id),
      profile: this.getProfileForMember(member),
    };
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
    const username = data.twitterUsername.toLowerCase().replace(/^@/, "");

    // Auto-resolve twitter_id from cached profiles
    const profile = db
      .select({ twitterId: twitterProfiles.twitterId })
      .from(twitterProfiles)
      .where(eq(twitterProfiles.username, username))
      .get();

    return db
      .insert(watchlistMembers)
      .values({
        userId: this.userId,
        watchlistId: data.watchlistId,
        twitterUsername: username,
        twitterId: profile?.twitterId ?? null,
        note: data.note ?? null,
        addedAt: new Date(),
      })
      .returning()
      .get();
  }

  /** Backfill twitter_id for a member after profile resolution. */
  linkProfile(memberId: number, twitterId: string): void {
    db.update(watchlistMembers)
      .set({ twitterId })
      .where(eq(watchlistMembers.id, memberId))
      .run();
  }

  /** Batch-backfill twitter_id for members by username lookup. */
  linkProfilesByUsername(watchlistId: number): number {
    // Find members in this watchlist that have no twitter_id
    const unlinked = db
      .select()
      .from(watchlistMembers)
      .where(
        and(
          eq(watchlistMembers.watchlistId, watchlistId),
          isNull(watchlistMembers.twitterId),
        ),
      )
      .all();
    if (unlinked.length === 0) return 0;

    const usernames = unlinked.map((m: WatchlistMember) => m.twitterUsername.toLowerCase());
    const profiles: TwitterProfile[] = db
      .select()
      .from(twitterProfiles)
      .where(inArray(twitterProfiles.username, usernames))
      .all();
    const profileMap = new Map(profiles.map((p: TwitterProfile) => [p.username, p.twitterId]));

    let linked = 0;
    const run = getRawSqlite().transaction(() => {
      for (const m of unlinked) {
        const tid = profileMap.get(m.twitterUsername.toLowerCase());
        if (tid) {
          db.update(watchlistMembers)
            .set({ twitterId: tid })
            .where(eq(watchlistMembers.id, m.id))
            .run();
          linked++;
        }
      }
    });
    run();
    return linked;
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
      .orderBy(desc(fetchedPosts.tweetCreatedAt), desc(fetchedPosts.id))
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
      .orderBy(desc(fetchedPosts.tweetCreatedAt), desc(fetchedPosts.id))
      .limit(limit)
      .all();
  }

  findUntranslated(watchlistId: number, limit = 50): FetchedPost[] {
    return db
      .select()
      .from(fetchedPosts)
      .where(
        and(
          eq(fetchedPosts.watchlistId, watchlistId),
          isNull(fetchedPosts.translatedText),
          isNull(fetchedPosts.translationError),
        ),
      )
      .orderBy(desc(fetchedPosts.fetchedAt), desc(fetchedPosts.id))
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
        translationError: null, // clear any previous error on success
      })
      .where(eq(fetchedPosts.id, id))
      .returning()
      .get();
  }

  updateTranslationError(id: number, error: string): FetchedPost | undefined {
    return db
      .update(fetchedPosts)
      .set({ translationError: error })
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

  /** Delete a single post by ID (user-scoped). Returns true if a row was deleted. */
  deleteById(id: number): boolean {
    const result = db
      .delete(fetchedPosts)
      .where(eq(fetchedPosts.id, id))
      .run();
    return result.changes > 0;
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
        and(
          eq(fetchedPosts.watchlistId, watchlistId),
          isNull(fetchedPosts.translatedText),
          isNull(fetchedPosts.translationError),
        ),
      )
      .get();
    return row?.total ?? 0;
  }

  countFailed(watchlistId: number): number {
    const row = db
      .select({ total: count() })
      .from(fetchedPosts)
      .where(
        and(
          eq(fetchedPosts.watchlistId, watchlistId),
          isNull(fetchedPosts.translatedText),
          sql`${fetchedPosts.translationError} IS NOT NULL`,
        ),
      )
      .get();
    return row?.total ?? 0;
  }

  /** Clear translation error for a post, making it eligible for retry. */
  clearTranslationError(id: number): void {
    db.update(fetchedPosts)
      .set({ translationError: null })
      .where(eq(fetchedPosts.id, id))
      .run();
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
      const result = this.findByKey(key);
      if (result) return result;
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

// =============================================================================
// Groups
// =============================================================================

export class GroupsRepo {
  constructor(private userId: string) {}

  findAll(): Group[] {
    return db
      .select()
      .from(groups)
      .where(eq(groups.userId, this.userId))
      .orderBy(desc(groups.createdAt))
      .all();
  }

  findById(id: number): Group | undefined {
    return db
      .select()
      .from(groups)
      .where(and(eq(groups.id, id), eq(groups.userId, this.userId)))
      .get();
  }

  create(
    data: Pick<NewGroup, "name"> &
      Partial<Pick<NewGroup, "description" | "icon">>,
  ): Group {
    return db
      .insert(groups)
      .values({
        userId: this.userId,
        name: data.name,
        description: data.description ?? null,
        icon: data.icon ?? "users",
        createdAt: new Date(),
      })
      .returning()
      .get();
  }

  update(
    id: number,
    data: Partial<Pick<NewGroup, "name" | "description" | "icon">>,
  ): Group | undefined {
    const existing = this.findById(id);
    if (!existing) return undefined;

    return db
      .update(groups)
      .set(data)
      .where(eq(groups.id, id))
      .returning()
      .get();
  }

  deleteById(id: number): boolean {
    const existing = this.findById(id);
    if (!existing) return false;

    const result = db.delete(groups).where(eq(groups.id, id)).run();
    return result.changes > 0;
  }
}

// =============================================================================
// Group Members
// =============================================================================

export class GroupMembersRepo {
  constructor(private userId: string) {}

  /** Batch-lookup profiles for members that have a twitter_id. */
  private batchGetProfiles(members: GroupMember[]): Map<number, MemberProfile> {
    const result = new Map<number, MemberProfile>();
    const twitterIds = members
      .filter((m) => m.twitterId)
      .map((m) => m.twitterId as string);
    if (twitterIds.length === 0) return result;

    const profiles: TwitterProfile[] = db
      .select()
      .from(twitterProfiles)
      .where(inArray(twitterProfiles.twitterId, twitterIds))
      .all();

    const profileMap = new Map(profiles.map((p: TwitterProfile) => [p.twitterId, p]));

    for (const m of members) {
      if (!m.twitterId) continue;
      const p = profileMap.get(m.twitterId);
      if (!p) continue;
      result.set(m.id, {
        twitterId: p.twitterId,
        displayName: p.displayName,
        description: p.description,
        profileImageUrl: p.profileImageUrl,
        profileBannerUrl: p.profileBannerUrl,
        followersCount: p.followersCount ?? 0,
        followingCount: p.followingCount ?? 0,
        tweetCount: p.tweetCount ?? 0,
        likeCount: p.likeCount ?? 0,
        isVerified: p.isVerified === 1,
        accountCreatedAt: p.accountCreatedAt,
        lastTweetAt: p.lastTweetAt ?? null,
        snapshotAt: p.snapshotAt ?? null,
      });
    }
    return result;
  }

  /** Enrich members with profile data. */
  private enrichFull(members: GroupMember[]): GroupMemberFull[] {
    const profileMap = this.batchGetProfiles(members);
    return members.map((m) => ({
      ...m,
      profile: profileMap.get(m.id) ?? null,
    }));
  }

  /** Get a single member's profile. */
  private getProfileForMember(member: GroupMember): MemberProfile | null {
    if (!member.twitterId) return null;
    const p: TwitterProfile | undefined = db
      .select()
      .from(twitterProfiles)
      .where(eq(twitterProfiles.twitterId, member.twitterId))
      .get();
    if (!p) return null;
    return {
      twitterId: p.twitterId,
      displayName: p.displayName,
      description: p.description,
      profileImageUrl: p.profileImageUrl,
      profileBannerUrl: p.profileBannerUrl,
      followersCount: p.followersCount ?? 0,
      followingCount: p.followingCount ?? 0,
      tweetCount: p.tweetCount ?? 0,
      likeCount: p.likeCount ?? 0,
      isVerified: p.isVerified === 1,
      accountCreatedAt: p.accountCreatedAt,
      lastTweetAt: p.lastTweetAt ?? null,
      snapshotAt: p.snapshotAt ?? null,
    };
  }

  findByGroupId(groupId: number): GroupMemberFull[] {
    const members = db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId))
      .all();
    return this.enrichFull(members);
  }

  findAll(): GroupMemberFull[] {
    const members = db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.userId, this.userId))
      .all();
    return this.enrichFull(members);
  }

  findById(id: number): GroupMemberFull | undefined {
    const member = db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.id, id), eq(groupMembers.userId, this.userId)))
      .get();
    if (!member) return undefined;
    return {
      ...member,
      profile: this.getProfileForMember(member),
    };
  }

  findByUsernameAndGroup(
    twitterUsername: string,
    groupId: number,
  ): GroupMember | undefined {
    return db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.twitterUsername, twitterUsername.toLowerCase()),
          eq(groupMembers.groupId, groupId),
        ),
      )
      .get();
  }

  create(
    data: Pick<NewGroupMember, "groupId" | "twitterUsername">,
  ): GroupMember {
    const username = data.twitterUsername.toLowerCase().replace(/^@/, "");

    // Auto-resolve twitter_id from cached profiles
    const profile = db
      .select({ twitterId: twitterProfiles.twitterId })
      .from(twitterProfiles)
      .where(eq(twitterProfiles.username, username))
      .get();

    return db
      .insert(groupMembers)
      .values({
        userId: this.userId,
        groupId: data.groupId,
        twitterUsername: username,
        twitterId: profile?.twitterId ?? null,
        addedAt: new Date(),
      })
      .returning()
      .get();
  }

  /** Batch-create members, skipping duplicates. Returns number inserted.
   *  @deprecated Use batchCreateWithIds instead. */
  batchCreate(groupId: number, usernames: string[]): number {
    return this.batchCreateWithIds(
      groupId,
      usernames.map((u) => ({ username: u })),
    );
  }

  /**
   * Batch-create members with optional pre-resolved twitterId.
   * When twitterId is provided, it is stored directly (no profile lookup).
   * When absent, falls back to looking up twitter_profiles by username.
   * Skips duplicates via ON CONFLICT DO NOTHING.
   */
  batchCreateWithIds(
    groupId: number,
    members: { username: string; twitterId?: string }[],
  ): number {
    if (members.length === 0) return 0;

    let inserted = 0;
    const run = getRawSqlite().transaction(() => {
      for (const m of members) {
        const username = m.username.toLowerCase().replace(/^@/, "");
        if (!username) continue;

        // Use provided twitterId, or fall back to profile cache lookup
        let twitterId = m.twitterId ?? null;
        if (!twitterId) {
          const profile = db
            .select({ twitterId: twitterProfiles.twitterId })
            .from(twitterProfiles)
            .where(eq(twitterProfiles.username, username))
            .get();
          twitterId = profile?.twitterId ?? null;
        }

        const result = db
          .insert(groupMembers)
          .values({
            userId: this.userId,
            groupId,
            twitterUsername: username,
            twitterId,
            addedAt: new Date(),
          })
          .onConflictDoNothing({
            target: [groupMembers.groupId, groupMembers.twitterUsername],
          })
          .run();
        inserted += result.changes;
      }
    });
    run();
    return inserted;
  }

  /** Backfill twitter_id for members by username lookup. */
  linkProfilesByUsername(groupId: number): number {
    const unlinked = db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          isNull(groupMembers.twitterId),
        ),
      )
      .all();
    if (unlinked.length === 0) return 0;

    const usernames = unlinked.map((m: GroupMember) => m.twitterUsername.toLowerCase());
    const profiles: TwitterProfile[] = db
      .select()
      .from(twitterProfiles)
      .where(inArray(twitterProfiles.username, usernames))
      .all();
    const profileMap = new Map(profiles.map((p: TwitterProfile) => [p.username, p.twitterId]));

    let linked = 0;
    const run = getRawSqlite().transaction(() => {
      for (const m of unlinked) {
        const tid = profileMap.get(m.twitterUsername.toLowerCase());
        if (tid) {
          db.update(groupMembers)
            .set({ twitterId: tid })
            .where(eq(groupMembers.id, m.id))
            .run();
          linked++;
        }
      }
    });
    run();
    return linked;
  }

  deleteById(id: number): boolean {
    const existing = this.findById(id);
    if (!existing) return false;

    const result = db.delete(groupMembers).where(eq(groupMembers.id, id)).run();
    return result.changes > 0;
  }

  /** Delete multiple members by IDs. Returns number deleted. */
  deleteByIds(ids: number[]): number {
    if (ids.length === 0) return 0;
    const result = db
      .delete(groupMembers)
      .where(
        and(
          inArray(groupMembers.id, ids),
          eq(groupMembers.userId, this.userId),
        ),
      )
      .run();
    return result.changes;
  }

  /** Delete all members in a group. Returns number deleted. */
  deleteByGroupId(groupId: number): number {
    const result = db
      .delete(groupMembers)
      .where(eq(groupMembers.groupId, groupId))
      .run();
    return result.changes;
  }

  countByGroupId(groupId: number): number {
    const row = db
      .select({ total: count() })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId))
      .get();
    return row?.total ?? 0;
  }
}
