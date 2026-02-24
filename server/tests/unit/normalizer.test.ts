// =============================================================================
// Unit Tests - TweAPI Normalizer Pure Functions
// =============================================================================

import { describe, expect, test } from "bun:test";
import {
  normalizeTweet,
  normalizeUserInfo,
  normalizeList,
  normalizeAnalytics,
  parseTimeSeries,
  normalizeAnalyticsWithTimeSeries,
} from "../../src/providers/tweapi/normalizer";
import type {
  TweAPITweet,
  TweAPIAuthor,
  TweAPIList,
  TweAPIAnalytics,
} from "../../src/providers/tweapi/api-types";

// =============================================================================
// Fixtures
// =============================================================================

function makeTweAPIAuthor(overrides?: Partial<TweAPIAuthor>): TweAPIAuthor {
  return {
    id: "author-1",
    userName: "alice",
    fullName: "Alice Wonderland",
    description: "Down the rabbit hole",
    location: "Wonderland",
    profileImage: "https://pbs.twimg.com/alice.jpg",
    profileBanner: "https://pbs.twimg.com/banner_alice.jpg",
    followersCount: 5000,
    followingsCount: 200,
    statusesCount: 1234,
    likeCount: 9999,
    isVerified: true,
    createdAt: "2020-01-01T00:00:00Z",
    pinnedTweet: "pinned-123",
    ...overrides,
  };
}

function makeTweAPITweet(overrides?: Partial<TweAPITweet>): TweAPITweet {
  return {
    id: "tweet-1",
    url: "https://x.com/alice/status/tweet-1",
    fullText: "Hello World!",
    createdAt: "2026-02-24T12:00:00Z",
    lang: "en",
    bookmarkCount: 10,
    likeCount: 42,
    retweetCount: 5,
    replyCount: 3,
    quoteCount: 1,
    viewCount: 1000,
    conversationId: "conv-1",
    tweetBy: makeTweAPIAuthor(),
    entities: {
      hashtags: ["hello"],
      mentionedUsers: ["bob"],
      urls: ["https://example.com"],
    },
    ...overrides,
  };
}

// =============================================================================
// normalizeTweet
// =============================================================================

