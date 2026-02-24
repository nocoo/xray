/**
 * Fetch Tweets Script
 *
 * Fetches tweets from all users in the watchlist and saves to raw_tweets.json
 * Automatically skips tweets that have already been processed.
 *
 * Usage:
 *   bun run scripts/fetch-tweets.ts
 *   bun run scripts/fetch-tweets.ts --include-processed  # Include already processed tweets
 */

import type { RawTweetsFile, Tweet, CommandResult } from "./lib/types";
import {
  loadConfig,
  nowISO,
  saveRawTweets,
  hoursAgoISO,
} from "./lib/utils";
import { createXRayClient } from "./lib/xray-client";
import { watchlistGetAll } from "./lib/watchlist-db";
import {
  tweetInsertMany,
  processedGetAllIds,
  getExistingTweetIds,
  deleteTweetsByIds,
  tweetGetByCreatedAtRange,
  tweetToModel,
} from "./lib/tweet-db";

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
  const processedIds = skipProcessed ? new Set(processedGetAllIds()) : new Set<string>();

  const client = createXRayClient(config);
  const allTweets: Tweet[] = [];
  const errors: { username: string; error: string }[] = [];
  let skippedCount = 0;
  let replacedCount = 0;

  console.log(`Fetching tweets from ${users.length} user(s)...`);
  if (skipProcessed) {
    console.log(`Skipping ${processedIds.size} already processed tweet(s)`);
  }
  const BATCH_SIZE = 5;

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(users.length / BATCH_SIZE)}...`);

    const batchPromises = batch.map(async (user) => {
      try {
        console.log(`  Fetching @${user.username}...`);
        const tweets = await client.fetchUserTweets(user.username);

        const noRetweets = config.classification.filter_retweets_without_comment
          ? tweets.filter((tweet) => !tweet.is_retweet)
          : tweets;

        const finalTweets = skipProcessed
          ? noRetweets.filter((tweet) => {
              if (processedIds.has(tweet.id)) {
                skippedCount++;
                return false;
              }
              return true;
            })
          : noRetweets;

        console.log(`    Found ${finalTweets.length} new tweet(s)`);
        return { tweets: finalTweets, error: null };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`    Error fetching @${user.username}: ${errorMessage}`);
        return { tweets: [], error: { username: user.username, error: errorMessage } };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach((result) => {
      if (result.error) {
        errors.push(result.error);
      } else {
        allTweets.push(...result.tweets);
      }
    });
  }

  allTweets.sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const uniqueTweets = deduplicateTweets(allTweets);
  const existingIds = getExistingTweetIds(uniqueTweets.map((tweet) => tweet.id));
  if (existingIds.size > 0) {
    replacedCount = deleteTweetsByIds([...existingIds]);
  }

  if (uniqueTweets.length > 0) {
    tweetInsertMany(uniqueTweets);
  }

  const windowFrom = hoursAgoISO(1);
  const windowTo = now;
  const windowRows = tweetGetByCreatedAtRange(windowFrom, windowTo);
  const summaryTweets = windowRows.map(tweetToModel);
  const summaryCount = summaryTweets.length;

  const result: RawTweetsFile = {
    fetched_at: now,
    tweets: summaryTweets,
    errors: errors.length > 0 ? errors : undefined,
  };

  await saveRawTweets(result);


  return {
    success: true,
    message: `Fetched ${uniqueTweets.length} new tweet(s) from ${users.length} user(s)`
      + `${skippedCount > 0 ? ` (${skippedCount} skipped as already processed)` : ""}`
      + `${replacedCount > 0 ? ` (${replacedCount} replaced in database)` : ""}`
      + `. Saved to database.`
      + ` Summary: ${summaryCount} tweet(s) in last 1h (UTC).`,
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
