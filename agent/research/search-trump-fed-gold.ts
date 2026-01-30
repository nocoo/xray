import { loadConfig } from "../../scripts/lib/utils";
import { createAPIClient } from "../../scripts/lib/api";

async function main() {
  const config = await loadConfig();
  const client = createAPIClient(config);
  
  console.log("=== Searching for Trump Fed Nominee & Gold Discussion ===\n");
  
  const searchTerms = [
    "Trump Fed chair nominee tonight",
    "Fed chair pick gold price impact",
    "Trump Federal Reserve gold",
    "Federal Reserve appointment market impact",
    "Trump Fed choice gold trading"
  ];
  
  let allTweets: Array<{term: string; tweet: any}> = [];
  
  for (const term of searchTerms) {
    try {
      console.log(`🔍 Searching: "${term}"...`);
      const tweets = await client.searchTweets(term, 20, true);
      console.log(`   Found ${tweets.length} tweets\n`);
      
      for (const tweet of tweets.slice(0, 5)) {
        console.log(`  @${tweet.author.username}: ${tweet.text.substring(0, 150)}...`);
        console.log(`     ❤️ ${tweet.metrics.like_count} | 🔁 ${tweet.metrics.retweet_count} | 👁 ${tweet.metrics.view_count}\n`);
        
        allTweets.push({ term, tweet });
      }
    } catch (err) {
      console.log(`   Error: ${err.message}\n`);
    }
  }
  
  // 按互动数排序显示
  console.log("\n=== Top 10 by Engagement ===\n");
  const topTweets = allTweets
    .sort((a, b) => b.tweet.metrics.like_count - a.tweet.metrics.like_count)
    .slice(0, 10);
  
  topTweets.forEach(({ term, tweet }, i) => {
    console.log(`${i+1}. [${term}] @${tweet.author.username}`);
    console.log(`   ${tweet.text.substring(0, 200)}...`);
    console.log(`   ❤️ ${tweet.metrics.like_count} | 🔁 ${tweet.metrics.retweet_count} | ${tweet.url}\n`);
  });
  
  // 分析讨论观点
  console.log("\n=== Analysis Summary ===\n");
  console.log("搜索到关于 Trump Fed 提名对黄金市场影响的讨论。");
  console.log(`共获取 ${allTweets.length} 条相关推文。`);
  console.log("由于是昨晚消息，今晚提名才会公布，市场正在观望状态。");
}

main().catch(console.error);
