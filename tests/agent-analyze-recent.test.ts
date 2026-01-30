import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { getRecentTweets } from "../agent/analyze/recent";
import { tweetInsertMany, processedMark } from "../scripts/lib/tweet-db";
import { useTestDB, useRealDB, resetDB } from "../scripts/lib/db";
import type { Tweet } from "../scripts/lib/types";

const createTweet = (id: string, createdAt: string): Tweet => ({
  id,
  text: `tweet ${id}`,
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

describe("agent/analyze/recent", () => {
  beforeAll(() => {
    useTestDB();
  });

  afterAll(() => {
    useRealDB();
  });

  beforeEach(() => {
    resetDB();
  });

  test("filters by time range and skips processed", async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const old = new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString();

    tweetInsertMany([
      createTweet("t1", recent),
      createTweet("t2", old),
    ]);
    processedMark("t1", "skipped");

    const result = await getRecentTweets({ hoursBack: 4, limit: 10, skipProcessed: true });

    expect(result.count).toBe(0);
    expect(result.tweets).toHaveLength(0);
  });

  test("includes unprocessed tweets within range", async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    tweetInsertMany([
      createTweet("t1", recent),
      createTweet("t2", recent),
    ]);

    const result = await getRecentTweets({ hoursBack: 4, limit: 10, skipProcessed: true });

    expect(result.count).toBe(2);
    expect(result.tweets).toHaveLength(2);
  });
});
