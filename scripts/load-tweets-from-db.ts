import { getDB } from "./lib/db";
import { tweetToModel, TweetRow } from "./lib/tweet-db";
import { nowISO } from "./lib/utils";
import { saveRawTweets } from "./lib/utils";
import type { RawTweetsFile } from "./lib/types";

async function main() {
  const db = getDB();
  
  const hoursAgo = Number(process.argv[2]) || 24;
  const fromISO = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  const toISO = nowISO();

  const rows = db
    .query(`SELECT * FROM tweets WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC`)
    .all(fromISO, toISO) as TweetRow[];

  const tweets = rows.map(tweetToModel);
  
  const result: RawTweetsFile = {
    fetched_at: nowISO(),
    tweets: tweets,
  };

  await saveRawTweets(result);
  console.log(`✅ Loaded ${tweets.length} tweets from last ${hoursAgo} hours`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
