/**
 * Fetch Single User's Tweets
 *
 * AI-friendly: Simple function to fetch one user's tweets.
 *
 * Usage:
 *   bun run agent/fetch/single.ts --user karpathy
 *   bun run agent/fetch/single.ts --user karpathy --hours 8
 */

import { hoursAgoISO } from "../../scripts/lib/utils";
import { getAgentClient } from "../lib/agent-api";
import {
  tweetInsertMany,
  processedGetAllIds,
} from "../../scripts/lib/tweet-db";
import type { Tweet, CommandResult } from "../../scripts/lib/types";

export interface FetchOptions {
  user: string;
  hoursBack?: number;
  skipProcessed?: boolean;
}

export async function fetchUser(options: FetchOptions): Promise<CommandResult<{ tweets: Tweet[] }>> {
  const {
    user,
    hoursBack = 4,
    skipProcessed = true,
  } = options;

  const client = await getAgentClient();
  const from = hoursAgoISO(hoursBack);
  const processedIds = skipProcessed ? new Set(processedGetAllIds()) : new Set<string>();

  console.log(`[potato] Fetching @${user} (last ${hoursBack}h)...`);

  try {
    const tweets = await client.fetchUserTweets(user);
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

    // Save to DB
    if (newTweets.length > 0) {
      tweetInsertMany(newTweets);
    }

    return {
      success: true,
      message: `Found ${newTweets.length} new tweet(s) from @${user}`,
      data: { tweets: newTweets },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Error fetching @${user}`,
      error,
    };
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  let user = "";
  let hoursBack = 4;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--user" && args[i + 1]) {
      user = args[i + 1].replace("@", "");
    } else if (args[i] === "--hours" && args[i + 1]) {
      hoursBack = parseInt(args[i + 1], 10);
    }
  }

  if (!user) {
    console.error("Usage: bun run agent/fetch/single.ts --user <username> [--hours 8]");
    process.exit(1);
  }

  const result = await fetchUser({ user, hoursBack });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
