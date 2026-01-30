import { loadConfig } from "../../scripts/lib/utils";
import { createAPIClient } from "../../scripts/lib/api";

async function main() {
  const config = await loadConfig();
  const client = createAPIClient(config);

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

  const allResults: Array<{ category: string; term: string; tweets: any[] }> = [];

  for (const term of extendedTerms) {
    try {
      console.log(`🔍 Searching: "${term}"...`);
      const tweets = await client.searchTweets(term, 15, true);
      console.log(`   Found ${tweets.length} tweets\n`);

      if (tweets.length > 0) {
        allResults.push({ category: "extended", term, tweets });
        
        for (const tweet of tweets.slice(0, 3)) {
          console.log(`  @${tweet.author.username}: ${tweet.text.substring(0, 120)}...`);
          console.log(`     ❤️ ${tweet.metrics.like_count} | 🔁 ${tweet.metrics.retweet_count}\n`);
        }
      }
    } catch (err) {
      console.log(`   Error: ${err.message}\n`);
    }
  }

  console.log("\n=== Summary ===\n");
  console.log(`Total searches: ${extendedTerms.length}`);
  console.log(`Total results: ${allResults.reduce((acc, r) => acc + r.tweets.length, 0)}`);
}

main().catch(console.error);
