/**
 * Generate Report Script
 *
 * Merges raw_tweets.json and classified.json to produce final report
 *
 * Usage:
 *   bun run scripts/generate-report.ts
 */

import type {
  RawTweetsFile,
  ClassifiedFile,
  ReportFile,
  ReportTweet,
  CommandResult,
  Tweet,
} from "./lib/types";
import {
  loadRawTweets,
  loadClassified,
  saveReport,
  fileExists,
  RAW_TWEETS_PATH,
  CLASSIFIED_PATH,
  nowISO,
} from "./lib/utils";
import { buildThreads } from "./lib/tweet-utils";
import { processedMarkMany } from "./lib/tweet-db";
import { resolve } from "path";

const OUTPUT_DIR = resolve(process.cwd(), "data", "output");

// =============================================================================
// Core Functions (exported for testing)
// =============================================================================

export async function generateReport(): Promise<CommandResult<ReportFile>> {
  if (!(await fileExists(RAW_TWEETS_PATH))) {
    return {
      success: false,
      message: `Raw tweets file not found: ${RAW_TWEETS_PATH}. Run fetch-tweets first.`,
      error: "MISSING_RAW_TWEETS",
    };
  }

  if (!(await fileExists(CLASSIFIED_PATH))) {
    return {
      success: false,
      message: `Classification file not found: ${CLASSIFIED_PATH}. Run x-ray-classify skill first.`,
      error: "MISSING_CLASSIFICATION",
    };
  }

  const rawTweets = await loadRawTweets();
  const classified = await loadClassified();

  const reasonMap = new Map<string, string>();
  for (const result of classified.results) {
    reasonMap.set(result.tweet_id, result.reason);
  }

  const tweetMap = new Map(rawTweets.tweets.map((t) => [t.id, t]));

  // Build threads to find replies for each root tweet
  const threads = buildThreads(rawTweets.tweets);
  const threadMap = new Map(threads.map((t) => [t.id, t]));

  const reportTweets: ReportTweet[] = [];
  for (const result of classified.results) {
    const tweet = tweetMap.get(result.tweet_id);
    if (!tweet) {
      console.warn(`Tweet not found in raw_tweets: ${result.tweet_id}`);
      continue;
    }

    // Check if this tweet is part of a thread
    const thread = threadMap.get(result.tweet_id);
    const hasReplies = thread && thread.reply_count > 0;

    reportTweets.push({
      ...tweet,
      reason: result.reason,
      is_thread: hasReplies,
      thread_replies: hasReplies ? thread.replies : undefined,
    });
  }

  const report: ReportFile = {
    generated_at: nowISO(),
    time_range: rawTweets.time_range,
    summary: {
      total_fetched: rawTweets.tweets.length,
      selected_count: reportTweets.length,
    },
    tweets: reportTweets,
  };

  const outputPath = await saveReport(report, OUTPUT_DIR);

  const processedIds = classified.results.map((r) => r.tweet_id);
  processedMarkMany(processedIds, "selected");

  return {
    success: true,
    message: `Generated report with ${reportTweets.length} selected tweet(s). Saved to ${outputPath}. Marked ${processedIds.length} tweet(s) as processed.`,
    data: report,
  };
}

// =============================================================================
// CLI Handler
// =============================================================================

async function main() {
  const result = await generateReport();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
