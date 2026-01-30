import { loadConfig } from "../../scripts/lib/utils";
import { createAPIClient } from "../../scripts/lib/api";

const USERS = ["steipete", "gregisenberg", "yetone", "tom_doerr"];

async function main() {
  const config = await loadConfig();
  const client = createAPIClient(config);
  
  console.log("=== 用户深入调查 ===\n");
  let apiCalls = 0;
  
  for (const username of USERS) {
    if (apiCalls >= 50) break;
    
    try {
      console.log(`调查 @${username}...`);
      apiCalls++;
      
      const userInfo = await client.getUserInfo(`https://x.com/${username}`);
      console.log(`  粉丝: ${userInfo.followers_count}`);
      console.log(`  简介: ${userInfo.description?.substring(0, 80) || "N/A"}...`);
      
      const tweets = await client.fetchUserTweets(username);
      apiCalls++;
      console.log(`  最近推文: ${tweets.length}`);
      
      if (tweets.length > 0) {
        const avgLikes = tweets.reduce((sum, t) => sum + t.metrics.like_count, 0) / tweets.length;
        console.log(`  平均互动: ${avgLikes.toFixed(1)} likes`);
      }
      console.log("");
    } catch (err) {
      console.log(`  错误: ${err.message}\n`);
    }
  }
  
  console.log(`API 调用次数: ${apiCalls}/50`);
}

main().catch(console.error);
