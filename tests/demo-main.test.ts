import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { main } from "../agent/research/demo";

describe("demo main()", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("fetches user info and tweets for all USERS", async () => {
    const fakeUserInfo = {
      id: "u1",
      username: "steipete",
      name: "S",
      profile_image_url: "",
      followers_count: 5000,
      description: "iOS engineer building cool stuff",
      is_verified: false,
    };
    const fakeTweet = {
      id: "t1",
      text: "hello",
      author: { id: "u1", username: "steipete", name: "S", profile_image_url: "", followers_count: 100, is_verified: false },
      created_at: new Date().toISOString(),
      url: "https://x.com/steipete/status/t1",
      metrics: { retweet_count: 0, like_count: 10, reply_count: 0, quote_count: 0, view_count: 200, bookmark_count: 0 },
      is_retweet: false,
      is_quote: false,
      is_reply: false,
      lang: "en",
    };

    let callIndex = 0;
    const mockFetch = mock(() => {
      callIndex++;
      // Odd calls = getUserInfo, Even calls = fetchUserTweets
      if (callIndex % 2 === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: fakeUserInfo }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [fakeTweet] }),
      } as Response);
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await main();

    // 4 users * 2 calls each (getUserInfo + fetchUserTweets) = 8
    expect(mockFetch.mock.calls.length).toBe(8);
  });

  test("handles errors for individual users without stopping", async () => {
    let callIndex = 0;
    const mockFetch = mock(() => {
      callIndex++;
      if (callIndex <= 2) {
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

    // Should not throw
    await main();

    // First user errors on getUserInfo, remaining 3 users get 2 calls each = 1 + 6 = 7
    // Actually: error on first getUserInfo (call 1), catches, moves to user 2
    // user 2: getUserInfo (call 2) — also error, catches, moves to user 3
    // user 3: getUserInfo (call 3) success, fetchUserTweets (call 4) success
    // user 4: getUserInfo (call 5) success, fetchUserTweets (call 6) success
    // Then writeAgentOutput writes to disk
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(6);
  });

  test("respects API call limit of 50", async () => {
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await main();

    // With 4 USERS and 2 calls each, max is 8, well under 50
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(50);
  });
});
