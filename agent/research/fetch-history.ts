import { loadConfig } from "../../scripts/lib/utils";
import { createAPIClient } from "../../scripts/lib/api";

const NEVER_USERS = [
  "AppSaildotDEV", "DIYgod", "EXM7777", "GitHub_Daily", "Khazix0918", 
  "KingBootoshi", "MParakhin", "PennyJoly", "QingQ77", "ZenHuifer",
  "ZeroZ_JQ", "_FORAB", "dingyi", "eptwts", "eryidebiji", "gdb", 
  "howie_serious", "ilovek8s", "imwsl90", "indie_maker_fox", 
  "karpathy", "lexrus", "lifesinger", "meta_alchemist", "miantiao", 
  "mustafasuleyman", "op7418", "realNyarime", "rileybrown", "sama", 
  "shadouyoua", "tinyfool", "vista8", "wang_xiaolou", "withfolyd", "zstmfhy"
];

interface UserStats {
  username: string;
  tweetCount: number;
  oldestTweet: string;
  newestTweet: string;
  daysActive: number;
}

async function main() {
  const config = await loadConfig();
  const client = createAPIClient(config);
  
  console.log("=== Fetching historical tweets ===\n");
  
  const results: UserStats[] = [];
  
  for (const username of NEVER_USERS) {
    try {
      console.log(`Fetching @${username}...`);
      const tweets = await client.fetchUserTweets(username);
      
      if (tweets.length > 0) {
        const dates = tweets.map(t => new Date(t.created_at).getTime());
        const oldest = new Date(Math.min(...dates));
        const newest = new Date(Math.max(...dates));
        const daysActive = (newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24);
        
        results.push({
          username,
          tweetCount: tweets.length,
          oldestTweet: oldest.toISOString().split('T')[0],
          newestTweet: newest.toISOString().split('T')[0],
          daysActive: Math.round(daysActive * 10) / 10
        });
        
        console.log(`  ${tweets.length} tweets, from ${results[results.length-1].oldestTweet} to ${results[results.length-1].newestTweet} (${results[results.length-1].daysActive} days)\n`);
      } else {
        console.log(`  No tweets found\n`);
      }
    } catch (err) {
      console.log(`  Error: ${err.message}\n`);
    }
  }
  
  // Sort by tweet frequency (tweets per day)
  results.sort((a, b) => {
    const freqA = a.tweetCount / Math.max(a.daysActive, 1);
    const freqB = b.tweetCount / Math.max(b.daysActive, 1);
    return freqA - freqB; // Lowest frequency first
  });
  
  console.log("\n=== Low Frequency Users (sorted by tweets/day) ===\n");
  console.log("Username | Tweets | Days | Tweets/Day | Date Range");
  console.log("---------|--------|-----|------------|------------");
  
  for (const r of results) {
    const freq = (r.tweetCount / Math.max(r.daysActive, 1)).toFixed(1);
    console.log(`${r.username.padEnd(12)} | ${r.tweetCount.toString().padEnd(6)} | ${r.daysActive.toString().padEnd(3)} | ${freq.padEnd(9)} | ${r.oldestTweet} to ${r.newestTweet}`);
  }
  
  console.log("\n=== Summary ===");
  console.log(`Total users checked: ${NEVER_USERS.length}`);
  console.log(`Users with tweets: ${results.length}`);
  console.log(`Lowest frequency: ${results[0]?.username || 'N/A'} (${results[0] ? (results[0].tweetCount / Math.max(results[0].daysActive, 1)).toFixed(1) : 'N/A'} tweets/day)`);
}

main().catch(console.error);
