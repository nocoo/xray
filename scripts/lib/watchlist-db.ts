import { getDB } from "./db";
import type { WatchlistUser, Watchlist } from "./types";

export interface WatchlistRow {
  username: string;
  url: string;
  added_at: string;
}

export function watchlistAdd(user: WatchlistUser): void {
  const db = getDB();
  db.query(
    `INSERT OR REPLACE INTO watchlist (username, url, added_at) VALUES (?, ?, ?)`
  ).run(user.username, user.url, user.added_at);
}

export function watchlistRemove(username: string): boolean {
  const db = getDB();
  const normalized = username.toLowerCase();
  const result = db.query(`DELETE FROM watchlist WHERE LOWER(username) = ?`).run(normalized);
  return result.changes > 0;
}

export function watchlistGet(username: string): WatchlistRow | null {
  const db = getDB();
  const normalized = username.toLowerCase();
  return db.query(`SELECT * FROM watchlist WHERE LOWER(username) = ?`).get(normalized) as WatchlistRow | null;
}

export function watchlistExists(username: string): boolean {
  const db = getDB();
  const normalized = username.toLowerCase();
  const result = db.query(`SELECT 1 FROM watchlist WHERE LOWER(username) = ?`).get(normalized);
  return result !== null;
}

export function watchlistGetAll(): WatchlistRow[] {
  const db = getDB();
  return db.query(`SELECT * FROM watchlist ORDER BY added_at DESC`).all() as WatchlistRow[];
}

export function watchlistToJSON(): Watchlist {
  return { users: watchlistGetAll() };
}

export function watchlistCount(): number {
  const db = getDB();
  const result = db.query(`SELECT COUNT(*) as count FROM watchlist`).get() as { count: number };
  return result.count;
}
