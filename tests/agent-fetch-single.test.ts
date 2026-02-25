import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from "bun:test";
import { fetchUser, main } from "../agent/fetch/single";
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

describe("agent/fetch/single", () => {
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

  test("filters by hoursBack and skips processed by default", async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const old = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

    const response = {
      success: true,
      data: [
        createApiTweet("t1", recent, "alice"),
        createApiTweet("t2", old, "alice"),
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

    const result = await fetchUser({ user: "alice", hoursBack: 4 });

    expect(result.success).toBe(true);
    expect(result.data?.tweets.length).toBe(0);
    expect(tweetCount()).toBe(0);
  });

  test("returns error on API failure", async () => {
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve("server error"),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const result = await fetchUser({ user: "alice", hoursBack: 4 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("X-Ray API error");
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

    test("exits 1 when no --user given", async () => {
      process.argv = ["bun", "single.ts"];

      const mockFetch = mock(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await expect(main()).rejects.toThrow("EXIT_1");
      expect(exitCode).toBe(1);
    });

    test("exits 0 on successful fetch with --user", async () => {
      const now = new Date();
      const recent = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: [createApiTweet("t1", recent, "alice")],
          }),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      process.argv = ["bun", "single.ts", "--user", "alice", "--hours", "4"];

      await expect(main()).rejects.toThrow("EXIT_0");
      expect(exitCode).toBe(0);
    });

    test("strips @ from --user param", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [] }),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      process.argv = ["bun", "single.ts", "--user", "@bob"];

      await expect(main()).rejects.toThrow("EXIT_0");
      expect(exitCode).toBe(0);

      // Verify the URL contains "bob" not "@bob"
      const url = (mockFetch.mock.calls as unknown as Array<[string]>)[0]![0];
      expect(url).toContain("/bob/");
      expect(url).not.toContain("@");
    });

    test("exits 1 on API failure", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: () => Promise.resolve("server error"),
        } as Response)
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      process.argv = ["bun", "single.ts", "--user", "failuser"];

      await expect(main()).rejects.toThrow("EXIT_1");
      expect(exitCode).toBe(1);
    });
  });
});