describe("normalizeTweet", () => {
  test("converts a basic tweet with correct field mapping", () => {
    const raw = makeTweAPITweet();
    const result = normalizeTweet(raw);

    expect(result.id).toBe("tweet-1");
    expect(result.text).toBe("Hello World!");
    expect(result.url).toBe("https://x.com/alice/status/tweet-1");
    expect(result.created_at).toBe("2026-02-24T12:00:00Z");
    expect(result.lang).toBe("en");
    expect(result.is_retweet).toBe(false);
    expect(result.is_quote).toBe(false);
    expect(result.is_reply).toBe(false);
  });

  test("normalizes author (camelCase → snake_case)", () => {
    const result = normalizeTweet(makeTweAPITweet());
    expect(result.author).toEqual({
      id: "author-1",
      username: "alice",
      name: "Alice Wonderland",
      profile_image_url: "https://pbs.twimg.com/alice.jpg",
      followers_count: 5000,
      is_verified: true,
    });
  });

  test("normalizes metrics correctly", () => {
    const result = normalizeTweet(makeTweAPITweet());
    expect(result.metrics).toEqual({
      retweet_count: 5,
      like_count: 42,
      reply_count: 3,
      quote_count: 1,
      view_count: 1000,
      bookmark_count: 10,
    });
  });

  test("normalizes entities", () => {
    const result = normalizeTweet(makeTweAPITweet());
    expect(result.entities).toEqual({
      hashtags: ["hello"],
      mentioned_users: ["bob"],
      urls: ["https://example.com"],
    });
  });

  test("handles missing media gracefully (undefined)", () => {
    const raw = makeTweAPITweet({ media: undefined });
    const result = normalizeTweet(raw);
    expect(result.media).toBeUndefined();
  });

  test("handles empty media array (undefined)", () => {
    const raw = makeTweAPITweet({ media: [] });
    const result = normalizeTweet(raw);
    expect(result.media).toBeUndefined();
  });

  test("normalizes media items", () => {
    const raw = makeTweAPITweet({
      media: [
        { id: "m1", type: "PHOTO", url: "https://img.com/1.jpg", thumbnailUrl: "https://img.com/1_thumb.jpg" },
        { id: "m2", type: "VIDEO", url: "https://vid.com/2.mp4" },
      ],
    });
    const result = normalizeTweet(raw);
    expect(result.media).toHaveLength(2);
    expect(result.media![0]).toEqual({
      id: "m1",
      type: "PHOTO",
      url: "https://img.com/1.jpg",
      thumbnail_url: "https://img.com/1_thumb.jpg",
    });
    expect(result.media![1].thumbnail_url).toBeUndefined();
  });

  test("marks is_reply when replyTo is set", () => {
    const raw = makeTweAPITweet({ replyTo: "parent-tweet-123" });
    const result = normalizeTweet(raw);
    expect(result.is_reply).toBe(true);
    expect(result.reply_to_id).toBe("parent-tweet-123");
  });

  test("handles retweet: uses original tweet data, keeps RT text, sets is_retweet", () => {
    const original = makeTweAPITweet({ id: "original-1", fullText: "Original content" });
    const rt = makeTweAPITweet({
      id: "rt-1",
      fullText: "RT @alice: Original content",
      retweetedTweet: original,
    });
    const result = normalizeTweet(rt);

    expect(result.is_retweet).toBe(true);
    expect(result.text).toBe("RT @alice: Original content");
    // The author, metrics, etc. come from the original tweet
    expect(result.id).toBe("original-1");
  });

  test("handles quote tweet: sets is_quote and quoted_tweet", () => {
    const quoted = makeTweAPITweet({ id: "quoted-1", fullText: "Quoted content" });
    const qt = makeTweAPITweet({
      id: "qt-1",
      fullText: "My take on this",
      quoted: quoted,
    });
    const result = normalizeTweet(qt);

    expect(result.is_quote).toBe(true);
    expect(result.quoted_tweet).toBeDefined();
    expect(result.quoted_tweet!.id).toBe("quoted-1");
    expect(result.quoted_tweet!.text).toBe("Quoted content");
  });

  test("defaults missing metric counts to 0", () => {
    const raw = makeTweAPITweet({
      likeCount: 0,
      retweetCount: 0,
      replyCount: 0,
      quoteCount: 0,
      viewCount: undefined,
      bookmarkCount: 0,
    });
    const result = normalizeTweet(raw);
    expect(result.metrics.view_count).toBe(0);
    expect(result.metrics.like_count).toBe(0);
  });

  test("handles missing entities gracefully", () => {
    const raw = makeTweAPITweet({
      entities: undefined as unknown as TweAPITweet["entities"],
    });
    const result = normalizeTweet(raw);
    expect(result.entities).toEqual({
      hashtags: [],
      mentioned_users: [],
      urls: [],
    });
  });
});

// =============================================================================
// normalizeUserInfo
// =============================================================================

describe("normalizeUserInfo", () => {
  test("converts all fields correctly", () => {
    const raw = makeTweAPIAuthor();
    const result = normalizeUserInfo(raw);

    expect(result).toEqual({
      id: "author-1",
      username: "alice",
      name: "Alice Wonderland",
      description: "Down the rabbit hole",
      location: "Wonderland",
      profile_image_url: "https://pbs.twimg.com/alice.jpg",
      profile_banner_url: "https://pbs.twimg.com/banner_alice.jpg",
      followers_count: 5000,
      following_count: 200,
      tweet_count: 1234,
      like_count: 9999,
      is_verified: true,
      created_at: "2020-01-01T00:00:00Z",
      pinned_tweet_id: "pinned-123",
    });
  });

  test("handles optional fields being undefined", () => {
    const raw = makeTweAPIAuthor({
      description: undefined,
      location: undefined,
      profileBanner: undefined,
      pinnedTweet: undefined,
    });
    const result = normalizeUserInfo(raw);
    expect(result.description).toBeUndefined();
    expect(result.location).toBeUndefined();
    expect(result.profile_banner_url).toBeUndefined();
    expect(result.pinned_tweet_id).toBeUndefined();
  });
});

