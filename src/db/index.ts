import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";
import * as schema from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbInstance = any;

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Railway Volume mount — set XRAY_DATA_DIR=/data to persist SQLite across deploys
function getDataDir(): string {
  return process.env.XRAY_DATA_DIR || PROJECT_ROOT;
}

/**
 * Resolve a database filename to an absolute path.
 *
 * Production DB ("database/xray.db"):
 *   - If XRAY_DATA_DIR is set → /data/xray.db (volume-mounted, survives redeploys)
 *   - Otherwise → PROJECT_ROOT/database/xray.db (local dev)
 *
 * Test/E2E DBs always resolve relative to PROJECT_ROOT.
 */
function resolveDbPath(filename: string): string {
  if (filename === ":memory:" || filename.startsWith("/")) return filename;

  const dataDir = getDataDir();
  if (filename === DEFAULT_DB_FILE && dataDir !== PROJECT_ROOT) {
    // Production: strip "database/" prefix, place directly in volume
    return resolve(dataDir, basename(filename));
  }
  return resolve(PROJECT_ROOT, filename);
}

const DEFAULT_DB_FILE = "database/xray.db";
const E2E_DB_FILE = "database/xray.e2e.db";

// Runtime detection: Bun exposes globalThis.Bun, Node.js does not.
// next dev spawns Node.js workers, so bun:sqlite is unavailable there.
const isBun = typeof globalThis.Bun !== "undefined";

// Eagerly load the correct SQLite driver and drizzle adapter via top-level await.
// This replaces require() calls which are unavailable in vinext's pure ESM environment.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DatabaseConstructor: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let drizzleFn: any;

if (isBun) {
  const bunSqlite = await import("bun:sqlite");
  const bunDrizzle = await import("drizzle-orm/bun-sqlite");
  DatabaseConstructor = bunSqlite.Database;
  drizzleFn = bunDrizzle.drizzle;
} else {
  const betterSqlite = await import("better-sqlite3");
  const betterDrizzle = await import("drizzle-orm/better-sqlite3");
  DatabaseConstructor = betterSqlite.default;
  drizzleFn = betterDrizzle.drizzle;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbInstance: any;
let currentDbFile: string | null = null;

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test" || process.env.BUN_ENV === "test";
}

// Guard: tests must never touch production database
const PROTECTED_FILES = new Set([resolveDbPath(DEFAULT_DB_FILE)]);

function createDatabase(filename: string): DbInstance {
  const resolvedPath = resolveDbPath(filename);

  if (isTestEnv() && PROTECTED_FILES.has(resolvedPath)) {
    throw new Error(
      `BLOCKED: Tests must not open protected database "${filename}". ` +
        `Use createTestDb() (:memory:) or xray.e2e.db instead.`
    );
  }

  // If switching to a different database, close the existing connection
  if (sqlite && currentDbFile !== resolvedPath) {
    sqlite.close();
    sqlite = null;
    dbInstance = null;
  }

  if (dbInstance && currentDbFile === resolvedPath) {
    return dbInstance;
  }

  currentDbFile = resolvedPath;
  console.log(`[db] Opening database: ${resolvedPath} (isBun=${isBun})`);

  sqlite = new DatabaseConstructor(resolvedPath);
  // Enable foreign key enforcement — SQLite defaults to OFF.
  sqlite.exec("PRAGMA foreign_keys = ON");
  dbInstance = drizzleFn(sqlite, { schema });

  initSchema();
  return dbInstance;
}

/**
 * Migrate legacy single-watchlist data to multi-watchlist model.
 * For each user_id that has watchlist_members with NULL watchlist_id,
 * create a "Default" watchlist and backfill all FK references.
 * Idempotent — skips users that already have watchlists.
 */
