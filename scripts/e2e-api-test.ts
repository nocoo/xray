import { loadConfig } from "./lib/utils";

const TEST_USER_URL = "https://x.com/zhengli";
const TEST_TWEET_URL = "https://x.com/zhengli/status/2015179265155952807";

interface TestResult {
  name: string;
  success: boolean;
  rawResponse?: unknown;
  error?: string;
}

async function main() {
  const config = await loadConfig();
  const baseUrl = config.api.base_url;
  const apiKey = config.api.api_key;
  const cookie = config.api.cookie;

  const results: TestResult[] = [];

  async function testAPI(
    name: string,
    endpoint: string,
    body: object
  ): Promise<TestResult> {
    console.log(`\n🔄 Testing: ${name}`);
    console.log(`   Endpoint: ${endpoint}`);

    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        console.log(`   ❌ HTTP Error: ${response.status}`);
        return { name, success: false, error: `HTTP ${response.status}`, rawResponse: data };
      }

      console.log(`   ✅ Success (code: ${data.code})`);
      console.log(`   📦 Response keys: ${Object.keys(data.data || {}).join(", ")}`);

      return { name, success: true, rawResponse: data };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.log(`   ❌ Error: ${errorMsg}`);
      return { name, success: false, error: errorMsg };
    }
  }

  // 1. getTweetDetails
  results.push(
    await testAPI("getTweetDetails", "/v1/twitter/tweet/details", {
      url: TEST_TWEET_URL,
    })
  );

  // 2. getTweetReplies
  results.push(
    await testAPI("getTweetReplies", "/v1/twitter/tweet/replys", {
      url: TEST_TWEET_URL,
    })
  );

  // 3. searchTweets
  results.push(
    await testAPI("searchTweets", "/v1/twitter/tweet/search", {
      words: "AI",
      count: 5,
    })
  );

  // 4. getUserInfo
  results.push(
    await testAPI("getUserInfo", "/v1/twitter/user/info", {
      url: TEST_USER_URL,
    })
  );

  // 5. getUserTimeline
  results.push(
    await testAPI("getUserTimeline", "/v1/twitter/user/timeline", {
      url: TEST_USER_URL,
    })
  );

  // 6. getUserReplies
  results.push(
    await testAPI("getUserReplies", "/v1/twitter/user/replies", {
      url: TEST_USER_URL,
    })
  );

  // 7. getUserFollowers
  results.push(
    await testAPI("getUserFollowers", "/v1/twitter/user/follower", {
      url: TEST_USER_URL,
    })
  );

  // 8. getUserFollowing
  results.push(
    await testAPI("getUserFollowing", "/v1/twitter/user/following", {
      url: TEST_USER_URL,
    })
  );

  // 9. getUserAffiliates
  results.push(
    await testAPI("getUserAffiliates", "/v1/twitter/user/affiliates", {
      url: TEST_USER_URL,
    })
  );

  // 10. getUserHighlights
  results.push(
    await testAPI("getUserHighlights", "/v1/twitter/user/highLights", {
      url: TEST_USER_URL,
    })
  );

  // 11. searchUserTweets
  results.push(
    await testAPI("searchUserTweets", "/v1/twitter/user/getUserTweetsBySearch", {
      userUrl: TEST_USER_URL,
      words: "AI",
    })
  );

  // 12. fetchUserTweets
  results.push(
    await testAPI("fetchUserTweets", "/v1/twitter/user/userRecentTweetsByFilter", {
      url: TEST_USER_URL,
      showPost: true,
      showReplies: false,
      showLinks: true,
      count: 5,
    })
  );

  // Cookie-required APIs
  if (cookie) {
    // 13. getUserAnalytics
    results.push(
      await testAPI("getUserAnalytics", "/v1/twitter/user/analytics", {
        cookie,
      })
    );

    // 14. getUserBookmarks
    results.push(
      await testAPI("getUserBookmarks", "/v1/twitter/user/bookmarks", {
        cookie,
      })
    );

    // 15. getUserLikes
    results.push(
      await testAPI("getUserLikes", "/v1/twitter/user/likes", {
        cookie,
      })
    );

    // 16. getUserLists
    results.push(
      await testAPI("getUserLists", "/v1/twitter/user/lists", {
        cookie,
      })
    );

    // 17. getInbox (skip for now - may not want to expose DMs)
    // results.push(await testAPI("getInbox", "/v1/twitter/message/inbox", { cookie }));
  } else {
    console.log("\n⚠️ No cookie configured, skipping cookie-required APIs");
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 E2E Test Summary");
  console.log("=".repeat(60));

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    results
      .filter((r) => !r.success)
      .forEach((r) => console.log(`  - ${r.name}: ${r.error}`));
  }

  // Save raw responses for analysis
  await Bun.write(
    "data/e2e-api-responses.json",
    JSON.stringify(results, null, 2)
  );
  console.log("\n📁 Raw responses saved to data/e2e-api-responses.json");
}

main();
