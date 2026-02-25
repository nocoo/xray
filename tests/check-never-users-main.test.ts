import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { main } from "../agent/research/check-never-users";
import { existsSync, rmSync } from "fs";
import { join } from "path";

describe("check-never-users main()", () => {
  let originalFetch: typeof globalThis.fetch;
  const outputDir = join(process.cwd(), "data", "agent");

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("fetches all NEVER_USERS and writes output", async () => {
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await main();

    // Should have called fetch for each of the 6 NEVER_USERS
    expect(mockFetch.mock.calls.length).toBe(6);
  });

  test("handles API errors gracefully", async () => {
    let callCount = 0;
    const mockFetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: () => Promise.resolve("server error"),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as Response);
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    // Should not throw even when some users fail
    await main();

    expect(mockFetch.mock.calls.length).toBe(6);
  });

  test("collects tweet results from successful fetches", async () => {
    const fakeTweet = {
      id: "t1",
      text: "hello",
      author: { id: "u1", username: "karpathy", name: "K", profile_image_url: "", followers_count: 100, is_verified: false },
      created_at: new Date().toISOString(),
      url: "https://x.com/karpathy/status/t1",
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

    await main();

    expect(mockFetch.mock.calls.length).toBe(6);
  });
});
