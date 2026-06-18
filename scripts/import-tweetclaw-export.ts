import { readFileSync, writeFileSync } from "fs";
import { parseTweetClawExport } from "./lib/tweetclaw-import";
import { RAW_TWEETS_PATH } from "./lib/utils";

function usage(): string {
  return [
    "Usage:",
    "  bun run scripts/import-tweetclaw-export.ts <tweetclaw-export> [output-json]",
    "",
    "Converts TweetClaw JSON, JSONL, or CSV exports into X-Ray raw_tweets.json.",
  ].join("\n");
}

function main(): void {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3] ?? RAW_TWEETS_PATH;

  if (!inputPath) {
    console.error(usage());
    process.exit(1);
  }

  const content = readFileSync(inputPath, "utf8");
  const rawTweets = parseTweetClawExport(content);
  writeFileSync(outputPath, JSON.stringify(rawTweets, null, 2));
  console.log(`Imported ${rawTweets.tweets.length} tweet(s) to ${outputPath}`);
}

main();
