// =============================================================================
// Twitter Routes - OpenAPI-documented endpoints
// =============================================================================

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { ITwitterProvider } from "../providers/types";
import { ErrorResponseSchema } from "../schemas/common";
import {
  UsernameParamsSchema,
  TweetIdParamsSchema,
  FetchTweetsQuerySchema,
  SearchQuerySchema,
  SearchUserTweetsQuerySchema,
  TweetListResponseSchema,
  SingleTweetResponseSchema,
  UserInfoResponseSchema,
  AnalyticsResponseSchema,
  TwitterListResponseSchema,
} from "../schemas/twitter";

type TwitterEnv = {
  Variables: {
    provider: ITwitterProvider;
  };
};

export function createTwitterRoutes() {
  const app = new OpenAPIHono<TwitterEnv>();

  // ===========================================================================
  // GET /twitter/users/:username/tweets
  // ===========================================================================
  const getUserTweets = createRoute({
    method: "get",
    path: "/users/{username}/tweets",
    tags: ["Twitter Users"],
    summary: "Fetch recent tweets from a user",
    request: {
      params: UsernameParamsSchema,
      query: FetchTweetsQuerySchema,
    },
    responses: {
      200: {
        content: { "application/json": { schema: TweetListResponseSchema } },
        description: "List of tweets",
      },
      400: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Invalid parameters",
      },
      500: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Server error",
      },
    },
  });

  app.openapi(getUserTweets, async (c) => {
    const { username } = c.req.valid("param");
    const { count } = c.req.valid("query");
    const provider = c.var.provider;
    const tweets = await provider.fetchUserTweets(username, { count });
    return c.json({ success: true as const, data: tweets }, 200);
  });

  // ===========================================================================
  // GET /twitter/users/:username/info
  // ===========================================================================
  const getUserInfo = createRoute({
    method: "get",
    path: "/users/{username}/info",
    tags: ["Twitter Users"],
    summary: "Get user profile information",
    request: {
      params: UsernameParamsSchema,
    },
    responses: {
      200: {
        content: { "application/json": { schema: UserInfoResponseSchema } },
        description: "User profile",
      },
      400: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Invalid parameters",
      },
      500: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Server error",
      },
    },
  });

  app.openapi(getUserInfo, async (c) => {
    const { username } = c.req.valid("param");
    const provider = c.var.provider;
    const user = await provider.getUserInfo(username);
    return c.json({ success: true as const, data: user }, 200);
  });

  // ===========================================================================
  // GET /twitter/users/:username/search
  // ===========================================================================
  const searchUserTweets = createRoute({
    method: "get",
    path: "/users/{username}/search",
    tags: ["Twitter Users"],
    summary: "Search a user's tweets by keyword",
    request: {
      params: UsernameParamsSchema,
      query: SearchUserTweetsQuerySchema,
    },
    responses: {
      200: {
        content: { "application/json": { schema: TweetListResponseSchema } },
        description: "Search results",
      },
      400: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Invalid parameters",
      },
      500: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Server error",
      },
    },
  });

  app.openapi(searchUserTweets, async (c) => {
    const { username } = c.req.valid("param");
    const { q } = c.req.valid("query");
    const provider = c.var.provider;
    const tweets = await provider.searchUserTweets(username, q);
    return c.json({ success: true as const, data: tweets }, 200);
  });

  // ===========================================================================
  // GET /twitter/tweets/search
  // ===========================================================================
  const searchTweets = createRoute({
    method: "get",
    path: "/tweets/search",
    tags: ["Twitter Tweets"],
    summary: "Search tweets globally",
    request: {
      query: SearchQuerySchema,
    },
    responses: {
      200: {
        content: { "application/json": { schema: TweetListResponseSchema } },
        description: "Search results",
      },
      400: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Invalid parameters",
      },
      500: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Server error",
      },
    },
  });

  app.openapi(searchTweets, async (c) => {
    const { q, count, sort_by_top } = c.req.valid("query");
    const provider = c.var.provider;
    const tweets = await provider.searchTweets(q, { count, sort_by_top });
    return c.json({ success: true as const, data: tweets }, 200);
  });

  // ===========================================================================
  // GET /twitter/tweets/:id
  // ===========================================================================
  const getTweetDetails = createRoute({
    method: "get",
    path: "/tweets/{id}",
    tags: ["Twitter Tweets"],
    summary: "Get tweet details by ID",
    request: {
      params: TweetIdParamsSchema,
    },
    responses: {
      200: {
        content: { "application/json": { schema: SingleTweetResponseSchema } },
        description: "Tweet details",
      },
      400: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Invalid parameters",
      },
      500: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Server error",
      },
    },
  });

  app.openapi(getTweetDetails, async (c) => {
    const { id } = c.req.valid("param");
    const provider = c.var.provider;
    const tweet = await provider.getTweetDetails(id);
    return c.json({ success: true as const, data: tweet }, 200);
  });

  // ===========================================================================
  // GET /twitter/me/analytics
  // ===========================================================================
  const getAnalytics = createRoute({
    method: "get",
    path: "/me/analytics",
    tags: ["Twitter Me"],
    summary: "Get authenticated user's analytics",
    responses: {
      200: {
        content: { "application/json": { schema: AnalyticsResponseSchema } },
        description: "Analytics data with time series",
      },
      401: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Cookie not configured",
      },
      500: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Server error",
      },
    },
  });

  app.openapi(getAnalytics, async (c) => {
    const provider = c.var.provider;
    const analytics = await provider.getUserAnalytics();
    return c.json({ success: true as const, data: analytics }, 200);
  });

  // ===========================================================================
  // GET /twitter/me/bookmarks
  // ===========================================================================
  const getBookmarks = createRoute({
    method: "get",
    path: "/me/bookmarks",
    tags: ["Twitter Me"],
    summary: "Get authenticated user's bookmarks",
    responses: {
      200: {
        content: { "application/json": { schema: TweetListResponseSchema } },
        description: "Bookmarked tweets",
      },
      401: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Cookie not configured",
      },
      500: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Server error",
      },
    },
  });

  app.openapi(getBookmarks, async (c) => {
    const provider = c.var.provider;
    const tweets = await provider.getUserBookmarks();
    return c.json({ success: true as const, data: tweets }, 200);
  });

  // ===========================================================================
  // GET /twitter/me/likes
  // ===========================================================================
  const getLikes = createRoute({
    method: "get",
    path: "/me/likes",
    tags: ["Twitter Me"],
    summary: "Get authenticated user's liked tweets",
    responses: {
      200: {
        content: { "application/json": { schema: TweetListResponseSchema } },
        description: "Liked tweets",
      },
      401: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Cookie not configured",
      },
      500: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Server error",
      },
    },
  });

  app.openapi(getLikes, async (c) => {
    const provider = c.var.provider;
    const tweets = await provider.getUserLikes();
    return c.json({ success: true as const, data: tweets }, 200);
  });

  // ===========================================================================
  // GET /twitter/me/lists
  // ===========================================================================
  const getLists = createRoute({
    method: "get",
    path: "/me/lists",
    tags: ["Twitter Me"],
    summary: "Get authenticated user's subscribed lists",
    responses: {
      200: {
        content: { "application/json": { schema: TwitterListResponseSchema } },
        description: "Subscribed lists",
      },
      401: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Cookie not configured",
      },
      500: {
        content: { "application/json": { schema: ErrorResponseSchema } },
        description: "Server error",
      },
    },
  });

  app.openapi(getLists, async (c) => {
    const provider = c.var.provider;
    const lists = await provider.getUserLists();
    return c.json({ success: true as const, data: lists }, 200);
  });

  return app;
}
