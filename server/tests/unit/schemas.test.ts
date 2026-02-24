// =============================================================================
// Unit Tests - Zod Schemas (request validation & response shapes)
// =============================================================================

import { describe, expect, test } from "bun:test";
import {
  UsernameParamsSchema,
  TweetIdParamsSchema,
  FetchTweetsQuerySchema,
  SearchQuerySchema,
  SearchUserTweetsQuerySchema,
  TweetSchema,
  UserInfoSchema,
  TwitterListSchema,
  DailyMetricsSchema,
} from "../../src/schemas/twitter";
import { ErrorResponseSchema } from "../../src/schemas/common";

// =============================================================================
// UsernameParamsSchema
// =============================================================================

describe("UsernameParamsSchema", () => {
  test("accepts valid usernames", () => {
    expect(UsernameParamsSchema.safeParse({ username: "elonmusk" }).success).toBe(true);
    expect(UsernameParamsSchema.safeParse({ username: "a" }).success).toBe(true);
    expect(UsernameParamsSchema.safeParse({ username: "user_123" }).success).toBe(true);
    expect(UsernameParamsSchema.safeParse({ username: "A1b2C3d4E5f6G7h" }).success).toBe(true); // 15 chars
  });

  test("rejects empty username", () => {
    expect(UsernameParamsSchema.safeParse({ username: "" }).success).toBe(false);
  });

  test("rejects username longer than 15 characters", () => {
    expect(UsernameParamsSchema.safeParse({ username: "a".repeat(16) }).success).toBe(false);
  });

  test("rejects usernames with invalid characters", () => {
    expect(UsernameParamsSchema.safeParse({ username: "user name" }).success).toBe(false);
    expect(UsernameParamsSchema.safeParse({ username: "user@name" }).success).toBe(false);
    expect(UsernameParamsSchema.safeParse({ username: "user.name" }).success).toBe(false);
    expect(UsernameParamsSchema.safeParse({ username: "用户" }).success).toBe(false);
  });

  test("rejects missing username", () => {
    expect(UsernameParamsSchema.safeParse({}).success).toBe(false);
  });
});

// =============================================================================
// TweetIdParamsSchema
// =============================================================================

describe("TweetIdParamsSchema", () => {
  test("accepts valid tweet IDs", () => {
    expect(TweetIdParamsSchema.safeParse({ id: "1234567890" }).success).toBe(true);
    expect(TweetIdParamsSchema.safeParse({ id: "1" }).success).toBe(true);
  });

  test("rejects empty ID", () => {
    expect(TweetIdParamsSchema.safeParse({ id: "" }).success).toBe(false);
  });

  test("rejects missing ID", () => {
    expect(TweetIdParamsSchema.safeParse({}).success).toBe(false);
  });
});

// =============================================================================
// FetchTweetsQuerySchema
// =============================================================================

describe("FetchTweetsQuerySchema", () => {
  test("accepts valid count as string (query params are strings)", () => {
    const result = FetchTweetsQuerySchema.safeParse({ count: "20" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.count).toBe(20);
    }
  });

  test("accepts missing count (optional)", () => {
    const result = FetchTweetsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.count).toBeUndefined();
    }
  });

  test("rejects count below 1", () => {
    expect(FetchTweetsQuerySchema.safeParse({ count: "0" }).success).toBe(false);
    expect(FetchTweetsQuerySchema.safeParse({ count: "-1" }).success).toBe(false);
  });

  test("rejects count above 100", () => {
    expect(FetchTweetsQuerySchema.safeParse({ count: "101" }).success).toBe(false);
  });

  test("rejects non-integer count", () => {
    expect(FetchTweetsQuerySchema.safeParse({ count: "3.5" }).success).toBe(false);
  });

  test("rejects non-numeric count", () => {
    expect(FetchTweetsQuerySchema.safeParse({ count: "abc" }).success).toBe(false);
  });
});

// =============================================================================
// SearchQuerySchema
// =============================================================================

describe("SearchQuerySchema", () => {
  test("accepts valid search query", () => {
    const result = SearchQuerySchema.safeParse({ q: "AI agents" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.q).toBe("AI agents");
      expect(result.data.sort_by_top).toBe(false); // default
    }
  });

  test("rejects empty search query", () => {
    expect(SearchQuerySchema.safeParse({ q: "" }).success).toBe(false);
  });

  test("rejects missing search query", () => {
    expect(SearchQuerySchema.safeParse({}).success).toBe(false);
  });

  test("transforms sort_by_top string to boolean", () => {
    const resultTrue = SearchQuerySchema.safeParse({ q: "test", sort_by_top: "true" });
    expect(resultTrue.success).toBe(true);
    if (resultTrue.success) {
      expect(resultTrue.data.sort_by_top).toBe(true);
    }

    const resultFalse = SearchQuerySchema.safeParse({ q: "test", sort_by_top: "false" });
    expect(resultFalse.success).toBe(true);
    if (resultFalse.success) {
      expect(resultFalse.data.sort_by_top).toBe(false);
    }
  });

  test("accepts count parameter", () => {
    const result = SearchQuerySchema.safeParse({ q: "test", count: "50" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.count).toBe(50);
    }
  });
});

