import { getAgentClient } from "../lib/agent-api";

const NEVER_USERS = ["karpathy", "AndrewYNg", "GitHub_Daily", "AppSaildotDEV", "MParakhin", "sama"];

async function main() {
  const client = await getAgentClient();
  
  console.log("=== Testing users with NO tweets ===\n");
  
  for (const username of NEVER_USERS) {
    try {
      console.log(`Testing @${username}...`);
      const tweets = await client.fetchUserTweets(username);
      console.log(`  Result: ${tweets.length} tweets\n`);
    } catch (err) {
      console.log(`  Error: ${err.message}\n`);
    }
  }
}

main().catch(console.error);