function migrateToMultiWatchlist(): void {
  // Find user_ids that have members without a watchlist_id
  const rows = sqlite!.prepare(
    `SELECT DISTINCT user_id FROM watchlist_members WHERE watchlist_id IS NULL`
  ).all() as Array<{ user_id: string }>;

  if (rows.length === 0) return;

  const now = Math.floor(Date.now() / 1000);
  const insertWl = sqlite!.prepare(
    `INSERT INTO watchlists (user_id, name, icon, translate_enabled, created_at) VALUES (?, 'Default', 'eye', 1, ?)`
  );
  const updateMembers = sqlite!.prepare(
    `UPDATE watchlist_members SET watchlist_id = ? WHERE user_id = ? AND watchlist_id IS NULL`
  );
  const updatePosts = sqlite!.prepare(
    `UPDATE fetched_posts SET watchlist_id = ? WHERE user_id = ? AND watchlist_id IS NULL`
  );
  const updateLogs = sqlite!.prepare(
    `UPDATE fetch_logs SET watchlist_id = ? WHERE user_id = ? AND watchlist_id IS NULL`
  );

  // Also migrate settings keys: watchlist.X → watchlist.{id}.X
  const readSettings = sqlite!.prepare(
    `SELECT key, value FROM settings WHERE user_id = ? AND key LIKE 'watchlist.%' AND key NOT LIKE 'watchlist.%.%'`
  );
  const deleteOldSetting = sqlite!.prepare(
    `DELETE FROM settings WHERE user_id = ? AND key = ?`
  );
  const insertNewSetting = sqlite!.prepare(
    `INSERT OR REPLACE INTO settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)`
  );

  for (const row of rows) {
    const userId = row.user_id;
    insertWl.run(userId, now);
    // Get the auto-generated watchlist id
    const wl = sqlite!.prepare(
      `SELECT id FROM watchlists WHERE user_id = ? ORDER BY id DESC LIMIT 1`
    ).get(userId) as { id: number };
    const wlId = wl.id;

    updateMembers.run(wlId, userId);
    updatePosts.run(wlId, userId);
    updateLogs.run(wlId, userId);

    // Migrate settings keys
    const settingsRows = readSettings.all(userId) as Array<{ key: string; value: string }>;
    for (const s of settingsRows) {
      // e.g. "watchlist.retentionDays" → "watchlist.{wlId}.retentionDays"
      const suffix = s.key.replace("watchlist.", "");
      const newKey = `watchlist.${wlId}.${suffix}`;
      insertNewSetting.run(userId, newKey, s.value, now);
      deleteOldSetting.run(userId, s.key);
    }
  }

  // Drop the old unique index and recreate with watchlist_id scope.
  // This is idempotent: IF EXISTS handles first run, subsequent runs are no-ops.
  try {
    sqlite!.exec(`DROP INDEX IF EXISTS fetched_posts_user_tweet_uniq`);
  } catch { /* index may not exist */ }
  // The new index is created by the CREATE UNIQUE INDEX IF NOT EXISTS above.
}

/**
 * Initialize all tables using CREATE TABLE IF NOT EXISTS.
 * Idempotent — safe to call multiple times.
 */
