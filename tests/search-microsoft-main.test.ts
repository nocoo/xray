import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { main } from "../agent/research/search-microsoft";

describe("search-microsoft main()", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("searches all 4 terms and writes output", async () => {
    const fakeTweet = {
      id: "t1",
      text: "MSFT is crashing",
      author: { id: "u1", username: "trader", name: "T", profile_image_url: "", followers_count: 500, is_verified: false },
      created_at: new Date().toISOString(),
      url: "https://x.com/trader/status/t1",
      metrics: { retweet_count: 3, like_count: 15, reply_count: 1, quote_count: 0, view_count: 300, bookmark_count: 0 },
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

    // 4 search terms = 4 fetch calls
    expect(mockFetch.mock.calls.length).toBe(4);
  });

  test("handles errors without throwing", async () => {
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve("error"),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await main();

    expect(mockFetch.mock.calls.length).toBe(4);
  });
});
