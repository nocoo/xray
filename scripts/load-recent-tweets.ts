import { getDB } from "./lib/db";
import { tweetGetRecent, tweetToModel } from "./lib/tweet-db";
import { saveRawTweets, nowISO } from "./lib/utils";
import type { RawTweetsFile } from "./lib/types";

async function main() {
  const db = getDB();
  const recentTweets = tweetGetRecent(100);
  const tweets = recentTweets.map(tweetToModel);

  const result: RawTweetsFile = {
    fetched_at: nowISO(),
    tweets: tweets,
  };

  await saveRawTweets(result);
  console.log(`Generated raw_tweets.json with ${tweets.length} tweets`);
  console.log(`Date range: ${tweets[0]?.created_at || 'N/A'} to ${tweets[tweets.length - 1]?.created_at || 'N/A'}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
