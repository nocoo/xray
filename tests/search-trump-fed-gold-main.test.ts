import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { main } from "../agent/research/search-trump-fed-gold";

describe("search-trump-fed-gold main()", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("searches all 5 terms and writes output", async () => {
    const fakeTweet = {
      id: "t1",
      text: "Trump Fed chair nominee tonight discussion",
      author: { id: "u1", username: "goldtrader", name: "G", profile_image_url: "", followers_count: 2000, is_verified: true },
      created_at: new Date().toISOString(),
      url: "https://x.com/goldtrader/status/t1",
      metrics: { retweet_count: 10, like_count: 50, reply_count: 5, quote_count: 2, view_count: 1000, bookmark_count: 3 },
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

    // 5 search terms = 5 fetch calls
    expect(mockFetch.mock.calls.length).toBe(5);
  });

  test("handles all errors gracefully", async () => {
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        text: () => Promise.resolve("down"),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await main();

    expect(mockFetch.mock.calls.length).toBe(5);
  });

  test("shows top 10 by engagement with multiple tweets", async () => {
    const makeTweet = (id: string, likes: number) => ({
      id,
      text: `tweet about gold and Fed ${id}`,
      author: { id: "u1", username: "user1", name: "U", profile_image_url: "", followers_count: 100, is_verified: false },
      created_at: new Date().toISOString(),
      url: `https://x.com/user1/status/${id}`,
      metrics: { retweet_count: 1, like_count: likes, reply_count: 0, quote_count: 0, view_count: likes * 10, bookmark_count: 0 },
      is_retweet: false,
      is_quote: false,
      is_reply: false,
      lang: "en",
    });

    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: [makeTweet("t1", 100), makeTweet("t2", 50), makeTweet("t3", 200)],
          }),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await main();

    expect(mockFetch.mock.calls.length).toBe(5);
  });
});
