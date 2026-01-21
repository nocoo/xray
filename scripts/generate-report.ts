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
  TweetClassification,
  CommandResult,
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
import {
  processedMarkMany,
  classificationUpsert,
  tweetGet,
} from "./lib/tweet-db";
import { resolve } from "path";

const OUTPUT_DIR = resolve(process.cwd(), "data", "output");

// =============================================================================
// Core Functions (exported for testing)
// =============================================================================

export interface ReportOptions {
  includeAll?: boolean; // Include all tweets, not just filtered
  minRelevanceScore?: number; // Minimum score to include (default: 0)
}

export async function generateReport(
  options: ReportOptions = {}
): Promise<CommandResult<ReportFile>> {
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

  const classificationMap = new Map<string, TweetClassification>();
  for (const result of classified.results) {
    classificationMap.set(result.tweet_id, result.classification);
  }

  const mergedTweets: ReportTweet[] = [];
  const minScore = options.minRelevanceScore ?? 0;

  for (const tweet of rawTweets.tweets) {
    const classification = classificationMap.get(tweet.id);

    if (!classification) {
      console.warn(`No classification found for tweet ${tweet.id}`);
      continue;
    }

    if (!options.includeAll) {
      if (!classification.is_tech_related || !classification.is_hot_topic) {
        continue;
      }
      if (classification.relevance_score < minScore) {
        continue;
      }
    }

    mergedTweets.push({
      ...tweet,
      classification,
    });
  }

  mergedTweets.sort((a, b) => {
    return b.classification.relevance_score - a.classification.relevance_score;
  });

  const summary = calculateSummary(rawTweets, classified);

  const report: ReportFile = {
    generated_at: nowISO(),
    time_range: rawTweets.time_range,
    summary,
    filtered_tweets: mergedTweets,
  };

  const outputPath = await saveReport(report, OUTPUT_DIR);

  const processedIds: string[] = [];
  for (const result of classified.results) {
    processedMarkMany([result.tweet_id], "tech");
    classificationUpsert(result.tweet_id, result.classification);
    processedIds.push(result.tweet_id);
  }

  return {
    success: true,
    message: `Generated report with ${mergedTweets.length} filtered tweet(s). Saved to ${outputPath}. Marked ${processedIds.length} tweet(s) as processed.`,
    data: report,
  };
}

export function calculateSummary(
  rawTweets: RawTweetsFile,
  classified: ClassifiedFile
): ReportFile["summary"] {
  let techRelated = 0;
  let hotTopics = 0;
  const categories: Record<string, number> = {};

  for (const result of classified.results) {
    const { classification } = result;

    if (classification.is_tech_related) {
      techRelated++;
    }

    if (classification.is_hot_topic) {
      hotTopics++;
    }

    for (const category of classification.category) {
      categories[category] = (categories[category] || 0) + 1;
    }
  }

  return {
    total_fetched: rawTweets.tweets.length,
    tech_related: techRelated,
    hot_topics: hotTopics,
    categories,
  };
}

// =============================================================================
// CLI Handler
// =============================================================================

function parseArgs(args: string[]): ReportOptions {
  const options: ReportOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--all") {
      options.includeAll = true;
    }
    if (args[i] === "--min-score" && args[i + 1]) {
      options.minRelevanceScore = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return options;
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  const result = await generateReport(options);

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

// Run if executed directly
if (import.meta.main) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
