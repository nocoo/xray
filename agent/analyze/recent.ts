/**
 * Get Unprocessed Tweets
 *
 * Get tweets that haven't been analyzed yet.
 * Useful for AI to analyze recent content.
 *
 * Usage:
 *   bun run agent/analyze/recent.ts
 *   bun run agent/analyze/recent.ts --hours 24
 *   bun run agent/analyze/recent.ts --limit 50
 */

import { hoursAgoISO } from "../../scripts/lib/utils";
import {
  tweetGetRecent,
  processedGetAllIds,
  tweetToModel,
} from "../../scripts/lib/tweet-db";
import type { Tweet } from "../../scripts/lib/types";

export interface RecentOptions {
  hoursBack?: number;
  limit?: number;
  skipProcessed?: boolean;
}

export async function getRecentTweets(
  options: RecentOptions = {}
): Promise<{ tweets: Tweet[]; count: number }> {
  const {
    hoursBack = 24,
    limit = 100,
    skipProcessed = true,
  } = options;

  const fromDate = hoursAgoISO(hoursBack);
  const processedIds = skipProcessed ? new Set(processedGetAllIds()) : new Set<string>();

  // Get recent tweets from DB
  const recentTweets = tweetGetRecent(limit);

  // Filter by time range and processed status
  const filtered = recentTweets.filter((row) => {
    const tweetDate = new Date(row.created_at);
    const inTimeRange = tweetDate >= new Date(fromDate);
    const notProcessed = !processedIds.has(row.id);
    return inTimeRange && notProcessed;
  });

  return {
    tweets: filtered.map(tweetToModel),
    count: filtered.length,
  };
}

// CLI
export async function main() {
  const args = process.argv.slice(2);
  let hoursBack = 24;
  let limit = 50;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--hours" && args[i + 1]) {
      hoursBack = parseInt(args[i + 1], 10);
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
    }
  }

  const result = await getRecentTweets({ hoursBack, limit });

  console.log(`[potato] Found ${result.count} unprocessed tweets (last ${hoursBack}h)`);
  console.log(JSON.stringify(result.tweets.map((t) => ({
    id: t.id,
    author: t.author.username,
    text: t.text.substring(0, 100) + "...",
    created_at: t.created_at,
    url: t.url,
  })), null, 2));

  return result;
}

if (import.meta.main) {
  main().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
