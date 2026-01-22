import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import type { RawTweetsFile, ClassifiedFile, ReportFile } from "../scripts/lib/types";

const RAW_TWEETS_PATH = join(import.meta.dir, "../data/raw_tweets.json");
const CLASSIFIED_PATH = join(import.meta.dir, "../data/classified.json");
const FIXTURES_DIR = join(import.meta.dir, "fixtures");

describe("generate-report", () => {
  describe("generateReport integration", () => {
    let originalRawTweets: string | null = null;
    let originalClassified: string | null = null;

    beforeEach(async () => {
      const rawFile = Bun.file(RAW_TWEETS_PATH);
      const classifiedFile = Bun.file(CLASSIFIED_PATH);

      if (await rawFile.exists()) {
        originalRawTweets = await rawFile.text();
      }
      if (await classifiedFile.exists()) {
        originalClassified = await classifiedFile.text();
      }

      const mockRaw = await Bun.file(join(FIXTURES_DIR, "mock-raw-tweets.json")).text();
      const mockClassified = await Bun.file(join(FIXTURES_DIR, "mock-classified.json")).text();

      await Bun.write(RAW_TWEETS_PATH, mockRaw);
      await Bun.write(CLASSIFIED_PATH, mockClassified);
    });

    afterEach(async () => {
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

    test("generates report with selected tweets", async () => {
      const { generateReport } = await import("../scripts/generate-report");
      const result = await generateReport();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const report = result.data!;
      expect(report.tweets.length).toBe(3);
      expect(report.summary.total_fetched).toBe(3);
      expect(report.summary.selected_count).toBe(3);
    });

    test("includes reason for each tweet", async () => {
      const { generateReport } = await import("../scripts/generate-report");
      const result = await generateReport();

      expect(result.success).toBe(true);
      const tweet = result.data!.tweets[0];
      expect(tweet.reason).toBeDefined();
      expect(typeof tweet.reason).toBe("string");
    });
  });
});
