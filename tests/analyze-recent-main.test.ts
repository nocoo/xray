import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { main } from "../agent/analyze/recent";
import { tweetInsertMany } from "../scripts/lib/tweet-db";
import { useTestDB, useRealDB, resetDB } from "../scripts/lib/db";
import type { Tweet } from "../scripts/lib/types";

const createTweet = (id: string, createdAt: string): Tweet => ({
  id,
  text: `tweet ${id} with some content that is long enough to be truncated in the output`,
  author: {
    id: "author",
    username: "alice",
    name: "Alice",
    profile_image_url: "",
    followers_count: 0,
    is_verified: false,
  },
  created_at: createdAt,
  url: `https://x.com/alice/status/${id}`,
  metrics: {
    retweet_count: 0,
    like_count: 0,
    reply_count: 0,
    quote_count: 0,
    view_count: 0,
    bookmark_count: 0,
  },
  is_retweet: false,
  is_quote: false,
  is_reply: false,
  lang: "en",
});

describe("agent/analyze/recent main()", () => {
  let originalArgv: string[];

  beforeAll(() => {
    useTestDB();
  });

  afterAll(() => {
    useRealDB();
  });

  beforeEach(() => {
    resetDB();
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  test("main() with default args", async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    tweetInsertMany([createTweet("t1", recent), createTweet("t2", recent)]);

    process.argv = ["bun", "agent/analyze/recent.ts"];

    const result = await main();

    expect(result.count).toBe(2);
    expect(result.tweets).toHaveLength(2);
  });

  test("main() with --hours flag", async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const old = new Date(now.getTime() - 10 * 60 * 60 * 1000).toISOString();

    tweetInsertMany([createTweet("t1", recent), createTweet("t2", old)]);

    process.argv = ["bun", "agent/analyze/recent.ts", "--hours", "2"];

    const result = await main();

    expect(result.count).toBe(1);
    expect(result.tweets).toHaveLength(1);
  });

  test("main() with --limit flag", async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    tweetInsertMany([
      createTweet("t1", recent),
      createTweet("t2", recent),
      createTweet("t3", recent),
    ]);

    process.argv = ["bun", "agent/analyze/recent.ts", "--limit", "2"];

    const result = await main();

    // limit controls how many tweets are fetched from DB, then filtered by time
    expect(result.count).toBeLessThanOrEqual(2);
  });

  test("main() with both --hours and --limit", async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    tweetInsertMany([createTweet("t1", recent)]);

    process.argv = ["bun", "agent/analyze/recent.ts", "--hours", "4", "--limit", "10"];

    const result = await main();

    expect(result.count).toBe(1);
  });

  test("main() returns empty when no tweets in range", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

    tweetInsertMany([createTweet("t1", old)]);

    process.argv = ["bun", "agent/analyze/recent.ts", "--hours", "4"];

    const result = await main();

    expect(result.count).toBe(0);
  });
});
