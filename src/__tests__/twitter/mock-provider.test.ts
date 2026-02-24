import { describe, expect, test } from "bun:test";
import { MockTwitterProvider } from "@/lib/twitter/mock-provider";

describe("MockTwitterProvider", () => {
  const provider = new MockTwitterProvider();

  // ===========================================================================
  // Public endpoints
  // ===========================================================================

  test("fetchUserTweets returns deterministic mock data", async () => {
    const tweets = await provider.fetchUserTweets("testuser");
    expect(tweets.length).toBeGreaterThan(0);
    for (const tweet of tweets) {
      expect(tweet.id).toBeDefined();
      expect(tweet.text).toBeDefined();
      expect(tweet.author.username).toBe("testuser");
      expect(tweet.metrics).toBeDefined();
    }
  });

  test("fetchUserTweets respects count option", async () => {
    const tweets = await provider.fetchUserTweets("testuser", { count: 5 });
    expect(tweets).toHaveLength(5);
  });

  test("searchTweets returns results matching query", async () => {
    const tweets = await provider.searchTweets("ai agents");
    expect(tweets.length).toBeGreaterThan(0);
    for (const tweet of tweets) {
      expect(tweet.id).toBeDefined();
      expect(tweet.text).toContain("ai agents");
    }
  });

  test("searchTweets respects count option", async () => {
    const tweets = await provider.searchTweets("test", { count: 7 });
    expect(tweets).toHaveLength(7);
  });

  test("getUserInfo returns deterministic user info", async () => {
    const info = await provider.getUserInfo("testuser");
    expect(info.username).toBe("testuser");
    expect(info.followers_count).toBeGreaterThan(0);
    expect(info.profile_image_url).toBeDefined();
  });

  test("getTweetDetails returns a tweet with matching id", async () => {
    const tweet = await provider.getTweetDetails("12345");
    expect(tweet.id).toBe("12345");
    expect(tweet.text).toBeDefined();
  });

  test("searchUserTweets returns results", async () => {
    const tweets = await provider.searchUserTweets("testuser", "ai");
    expect(tweets.length).toBeGreaterThan(0);
    expect(tweets[0].author.username).toBe("testuser");
  });

  // ===========================================================================
  // Authenticated endpoints
  // ===========================================================================

  test("getUserAnalytics returns analytics with time series", async () => {
    const analytics = await provider.getUserAnalytics();
    expect(analytics.impressions).toBeGreaterThan(0);
    expect(analytics.engagement_rate).toBeGreaterThan(0);
    expect(analytics.time_series).toBeDefined();
    expect(analytics.time_series.length).toBeGreaterThan(0);
    for (const day of analytics.time_series) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("getUserBookmarks returns bookmarked tweets", async () => {
    const tweets = await provider.getUserBookmarks();
    expect(tweets.length).toBeGreaterThan(0);
  });

  test("getUserLikes returns liked tweets", async () => {
    const tweets = await provider.getUserLikes();
    expect(tweets.length).toBeGreaterThan(0);
  });

  test("getUserLists returns lists", async () => {
    const lists = await provider.getUserLists();
    expect(lists.length).toBeGreaterThan(0);
    expect(lists[0].name).toBeDefined();
    expect(lists[0].member_count).toBeGreaterThan(0);
  });
});
