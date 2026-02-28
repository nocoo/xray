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

  sqlite = new DatabaseConstructor(resolvedPath);
  dbInstance = drizzleFn(sqlite, { schema });

  initSchema();
  return dbInstance;
}

/**
 * Initialize all tables using CREATE TABLE IF NOT EXISTS.
 * Idempotent — safe to call multiple times.
 */
export function initSchema(): void {
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
    CREATE TABLE IF NOT EXISTS watchlist_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
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

    CREATE UNIQUE INDEX IF NOT EXISTS fetched_posts_user_tweet_uniq
      ON fetched_posts (user_id, tweet_id);

    -- Safe column migration: add comment_text if missing (for pre-existing DBs)
    -- SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we catch the error.
  `);

  try {
    sqlite!.exec(`ALTER TABLE fetched_posts ADD COLUMN comment_text TEXT`);
  } catch {
    // Column already exists — ignore
  }

  sqlite!.exec(`
    -- Fetch logs (persistent fetch/translate history)
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
