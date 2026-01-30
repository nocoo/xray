/**
 * Incremental Fetch - Smart Tweet Fetching
 *
 * Only fetches new tweets since last fetch.
 * Uses database to track processed tweets.
 *
 * Usage:
 *   bun run agent/fetch/incremental.ts
 *   bun run agent/fetch/incremental.ts --hours 4
 *   bun run agent/fetch/incremental.ts --batch 10
 */

import { loadConfig, hoursAgoISO, nowISO } from "../../scripts/lib/utils";
import { createAPIClient } from "../../scripts/lib/api";
import {
  watchlistGetAll,
  watchlistGet,
} from "../../scripts/lib/watchlist-db";
import {
  tweetInsertMany,
  processedGetAllIds,
  processedMark,
  processedMarkMany,
  tweetCount,
  processedCount,
} from "../../scripts/lib/tweet-db";
import type { Tweet } from "../../scripts/lib/types";

export interface IncrementalOptions {
  hoursBack?: number;
  skipProcessed?: boolean;
  batchSize?: number;
  delayMs?: number;
}

export interface IncrementalResult {
  success: boolean;
  usersProcessed: number;
  newTweets: number;
  errors: string[];
  duration: number;
}

export async function fetchIncremental(
  options: IncrementalOptions = {}
): Promise<IncrementalResult> {
  const startTime = Date.now();
  const {
    hoursBack = 4,
    skipProcessed = true,
    batchSize = 20,
    delayMs = 500,
  } = options;

  const config = await loadConfig();
  const users = watchlistGetAll();
  const client = createAPIClient(config);
  const from = hoursAgoISO(hoursBack);
  const processedIds = skipProcessed ? new Set(processedGetAllIds()) : new Set<string>();

  console.log(`[potato] Incremental fetch (last ${hoursBack}h)...`);
  console.log(`[potato] Users: ${users.length}, Cached: ${processedIds.size}`);

  const allNewTweets: Tweet[] = [];
  const errors: string[] = [];
  let usersProcessed = 0;

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);

    console.log(`[potato] Processing ${i + 1}-${Math.min(i + batchSize, users.length)}/${users.length}`);

    for (const user of batch) {
      try {
        const tweets = await client.fetchUserTweets(user.username);
        const fromDate = new Date(from);

        // Filter by time range
        const filtered = tweets.filter((t) => {
          const tweetDate = new Date(t.created_at);
          return tweetDate >= fromDate;
        });

        // Filter already processed
        const newTweets = skipProcessed
          ? filtered.filter((t) => !processedIds.has(t.id))
          : filtered;

        if (newTweets.length > 0) {
          allNewTweets.push(...newTweets);
          console.log(`[potato]   @${user.username}: ${newTweets.length} new`);
        }

        usersProcessed++;

        // Small delay to avoid rate limiting
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        errors.push(`@${user.username}: ${error}`);
        console.error(`[potato]   @${user.username}: ERROR - ${error}`);
      }
    }
  }

  // Save to database
  if (allNewTweets.length > 0) {
    tweetInsertMany(allNewTweets);
    // Mark all as processed
    const newIds = allNewTweets.map((t) => t.id);
    processedMarkMany(newIds, "skipped");  // Default to skipped
  }

  const duration = Date.now() - startTime;

  return {
    success: errors.length === 0,
    usersProcessed,
    newTweets: allNewTweets.length,
    errors,
    duration,
  };
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  let hoursBack = 4;
  let batchSize = 20;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--hours" && args[i + 1]) {
      hoursBack = parseInt(args[i + 1], 10);
    } else if (args[i] === "--batch" && args[i + 1]) {
      batchSize = parseInt(args[i + 1], 10);
    }
  }

  const result = await fetchIncremental({ hoursBack, batchSize });

  console.log("\n=== Result ===");
  console.log(`Users processed: ${result.usersProcessed}`);
  console.log(`New tweets: ${result.newTweets}`);
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Duration: ${result.duration}ms`);

  if (result.errors.length > 0) {
    console.log("\nErrors:");
    result.errors.forEach((e) => console.log(`  - ${e}`));
  }

  // Print counts
  console.log(`\nDatabase: ${tweetCount()} tweets, ${processedCount()} processed`);

  process.exit(result.success ? 0 : 1);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
