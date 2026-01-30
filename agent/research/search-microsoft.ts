import { getAgentClient } from "../lib/agent-api";

async function main() {
  const client = await getAgentClient();
  
  console.log("=== Searching for Microsoft stock crash tweets ===\n");
  
  const searchTerms = [
    "Microsoft stock crash",
    "Microsoft股价暴跌",
    "MSFT crash",
    "Microsoft earnings"
  ];
  
  for (const term of searchTerms) {
    try {
      console.log(`Searching: "${term}"...`);
      const tweets = await client.searchTweets(term, 10, true);
      console.log(`  Found ${tweets.length} tweets\n`);
      
      for (const tweet of tweets.slice(0, 5)) {
        console.log(`  @${tweet.author.username}: ${tweet.text.substring(0, 100)}...`);
        console.log(`     ${tweet.metrics.like_count} likes | ${tweet.metrics.retweet_count} RTs\n`);
      }
    } catch (err) {
      console.log(`  Error: ${err.message}\n`);
    }
  }
}

main().catch(console.error);
