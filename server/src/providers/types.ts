// =============================================================================
// ITwitterProvider - Provider interface for Twitter data access
// Implementations are interchangeable (TweAPI, RapidAPI, direct, etc.)
// =============================================================================

import type {
  Tweet,
  UserInfo,
  TwitterList,
  Analytics,
  AnalyticsWithTimeSeries,
} from "../../../shared/types";

export interface FetchTweetsOptions {
  count?: number;
}

export interface SearchTweetsOptions {
  count?: number;
  sort_by_top?: boolean;
}

export interface ITwitterProvider {
  // Public data (no auth required)
  fetchUserTweets(username: string, options?: FetchTweetsOptions): Promise<Tweet[]>;
  searchTweets(query: string, options?: SearchTweetsOptions): Promise<Tweet[]>;
  getUserInfo(username: string): Promise<UserInfo>;
  getTweetDetails(tweetId: string): Promise<Tweet>;
  searchUserTweets(username: string, query: string): Promise<Tweet[]>;

  // Authenticated data (cookie/token required)
  getUserAnalytics(): Promise<AnalyticsWithTimeSeries>;
  getUserBookmarks(): Promise<Tweet[]>;
  getUserLikes(): Promise<Tweet[]>;
  getUserLists(): Promise<TwitterList[]>;
}

// =============================================================================
// Provider errors
// =============================================================================

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export class UpstreamError extends ProviderError {
  constructor(statusCode: number, message: string, cause?: unknown) {
    super(message, statusCode, cause);
    this.name = "UpstreamError";
  }
}

export class AuthRequiredError extends ProviderError {
  constructor(message: string = "Authentication cookie is required for this endpoint") {
    super(message, 401);
    this.name = "AuthRequiredError";
  }
}

export class TimeoutError extends ProviderError {
  constructor(timeoutMs: number) {
    super(`Provider request timed out after ${timeoutMs}ms`, 504);
    this.name = "TimeoutError";
  }
}
