import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import type { AdapterAccountType } from "@auth/core/adapters";

// ============================================================================
// NextAuth Tables (managed by Drizzle Adapter)
// ============================================================================

export const users = sqliteTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
});

export const accounts = sqliteTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compositePk: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const sessions = sqliteTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (vt) => ({
    compositePk: primaryKey({
      columns: [vt.identifier, vt.token],
    }),
  })
);

// ============================================================================
// X-Ray Business Tables
// ============================================================================

export const apiCredentials = sqliteTable("api_credentials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tweapiKey: text("tweapi_key"),
  twitterCookie: text("twitter_cookie"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const webhooks = sqliteTable("webhooks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  rotatedAt: integer("rotated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const usageStats = sqliteTable("usage_stats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  requestCount: integer("request_count").notNull().default(0),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  date: text("date").notNull(),
});

// ============================================================================
// Watchlists — named, icon-tagged collections of Twitter users
// ============================================================================

export const watchlists = sqliteTable("watchlists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  /** Lucide icon name (e.g. "eye", "radar", "brain"). */
  icon: text("icon").notNull().default("eye"),
  /** Whether to auto-translate + comment after fetching. 1 = on, 0 = off. */
  translateEnabled: integer("translate_enabled").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================================
// Watchlist Members — users tracked within a watchlist
// ============================================================================

export const watchlistMembers = sqliteTable(
  "watchlist_members",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Which watchlist this member belongs to. */
    watchlistId: integer("watchlist_id")
      .notNull()
      .references(() => watchlists.id, { onDelete: "cascade" }),
    twitterUsername: text("twitter_username").notNull(),
    note: text("note"),
    addedAt: integer("added_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    /** Auto-fetch interval in minutes. null = disabled. */
    fetchIntervalMinutes: integer("fetch_interval_minutes"),
  },
  (t) => ({
    /** Prevent duplicate usernames within the same watchlist. */
    uniqWatchlistUsername: uniqueIndex("watchlist_members_wl_username_uniq").on(
      t.watchlistId,
      t.twitterUsername,
    ),
  }),
);

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull(),
});

export const watchlistMemberTags = sqliteTable(
  "watchlist_member_tags",
  {
    memberId: integer("member_id")
      .notNull()
      .references(() => watchlistMembers.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    compositePk: primaryKey({
      columns: [t.memberId, t.tagId],
    }),
  })
);

// ============================================================================
// Fetched Posts — cached tweets from auto-fetch, with translation
// ============================================================================

export const fetchedPosts = sqliteTable(
  "fetched_posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Which watchlist this post belongs to. */
    watchlistId: integer("watchlist_id")
      .notNull()
      .references(() => watchlists.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => watchlistMembers.id, { onDelete: "cascade" }),
    /** Twitter tweet ID — unique per watchlist to prevent duplicates. */
    tweetId: text("tweet_id").notNull(),
    twitterUsername: text("twitter_username").notNull(),
    /** Raw tweet text. */
    text: text("text").notNull(),
    /** Full tweet JSON (author, metrics, media, entities, etc.). */
    tweetJson: text("tweet_json").notNull(),
    /** ISO 8601 timestamp of the original tweet. */
    tweetCreatedAt: text("tweet_created_at").notNull(),
    /** When we fetched this tweet. */
    fetchedAt: integer("fetched_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    /** Translated text (null = not yet translated). */
    translatedText: text("translated_text"),
    /** AI editorial comment (null = not yet generated). */
    commentText: text("comment_text"),
    /** Translated text for the quoted tweet (null if no quoted tweet or not yet translated). */
    quotedTranslatedText: text("quoted_translated_text"),
    /** When the translation was completed. */
    translatedAt: integer("translated_at", { mode: "timestamp" }),
  },
  (t) => ({
    /** Prevent duplicate tweets per watchlist — enables onConflictDoNothing. */
    uniqWatchlistTweet: uniqueIndex("fetched_posts_watchlist_tweet_uniq").on(
      t.watchlistId,
      t.tweetId,
    ),
    /** Speed up queries filtering by member. */
    idxMemberId: index("fetched_posts_member_id_idx").on(t.memberId),
    /** Speed up queries filtering by user. */
    idxUserId: index("fetched_posts_user_id_idx").on(t.userId),
    /** Speed up ordering/filtering by tweet timestamp. */
    idxTweetCreatedAt: index("fetched_posts_tweet_created_at_idx").on(t.tweetCreatedAt),
  }),
);

// ============================================================================
// Fetch Logs — persistent history of fetch/translate runs
// ============================================================================

export const fetchLogs = sqliteTable("fetch_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Which watchlist this log entry belongs to (nullable for legacy logs). */
  watchlistId: integer("watchlist_id")
    .references(() => watchlists.id, { onDelete: "cascade" }),
  /** "fetch" or "translate" */
  type: text("type").notNull(),
  /** Total members/posts attempted */
  attempted: integer("attempted").notNull().default(0),
  /** Successfully processed count (new posts / translated) */
  succeeded: integer("succeeded").notNull().default(0),
  /** Skipped (too old) */
  skipped: integer("skipped").notNull().default(0),
  /** Purged old posts */
  purged: integer("purged").notNull().default(0),
  /** Number of errors */
  errorCount: integer("error_count").notNull().default(0),
  /** JSON array of error detail strings */
  errors: text("errors"),
  /** When this run started */
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================================
// Settings — generic key-value store (per user)
// ============================================================================

export const settings = sqliteTable(
  "settings",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    compositePk: primaryKey({
      columns: [t.userId, t.key],
    }),
  })
);

// ============================================================================
// Type exports
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type ApiCredential = typeof apiCredentials.$inferSelect;
export type NewApiCredential = typeof apiCredentials.$inferInsert;
export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type UsageStat = typeof usageStats.$inferSelect;
export type NewUsageStat = typeof usageStats.$inferInsert;
export type Watchlist = typeof watchlists.$inferSelect;
export type NewWatchlist = typeof watchlists.$inferInsert;
export type WatchlistMember = typeof watchlistMembers.$inferSelect;
export type NewWatchlistMember = typeof watchlistMembers.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type WatchlistMemberTag = typeof watchlistMemberTags.$inferSelect;
export type NewWatchlistMemberTag = typeof watchlistMemberTags.$inferInsert;
export type FetchedPost = typeof fetchedPosts.$inferSelect;
export type NewFetchedPost = typeof fetchedPosts.$inferInsert;
export type FetchLog = typeof fetchLogs.$inferSelect;
export type NewFetchLog = typeof fetchLogs.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
