import { describe, expect, test } from "bun:test";
import {
  normalizeTweet,
  normalizeUserInfo,
  normalizeList,
  normalizeAnalytics,
  normalizeAnalyticsWithTimeSeries,
  parseTimeSeries,
  normalizeCredits,
  normalizeCreditsUsage,
} from "@/lib/twitter/normalizer";
import type {
  TweAPITweet,
  TweAPIAuthor,
  TweAPIList,
  TweAPIAnalytics,
} from "@/lib/twitter/api-types";
import type {
  TweAPICreditsResponse,
  TweAPICreditsUsageResponse,
} from "@/lib/twitter/api-types";

// =============================================================================
// Fixtures
// =============================================================================

function makeTweAPIAuthor(overrides?: Partial<TweAPIAuthor>): TweAPIAuthor {
  return {
    id: "author-1",
    userName: "testuser",
    fullName: "Test User",
    profileImage: "https://pbs.twimg.com/test.jpg",
    followersCount: 1000,
    followingsCount: 200,
    statusesCount: 500,
    likeCount: 3000,
    isVerified: false,
    createdAt: "2020-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeTweAPITweet(overrides?: Partial<TweAPITweet>): TweAPITweet {
  return {
    id: "tweet-1",
    url: "https://x.com/testuser/status/tweet-1",
    fullText: "Hello world",
    createdAt: "2026-02-24T00:00:00Z",
    lang: "en",
    bookmarkCount: 2,
    likeCount: 42,
    retweetCount: 5,
    replyCount: 3,
    quoteCount: 1,
    viewCount: 1000,
    conversationId: "conv-1",
    tweetBy: makeTweAPIAuthor(),
    entities: { hashtags: [], mentionedUsers: [], urls: [] },
    ...overrides,
  };
}

// =============================================================================
// normalizeTweet
// =============================================================================

describe("normalizeTweet", () => {
  test("converts a basic tweet", () => {
    const result = normalizeTweet(makeTweAPITweet());
    expect(result.id).toBe("tweet-1");
    expect(result.text).toBe("Hello world");
    expect(result.author.username).toBe("testuser");
    expect(result.author.name).toBe("Test User");
    expect(result.metrics.like_count).toBe(42);
    expect(result.metrics.view_count).toBe(1000);
    expect(result.is_retweet).toBe(false);
    expect(result.is_quote).toBe(false);
    expect(result.is_reply).toBe(false);
    expect(result.lang).toBe("en");
  });

  test("handles retweet by flattening original tweet", () => {
    const original = makeTweAPITweet({ id: "original-1", fullText: "Original text" });
    const retweet = makeTweAPITweet({
      id: "rt-1",
      fullText: "RT @testuser: Original text",
      retweetedTweet: original,
    });
    const result = normalizeTweet(retweet);
    expect(result.is_retweet).toBe(true);
    expect(result.text).toBe("RT @testuser: Original text");
    expect(result.id).toBe("original-1");
  });

  test("handles quoted tweet", () => {
    const quoted = makeTweAPITweet({ id: "quoted-1", fullText: "Quoted content" });
    const tweet = makeTweAPITweet({ quoted });
    const result = normalizeTweet(tweet);
    expect(result.is_quote).toBe(true);
    expect(result.quoted_tweet).toBeDefined();
    expect(result.quoted_tweet!.id).toBe("quoted-1");
  });

  test("handles reply", () => {
    const tweet = makeTweAPITweet({ replyTo: "parent-123" });
    const result = normalizeTweet(tweet);
    expect(result.is_reply).toBe(true);
    expect(result.reply_to_id).toBe("parent-123");
  });

  test("maps media correctly", () => {
    const tweet = makeTweAPITweet({
      media: [
        { id: "m1", type: "PHOTO", url: "https://example.com/photo.jpg", thumbnailUrl: "https://example.com/thumb.jpg" },
        { id: "m2", type: "VIDEO", url: "https://example.com/video.mp4" },
      ],
    });
    const result = normalizeTweet(tweet);
    expect(result.media).toHaveLength(2);
    expect(result.media![0].type).toBe("PHOTO");
    expect(result.media![0].thumbnail_url).toBe("https://example.com/thumb.jpg");
    expect(result.media![1].type).toBe("VIDEO");
    expect(result.media![1].thumbnail_url).toBeUndefined();
  });

  test("maps entities correctly", () => {
    const tweet = makeTweAPITweet({
      entities: {
        hashtags: ["ai", "typescript"],
        mentionedUsers: ["elonmusk"],
        urls: ["https://example.com"],
      },
    });
    const result = normalizeTweet(tweet);
    expect(result.entities!.hashtags).toEqual(["ai", "typescript"]);
    expect(result.entities!.mentioned_users).toEqual(["elonmusk"]);
    expect(result.entities!.urls).toEqual(["https://example.com"]);
  });

  test("handles missing optional fields gracefully", () => {
    const tweet = makeTweAPITweet({ viewCount: undefined, media: undefined });
    const result = normalizeTweet(tweet);
    expect(result.metrics.view_count).toBe(0);
    expect(result.media).toBeUndefined();
  });
});

// =============================================================================
// normalizeUserInfo
// =============================================================================

describe("normalizeUserInfo", () => {
  test("converts a TweAPI author to UserInfo", () => {
    const author = makeTweAPIAuthor({
      description: "A test description",
      location: "SF",
      profileBanner: "https://banner.jpg",
      pinnedTweet: "pinned-1",
    });
    const result = normalizeUserInfo(author);
    expect(result.id).toBe("author-1");
    expect(result.username).toBe("testuser");
    expect(result.name).toBe("Test User");
    expect(result.description).toBe("A test description");
    expect(result.location).toBe("SF");
    expect(result.profile_banner_url).toBe("https://banner.jpg");
    expect(result.followers_count).toBe(1000);
    expect(result.following_count).toBe(200);
    expect(result.tweet_count).toBe(500);
    expect(result.like_count).toBe(3000);
    expect(result.pinned_tweet_id).toBe("pinned-1");
  });

  test("handles missing optional fields", () => {
    const author = makeTweAPIAuthor();
    const result = normalizeUserInfo(author);
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
  test("converts a TweAPI list", () => {
    const list: TweAPIList = {
      id: "list-1",
      name: "AI Researchers",
      description: "Top AI folks",
      memberCount: 42,
      subscriberCount: 100,
      createdAt: "2025-01-01T00:00:00Z",
      createdBy: "testuser",
      isFollowing: true,
      isMember: false,
    };
    const result = normalizeList(list);
    expect(result.id).toBe("list-1");
    expect(result.name).toBe("AI Researchers");
    expect(result.member_count).toBe(42);
    expect(result.subscriber_count).toBe(100);
    expect(result.is_following).toBe(true);
    expect(result.is_member).toBe(false);
  });
});

// =============================================================================
// normalizeAnalytics
// =============================================================================

describe("normalizeAnalytics", () => {
  test("computes engagement rate", () => {
    const analytics: TweAPIAnalytics = {
      createdAt: "2026-02-24",
      followers: 5000,
      impressions: 10000,
      profileVisits: 300,
      engagements: 500,
    };
    const result = normalizeAnalytics(analytics);
    expect(result.impressions).toBe(10000);
    expect(result.engagements).toBe(500);
    expect(result.engagement_rate).toBe(5.0);
    expect(result.followers).toBe(5000);
  });

  test("engagement rate is 0 when impressions is 0", () => {
    const analytics: TweAPIAnalytics = {
      createdAt: "2026-02-24",
      followers: 0,
      impressions: 0,
      profileVisits: 0,
      engagements: 0,
    };
    const result = normalizeAnalytics(analytics);
    expect(result.engagement_rate).toBe(0);
  });

  test("handles optional fields with nulls", () => {
    const analytics: TweAPIAnalytics = {
      createdAt: "2026-02-24",
      followers: 100,
      impressions: 1000,
      profileVisits: 10,
      engagements: 50,
      likes: null,
      retweets: null,
      replies: null,
      bookmarks: null,
      shares: null,
      unfollows: null,
    };
    const result = normalizeAnalytics(analytics);
    expect(result.likes).toBe(0);
    expect(result.retweets).toBe(0);
    expect(result.replies).toBe(0);
    expect(result.bookmarks).toBeUndefined();
    expect(result.shares).toBeUndefined();
    expect(result.unfollows).toBeUndefined();
  });
});

// =============================================================================
// parseTimeSeries
// =============================================================================

describe("parseTimeSeries", () => {
  test("parses organic metrics time series", () => {
    const analytics: TweAPIAnalytics = {
      createdAt: "2026-02-24",
      followers: 100,
      impressions: 1000,
      profileVisits: 10,
      engagements: 50,
      organicMetricsTimeSeries: [
        {
          timestamp: { iso8601_time: "2026-02-23T00:00:00Z" },
          metric_values: [
            { metric_type: "Impressions", metric_value: 1500 },
            { metric_type: "Engagements", metric_value: 75 },
            { metric_type: "Likes", metric_value: 30 },
          ],
        },
        {
          timestamp: { iso8601_time: "2026-02-24T00:00:00Z" },
          metric_values: [
            { metric_type: "Impressions", metric_value: 1800 },
            { metric_type: "Retweets", metric_value: 18 },
            { metric_type: "Bookmark", metric_value: 8 },
          ],
        },
      ],
    };
    const result = parseTimeSeries(analytics);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2026-02-23");
    expect(result[0].impressions).toBe(1500);
    expect(result[0].likes).toBe(30);
    expect(result[1].retweets).toBe(18);
    expect(result[1].bookmarks).toBe(8);
  });

  test("returns empty array when no time series", () => {
    const analytics: TweAPIAnalytics = {
      createdAt: "2026-02-24",
      followers: 100,
      impressions: 1000,
      profileVisits: 10,
      engagements: 50,
    };
    expect(parseTimeSeries(analytics)).toEqual([]);
  });
});

// =============================================================================
// normalizeAnalyticsWithTimeSeries
// =============================================================================

describe("normalizeAnalyticsWithTimeSeries", () => {
  test("combines analytics with time series", () => {
    const analytics: TweAPIAnalytics = {
      createdAt: "2026-02-24",
      followers: 5000,
      impressions: 10000,
      profileVisits: 300,
      engagements: 500,
      organicMetricsTimeSeries: [
        {
          timestamp: { iso8601_time: "2026-02-24T00:00:00Z" },
          metric_values: [{ metric_type: "Impressions", metric_value: 1500 }],
        },
      ],
    };
    const result = normalizeAnalyticsWithTimeSeries(analytics);
    expect(result.impressions).toBe(10000);
    expect(result.time_series).toHaveLength(1);
    expect(result.time_series[0].impressions).toBe(1500);
  });
});

// =============================================================================
// normalizeCredits
// =============================================================================

describe("normalizeCredits", () => {
  test("maps TweAPICreditsResponse to Credits", () => {
    const apiResponse: TweAPICreditsResponse = {
      code: 200,
      msg: "ok",
      data: { remaining: 4200, total: 5000, expiresAt: "2026-12-31T23:59:59Z" },
    };
    const result = normalizeCredits(apiResponse);
    expect(result.remaining).toBe(4200);
    expect(result.total).toBe(5000);
    expect(result.expires_at).toBe("2026-12-31T23:59:59Z");
  });

  test("defaults to 0 when data fields are missing", () => {
    const apiResponse = {
      code: 200,
      msg: "ok",
      data: {},
    } as TweAPICreditsResponse;
    const result = normalizeCredits(apiResponse);
    expect(result.remaining).toBe(0);
    expect(result.total).toBe(0);
    expect(result.expires_at).toBeUndefined();
  });

  test("handles missing data property gracefully", () => {
    const apiResponse = { code: 200, msg: "ok" } as TweAPICreditsResponse;
    const result = normalizeCredits(apiResponse);
    expect(result.remaining).toBe(0);
    expect(result.total).toBe(0);
    expect(result.expires_at).toBeUndefined();
  });
});

// =============================================================================
// normalizeCreditsUsage
// =============================================================================

describe("normalizeCreditsUsage", () => {
  test("maps TweAPICreditsUsageResponse to CreditsUsageRecord[]", () => {
    const apiResponse: TweAPICreditsUsageResponse = {
      code: 200,
      msg: "ok",
      data: {
        list: [
          { date: "2026-02-20", endpoint: "/v1/twitter/user/info", creditsUsed: 10, requestCount: 5 },
          { date: "2026-02-21", endpoint: "/v1/twitter/tweet/search", creditsUsed: 30, requestCount: 15 },
        ],
      },
    };
    const result = normalizeCreditsUsage(apiResponse);
    expect(result).toHaveLength(2);
    expect(result[0]!.date).toBe("2026-02-20");
    expect(result[0]!.endpoint).toBe("/v1/twitter/user/info");
    expect(result[0]!.credits_used).toBe(10);
    expect(result[0]!.request_count).toBe(5);
    expect(result[1]!.credits_used).toBe(30);
  });

  test("returns empty array when list is missing", () => {
    const apiResponse = {
      code: 200,
      msg: "ok",
      data: {},
    } as TweAPICreditsUsageResponse;
    const result = normalizeCreditsUsage(apiResponse);
    expect(result).toEqual([]);
  });

  test("returns empty array when data is missing", () => {
    const apiResponse = { code: 200, msg: "ok" } as TweAPICreditsUsageResponse;
    const result = normalizeCreditsUsage(apiResponse);
    expect(result).toEqual([]);
  });
});
