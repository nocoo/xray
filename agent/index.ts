/**
 * Potato Agent - Main Entry Point
 *
 * Hourly workflow: fetch → analyze → report
 *
 * Usage:
 *   bun run agent/index.ts --mode hourly    # Full workflow
 *   bun run agent/index.ts --mode fetch     # Fetch only
 *   bun run agent/index.ts --mode analyze   # Analyze only
 */

import { nowISO } from "../../scripts/lib/utils";
import { fetchIncremental, IncrementalOptions } from "../fetch/incremental";
import { getRecentTweets, RecentOptions } from "../analyze/recent";
import {
  processedMark,
  processedMarkMany,
  classificationUpsert,
  classificationGetTechRelated,
  tweetCount,
  processedCount,
} from "../../scripts/lib/tweet-db";
import type { Tweet } from "../../scripts/lib/types";

export interface WorkflowOptions {
  mode: "hourly" | "fetch" | "analyze";
  fetchOptions?: IncrementalOptions;
  analyzeOptions?: RecentOptions;
}

interface AnalysisResult {
  tweet_id: string;
  reason: string;
  is_selected: boolean;
}

/**
 * Simple keyword-based classifier
 * Replace with LLM call for better results
 */
function classifyTweet(tweet: Tweet): AnalysisResult {
  const text = tweet.text.toLowerCase();
  const keywords = [
    "ai", "llm", "gpt", "claude", "model", "training",
    "code", "programming", "developer", "software",
    "github", "open source", "release", "launch",
    "announcement", "introducing", "new", "update",
  ];

  const hasKeyword = keywords.some((k) => text.includes(k));

  if (hasKeyword) {
    return {
      tweet_id: tweet.id,
      reason: `Tech-related content about: ${keywords.filter((k) => text.includes(k)).join(", ")}`,
      is_selected: true,
    };
  }

  return {
    tweet_id: tweet.id,
    reason: "Not tech-related",
    is_selected: false,
  };
}

/**
 * Analyze and classify tweets
 */
async function analyzeTweets(tweets: Tweet[]): Promise<AnalysisResult[]> {
  console.log(`[potato] Analyzing ${tweets.length} tweets...`);

  const results: AnalysisResult[] = [];

  for (const tweet of tweets) {
    const result = classifyTweet(tweet);
    results.push(result);

    // Save to DB
    processedMark(tweet.id, result.is_selected ? "selected" : "skipped");

    if (result.is_selected) {
      classificationUpsert(tweet.id, {
        is_tech_related: true,
        is_hot_topic: tweet.metrics.like_count > 100,
        category: ["tech"],
        relevance_score: Math.min(tweet.metrics.like_count / 100, 10),
        reason: result.reason,
      });
    }
  }

  console.log(`[potato] Selected ${results.filter((r) => r.is_selected).length} tweets`);
  return results;
}

/**
 * Generate simple text report
 */
function generateReport(analyses: AnalysisResult[], tweets: Tweet[]): string {
  const selectedTweets = analyses.filter((r) => r.is_selected);
  const tweetMap = new Map(tweets.map((t) => [t.id, t]));

  const report = `# Potato Daily Report

Generated: ${nowISO()}

## Summary

- Total tweets analyzed: ${analyses.length}
- Selected (tech-related): ${selectedTweets.length}
- Skipped: ${analyses.length - selectedTweets.length}

## Selected Tweets

`;

  for (const analysis of selectedTweets) {
    const tweet = tweetMap.get(analysis.tweet_id);
    if (tweet) {
      report += `### @${tweet.author.username}\n`;
      report += `${tweet.text}\n\n`;
      report += `[Link](${tweet.url})\n`;
      report += `Reason: ${analysis.reason}\n\n---\n\n`;
    }
  }

  return report;
}

/**
 * Main workflow
 */
export async function runWorkflow(options: WorkflowOptions): Promise<{
  success: boolean;
  fetched: number;
  analyzed: number;
  report?: string;
}> {
  const { mode } = options;

  console.log(`[potato] Starting workflow: ${mode}`);

  let fetchedCount = 0;
  let analyzedCount = 0;
  let report: string | undefined;

  // Step 1: Fetch
  if (mode === "hourly" || mode === "fetch") {
    const fetchResult = await fetchIncremental({
      hoursBack: 4,
      batchSize: 20,
      ...options.fetchOptions,
    });
    fetchedCount = fetchResult.newTweets;
    console.log(`[potato] Fetched ${fetchedCount} new tweets`);
  }

  // Step 2: Analyze
  if (mode === "hourly" || mode === "analyze") {
    const { tweets, count } = await getRecentTweets({
      hoursBack: 24,
      limit: 100,
      ...options.analyzeOptions,
    });

    if (tweets.length > 0) {
      const analyses = await analyzeTweets(tweets);
      analyzedCount = analyses.length;
      report = generateReport(analyses, tweets);
    } else {
      console.log(`[potato] No new tweets to analyze`);
    }
  }

  // Summary
  console.log(`[potato] Workflow complete`);
  console.log(`[potato]   Fetched: ${fetchedCount}`);
  console.log(`[potato]   Analyzed: ${analyzedCount}`);
  console.log(`[potato]   DB: ${tweetCount()} tweets, ${processedCount()} processed`);

  return {
    success: true,
    fetched: fetchedCount,
    analyzed: analyzedCount,
    report,
  };
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  let mode: WorkflowOptions["mode"] = "hourly";

  for (const arg of args) {
    if (arg === "--mode" && args[args.indexOf(arg) + 1]) {
      mode = args[args.indexOf(arg) + 1] as WorkflowOptions["mode"];
    }
  }

  const result = await runWorkflow({ mode });

  if (result.report) {
    console.log("\n=== Report ===\n");
    console.log(result.report);
  }

  process.exit(result.success ? 0 : 1);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