// =============================================================================
// normalizeList
// =============================================================================

describe("normalizeList", () => {
  test("converts list fields correctly", () => {
    const raw: TweAPIList = {
      id: "list-1",
      name: "AI Researchers",
      description: "Top minds in AI",
      memberCount: 100,
      subscriberCount: 500,
      createdAt: "2025-06-01T00:00:00Z",
      createdBy: "alice",
      isFollowing: true,
      isMember: false,
    };
    const result = normalizeList(raw);
    expect(result).toEqual({
      id: "list-1",
      name: "AI Researchers",
      description: "Top minds in AI",
      member_count: 100,
      subscriber_count: 500,
      created_at: "2025-06-01T00:00:00Z",
      created_by: "alice",
      is_following: true,
      is_member: false,
    });
  });

  test("handles optional fields", () => {
    const raw: TweAPIList = {
      id: "list-2",
      name: "Minimal List",
      memberCount: 0,
      subscriberCount: 0,
      createdAt: "2025-01-01T00:00:00Z",
      createdBy: "bob",
    };
    const result = normalizeList(raw);
    expect(result.description).toBeUndefined();
    expect(result.is_following).toBeUndefined();
    expect(result.is_member).toBeUndefined();
  });
});

// =============================================================================
// normalizeAnalytics
// =============================================================================

describe("normalizeAnalytics", () => {
  test("normalizes analytics with engagement rate calculation", () => {
    const raw: TweAPIAnalytics = {
      createdAt: "2026-02-24T00:00:00Z",
      followers: 5000,
      impressions: 10000,
      profileVisits: 300,
      engagements: 500,
      follows: 200,
      replies: 80,
      likes: 200,
      retweets: 100,
      verifiedFollowers: 50,
      bookmarks: 30,
      shares: 20,
      unfollows: 5,
    };
    const result = normalizeAnalytics(raw);

    expect(result.impressions).toBe(10000);
    expect(result.engagements).toBe(500);
    expect(result.engagement_rate).toBe(5.0); // (500/10000)*100
    expect(result.likes).toBe(200);
    expect(result.retweets).toBe(100);
    expect(result.replies).toBe(80);
    expect(result.profile_visits).toBe(300);
    expect(result.followers).toBe(5000);
    expect(result.following).toBe(200);
    expect(result.verified_followers).toBe(50);
    expect(result.bookmarks).toBe(30);
    expect(result.shares).toBe(20);
    expect(result.unfollows).toBe(5);
  });

  test("engagement rate is 0 when impressions are 0", () => {
    const raw: TweAPIAnalytics = {
      createdAt: "2026-01-01T00:00:00Z",
      followers: 0,
      impressions: 0,
      profileVisits: 0,
      engagements: 0,
    };
    const result = normalizeAnalytics(raw);
    expect(result.engagement_rate).toBe(0);
  });

  test("handles null/undefined optional fields", () => {
    const raw: TweAPIAnalytics = {
      createdAt: "2026-01-01T00:00:00Z",
      followers: 100,
      impressions: 500,
      profileVisits: 10,
      engagements: 25,
      likes: null,
      retweets: null,
      replies: null,
      bookmarks: null,
      shares: null,
      unfollows: null,
    };
    const result = normalizeAnalytics(raw);
    expect(result.likes).toBe(0);
    expect(result.retweets).toBe(0);
    expect(result.replies).toBe(0);
    expect(result.bookmarks).toBeUndefined(); // null ?? undefined
    expect(result.shares).toBeUndefined();
    expect(result.unfollows).toBeUndefined();
  });
});

// =============================================================================
// parseTimeSeries
// =============================================================================

