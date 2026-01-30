/**
 * Search User Tweets Script
 * 
 * Searches for tweets from a specific user matching given keywords.
 * Useful for finding specific discussions from known influencers.
 * 
 * Usage:
 *   bun run agent/research/search-user-tweets.ts --user @karpathy --words "AI safety" --count 20
 */

import { getAgentClient } from "../lib/agent-api";
import { writeAgentOutput } from "../lib/agent-output";
import { normalizeUsername, formatTweetOutput, nowISO } from "../../scripts/lib/utils";
import type { Tweet } from "../../scripts/lib/types";

interface Args {
  user?: string;
  words?: string;
  count?: number;
  sortByTop?: boolean;
  out?: string;
  help?: boolean;
}

function parseArgs(): Args {
  const args: Args = {};
  const rawArgs = process.argv.slice(2);
  
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    const nextArg = rawArgs[i + 1];
    
    if (arg === "--user" || arg === "-u") {
      args.user = nextArg;
      i++;
    } else if (arg === "--words" || arg === "-w") {
      args.words = nextArg;
      i++;
    } else if (arg === "--count" || arg === "-c") {
      args.count = parseInt(nextArg, 10);
      i++;
    } else if (arg === "--sort" || arg === "-s") {
      args.sortByTop = nextArg !== "false";
      i++;
    } else if (arg === "--out" || arg === "-o") {
      args.out = nextArg;
      i++;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  
  return args;
}

function printHelp() {
  console.log(`
Search User Tweets Script
========================

Searches for tweets from a specific user matching given keywords.

Usage:
  bun run agent/research/search-user-tweets.ts --user @username --words "keywords"

Options:
  --user, -u     Username to search (with or without @)
  --words, -w   Keywords to search for (required)
  --count, -c   Number of tweets to return (default: 20)
  --sort, -s    Sort by top engagement (default: true)
  --out, -o     Output JSON path (optional)
  --help, -h    Show this help message

Examples:
  bun run agent/research/search-user-tweets.ts --user karpathy --words "AI safety"
  bun run agent/research/search-user-tweets.ts -u sama -w "GPT-5" -c 10
  bun run agent/research/search-user-tweets.ts --user @gdb --words "Rust" --sort true
`);
}

export function buildSearchUserOutput(params: {
  username: string;
  words: string;
  count: number;
  sortByTop: boolean;
  tweets: Tweet[];
}) {
  const totalEngagement = params.tweets.reduce(
    (sum, t) => sum + t.metrics.like_count + t.metrics.retweet_count + t.metrics.reply_count,
    0
  );
  const avgEngagement = params.tweets.length
    ? Math.round(totalEngagement / params.tweets.length)
    : 0;
  const topTweet = params.tweets[0];

  return {
    generated_at: nowISO(),
    query: {
      user: params.username,
      words: params.words,
      count: params.count,
      sort: params.sortByTop ? "top" : "recent",
    },
    tweets: params.tweets,
    summary: {
      total: params.tweets.length,
      total_engagement: totalEngagement,
      avg_engagement: avgEngagement,
      top_tweet_id: topTweet?.id || "",
      top_tweet_author: topTweet?.author.username || "",
    },
  };
}

async function main() {
  const args = parseArgs();
  
  if (args.help || !args.user || !args.words) {
    printHelp();
    return;
  }
  
  try {
    const client = await getAgentClient();
    
    const username = normalizeUsername(args.user);
    const count = args.count || 20;
    const sortByTop = args.sortByTop !== false;
    
    console.log(`\n🔍 Searching for "${args.words}" from @${username}...`);
    console.log(`   Count: ${count}, Sort: ${sortByTop ? "Top" : "Recent"}\n`);
    
    const tweets = await client.searchUserTweets(
      `https://x.com/${username}`,
      args.words,
    );
    
    // Filter and sort results
    let filteredTweets = tweets;
    if (sortByTop) {
      filteredTweets = tweets.sort((a, b) => 
        (b.metrics.like_count + b.metrics.retweet_count * 2) - 
        (a.metrics.like_count + a.metrics.retweet_count * 2)
      );
    }
    
    filteredTweets = filteredTweets.slice(0, count);
    
    console.log(`📊 Found ${filteredTweets.length} matching tweets:\n`);
    
    const output = buildSearchUserOutput({
      username,
      words: args.words,
      count,
      sortByTop,
      tweets: filteredTweets,
    });
    const outputPath = await writeAgentOutput("search_user_tweets", output, args.out);

    if (filteredTweets.length === 0) {
      console.log("   No tweets found matching your criteria.");
      console.log("   Try different keywords or increase the count.\n");
      console.log(`💾 输出已保存: ${outputPath}`);
      return;
    }
    
    for (let i = 0; i < filteredTweets.length; i++) {
      const tweet = filteredTweets[i];
      console.log(`${i + 1}. ${formatTweetOutput(tweet)}`);
      console.log("");
    }
    
    // Summary statistics
    const totalEngagement = filteredTweets.reduce((sum, t) => 
      sum + t.metrics.like_count + t.metrics.retweet_count + t.metrics.reply_count, 0);
    const avgEngagement = Math.round(totalEngagement / filteredTweets.length);
    
    console.log("=== Summary ===");
    console.log(`Total tweets: ${filteredTweets.length}`);
    console.log(`Total engagement: ${totalEngagement}`);
    console.log(`Avg engagement: ${avgEngagement}`);
    console.log(`Top tweet: @${filteredTweets[0]?.author.username} (${filteredTweets[0]?.metrics.like_count} ❤️)`);
    console.log(`💾 输出已保存: ${outputPath}`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
