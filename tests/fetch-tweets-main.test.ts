import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from "bun:test";
import { parseArgs, main } from "../scripts/fetch-tweets";
import { useTestDB, useRealDB, resetDB } from "../scripts/lib/db";
import { watchlistAdd } from "../scripts/lib/watchlist-db";

describe("fetch-tweets parseArgs()", () => {
  test("returns empty options for no args", () => {
    const result = parseArgs([]);
    expect(result).toEqual({});
  });

  test("returns skipProcessed: false for --include-processed", () => {
    const result = parseArgs(["--include-processed"]);
    expect(result.skipProcessed).toBe(false);
  });

  test("ignores unknown flags", () => {
    const result = parseArgs(["--unknown", "value"]);
    expect(result).toEqual({});
  });

  test("handles multiple args with --include-processed", () => {
    const result = parseArgs(["--other", "--include-processed", "--more"]);
    expect(result.skipProcessed).toBe(false);
  });
});

describe("fetch-tweets main()", () => {
  let originalArgv: string[];
  let originalFetch: typeof globalThis.fetch;
  let originalExit: typeof process.exit;
  let exitCode: number | undefined;

  beforeAll(() => {
    useTestDB();
  });

  afterAll(() => {
    useRealDB();
  });

  beforeEach(() => {
    resetDB();
    originalArgv = process.argv;
    originalFetch = globalThis.fetch;
    originalExit = process.exit;
    exitCode = undefined;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`EXIT_${code}`);
    }) as typeof process.exit;
  });

  afterEach(() => {
    process.argv = originalArgv;
    globalThis.fetch = originalFetch;
    process.exit = originalExit;
  });

  test("main() exits 1 when watchlist is empty", async () => {
    process.argv = ["bun", "fetch-tweets.ts"];

    // Need to mock fetch since createXRayAPIClient reads config but watchlist is empty
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await expect(main()).rejects.toThrow("EXIT_1");
    expect(exitCode).toBe(1);
  });

  test("main() exits 0 when fetch succeeds", async () => {
    watchlistAdd({
      username: "testuser",
      url: "https://x.com/testuser",
      added_at: new Date().toISOString(),
    });

    const fakeTweet = {
      id: "t1",
      text: "hello world",
      author: { id: "u1", username: "testuser", name: "T", profile_image_url: "", followers_count: 100, is_verified: false },
      created_at: new Date().toISOString(),
      url: "https://x.com/testuser/status/t1",
      metrics: { retweet_count: 0, like_count: 5, reply_count: 0, quote_count: 0, view_count: 100, bookmark_count: 0 },
      is_retweet: false,
      is_quote: false,
      is_reply: false,
      lang: "en",
    };

    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [fakeTweet] }),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    process.argv = ["bun", "fetch-tweets.ts"];

    await expect(main()).rejects.toThrow("EXIT_0");
    expect(exitCode).toBe(0);
  });

  test("main() with --include-processed flag", async () => {
    watchlistAdd({
      username: "testuser",
      url: "https://x.com/testuser",
      added_at: new Date().toISOString(),
    });

    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    process.argv = ["bun", "fetch-tweets.ts", "--include-processed"];

    await expect(main()).rejects.toThrow("EXIT_0");
    expect(exitCode).toBe(0);
  });
});
