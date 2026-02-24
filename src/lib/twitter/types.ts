// =============================================================================
// ITwitterProvider - Provider interface for Twitter data access
// =============================================================================

import type {
  Tweet,
  UserInfo,
  TwitterList,
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
  fetchUserTweets(
    username: string,
    options?: FetchTweetsOptions,
  ): Promise<Tweet[]>;
  searchTweets(
    query: string,
    options?: SearchTweetsOptions,
  ): Promise<Tweet[]>;
  getUserInfo(username: string): Promise<UserInfo>;
  getTweetDetails(tweetId: string): Promise<Tweet>;
  getTweetReplies(tweetId: string): Promise<Tweet[]>;
  searchUserTweets(username: string, query: string): Promise<Tweet[]>;

  // Authenticated data (cookie/token required)
  getUserAnalytics(): Promise<AnalyticsWithTimeSeries>;
  getUserBookmarks(): Promise<Tweet[]>;
  getUserLikes(): Promise<Tweet[]>;
  getUserLists(): Promise<TwitterList[]>;
}
