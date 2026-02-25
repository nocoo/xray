import { getAgentClient } from "../lib/agent-api";
import { writeAgentOutput } from "../lib/agent-output";
import { nowISO } from "../../scripts/lib/utils";
import type { Tweet } from "../../scripts/lib/types";

const USERS = ["steipete", "gregisenberg", "yetone", "tom_doerr"];

export function buildDemoOutput(params: {
  users: string[];
  results: Array<{ username: string; tweets: Tweet[] }>
}) {
  const total = params.results.reduce((sum, r) => sum + r.tweets.length, 0);
  return {
    generated_at: nowISO(),
    query: {
      users: params.users,
    },
    results: params.results,
    summary: {
      total,
    },
  };
}

export async function main() {
  const client = await getAgentClient();
  
  console.log("=== 用户深入调查 ===\n");
  let apiCalls = 0;
  const results: Array<{ username: string; tweets: Tweet[] }> = [];
  
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

      results.push({ username, tweets });
      
      if (tweets.length > 0) {
        const avgLikes = tweets.reduce((sum, t) => sum + t.metrics.like_count, 0) / tweets.length;
        console.log(`  平均互动: ${avgLikes.toFixed(1)} likes`);
      }
      console.log("");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  错误: ${message}\n`);
    }
  }
  
  console.log(`API 调用次数: ${apiCalls}/50`);

  const output = buildDemoOutput({
    users: USERS,
    results,
  });
  const outputPath = await writeAgentOutput("demo", output);
  console.log(`\n💾 输出已保存: ${outputPath}`);
}

if (import.meta.main) {
  main().catch(console.error);
}
