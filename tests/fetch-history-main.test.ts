import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { main } from "../agent/research/fetch-history";

describe("fetch-history main()", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("fetches tweets for all NEVER_USERS and computes stats", async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const fakeTweet = (id: string) => ({
      id,
      text: `tweet ${id}`,
      author: { id: "u1", username: "karpathy", name: "K", profile_image_url: "", followers_count: 100, is_verified: false },
      created_at: yesterday.toISOString(),
      url: `https://x.com/karpathy/status/${id}`,
      metrics: { retweet_count: 0, like_count: 5, reply_count: 0, quote_count: 0, view_count: 100, bookmark_count: 0 },
      is_retweet: false,
      is_quote: false,
      is_reply: false,
      lang: "en",
    });

    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [fakeTweet("t1"), fakeTweet("t2")] }),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await main();

    // 36 NEVER_USERS = 36 fetch calls
    expect(mockFetch.mock.calls.length).toBe(36);
  });

  test("handles users with no tweets", async () => {
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await main();

    expect(mockFetch.mock.calls.length).toBe(36);
  });

  test("handles API errors for individual users", async () => {
    let callCount = 0;
    const mockFetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: () => Promise.resolve("error"),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as Response);
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await main();

    expect(mockFetch.mock.calls.length).toBe(36);
  });
});
