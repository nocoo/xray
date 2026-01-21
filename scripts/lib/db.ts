import { Database } from "bun:sqlite";
import { resolve, dirname } from "path";
import { mkdirSync, existsSync } from "fs";

const DB_PATH = resolve(process.cwd(), "data/x-ray.db");
const TEST_DB_PATH = resolve(process.cwd(), "data/test-x-ray.db");

let db: Database | null = null;

export function getDB(): Database {
  if (!db) {
    const dbPath = isTestMode() ? TEST_DB_PATH : DB_PATH;
    const dbDir = dirname(dbPath);
    
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
    
    db = new Database(dbPath);
    initDB();
  }
  return db;
}

export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function isTestMode(): boolean {
  return process.env.NODE_ENV === "test" || Bun.env.XRAY_TEST_DB === "true";
}

export function getTestDBPath(): string {
  return TEST_DB_PATH;
}

export function useTestDB(): void {
  process.env.XRAY_TEST_DB = "true";
  closeDB();
}

export function useRealDB(): void {
  process.env.XRAY_TEST_DB = "false";
  closeDB();
}

function initDB(): void {
  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      username TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      added_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tweets (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_username TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_profile_image TEXT,
      created_at TEXT NOT NULL,
      url TEXT NOT NULL,
      retweet_count INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      reply_count INTEGER DEFAULT 0,
      quote_count INTEGER DEFAULT 0,
      view_count INTEGER DEFAULT 0,
      is_retweet INTEGER DEFAULT 0,
      is_quote INTEGER DEFAULT 0,
      lang TEXT,
      fetched_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS processed_tweets (
      tweet_id TEXT PRIMARY KEY,
      processed_at TEXT NOT NULL,
      classification_result TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS classifications (
      tweet_id TEXT PRIMARY KEY,
      is_tech_related INTEGER NOT NULL,
      is_hot_topic INTEGER NOT NULL,
      category TEXT NOT NULL,
      relevance_score INTEGER NOT NULL,
      reason TEXT NOT NULL,
      classified_at TEXT NOT NULL,
      FOREIGN KEY (tweet_id) REFERENCES tweets(id)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tweets_created_at ON tweets(created_at DESC)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_processed_tweets_processed_at ON processed_tweets(processed_at DESC)
  `);
}

export function resetDB(): void {
  const db = getDB();
  db.exec(`
    DROP TABLE IF EXISTS watchlist;
    DROP TABLE IF EXISTS tweets;
    DROP TABLE IF EXISTS processed_tweets;
    DROP TABLE IF EXISTS classifications;
  `);
  initDB();
}
