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

async function main() {
  const client = await getAgentClient();

  console.log("=== Extended Search: Fed Candidates & Market Views ===\n");

  const extendedTerms = [
    "Kevin Hassett Fed chair views",
    "Kevin Warsh Fed policy inflation",
    "Judy Shelton gold standard Fed",
    "Christopher Waller Fed nomination",
    "Rick Rieder BlackRock Fed",
    "Fed chair Trump Powell replacement",
    "Trump Fed independence market reaction"
  ];

  const allResults: Array<{ term: string; tweets: Tweet[] }> = [];

  for (const term of extendedTerms) {
    try {
      console.log(`🔍 Searching: "${term}"...`);
      const tweets = await client.searchTweets(term, 15, true);
      console.log(`   Found ${tweets.length} tweets\n`);

      if (tweets.length > 0) {
        allResults.push({ term, tweets });
        
        for (const tweet of tweets.slice(0, 3)) {
          console.log(`  @${tweet.author.username}: ${tweet.text.substring(0, 120)}...`);
          console.log(`     ❤️ ${tweet.metrics.like_count} | 🔁 ${tweet.metrics.retweet_count}\n`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`   Error: ${message}\n`);
    }
  }

  console.log("\n=== Summary ===\n");
  console.log(`Total searches: ${extendedTerms.length}`);
  console.log(`Total results: ${allResults.reduce((acc, r) => acc + r.tweets.length, 0)}`);

  const output = buildSearchOutput({
    queries: extendedTerms,
    results: allResults,
  });
  const outputPath = await writeAgentOutput("search_fed_candidates", output);
  console.log(`\n💾 输出已保存: ${outputPath}`);
}

if (import.meta.main) {
  main().catch(console.error);
}
