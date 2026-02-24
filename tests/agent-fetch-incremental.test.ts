import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from "bun:test";
import { fetchIncremental } from "../agent/fetch/incremental";
import { watchlistAdd } from "../scripts/lib/watchlist-db";
import { processedMark, tweetCount } from "../scripts/lib/tweet-db";
import { useTestDB, useRealDB, resetDB } from "../scripts/lib/db";

const createApiTweet = (id: string, createdAt: string, userName: string) => ({
  id,
  text: `tweet ${id}`,
  author: {
    id: `${userName}-id`,
    username: userName,
    name: userName,
    profile_image_url: "",
    followers_count: 1,
    is_verified: false,
  },
  created_at: createdAt,
  url: `https://x.com/${userName}/status/${id}`,
  metrics: {
    retweet_count: 0,
    like_count: 1,
    reply_count: 0,
    quote_count: 0,
    view_count: 10,
    bookmark_count: 0,
  },
  is_retweet: false,
  is_quote: false,
  is_reply: false,
  lang: "en",
  entities: { hashtags: [], mentioned_users: [], urls: [] },
});

describe("agent/fetch/incremental", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeAll(() => {
    useTestDB();
  });

  afterAll(() => {
    useRealDB();
  });

  beforeEach(() => {
    resetDB();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("fetches recent tweets and skips processed", async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const old = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

    watchlistAdd({ username: "alice", url: "https://x.com/alice", added_at: now.toISOString() });
    watchlistAdd({ username: "bob", url: "https://x.com/bob", added_at: now.toISOString() });

    const responseAlice = {
      success: true,
      data: [
        createApiTweet("t1", recent, "alice"),
        createApiTweet("t2", old, "alice"),
      ],
    };

    const responseBob = {
      success: true,
      data: [
        createApiTweet("t3", recent, "bob"),
      ],
    };

    let callIndex = 0;
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(callIndex++ === 0 ? responseAlice : responseBob),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    processedMark("t1", "skipped");

    const result = await fetchIncremental({ hoursBack: 4, batchSize: 2, delayMs: 0 });

    expect(result.success).toBe(true);
    expect(result.newTweets).toBe(1);
    expect(tweetCount()).toBe(1);
  });

  test("includes processed when skipProcessed is false", async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    watchlistAdd({ username: "alice", url: "https://x.com/alice", added_at: now.toISOString() });

    const response = {
      success: true,
      data: [
        createApiTweet("t1", recent, "alice"),
        createApiTweet("t2", recent, "alice"),
      ],
    };

    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(response),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    processedMark("t1", "skipped");

    const result = await fetchIncremental({ hoursBack: 4, batchSize: 2, delayMs: 0, skipProcessed: false });

    expect(result.success).toBe(true);
    expect(result.newTweets).toBe(2);
    expect(tweetCount()).toBe(2);
  });
});