describe("parseTimeSeries", () => {
  test("parses time series metric values correctly", () => {
    const raw: TweAPIAnalytics = {
      createdAt: "2026-02-24T00:00:00Z",
      followers: 100,
      impressions: 500,
      profileVisits: 10,
      engagements: 25,
      organicMetricsTimeSeries: [
        {
          timestamp: { iso8601_time: "2026-02-23T00:00:00Z" },
          metric_values: [
            { metric_type: "Impressions", metric_value: 1500 },
            { metric_type: "Engagements", metric_value: 75 },
            { metric_type: "ProfileVisits", metric_value: 40 },
            { metric_type: "Follows", metric_value: 10 },
            { metric_type: "Likes", metric_value: 30 },
            { metric_type: "Replies", metric_value: 12 },
            { metric_type: "Retweets", metric_value: 15 },
            { metric_type: "Bookmark", metric_value: 5 },
          ],
        },
      ],
    };
    const result = parseTimeSeries(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      date: "2026-02-23",
      impressions: 1500,
      engagements: 75,
      profile_visits: 40,
      follows: 10,
      likes: 30,
      replies: 12,
      retweets: 15,
      bookmarks: 5,
    });
  });

  test("returns empty array when organicMetricsTimeSeries is missing", () => {
    const raw: TweAPIAnalytics = {
      createdAt: "2026-01-01T00:00:00Z",
      followers: 0,
      impressions: 0,
      profileVisits: 0,
      engagements: 0,
    };
    expect(parseTimeSeries(raw)).toEqual([]);
  });

  test("returns empty array when organicMetricsTimeSeries is not an array", () => {
    const raw = {
      createdAt: "2026-01-01T00:00:00Z",
      followers: 0,
      impressions: 0,
      profileVisits: 0,
      engagements: 0,
      organicMetricsTimeSeries: "invalid",
    } as unknown as TweAPIAnalytics;
    expect(parseTimeSeries(raw)).toEqual([]);
  });

  test("handles missing metric_value (defaults to 0)", () => {
    const raw: TweAPIAnalytics = {
      createdAt: "2026-02-24T00:00:00Z",
      followers: 100,
      impressions: 500,
      profileVisits: 10,
      engagements: 25,
      organicMetricsTimeSeries: [
        {
          timestamp: { iso8601_time: "2026-02-24T00:00:00Z" },
          metric_values: [
            { metric_type: "Impressions", metric_value: undefined },
            { metric_type: "Likes" } as { metric_type: string; metric_value?: number },
          ],
        },
      ],
    };
    const result = parseTimeSeries(raw);
    expect(result[0].impressions).toBe(0);
    expect(result[0].likes).toBe(0);
  });

  test("ignores unknown metric types", () => {
    const raw: TweAPIAnalytics = {
      createdAt: "2026-02-24T00:00:00Z",
      followers: 100,
      impressions: 500,
      profileVisits: 10,
      engagements: 25,
      organicMetricsTimeSeries: [
        {
          timestamp: { iso8601_time: "2026-02-24T00:00:00Z" },
          metric_values: [
            { metric_type: "UnknownMetric", metric_value: 999 },
            { metric_type: "Impressions", metric_value: 100 },
          ],
        },
      ],
    };
    const result = parseTimeSeries(raw);
    expect(result[0].impressions).toBe(100);
    // Unknown metric should not appear - all others default to 0
    expect(result[0].engagements).toBe(0);
  });
});

// =============================================================================
// normalizeAnalyticsWithTimeSeries
// =============================================================================

describe("normalizeAnalyticsWithTimeSeries", () => {
  test("combines analytics + time series", () => {
    const raw: TweAPIAnalytics = {
      createdAt: "2026-02-24T00:00:00Z",
      followers: 5000,
      impressions: 10000,
      profileVisits: 300,
      engagements: 500,
      follows: 200,
      likes: 200,
      retweets: 100,
      replies: 80,
      organicMetricsTimeSeries: [
        {
          timestamp: { iso8601_time: "2026-02-24T00:00:00Z" },
          metric_values: [
            { metric_type: "Impressions", metric_value: 1500 },
          ],
        },
      ],
    };
    const result = normalizeAnalyticsWithTimeSeries(raw);

    // Analytics fields present
    expect(result.impressions).toBe(10000);
    expect(result.engagement_rate).toBe(5.0);

    // Time series present
    expect(result.time_series).toHaveLength(1);
    expect(result.time_series[0].date).toBe("2026-02-24");
    expect(result.time_series[0].impressions).toBe(1500);
  });
});
