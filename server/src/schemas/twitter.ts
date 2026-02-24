// =============================================================================
// Twitter Zod Schemas - Request params and response types for OpenAPI
// =============================================================================

import { z } from "@hono/zod-openapi";

// =============================================================================
// Request Schemas
// =============================================================================

export const UsernameParamsSchema = z.object({
  username: z
    .string()
    .min(1)
    .max(15)
    .regex(/^[a-zA-Z0-9_]+$/, "Invalid Twitter username")
    .openapi({
      param: { name: "username", in: "path" },
      example: "elonmusk",
    }),
});

export const TweetIdParamsSchema = z.object({
  id: z
    .string()
    .min(1)
    .openapi({
      param: { name: "id", in: "path" },
      example: "1234567890",
    }),
});

export const FetchTweetsQuerySchema = z.object({
  count: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : undefined))
    .pipe(z.number().int().min(1).max(100).optional())
    .openapi({
      param: { name: "count", in: "query" },
      example: "20",
    }),
});

export const SearchQuerySchema = z.object({
  q: z
    .string()
    .min(1, "Search query is required")
    .openapi({
      param: { name: "q", in: "query" },
      example: "AI",
    }),
  count: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : undefined))
    .pipe(z.number().int().min(1).max(100).optional())
    .openapi({
      param: { name: "count", in: "query" },
      example: "20",
    }),
  sort_by_top: z
    .string()
    .optional()
    .transform((val) => val === "true")
    .openapi({
      param: { name: "sort_by_top", in: "query" },
      example: "true",
    }),
});

export const SearchUserTweetsQuerySchema = z.object({
  q: z
    .string()
    .min(1, "Search query is required")
    .openapi({
      param: { name: "q", in: "query" },
      example: "AI",
    }),
});

// =============================================================================
// Response Schemas
// =============================================================================

export const TweetAuthorSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    name: z.string(),
    profile_image_url: z.string().optional(),
    followers_count: z.number().optional(),
    is_verified: z.boolean().optional(),
  })
  .openapi("TweetAuthor");

export const TweetMetricsSchema = z
  .object({
    retweet_count: z.number(),
    like_count: z.number(),
    reply_count: z.number(),
    quote_count: z.number(),
    view_count: z.number(),
    bookmark_count: z.number(),
  })
  .openapi("TweetMetrics");

export const TweetMediaSchema = z
  .object({
    id: z.string(),
    type: z.enum(["PHOTO", "VIDEO", "GIF"]),
    url: z.string(),
    thumbnail_url: z.string().optional(),
  })
  .openapi("TweetMedia");

export const TweetEntitiesSchema = z
  .object({
    hashtags: z.array(z.string()),
    mentioned_users: z.array(z.string()),
    urls: z.array(z.string()),
  })
  .openapi("TweetEntities");

// Use lazy for recursive Tweet type (quoted_tweet)
const BaseTweetFields = {
  id: z.string(),
  text: z.string(),
  author: TweetAuthorSchema,
  created_at: z.string(),
  url: z.string(),
  metrics: TweetMetricsSchema,
  is_retweet: z.boolean(),
  is_quote: z.boolean(),
  is_reply: z.boolean(),
  lang: z.string().optional(),
  media: z.array(TweetMediaSchema).optional(),
  entities: TweetEntitiesSchema.optional(),
  reply_to_id: z.string().optional(),
};

export const TweetSchema: z.ZodType = z.lazy(() =>
  z.object({
    ...BaseTweetFields,
    quoted_tweet: TweetSchema.optional(),
  }),
).openapi("Tweet");

export const TweetListResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.array(TweetSchema),
  })
  .openapi("TweetListResponse");

export const SingleTweetResponseSchema = z
  .object({
    success: z.literal(true),
    data: TweetSchema,
  })
  .openapi("SingleTweetResponse");

export const UserInfoSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    name: z.string(),
    description: z.string().optional(),
    location: z.string().optional(),
    profile_image_url: z.string(),
    profile_banner_url: z.string().optional(),
    followers_count: z.number(),
    following_count: z.number(),
    tweet_count: z.number(),
    like_count: z.number(),
    is_verified: z.boolean(),
    created_at: z.string(),
    pinned_tweet_id: z.string().optional(),
  })
  .openapi("UserInfo");

export const UserInfoResponseSchema = z
  .object({
    success: z.literal(true),
    data: UserInfoSchema,
  })
  .openapi("UserInfoResponse");

export const TwitterListSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    member_count: z.number(),
    subscriber_count: z.number(),
    created_at: z.string(),
    created_by: z.string(),
    is_following: z.boolean().optional(),
    is_member: z.boolean().optional(),
  })
  .openapi("TwitterList");

export const TwitterListResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.array(TwitterListSchema),
  })
  .openapi("TwitterListResponse");

export const DailyMetricsSchema = z
  .object({
    date: z.string(),
    impressions: z.number(),
    engagements: z.number(),
    profile_visits: z.number(),
    follows: z.number(),
    likes: z.number(),
    replies: z.number(),
    retweets: z.number(),
    bookmarks: z.number(),
  })
  .openapi("DailyMetrics");

export const AnalyticsResponseSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        impressions: z.number(),
        engagements: z.number(),
        engagement_rate: z.number(),
        likes: z.number(),
        retweets: z.number(),
        replies: z.number(),
        profile_visits: z.number(),
        followers: z.number(),
        following: z.number(),
        verified_followers: z.number().optional(),
        bookmarks: z.number().optional(),
        shares: z.number().optional(),
        unfollows: z.number().optional(),
        time_series: z.array(DailyMetricsSchema),
      })
      .openapi("AnalyticsWithTimeSeries"),
  })
  .openapi("AnalyticsResponse");