// =============================================================================
// SearchUserTweetsQuerySchema
// =============================================================================

describe("SearchUserTweetsQuerySchema", () => {
  test("accepts valid query", () => {
    const result = SearchUserTweetsQuerySchema.safeParse({ q: "AI" });
    expect(result.success).toBe(true);
  });

  test("rejects empty query", () => {
    expect(SearchUserTweetsQuerySchema.safeParse({ q: "" }).success).toBe(false);
  });
});

// =============================================================================
// Response Schemas (validate outgoing data shapes)
// =============================================================================

describe("TweetSchema", () => {
  const validTweet = {
    id: "123",
    text: "Hello World",
    author: {
      id: "author-1",
      username: "alice",
      name: "Alice",
    },
    created_at: "2026-02-24T12:00:00Z",
    url: "https://x.com/alice/status/123",
    metrics: {
      retweet_count: 5,
      like_count: 42,
      reply_count: 3,
      quote_count: 1,
      view_count: 1000,
      bookmark_count: 2,
    },
    is_retweet: false,
    is_quote: false,
    is_reply: false,
  };

  test("accepts a valid tweet", () => {
    expect(TweetSchema.safeParse(validTweet).success).toBe(true);
  });

  test("accepts tweet with optional fields", () => {
    const tweetWithOptionals = {
      ...validTweet,
      lang: "en",
      media: [{ id: "m1", type: "PHOTO", url: "https://img.com/1.jpg" }],
      entities: { hashtags: ["hello"], mentioned_users: [], urls: [] },
      reply_to_id: "parent-123",
    };
    expect(TweetSchema.safeParse(tweetWithOptionals).success).toBe(true);
  });

  test("accepts tweet with nested quoted_tweet", () => {
    const tweetWithQuote = {
      ...validTweet,
      is_quote: true,
      quoted_tweet: { ...validTweet, id: "quoted-1" },
    };
    expect(TweetSchema.safeParse(tweetWithQuote).success).toBe(true);
  });

  test("rejects tweet missing required fields", () => {
    const { id, ...missingId } = validTweet;
    expect(TweetSchema.safeParse(missingId).success).toBe(false);
  });

  test("rejects invalid media type", () => {
    const tweetBadMedia = {
      ...validTweet,
      media: [{ id: "m1", type: "AUDIO", url: "https://audio.com/1.mp3" }],
    };
    expect(TweetSchema.safeParse(tweetBadMedia).success).toBe(false);
  });
});

describe("UserInfoSchema", () => {
  const validUser = {
    id: "user-1",
    username: "alice",
    name: "Alice Wonderland",
    profile_image_url: "https://pbs.twimg.com/alice.jpg",
    followers_count: 5000,
    following_count: 200,
    tweet_count: 1234,
    like_count: 9999,
    is_verified: true,
    created_at: "2020-01-01T00:00:00Z",
  };

  test("accepts a valid user", () => {
    expect(UserInfoSchema.safeParse(validUser).success).toBe(true);
  });

  test("accepts user with optional fields", () => {
    const withOptionals = {
      ...validUser,
      description: "Hello",
      location: "SF",
      profile_banner_url: "https://banner.jpg",
      pinned_tweet_id: "pinned-1",
    };
    expect(UserInfoSchema.safeParse(withOptionals).success).toBe(true);
  });

  test("rejects user missing required fields", () => {
    const { username, ...missing } = validUser;
    expect(UserInfoSchema.safeParse(missing).success).toBe(false);
  });
});

describe("TwitterListSchema", () => {
  test("accepts a valid list", () => {
    const validList = {
      id: "list-1",
      name: "AI Researchers",
      member_count: 42,
      subscriber_count: 100,
      created_at: "2025-01-01T00:00:00Z",
      created_by: "alice",
    };
    expect(TwitterListSchema.safeParse(validList).success).toBe(true);
  });
});

describe("ErrorResponseSchema", () => {
  test("accepts valid error response", () => {
    const result = ErrorResponseSchema.safeParse({
      success: false,
      error: "Something went wrong",
    });
    expect(result.success).toBe(true);
  });

  test("rejects error response with success: true", () => {
    const result = ErrorResponseSchema.safeParse({
      success: true,
      error: "Nope",
    });
    expect(result.success).toBe(false);
  });
});

describe("DailyMetricsSchema", () => {
  test("accepts valid daily metrics", () => {
    const result = DailyMetricsSchema.safeParse({
      date: "2026-02-24",
      impressions: 1500,
      engagements: 75,
      profile_visits: 40,
      follows: 10,
      likes: 30,
      replies: 12,
      retweets: 15,
      bookmarks: 5,
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing fields", () => {
    expect(DailyMetricsSchema.safeParse({ date: "2026-02-24" }).success).toBe(false);
  });
});
