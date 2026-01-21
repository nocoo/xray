import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import type { RawTweetsFile, ClassifiedFile, ReportFile } from "../scripts/lib/types";
import { calculateSummary } from "../scripts/generate-report";

const RAW_TWEETS_PATH = join(import.meta.dir, "../data/raw_tweets.json");
const CLASSIFIED_PATH = join(import.meta.dir, "../data/classified.json");
const FIXTURES_DIR = join(import.meta.dir, "fixtures");

describe("generate-report", () => {
  describe("calculateSummary", () => {
    test("calculates summary correctly", async () => {
      const rawTweets: RawTweetsFile = await Bun.file(
        join(FIXTURES_DIR, "mock-raw-tweets.json")
      ).json();
      const classified: ClassifiedFile = await Bun.file(
        join(FIXTURES_DIR, "mock-classified.json")
      ).json();

      const summary = calculateSummary(rawTweets, classified);

      expect(summary.total_fetched).toBe(3);
      expect(summary.tech_related).toBe(2);
      expect(summary.hot_topics).toBe(2);
      expect(summary.categories["AI/LLM"]).toBe(2);
      expect(summary.categories["Research"]).toBe(1);
      expect(summary.categories["Agent"]).toBe(1);
    });

    test("handles empty results", () => {
      const rawTweets: RawTweetsFile = {
        fetched_at: "2026-01-21T15:30:00.000Z",
        time_range: { from: "2026-01-20T15:30:00.000Z", to: "2026-01-21T15:30:00.000Z" },
        tweets: [],
      };
      const classified: ClassifiedFile = {
        classified_at: "2026-01-21T15:35:00.000Z",
        source_file: "data/raw_tweets.json",
        results: [],
      };

      const summary = calculateSummary(rawTweets, classified);

      expect(summary.total_fetched).toBe(0);
      expect(summary.tech_related).toBe(0);
      expect(summary.hot_topics).toBe(0);
      expect(Object.keys(summary.categories)).toHaveLength(0);
    });
  });

  describe("generateReport integration", () => {
    let originalRawTweets: string | null = null;
    let originalClassified: string | null = null;

    beforeEach(async () => {
      // Save original files if they exist
      const rawFile = Bun.file(RAW_TWEETS_PATH);
      const classifiedFile = Bun.file(CLASSIFIED_PATH);

      if (await rawFile.exists()) {
        originalRawTweets = await rawFile.text();
      }
      if (await classifiedFile.exists()) {
        originalClassified = await classifiedFile.text();
      }

      // Copy fixtures to data directory
      const mockRaw = await Bun.file(join(FIXTURES_DIR, "mock-raw-tweets.json")).text();
      const mockClassified = await Bun.file(join(FIXTURES_DIR, "mock-classified.json")).text();

      await Bun.write(RAW_TWEETS_PATH, mockRaw);
      await Bun.write(CLASSIFIED_PATH, mockClassified);
    });

    afterEach(async () => {
      // Restore original files
      if (originalRawTweets !== null) {
        await Bun.write(RAW_TWEETS_PATH, originalRawTweets);
      } else {
        await Bun.file(RAW_TWEETS_PATH).delete().catch(() => {});
      }

      if (originalClassified !== null) {
        await Bun.write(CLASSIFIED_PATH, originalClassified);
      } else {
        await Bun.file(CLASSIFIED_PATH).delete().catch(() => {});
      }
    });

    test("generates report with filtered tweets", async () => {
      const { generateReport } = await import("../scripts/generate-report");
      const result = await generateReport();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const report = result.data!;
      // Should only include tech-related hot topics (2 out of 3)
      expect(report.filtered_tweets.length).toBe(2);
      expect(report.summary.total_fetched).toBe(3);
      expect(report.summary.tech_related).toBe(2);
    });

    test("includes all tweets with --all option", async () => {
      const { generateReport } = await import("../scripts/generate-report");
      const result = await generateReport({ includeAll: true });

      expect(result.success).toBe(true);
      // With includeAll, should include all 3 tweets
      expect(result.data!.filtered_tweets.length).toBe(3);
    });

    test("filters by minimum relevance score", async () => {
      const { generateReport } = await import("../scripts/generate-report");
      const result = await generateReport({ minRelevanceScore: 97 });

      expect(result.success).toBe(true);
      // Only the 98-score tweet should be included
      expect(result.data!.filtered_tweets.length).toBe(1);
      expect(result.data!.filtered_tweets[0].classification.relevance_score).toBe(98);
    });
  });
});
