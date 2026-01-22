import { getDB } from "./db";
import type { Tweet, TweetAuthor, TweetMetrics, ProcessedTweet } from "./types";

export interface TweetRow {
  id: string;
  text: string;
  author_id: string;
  author_username: string;
  author_name: string;
  author_profile_image: string | null;
  author_followers_count: number;
  author_is_verified: number;
  created_at: string;
  url: string;
  retweet_count: number;
  like_count: number;
  reply_count: number;
  quote_count: number;
  view_count: number;
  bookmark_count: number;
  is_retweet: number;
  is_quote: number;
  is_reply: number;
  lang: string | null;
  reply_to_id: string | null;
  fetched_at: string;
}

export interface ProcessedRow {
  tweet_id: string;
  processed_at: string;
  classification_result: string | null;
}

export interface ClassificationRow {
  tweet_id: string;
  is_tech_related: number;
  is_hot_topic: number;
  category: string;
  relevance_score: number;
  reason: string;
  classified_at: string;
}

export function tweetInsert(tweet: Tweet): void {
  const db = getDB();
  db.query(
    `INSERT OR REPLACE INTO tweets (
      id, text, author_id, author_username, author_name, author_profile_image,
      author_followers_count, author_is_verified,
      created_at, url, retweet_count, like_count, reply_count, quote_count,
      view_count, bookmark_count, is_retweet, is_quote, is_reply, lang, reply_to_id, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    tweet.id,
    tweet.text,
    tweet.author.id,
    tweet.author.username,
    tweet.author.name,
    tweet.author.profile_image_url || null,
    tweet.author.followers_count || 0,
    tweet.author.is_verified ? 1 : 0,
    tweet.created_at,
    tweet.url,
    tweet.metrics.retweet_count,
    tweet.metrics.like_count,
    tweet.metrics.reply_count,
    tweet.metrics.quote_count,
    tweet.metrics.view_count,
    tweet.metrics.bookmark_count,
    tweet.is_retweet ? 1 : 0,
    tweet.is_quote ? 1 : 0,
    tweet.is_reply ? 1 : 0,
    tweet.lang || null,
    tweet.reply_to_id || null,
    new Date().toISOString()
  );
}

export function tweetInsertMany(tweets: Tweet[]): void {
  const db = getDB();
  const txn = db.transaction(() => {
    for (const tweet of tweets) {
      tweetInsert(tweet);
    }
  });
  txn();
}

export function tweetGet(id: string): TweetRow | null {
  const db = getDB();
  return db.query(`SELECT * FROM tweets WHERE id = ?`).get(id) as TweetRow | null;
}

export function tweetGetRecent(limit: number = 100): TweetRow[] {
  const db = getDB();
  return db.query(`SELECT * FROM tweets ORDER BY created_at DESC LIMIT ?`).all(limit) as TweetRow[];
}

export function tweetGetByIds(ids: string[]): TweetRow[] {
  if (ids.length === 0) return [];
  const db = getDB();
  const placeholders = ids.map(() => "?").join(",");
  return db.query(`SELECT * FROM tweets WHERE id IN (${placeholders})`).all(...ids) as TweetRow[];
}

export function tweetToModel(row: TweetRow): Tweet {
  return {
    id: row.id,
    text: row.text,
    author: {
      id: row.author_id,
      username: row.author_username,
      name: row.author_name,
      profile_image_url: row.author_profile_image || undefined,
      followers_count: row.author_followers_count,
      is_verified: row.author_is_verified === 1,
    },
    created_at: row.created_at,
    url: row.url,
    metrics: {
      retweet_count: row.retweet_count,
      like_count: row.like_count,
      reply_count: row.reply_count,
      quote_count: row.quote_count,
      view_count: row.view_count,
      bookmark_count: row.bookmark_count,
    },
    is_retweet: row.is_retweet === 1,
    is_quote: row.is_quote === 1,
    is_reply: row.is_reply === 1,
    lang: row.lang || undefined,
    reply_to_id: row.reply_to_id || undefined,
  };
}

export function tweetCount(): number {
  const db = getDB();
  const result = db.query(`SELECT COUNT(*) as count FROM tweets`).get() as { count: number };
  return result.count;
}

export function processedMark(tweetId: string, classificationResult: "tech" | "non_tech" | "skipped"): void {
  const db = getDB();
  db.query(
    `INSERT OR REPLACE INTO processed_tweets (tweet_id, processed_at, classification_result) VALUES (?, ?, ?)`
  ).run(tweetId, new Date().toISOString(), classificationResult);
}

export function processedMarkMany(
  tweetIds: string[],
  classificationResult: "tech" | "non_tech" | "skipped"
): void {
  const db = getDB();
  const txn = db.transaction(() => {
    const stmt = db.query(
      `INSERT OR REPLACE INTO processed_tweets (tweet_id, processed_at, classification_result) VALUES (?, ?, ?)`
    );
    const now = new Date().toISOString();
    for (const tweetId of tweetIds) {
      stmt.run(tweetId, now, classificationResult);
    }
  });
  txn();
}

export function processedGet(tweetId: string): ProcessedRow | null {
  const db = getDB();
  return db.query(`SELECT * FROM processed_tweets WHERE tweet_id = ?`).get(tweetId) as ProcessedRow | null;
}

export function processedGetAll(): ProcessedRow[] {
  const db = getDB();
  return db.query(`SELECT * FROM processed_tweets ORDER BY processed_at DESC`).all() as ProcessedRow[];
}

export function processedGetAllIds(): string[] {
  const db = getDB();
  const rows = db.query(`SELECT tweet_id FROM processed_tweets`).all() as { tweet_id: string }[];
  return rows.map((r) => r.tweet_id);
}

export function processedCount(): number {
  const db = getDB();
  const result = db.query(`SELECT COUNT(*) as count FROM processed_tweets`).get() as { count: number };
  return result.count;
}

export function classificationUpsert(
  tweetId: string,
  classification: {
    is_tech_related: boolean;
    is_hot_topic: boolean;
    category: string[];
    relevance_score: number;
    reason: string;
  }
): void {
  const db = getDB();
  db.query(
    `INSERT OR REPLACE INTO classifications (
      tweet_id, is_tech_related, is_hot_topic, category, relevance_score, reason, classified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    tweetId,
    classification.is_tech_related ? 1 : 0,
    classification.is_hot_topic ? 1 : 0,
    JSON.stringify(classification.category),
    classification.relevance_score,
    classification.reason,
    new Date().toISOString()
  );
}

export function classificationGet(tweetId: string): ClassificationRow | null {
  const db = getDB();
  return db.query(`SELECT * FROM classifications WHERE tweet_id = ?`).get(tweetId) as ClassificationRow | null;
}

export function classificationGetByIds(tweetIds: string[]): ClassificationRow[] {
  if (tweetIds.length === 0) return [];
  const db = getDB();
  const placeholders = tweetIds.map(() => "?").join(",");
  return db.query(`SELECT * FROM classifications WHERE tweet_id IN (${placeholders})`).all(...tweetIds) as ClassificationRow[];
}

export function classificationToModel(row: ClassificationRow) {
  return {
    is_tech_related: row.is_tech_related === 1,
    is_hot_topic: row.is_hot_topic === 1,
    category: JSON.parse(row.category),
    relevance_score: row.relevance_score,
    reason: row.reason,
  };
}

export function classificationGetTechRelated(limit: number = 100): TweetRow[] {
  const db = getDB();
  return db.query(`
    SELECT t.* FROM tweets t
    INNER JOIN classifications c ON t.id = c.tweet_id
    WHERE c.is_tech_related = 1
    ORDER BY t.created_at DESC
    LIMIT ?
  `).all(limit) as TweetRow[];
}

export function classificationGetHotTopics(limit: number = 100): TweetRow[] {
  const db = getDB();
  return db.query(`
    SELECT t.* FROM tweets t
    INNER JOIN classifications c ON t.id = c.tweet_id
    WHERE c.is_hot_topic = 1
    ORDER BY c.relevance_score DESC, t.created_at DESC
    LIMIT ?
  `).all(limit) as TweetRow[];
}
