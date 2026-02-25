import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import type { Mock } from "bun:test";
import { deduplicateTweets, fetchAllTweets, type FetchOptions } from "../scripts/fetch-tweets";
import type { Tweet } from "../scripts/lib/types";
import { useTestDB, useRealDB, resetDB } from "../scripts/lib/db";
import { watchlistAdd } from "../scripts/lib/watchlist-db";
import { tweetInsert, processedMark, tweetGet } from "../scripts/lib/tweet-db";

describe("fetch-tweets", () => {
  const createMockTweet = (id: string, createdAt: string, overrides: Partial<Tweet> = {}): Tweet => ({
    id,
    text: `Tweet ${id}`,
    author: {
      id: "123",
      username: "testuser",
      name: "Test User",
    },
    created_at: createdAt,
    url: `https://x.com/testuser/status/${id}`,
    metrics: {
      retweet_count: 0,
      like_count: 0,
      reply_count: 0,
      quote_count: 0,
      view_count: 0,
      bookmark_count: 0,
    },
    is_retweet: false,
    is_quote: false,
    is_reply: false,
    ...overrides,
  });

  describe("deduplicateTweets", () => {
    test("removes duplicate tweets by ID", () => {
      const tweets: Tweet[] = [
        createMockTweet("1", "2026-01-21T10:00:00.000Z"),
        createMockTweet("2", "2026-01-21T09:00:00.000Z"),
        createMockTweet("1", "2026-01-21T10:00:00.000Z"), // duplicate
        createMockTweet("3", "2026-01-21T08:00:00.000Z"),
      ];

      const result = deduplicateTweets(tweets);

      expect(result).toHaveLength(3);
      expect(result.map((t) => t.id)).toEqual(["1", "2", "3"]);
    });

    test("preserves first occurrence", () => {
      const tweet1 = createMockTweet("1", "2026-01-21T10:00:00.000Z");
      tweet1.text = "First occurrence";

      const tweet1Dup = createMockTweet("1", "2026-01-21T10:00:00.000Z");
      tweet1Dup.text = "Duplicate";

      const result = deduplicateTweets([tweet1, tweet1Dup]);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("First occurrence");
    });

    test("handles empty array", () => {
      expect(deduplicateTweets([])).toEqual([]);
    });
  });

  // ===========================================================================
  // fetchAllTweets integration tests (uses test DB + mocked modules)
  // ===========================================================================

  describe("fetchAllTweets", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      useTestDB();
      resetDB();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      useRealDB();
    });

    function mockXRayAPI(tweetsMap: Record<string, Tweet[]>) {
      globalThis.fetch = mock(async (url: string) => {
        // Parse username from /api/twitter/users/{username}/tweets
        const match = url.match(/\/api\/twitter\/users\/([^/]+)\/tweets/);
        if (match) {
          const username = match[1];
          const tweets = tweetsMap[username] || [];
          return new Response(
            JSON.stringify({ success: true, data: tweets }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ success: false, error: "Not found" }),
          { status: 404, headers: { "content-type": "application/json" } },
        );
      }) as unknown as typeof fetch;
    }

    function mockConfig() {
      // fetchAllTweets calls loadConfig() which reads config/config.json
      // and createXRayAPIClient() which reads config/api-key.json
      // We need both to exist. Since useTestDB is active, we need
      // to ensure these config files exist or mock them.
      // The simplest approach: mock the module imports isn't easy in bun,
      // so we'll write temporary config files.
    }

    test("returns error when watchlist is empty", async () => {
      // Write temp config files for loadConfig and createXRayAPIClient
      const { join } = await import("path");
      const configDir = join(import.meta.dir, "../config");
      const configPath = join(configDir, "config.json");
      const apiKeyPath = join(configDir, "api-key.json");

      const configExists = await Bun.file(configPath).exists();
      const apiKeyExists = await Bun.file(apiKeyPath).exists();

      if (!configExists || !apiKeyExists) {
        // Skip if config files don't exist (CI/fresh clone)
        return;
      }

      const result = await fetchAllTweets();
      expect(result.success).toBe(false);
      expect(result.error).toBe("EMPTY_WATCHLIST");
      expect(result.message).toContain("Watchlist is empty");
    });

    test("fetches tweets from watchlist users and saves to DB", async () => {
      const { join } = await import("path");
      const configDir = join(import.meta.dir, "../config");
      const configPath = join(configDir, "config.json");
      const apiKeyPath = join(configDir, "api-key.json");

      const configExists = await Bun.file(configPath).exists();
      const apiKeyExists = await Bun.file(apiKeyPath).exists();

      if (!configExists || !apiKeyExists) {
        return; // Skip if config files don't exist
      }

      // Add user to watchlist
      watchlistAdd({
        username: "alice",
        url: "https://x.com/alice",
        added_at: new Date().toISOString(),
      });

      const now = new Date();
      const recentTime = now.toISOString();

      // Mock API to return tweets
      mockXRayAPI({
        alice: [
          createMockTweet("t1", recentTime, {
            author: { id: "a1", username: "alice", name: "Alice" },
          }),
          createMockTweet("t2", recentTime, {
            author: { id: "a1", username: "alice", name: "Alice" },
          }),
        ],
      });

      const result = await fetchAllTweets();
      expect(result.success).toBe(true);
      expect(result.message).toContain("Fetched 2 new tweet(s)");

      // Verify tweets are saved in DB
      const t1 = tweetGet("t1");
      expect(t1).not.toBeNull();
      expect(t1!.author_username).toBe("alice");
    });

    test("skips processed tweets by default", async () => {
      const { join } = await import("path");
      const configDir = join(import.meta.dir, "../config");
      const configPath = join(configDir, "config.json");
      const apiKeyPath = join(configDir, "api-key.json");

      const configExists = await Bun.file(configPath).exists();
      const apiKeyExists = await Bun.file(apiKeyPath).exists();

      if (!configExists || !apiKeyExists) {
        return;
      }

      // Add user to watchlist
      watchlistAdd({
        username: "bob",
        url: "https://x.com/bob",
        added_at: new Date().toISOString(),
      });

      // Insert an old tweet and mark as processed
      const oldTweet = createMockTweet("old1", new Date().toISOString(), {
        author: { id: "b1", username: "bob", name: "Bob" },
      });
      tweetInsert(oldTweet);
      processedMark("old1", "selected");

      const now = new Date().toISOString();

      // Mock API returns both old and new tweets
      mockXRayAPI({
        bob: [
          createMockTweet("old1", now, {
            author: { id: "b1", username: "bob", name: "Bob" },
          }),
          createMockTweet("new1", now, {
            author: { id: "b1", username: "bob", name: "Bob" },
          }),
        ],
      });

      const result = await fetchAllTweets({ skipProcessed: true });
      expect(result.success).toBe(true);
      expect(result.message).toContain("1 skipped as already processed");
    });

    test("handles API errors gracefully", async () => {
      const { join } = await import("path");
      const configDir = join(import.meta.dir, "../config");
      const configPath = join(configDir, "config.json");
      const apiKeyPath = join(configDir, "api-key.json");

      const configExists = await Bun.file(configPath).exists();
      const apiKeyExists = await Bun.file(apiKeyPath).exists();

      if (!configExists || !apiKeyExists) {
        return;
      }

      watchlistAdd({
        username: "erroruser",
        url: "https://x.com/erroruser",
        added_at: new Date().toISOString(),
      });

      // Mock API to throw error
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response("Server error", { status: 500 }),
        ),
      ) as unknown as typeof fetch;

      const result = await fetchAllTweets();
      expect(result.success).toBe(true);
      expect(result.data!.errors).toBeDefined();
      expect(result.data!.errors!.length).toBe(1);
      expect(result.data!.errors![0].username).toBe("erroruser");
    });

    test("filters retweets when config says so", async () => {
      const { join } = await import("path");
      const configDir = join(import.meta.dir, "../config");
      const configPath = join(configDir, "config.json");
      const apiKeyPath = join(configDir, "api-key.json");

      const configExists = await Bun.file(configPath).exists();
      const apiKeyExists = await Bun.file(apiKeyPath).exists();

      if (!configExists || !apiKeyExists) {
        return;
      }

      // Read existing config to check filter_retweets_without_comment setting
      const config = await Bun.file(configPath).json();

      watchlistAdd({
        username: "charlie",
        url: "https://x.com/charlie",
        added_at: new Date().toISOString(),
      });

      const now = new Date().toISOString();
      mockXRayAPI({
        charlie: [
          createMockTweet("rt1", now, {
            author: { id: "c1", username: "charlie", name: "Charlie" },
            is_retweet: true,
          }),
          createMockTweet("orig1", now, {
            author: { id: "c1", username: "charlie", name: "Charlie" },
          }),
        ],
      });

      const result = await fetchAllTweets();
      expect(result.success).toBe(true);

      if (config.classification.filter_retweets_without_comment) {
        // Retweets should be filtered
        expect(result.message).toContain("1 new tweet(s)");
      }
    });

    test("deduplicates tweets from multiple users", async () => {
      const { join } = await import("path");
      const configDir = join(import.meta.dir, "../config");
      const configPath = join(configDir, "config.json");
      const apiKeyPath = join(configDir, "api-key.json");

      const configExists = await Bun.file(configPath).exists();
      const apiKeyExists = await Bun.file(apiKeyPath).exists();

      if (!configExists || !apiKeyExists) {
        return;
      }

      watchlistAdd({
        username: "user1",
        url: "https://x.com/user1",
        added_at: new Date().toISOString(),
      });
      watchlistAdd({
        username: "user2",
        url: "https://x.com/user2",
        added_at: new Date().toISOString(),
      });

      const now = new Date().toISOString();
      // Same tweet appears in both users' timelines
      const sharedTweet = createMockTweet("shared1", now, {
        author: { id: "u1", username: "user1", name: "User 1" },
      });

      mockXRayAPI({
        user1: [sharedTweet],
        user2: [sharedTweet, createMockTweet("unique1", now, {
          author: { id: "u2", username: "user2", name: "User 2" },
        })],
      });

      const result = await fetchAllTweets();
      expect(result.success).toBe(true);
      // Should deduplicate: shared1 + unique1 = 2 tweets
      expect(result.message).toContain("2 new tweet(s)");
    });
  });
});

