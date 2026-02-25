import { TwitterAPIClient } from "./lib/api";
import { loadConfig } from "./lib/utils";

const TEST_USER_URL = "https://x.com/zhengli";
const TEST_TWEET_URL = "https://x.com/zhengli/status/2015179265155952807";

async function testEndpoint<T>(
  name: string,
  fn: () => Promise<T>
): Promise<{ name: string; success: boolean; data?: T; error?: string; rawResponse?: unknown }> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log("=".repeat(60));

  try {
    const result = await fn();
    console.log("✅ Success");
    console.log("Result:", JSON.stringify(result, null, 2));
    return { name, success: true, data: result };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log("❌ Failed:", errorMsg);
    return { name, success: false, error: errorMsg };
  }
}

async function main() {
  const config = await loadConfig();
  const client = new TwitterAPIClient(config);

  const results: Array<{ name: string; success: boolean; error?: string }> = [];

  console.log("\n🚀 Starting API Integration Tests");
  console.log(`Test User: ${TEST_USER_URL}`);
  console.log(`Test Tweet: ${TEST_TWEET_URL}`);

  const testToRun = process.argv[2];

  if (!testToRun || testToRun === "tweet-details") {
    const r = await testEndpoint("getTweetDetails", () =>
      client.getTweetDetails(TEST_TWEET_URL)
    );
    results.push(r);
    if (testToRun) return;
  }

  if (!testToRun || testToRun === "user-info") {
    const r = await testEndpoint("getUserInfo", () =>
      client.getUserInfo(TEST_USER_URL)
    );
    results.push(r);
    if (testToRun) return;
  }

  if (!testToRun || testToRun === "search-tweets") {
    const r = await testEndpoint("searchTweets", () =>
      client.searchTweets("AI", 5, true)
    );
    results.push(r);
    if (testToRun) return;
  }

  // NOTE: The following methods were removed from XRayClient as they are not
  // actively used: getUserTimeline, getUserReplies, getUserFollowers,
  // getUserFollowing, getUserAffiliates, getUserHighlights, getTweetReplies

  if (!testToRun || testToRun === "search-user-tweets") {
    const r = await testEndpoint("searchUserTweets", () =>
      client.searchUserTweets(TEST_USER_URL, "AI")
    );
    results.push(r);
    if (testToRun) return;
  }

  if (!testToRun || testToRun === "user-bookmarks") {
    const r = await testEndpoint("getUserBookmarks", () =>
      client.getUserBookmarks()
    );
    results.push(r);
    if (testToRun) return;
  }

  if (!testToRun || testToRun === "user-likes") {
    const r = await testEndpoint("getUserLikes", () =>
      client.getUserLikes()
    );
    results.push(r);
    if (testToRun) return;
  }

  if (!testToRun || testToRun === "user-lists") {
    const r = await testEndpoint("getUserLists", () =>
      client.getUserLists()
    );
    results.push(r);
    if (testToRun) return;
  }

  if (!testToRun || testToRun === "user-analytics") {
    const r = await testEndpoint("getUserAnalytics", () =>
      client.getUserAnalytics()
    );
    results.push(r);
    if (testToRun) return;
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 Summary");
  console.log("=".repeat(60));

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`Total: ${results.length}, Passed: ${passed}, Failed: ${failed}`);

  for (const r of results) {
    console.log(`  ${r.success ? "✅" : "❌"} ${r.name}${r.error ? `: ${r.error}` : ""}`);
  }
}

main().catch(console.error);
