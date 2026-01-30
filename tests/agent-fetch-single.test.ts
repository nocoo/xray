import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from "bun:test";
import { fetchUser } from "../agent/fetch/single";
import { processedMark, tweetCount } from "../scripts/lib/tweet-db";
import { useTestDB, useRealDB, resetDB } from "../scripts/lib/db";

const createApiTweet = (id: string, createdAt: string, userName: string) => ({
  id,
  url: `https://x.com/${userName}/status/${id}`,
  fullText: `tweet ${id}`,
  createdAt,
  lang: "en",
  bookmarkCount: 0,
  likeCount: 1,
  retweetCount: 0,
  replyCount: 0,
  quoteCount: 0,
  viewCount: 10,
  conversationId: id,
  tweetBy: {
    id: `${userName}-id`,
    userName,
    fullName: userName,
    profileImage: "",
    followersCount: 1,
    followingsCount: 1,
    statusesCount: 1,
    likeCount: 1,
    isVerified: false,
    createdAt: "2020-01-01T00:00:00.000Z",
  },
  entities: { hashtags: [], mentionedUsers: [], urls: [] },
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
      code: 201,
      msg: "ok",
      data: {
        list: [
          createApiTweet("t1", recent, "alice"),
          createApiTweet("t2", old, "alice"),
        ],
      },
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
      } as Response)
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const result = await fetchUser({ user: "alice", hoursBack: 4 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("API error");
  });
});
