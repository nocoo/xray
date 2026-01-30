import { loadConfig } from "../../scripts/lib/utils";
import { createAPIClient } from "../../scripts/lib/api";

const NEVER_USERS = ["karpathy", "AndrewYNg", "GitHub_Daily", "AppSaildotDEV", "MParakhin", "sama"];

async function main() {
  const config = await loadConfig();
  const client = createAPIClient(config);
  
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
