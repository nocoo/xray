import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { main } from "../agent/research/search-fed-candidates";

describe("search-fed-candidates main()", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("searches all 7 terms and writes output", async () => {
    const fakeTweet = {
      id: "t1",
      text: "Kevin Hassett could be next Fed chair",
      author: { id: "u1", username: "analyst", name: "A", profile_image_url: "", followers_count: 1000, is_verified: false },
      created_at: new Date().toISOString(),
      url: "https://x.com/analyst/status/t1",
      metrics: { retweet_count: 5, like_count: 20, reply_count: 2, quote_count: 1, view_count: 500, bookmark_count: 0 },
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

    // 7 search terms = 7 fetch calls
    expect(mockFetch.mock.calls.length).toBe(7);
  });

  test("handles search errors gracefully", async () => {
    let callCount = 0;
    const mockFetch = mock(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve({
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
          text: () => Promise.resolve("rate limited"),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as Response);
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await main();

    expect(mockFetch.mock.calls.length).toBe(7);
  });

  test("handles empty search results", async () => {
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await main();

    expect(mockFetch.mock.calls.length).toBe(7);
  });
});
