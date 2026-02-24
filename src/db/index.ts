import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as schema from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbInstance = any;

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Resolve a database filename to an absolute path under the project root. */
function resolveDbPath(filename: string): string {
  if (filename === ":memory:" || filename.startsWith("/")) return filename;
  return resolve(PROJECT_ROOT, filename);
}

const DEFAULT_DB_FILE = "database/xray.db";
const E2E_DB_FILE = "database/xray.e2e.db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbInstance: any;
let currentDbFile: string | null = null;

const isBun = typeof globalThis.Bun !== "undefined";

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

  if (isBun) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Database } = require("bun:sqlite");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/bun-sqlite");
    sqlite = new Database(resolvedPath);
    dbInstance = drizzle(sqlite, { schema });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/better-sqlite3");
    sqlite = new Database(resolvedPath);
    dbInstance = drizzle(sqlite, { schema });
  }

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
    DELETE FROM usage_stats;
    DELETE FROM webhooks;
    DELETE FROM api_credentials;
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
