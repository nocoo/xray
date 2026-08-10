import { getAgentClient } from "../lib/agent-api";
import { writeAgentOutput } from "../lib/agent-output";
import { nowISO } from "../../scripts/lib/utils";
import type { Tweet } from "../../scripts/lib/types";

const NEVER_USERS = ["karpathy", "AndrewYNg", "GitHub_Daily", "AppSaildotDEV", "MParakhin", "sama"];

export function buildNeverUsersOutput(params: {
  users: string[];
  results: Array<{ username: string; tweets: Tweet[] }>;
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
  
  console.log("=== Testing users with NO tweets ===\n");
  const results: Array<{ username: string; tweets: Tweet[] }> = [];
  
  for (const username of NEVER_USERS) {
    try {
      console.log(`Testing @${username}...`);
      const tweets = await client.fetchUserTweets(username);
      console.log(`  Result: ${tweets.length} tweets\n`);
      results.push({ username, tweets });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  Error: ${message}\n`);
    }
  }

  const output = buildNeverUsersOutput({
    users: NEVER_USERS,
    results,
  });
  const outputPath = await writeAgentOutput("check_never_users", output);
  console.log(`\n💾 输出已保存: ${outputPath}`);
}

if (import.meta.main) {
  main().catch(console.error);
}
