/**
 * Fetch Tweets Script
 *
 * Fetches tweets from all users in the watchlist and saves to raw_tweets.json
 * Automatically skips tweets that have already been processed.
 * Always fetches the last 1 hour of tweets.
 *
 * Usage:
 *   bun run scripts/fetch-tweets.ts
 *   bun run scripts/fetch-tweets.ts --include-processed  # Include already processed tweets
 */

import type { RawTweetsFile, Tweet, CommandResult } from "./lib/types";
import {
  loadConfig,
  nowISO,
  hoursAgoISO,
  saveRawTweets,
} from "./lib/utils";
import { createAPIClient } from "./lib/api";
import { watchlistGetAll } from "./lib/watchlist-db";
import {
  tweetInsertMany,
  processedGetAllIds,
} from "./lib/tweet-db";

const TIME_RANGE_HOURS = 1;

// =============================================================================
// Core Functions (exported for testing)
// =============================================================================

export interface FetchOptions {
  skipProcessed?: boolean; // Skip already processed tweets (default: true)
}

export async function fetchAllTweets(options: FetchOptions = {}): Promise<CommandResult<RawTweetsFile>> {
  const config = await loadConfig();
  const users = watchlistGetAll();

  if (users.length === 0) {
    return {
      success: false,
      message: "Watchlist is empty. Add users first with: bun run scripts/manage-watchlist.ts add <username>",
      error: "EMPTY_WATCHLIST",
    };
  }

  const skipProcessed = options.skipProcessed ?? true;
  const now = nowISO();
  const from = hoursAgoISO(TIME_RANGE_HOURS);

  const processedIds = skipProcessed ? new Set(processedGetAllIds()) : new Set<string>();

  const client = createAPIClient(config);
  const allTweets: Tweet[] = [];
  const errors: { username: string; error: string }[] = [];
  let skippedCount = 0;

  console.log(`Fetching tweets from ${users.length} user(s)...`);
  console.log(`Time range: ${from} to ${now}`);
  if (skipProcessed) {
    console.log(`Skipping ${processedIds.size} already processed tweet(s)`);
  }

  for (const user of users) {
    try {
      console.log(`  Fetching @${user.username}...`);
      const tweets = await client.fetchUserTweets(user.username);

      const fromDate = new Date(from);
      const filteredTweets = tweets.filter((tweet) => {
        const tweetDate = new Date(tweet.created_at);
        return tweetDate >= fromDate;
      });

      const noRetweets = config.classification.filter_retweets_without_comment
        ? filteredTweets.filter((tweet) => !tweet.is_retweet)
        : filteredTweets;

      const finalTweets = skipProcessed
        ? noRetweets.filter((tweet) => {
            if (processedIds.has(tweet.id)) {
              skippedCount++;
              return false;
            }
            return true;
          })
        : noRetweets;

      console.log(`    Found ${finalTweets.length} new tweet(s) in time range`);
      allTweets.push(...finalTweets);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`    Error fetching @${user.username}: ${errorMessage}`);
      errors.push({ username: user.username, error: errorMessage });
    }
  }

  allTweets.sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const uniqueTweets = deduplicateTweets(allTweets);

  if (uniqueTweets.length > 0) {
    tweetInsertMany(uniqueTweets);
  }

  const result: RawTweetsFile = {
    fetched_at: now,
    time_range: { from, to: now },
    tweets: uniqueTweets,
    errors: errors.length > 0 ? errors : undefined,
  };

  await saveRawTweets(result);

  return {
    success: true,
    message: `Fetched ${uniqueTweets.length} new tweet(s) from ${users.length} user(s)${skippedCount > 0 ? ` (${skippedCount} skipped as already processed)` : ""}. Saved to database.`,
    data: result,
  };
}

export function deduplicateTweets(tweets: Tweet[]): Tweet[] {
  const seen = new Set<string>();
  return tweets.filter((tweet) => {
    if (seen.has(tweet.id)) {
      return false;
    }
    seen.add(tweet.id);
    return true;
  });
}

export function filterTweetsByTimeRange(tweets: Tweet[], from: string, to: string): Tweet[] {
  const fromDate = new Date(from);
  const toDate = new Date(to);

  return tweets.filter((tweet) => {
    const tweetDate = new Date(tweet.created_at);
    return tweetDate >= fromDate && tweetDate <= toDate;
  });
}

// =============================================================================
// CLI Handler
// =============================================================================

function parseArgs(args: string[]): FetchOptions {
  const options: FetchOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--include-processed") {
      options.skipProcessed = false;
    }
  }

  return options;
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  const result = await fetchAllTweets(options);

  console.log("\n" + JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

// Run if executed directly
if (import.meta.main) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