export function initSchema(): void {
  console.log("[db] initSchema() starting...");
  sqlite!.exec(`
    -- NextAuth tables
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      emailVerified INTEGER,
      image TEXT
    );

    CREATE TABLE IF NOT EXISTS account (
      userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      provider TEXT NOT NULL,
      providerAccountId TEXT NOT NULL,
      refresh_token TEXT,
      access_token TEXT,
      expires_at INTEGER,
      token_type TEXT,
      scope TEXT,
      id_token TEXT,
      session_state TEXT,
      PRIMARY KEY (provider, providerAccountId)
    );

    CREATE TABLE IF NOT EXISTS session (
      sessionToken TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verificationToken (
      identifier TEXT NOT NULL,
      token TEXT NOT NULL,
      expires INTEGER NOT NULL,
      PRIMARY KEY (identifier, token)
    );

    -- X-Ray business tables
    CREATE TABLE IF NOT EXISTS api_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      tweapi_key TEXT,
      twitter_cookie TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      rotated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      last_used_at INTEGER,
      date TEXT NOT NULL
    );

    -- Watchlist tables
    CREATE TABLE IF NOT EXISTS watchlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT NOT NULL DEFAULT 'eye',
      translate_enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
      twitter_username TEXT NOT NULL,
      note TEXT,
      added_at INTEGER NOT NULL,
      fetch_interval_minutes INTEGER
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist_member_tags (
      member_id INTEGER NOT NULL REFERENCES watchlist_members(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (member_id, tag_id)
    );

    -- Settings key-value store
    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, key)
    );

    -- Fetched posts (auto-fetch cache with translation)
    CREATE TABLE IF NOT EXISTS fetched_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES watchlist_members(id) ON DELETE CASCADE,
      tweet_id TEXT NOT NULL,
      twitter_username TEXT NOT NULL,
      text TEXT NOT NULL,
      tweet_json TEXT NOT NULL,
      tweet_created_at TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      translated_text TEXT,
      comment_text TEXT,
      translated_at INTEGER
    );

    -- Performance indexes that DON'T depend on watchlist_id (safe for legacy DBs)
    CREATE INDEX IF NOT EXISTS fetched_posts_member_id_idx
      ON fetched_posts (member_id);
    CREATE INDEX IF NOT EXISTS fetched_posts_user_id_idx
      ON fetched_posts (user_id);
    CREATE INDEX IF NOT EXISTS fetched_posts_tweet_created_at_idx
      ON fetched_posts (tweet_created_at);
    CREATE INDEX IF NOT EXISTS watchlist_members_user_id_idx
      ON watchlist_members (user_id);
  `);
  console.log("[db] initSchema() main exec block done");

  // Create fetch_logs table early so safeAddColumn and migrateToMultiWatchlist can reference it.
  sqlite!.exec(`
    CREATE TABLE IF NOT EXISTS fetch_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      attempted INTEGER NOT NULL DEFAULT 0,
      succeeded INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      purged INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      errors TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  console.log("[db] initSchema() fetch_logs block done");

  // Safe column migrations for pre-existing databases.
  // Each ALTER TABLE is wrapped in try/catch because SQLite lacks ADD COLUMN IF NOT EXISTS.
  const safeAddColumn = (sql: string) => {
    try {
      sqlite!.exec(sql);
      console.log(`[db] safeAddColumn OK: ${sql.slice(0, 80)}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Only silence "duplicate column" errors; surface anything else.
      if (!msg.includes("duplicate column")) {
        console.error(`[db] safeAddColumn failed: ${msg}\n  SQL: ${sql}`);
      } else {
        console.log(`[db] safeAddColumn skipped (duplicate): ${sql.slice(0, 80)}`);
      }
    }
  };
  safeAddColumn(`ALTER TABLE watchlist_members ADD COLUMN fetch_interval_minutes INTEGER`);
  safeAddColumn(`ALTER TABLE watchlist_members ADD COLUMN watchlist_id INTEGER REFERENCES watchlists(id) ON DELETE CASCADE`);
  safeAddColumn(`ALTER TABLE fetched_posts ADD COLUMN comment_text TEXT`);
  safeAddColumn(`ALTER TABLE fetched_posts ADD COLUMN quoted_translated_text TEXT`);
  safeAddColumn(`ALTER TABLE fetched_posts ADD COLUMN watchlist_id INTEGER REFERENCES watchlists(id) ON DELETE CASCADE`);
  safeAddColumn(`ALTER TABLE fetch_logs ADD COLUMN watchlist_id INTEGER REFERENCES watchlists(id) ON DELETE CASCADE`);
  console.log("[db] initSchema() safeAddColumn block done");

  // Indexes that depend on watchlist_id — MUST run AFTER safeAddColumn adds the column.
  // For fresh DBs the column exists from CREATE TABLE; for legacy DBs safeAddColumn just added it.
  sqlite!.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS fetched_posts_watchlist_tweet_uniq
      ON fetched_posts (watchlist_id, tweet_id);
    CREATE UNIQUE INDEX IF NOT EXISTS watchlist_members_wl_username_uniq
      ON watchlist_members (watchlist_id, twitter_username);
    CREATE INDEX IF NOT EXISTS watchlist_members_watchlist_id_idx
      ON watchlist_members (watchlist_id);
    CREATE INDEX IF NOT EXISTS fetch_logs_watchlist_id_idx
      ON fetch_logs (watchlist_id);
  `);
  console.log("[db] initSchema() watchlist_id indexes created, starting migration...");

  // --------------------------------------------------------------------------
  // Data migration: create "Default" watchlists for existing users and backfill
  // watchlist_id on watchlist_members, fetched_posts, and fetch_logs.
  // --------------------------------------------------------------------------
  migrateToMultiWatchlist();
  console.log("[db] initSchema() complete");
}

/** Get or create the database instance based on XRAY_DB env var. */
export function getDb(): DbInstance {
  const filename = process.env.XRAY_DB || DEFAULT_DB_FILE;
  return createDatabase(filename);
}

/** Create an in-memory database for unit tests. */
export function createTestDb(): DbInstance {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    dbInstance = null;
    currentDbFile = null;
  }
  return createDatabase(":memory:");
}

/** Create or reset the E2E test database. Returns the file path. */
export function createE2EDb(): string {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    dbInstance = null;
  }
  createDatabase(E2E_DB_FILE);
  return E2E_DB_FILE;
}

/** Reset test database by clearing all data. */
export function resetTestDb(): void {
  if (currentDbFile && PROTECTED_FILES.has(currentDbFile)) {
    throw new Error(
      `BLOCKED: resetTestDb() refused to wipe protected database "${currentDbFile}".`
    );
  }

  if (!sqlite) {
    createTestDb();
    return;
  }

  initSchema();

  sqlite!.exec(`
    DELETE FROM fetch_logs;
    DELETE FROM fetched_posts;
    DELETE FROM watchlist_member_tags;
    DELETE FROM watchlist_members;
    DELETE FROM watchlists;
    DELETE FROM tags;
    DELETE FROM usage_stats;
    DELETE FROM webhooks;
    DELETE FROM api_credentials;
    DELETE FROM settings;
    DELETE FROM session;
    DELETE FROM account;
    DELETE FROM user;
    DELETE FROM verificationToken;
  `);
}

/** Get the raw SQLite driver instance (for backup/restore). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRawSqlite(): any {
  if (!sqlite) {
    throw new Error(
      "No database connection. Call getDb() or createTestDb() first."
    );
  }
  return sqlite;
}

/**
 * Seed a user row into the database. Required before inserting into any table
 * with a REFERENCES user(id) FK when PRAGMA foreign_keys = ON.
 *
 * Idempotent — uses INSERT OR IGNORE so repeated calls with the same id are safe.
 */
export function seedUser(
  id: string,
  name = "Test User",
  email?: string
): void {
  sqlite!.prepare(
    `INSERT OR IGNORE INTO user (id, name, email) VALUES (?, ?, ?)`
  ).run(id, name, email ?? null);
}

/** Close the current database connection. */
export function closeDb(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    dbInstance = null;
    currentDbFile = null;
  }
}

/**
 * Dynamic db getter — always resolves the current environment variable.
 * In test environments, auto-creates an in-memory database.
 */
export const db = new Proxy({} as DbInstance, {
  get(_, prop) {
    if (isTestEnv()) {
      if (!dbInstance) createTestDb();
      return dbInstance[prop];
    }
    const currentDb = getDb();
    return currentDb[prop];
  },
});
