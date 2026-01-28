import { getDB } from "./db";
import type { Analytics } from "./types";

export interface AnalyticsRecord extends Analytics {
  id: number;
  username: string;
  fetched_at: string;
}

export function saveAnalytics(username: string, analytics: Analytics): AnalyticsRecord {
  const db = getDB();
  const fetched_at = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO analytics (
      username, impressions, engagements, engagement_rate,
      likes, retweets, replies, profile_visits,
      followers, following, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    username,
    analytics.impressions,
    analytics.engagements,
    analytics.engagement_rate,
    analytics.likes,
    analytics.retweets,
    analytics.replies,
    analytics.profile_visits,
    analytics.followers,
    analytics.following,
    fetched_at
  );

  return {
    id: Number(result.lastInsertRowid),
    username,
    ...analytics,
    fetched_at,
  };
}

export function getLatestAnalytics(username: string): AnalyticsRecord | null {
  const db = getDB();
  const stmt = db.prepare(`
    SELECT * FROM analytics
    WHERE username = ?
    ORDER BY id DESC
    LIMIT 1
  `);

  const row = stmt.get(username) as AnalyticsRecord | undefined;
  return row || null;
}

export function getAnalyticsHistory(
  username: string,
  limit: number = 30
): AnalyticsRecord[] {
  const db = getDB();
  const stmt = db.prepare(`
    SELECT * FROM analytics
    WHERE username = ?
    ORDER BY id DESC
    LIMIT ?
  `);

  return stmt.all(username, limit) as AnalyticsRecord[];
}

export function getAnalyticsByDateRange(
  username: string,
  from: string,
  to: string
): AnalyticsRecord[] {
  const db = getDB();
  const stmt = db.prepare(`
    SELECT * FROM analytics
    WHERE username = ?
      AND fetched_at >= ?
      AND fetched_at <= ?
    ORDER BY fetched_at ASC
  `);

  return stmt.all(username, from, to) as AnalyticsRecord[];
}

export function calculateTrend(
  current: AnalyticsRecord,
  previous: AnalyticsRecord | null
): AnalyticsTrend {
  if (!previous) {
    return {
      impressions: { value: current.impressions, change: 0, percent: 0 },
      engagements: { value: current.engagements, change: 0, percent: 0 },
      engagement_rate: { value: current.engagement_rate, change: 0, percent: 0 },
      likes: { value: current.likes, change: 0, percent: 0 },
      retweets: { value: current.retweets, change: 0, percent: 0 },
      replies: { value: current.replies, change: 0, percent: 0 },
      profile_visits: { value: current.profile_visits, change: 0, percent: 0 },
      followers: { value: current.followers, change: 0, percent: 0 },
      following: { value: current.following, change: 0, percent: 0 },
    };
  }

  const calc = (curr: number, prev: number) => ({
    value: curr,
    change: curr - prev,
    percent: prev === 0 ? 0 : ((curr - prev) / prev) * 100,
  });

  return {
    impressions: calc(current.impressions, previous.impressions),
    engagements: calc(current.engagements, previous.engagements),
    engagement_rate: calc(current.engagement_rate, previous.engagement_rate),
    likes: calc(current.likes, previous.likes),
    retweets: calc(current.retweets, previous.retweets),
    replies: calc(current.replies, previous.replies),
    profile_visits: calc(current.profile_visits, previous.profile_visits),
    followers: calc(current.followers, previous.followers),
    following: calc(current.following, previous.following),
  };
}

export interface TrendMetric {
  value: number;
  change: number;
  percent: number;
}

export interface AnalyticsTrend {
  impressions: TrendMetric;
  engagements: TrendMetric;
  engagement_rate: TrendMetric;
  likes: TrendMetric;
  retweets: TrendMetric;
  replies: TrendMetric;
  profile_visits: TrendMetric;
  followers: TrendMetric;
  following: TrendMetric;
}

export function deleteAnalyticsBefore(date: string): number {
  const db = getDB();
  const stmt = db.prepare(`DELETE FROM analytics WHERE fetched_at < ?`);
  const result = stmt.run(date);
  return result.changes;
}

export function getAnalyticsCount(username: string): number {
  const db = getDB();
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM analytics WHERE username = ?`);
  const row = stmt.get(username) as { count: number };
  return row.count;
}
