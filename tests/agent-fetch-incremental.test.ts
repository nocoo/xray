import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from "bun:test";
import { fetchIncremental, main } from "../agent/fetch/incremental";
import { watchlistAdd } from "../scripts/lib/watchlist-db";
import { processedMark, tweetCount, processedCount } from "../scripts/lib/tweet-db";
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

  test("reports errors from failed user fetches", async () => {
    const now = new Date();
    watchlistAdd({ username: "erroruser", url: "https://x.com/erroruser", added_at: now.toISOString() });

    const mockFetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve("Server error"),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const result = await fetchIncremental({ hoursBack: 4, batchSize: 2, delayMs: 0 });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("@erroruser");
  });

  test("uses delay between fetches", async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    watchlistAdd({ username: "user1", url: "https://x.com/user1", added_at: now.toISOString() });
    watchlistAdd({ username: "user2", url: "https://x.com/user2", added_at: now.toISOString() });

    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: [createApiTweet("t1", recent, "user1")],
        }),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const startTime = Date.now();
    const result = await fetchIncremental({ hoursBack: 4, batchSize: 10, delayMs: 10 });
    const elapsed = Date.now() - startTime;

    expect(result.success).toBe(true);
    // With 2 users and 10ms delay, should take at least 20ms
    expect(elapsed).toBeGreaterThanOrEqual(15);
  });

  describe("main()", () => {
    let originalArgv: string[];
    let originalExit: typeof process.exit;
    let exitCode: number | undefined;

    beforeEach(() => {
      originalArgv = process.argv;
      originalExit = process.exit;
      exitCode = undefined;
      process.exit = ((code?: number) => {
        exitCode = code ?? 0;
        throw new Error(`EXIT_${code}`);
      }) as typeof process.exit;
    });

    afterEach(() => {
      process.argv = originalArgv;
      process.exit = originalExit;
    });

    test("exits 0 when all users succeed", async () => {
      const now = new Date();
      const recent = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

      watchlistAdd({ username: "charlie", url: "https://x.com/charlie", added_at: now.toISOString() });

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: [createApiTweet("t10", recent, "charlie")],
          }),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      process.argv = ["bun", "incremental.ts"];

      await expect(main()).rejects.toThrow("EXIT_0");
      expect(exitCode).toBe(0);
    });

    test("exits 1 when errors occur", async () => {
      const now = new Date();
      watchlistAdd({ username: "failuser", url: "https://x.com/failuser", added_at: now.toISOString() });

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: () => Promise.resolve("error"),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      process.argv = ["bun", "incremental.ts"];

      await expect(main()).rejects.toThrow("EXIT_1");
      expect(exitCode).toBe(1);
    });

    test("parses --hours and --batch args", async () => {
      const now = new Date();
      watchlistAdd({ username: "user1", url: "https://x.com/user1", added_at: now.toISOString() });
      watchlistAdd({ username: "user2", url: "https://x.com/user2", added_at: now.toISOString() });

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [] }),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      process.argv = ["bun", "incremental.ts", "--hours", "8", "--batch", "1"];

      await expect(main()).rejects.toThrow("EXIT_0");
      expect(exitCode).toBe(0);
    });
  });
});
