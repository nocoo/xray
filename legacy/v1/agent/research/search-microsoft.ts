import { getAgentClient } from "../lib/agent-api";
import { writeAgentOutput } from "../lib/agent-output";
import { nowISO } from "../../scripts/lib/utils";
import type { Tweet } from "../../scripts/lib/types";

export function buildSearchOutput(params: {
  queries: string[];
  results: Array<{ term: string; tweets: Tweet[] }>;
}) {
  const total = params.results.reduce((sum, r) => sum + r.tweets.length, 0);
  return {
    generated_at: nowISO(),
    query: {
      terms: params.queries,
    },
    results: params.results,
    summary: {
      total,
    },
  };
}

export async function main() {
  const client = await getAgentClient();
  
  console.log("=== Searching for Microsoft stock crash tweets ===\n");
  
  const searchTerms = [
    "Microsoft stock crash",
    "Microsoft股价暴跌",
    "MSFT crash",
    "Microsoft earnings"
  ];
  
  const results: Array<{ term: string; tweets: Tweet[] }> = [];

  for (const term of searchTerms) {
    try {
      console.log(`Searching: "${term}"...`);
      const tweets = await client.searchTweets(term, 10, true);
      console.log(`  Found ${tweets.length} tweets\n`);
      
      for (const tweet of tweets.slice(0, 5)) {
        console.log(`  @${tweet.author.username}: ${tweet.text.substring(0, 100)}...`);
        console.log(`     ${tweet.metrics.like_count} likes | ${tweet.metrics.retweet_count} RTs\n`);
      }

      results.push({ term, tweets });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  Error: ${message}\n`);
    }
  }

  const output = buildSearchOutput({
    queries: searchTerms,
    results,
  });
  const outputPath = await writeAgentOutput("search_microsoft", output);
  console.log(`\n💾 输出已保存: ${outputPath}`);
}

if (import.meta.main) {
  main().catch(console.error);
}
