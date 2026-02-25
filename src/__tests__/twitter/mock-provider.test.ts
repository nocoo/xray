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

  test("getTweetReplies returns reply tweets for a given tweet", async () => {
    const replies = await provider.getTweetReplies("12345");
    expect(replies.length).toBeGreaterThan(0);
    for (const reply of replies) {
      expect(reply.is_reply).toBe(true);
      expect(reply.reply_to_id).toBe("12345");
      expect(reply.id).toContain("reply");
    }
  });

  // ===========================================================================
  // User content endpoints (API Key only)
  // ===========================================================================

  test("getUserTimeline returns timeline tweets", async () => {
    const tweets = await provider.getUserTimeline("testuser");
    expect(tweets.length).toBeGreaterThan(0);
    for (const tweet of tweets) {
      expect(tweet.id).toContain("timeline");
      expect(tweet.author.username).toBe("testuser");
      expect(tweet.text).toContain("testuser");
    }
  });

  test("getUserReplies returns user reply tweets", async () => {
    const replies = await provider.getUserReplies("testuser");
    expect(replies.length).toBeGreaterThan(0);
    for (const reply of replies) {
      expect(reply.is_reply).toBe(true);
      expect(reply.reply_to_id).toBeDefined();
      expect(reply.author.username).toBe("testuser");
    }
  });

  test("getUserHighlights returns highlighted tweets", async () => {
    const highlights = await provider.getUserHighlights("testuser");
    expect(highlights.length).toBeGreaterThan(0);
    expect(highlights[0].id).toContain("highlight");
    expect(highlights[0].author.username).toBe("testuser");
  });

  // ===========================================================================
  // User connections endpoints (API Key only)
  // ===========================================================================

  test("getUserFollowers returns follower user infos", async () => {
    const followers = await provider.getUserFollowers("testuser");
    expect(followers.length).toBeGreaterThan(0);
    for (const follower of followers) {
      expect(follower.username).toContain("follower");
      expect(follower.id).toBeDefined();
      expect(follower.profile_image_url).toBeDefined();
      expect(follower.followers_count).toBeGreaterThan(0);
    }
  });

  test("getUserFollowing returns following user infos", async () => {
    const following = await provider.getUserFollowing("testuser");
    expect(following.length).toBeGreaterThan(0);
    for (const user of following) {
      expect(user.username).toContain("following");
      expect(user.id).toBeDefined();
    }
  });

  test("getUserAffiliates returns affiliated user infos", async () => {
    const affiliates = await provider.getUserAffiliates("testuser");
    expect(affiliates.length).toBeGreaterThan(0);
    for (const affiliate of affiliates) {
      expect(affiliate.username).toContain("affiliate");
      expect(affiliate.id).toBeDefined();
    }
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

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  test("getInbox returns inbox items with participants and last message", async () => {
    const inbox = await provider.getInbox();
    expect(inbox.length).toBeGreaterThan(0);
    for (const item of inbox) {
      expect(item.conversation_id).toBeDefined();
      expect(item.last_message).toBeDefined();
      expect(item.last_message.id).toBeDefined();
      expect(item.last_message.text).toBeDefined();
      expect(item.last_message.sender_id).toBeDefined();
      expect(item.participants.length).toBeGreaterThan(0);
      expect(item.participants[0].username).toBeDefined();
    }
  });

  test("getConversation returns conversation with messages and participants", async () => {
    const conversation = await provider.getConversation("conv-mock-1");
    expect(conversation.conversation_id).toBe("conv-mock-1");
    expect(conversation.messages.length).toBeGreaterThan(0);
    for (const msg of conversation.messages) {
      expect(msg.id).toBeDefined();
      expect(msg.text).toBeDefined();
      expect(msg.sender_id).toBeDefined();
      expect(msg.recipient_id).toBeDefined();
      expect(msg.created_at).toBeDefined();
    }
    expect(conversation.participants.length).toBeGreaterThan(0);
    expect(conversation.participants[0].username).toBeDefined();
  });

  // ===========================================================================
  // Credits endpoints
  // ===========================================================================

  test("getCredits returns credits balance with remaining and total", async () => {
    const credits = await provider.getCredits();
    expect(credits.remaining).toBeGreaterThan(0);
    expect(credits.total).toBeGreaterThan(0);
    expect(credits.remaining).toBeLessThanOrEqual(credits.total);
    expect(credits.expires_at).toBeDefined();
  });

  test("getCreditsUsage returns usage records with required fields", async () => {
    const usage = await provider.getCreditsUsage();
    expect(usage.length).toBeGreaterThan(0);
    for (const record of usage) {
      expect(record.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(record.endpoint).toBeDefined();
      expect(record.endpoint.length).toBeGreaterThan(0);
      expect(record.credits_used).toBeGreaterThan(0);
      expect(record.request_count).toBeGreaterThan(0);
    }
  });
});
