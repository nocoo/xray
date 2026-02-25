// =============================================================================
// TweAPI Provider - Production implementation hitting api.tweapi.io
// =============================================================================

import type {
  Tweet,
  UserInfo,
  TwitterList,
  AnalyticsWithTimeSeries,
} from "../../../shared/types";

import type {
  ITwitterProvider,
  FetchTweetsOptions,
  SearchTweetsOptions,
} from "./types";

import {
  ProviderError,
  UpstreamError,
  AuthRequiredError,
  TimeoutError,
} from "./errors";

import type {
  TweAPIResponse,
  TweAPITweetDetailsResponse,
  TweAPIUserInfoResponse,
  TweAPIListsResponse,
  TweAPIAnalyticsResponse,
  TweAPIUserListResponse,
} from "./api-types";

import {
  normalizeTweet,
  normalizeUserInfo,
  normalizeList,
  normalizeAnalyticsWithTimeSeries,
} from "./normalizer";

export interface TweAPIConfig {
  apiKey: string;
  baseUrl: string;
  cookie?: string;
  timeoutMs?: number;
}

export class TweAPIProvider implements ITwitterProvider {
  private apiKey: string;
  private baseUrl: string;
  private cookie?: string;
  private timeout: number;

  constructor(config: TweAPIConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.cookie = config.cookie;
    this.timeout = config.timeoutMs ?? 30000;
  }

  // ---------------------------------------------------------------------------
  // Core HTTP request
  // ---------------------------------------------------------------------------

  private async request<T>(endpoint: string, body: object): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    let didTimeout = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        didTimeout = true;
        controller.abort();
        reject(new TimeoutError(this.timeout));
      }, this.timeout);
    });

    try {
      const response = await Promise.race([
        fetch(url, {
          method: "POST",
          headers: {
            "x-api-key": this.apiKey,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }),
        timeoutPromise,
      ]);

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        throw new UpstreamError(
          response.status,
          `TweAPI error: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as T & {
        code: number;
        msg: string;
      };

      if (data.code !== 201 || data.msg !== "ok") {
        throw new UpstreamError(
          502,
          `TweAPI error: ${data.msg} (code: ${data.code})`,
        );
      }

      return data;
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      if (didTimeout || (err instanceof Error && err.name === "AbortError")) {
        throw new TimeoutError(this.timeout);
      }
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        `TweAPI request failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
        err,
      );
    }
  }

  private requireCookie(): void {
    if (!this.cookie) {
      throw new AuthRequiredError();
    }
  }

  // ---------------------------------------------------------------------------
  // Public endpoints
  // ---------------------------------------------------------------------------

  async fetchUserTweets(
    username: string,
    options?: FetchTweetsOptions,
  ): Promise<Tweet[]> {
    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/user/userRecentTweetsByFilter",
      {
        url: `https://x.com/${username}`,
        showPost: true,
        showReplies: false,
        showLinks: true,
        count: options?.count ?? 20,
      },
    );
    if (!data.data?.list) return [];
    return data.data.list.map((tweet) => normalizeTweet(tweet));
  }

  async searchTweets(
    query: string,
    options?: SearchTweetsOptions,
  ): Promise<Tweet[]> {
    const body: Record<string, unknown> = { words: query };
    if (options?.count !== undefined) body.count = options.count;
    if (options?.sort_by_top !== undefined) body.sortByTop = options.sort_by_top;

    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/tweet/search",
      body,
    );
    if (!data.data?.list) return [];
    return data.data.list.map((tweet) => normalizeTweet(tweet));
  }

  async getUserInfo(username: string): Promise<UserInfo> {
    const data = await this.request<TweAPIUserInfoResponse>(
      "/v1/twitter/user/info",
      { url: `https://x.com/${username}` },
    );
    return normalizeUserInfo(data.data);
  }

  async getTweetDetails(tweetId: string): Promise<Tweet> {
    const data = await this.request<TweAPITweetDetailsResponse>(
      "/v1/twitter/tweet/details",
      { url: `https://x.com/i/status/${tweetId}` },
    );
    return normalizeTweet(data.data);
  }

  async getTweetReplies(tweetId: string): Promise<Tweet[]> {
    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/tweet/replys",
      { url: `https://x.com/i/status/${tweetId}` },
    );
    if (!data.data?.list) return [];
    return data.data.list.map((tweet) => normalizeTweet(tweet));
  }

  async searchUserTweets(
    username: string,
    query: string,
  ): Promise<Tweet[]> {
    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/user/getUserTweetsBySearch",
      { userUrl: `https://x.com/${username}`, words: query },
    );
    if (!data.data?.list) return [];
    return data.data.list.map((tweet) => normalizeTweet(tweet));
  }

  // ---------------------------------------------------------------------------
  // User content endpoints (API Key only)
  // ---------------------------------------------------------------------------

  async getUserTimeline(username: string): Promise<Tweet[]> {
    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/user/timeline",
      { url: `https://x.com/${username}` },
    );
    if (!data.data?.list) return [];
    return data.data.list.map((tweet) => normalizeTweet(tweet));
  }

  async getUserReplies(username: string): Promise<Tweet[]> {
    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/user/replies",
      { url: `https://x.com/${username}` },
    );
    if (!data.data?.list) return [];
    return data.data.list.map((tweet) => normalizeTweet(tweet));
  }

  async getUserHighlights(username: string): Promise<Tweet[]> {
    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/user/highLights",
      { url: `https://x.com/${username}` },
    );
    if (!data.data?.list) return [];
    return data.data.list.map((tweet) => normalizeTweet(tweet));
  }

  // ---------------------------------------------------------------------------
  // User connections endpoints (API Key only)
  // ---------------------------------------------------------------------------

  async getUserFollowers(username: string): Promise<UserInfo[]> {
    const data = await this.request<TweAPIUserListResponse>(
      "/v1/twitter/user/follower",
      { url: `https://x.com/${username}` },
    );
    if (!data.data?.list) return [];
    return data.data.list.map((user) => normalizeUserInfo(user));
  }

  async getUserFollowing(username: string): Promise<UserInfo[]> {
    const data = await this.request<TweAPIUserListResponse>(
      "/v1/twitter/user/following",
      { url: `https://x.com/${username}` },
    );
    if (!data.data?.list) return [];
    return data.data.list.map((user) => normalizeUserInfo(user));
  }

  async getUserAffiliates(username: string): Promise<UserInfo[]> {
    const data = await this.request<TweAPIUserListResponse>(
      "/v1/twitter/user/affiliates",
      { url: `https://x.com/${username}` },
    );
    if (!data.data?.list) return [];
    return data.data.list.map((user) => normalizeUserInfo(user));
  }

  // ---------------------------------------------------------------------------
  // Authenticated endpoints
  // ---------------------------------------------------------------------------

  async getUserAnalytics(): Promise<AnalyticsWithTimeSeries> {
    this.requireCookie();
    const data = await this.request<TweAPIAnalyticsResponse>(
      "/v1/twitter/user/analytics",
      { cookie: this.cookie },
    );
    return normalizeAnalyticsWithTimeSeries(data.data);
  }

  async getUserBookmarks(): Promise<Tweet[]> {
    this.requireCookie();
    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/user/bookmarks",
      { cookie: this.cookie },
    );
    if (!data.data?.list) return [];
    return data.data.list.map((tweet) => normalizeTweet(tweet));
  }

  async getUserLikes(): Promise<Tweet[]> {
    this.requireCookie();
    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/user/likes",
      { cookie: this.cookie },
    );
    if (!data.data?.list) return [];
    return data.data.list.map((tweet) => normalizeTweet(tweet));
  }

  async getUserLists(): Promise<TwitterList[]> {
    this.requireCookie();
    const data = await this.request<TweAPIListsResponse>(
      "/v1/twitter/user/lists",
      { cookie: this.cookie },
    );
    if (!data.data?.list) return [];
    return data.data.list.map((list) => normalizeList(list));
  }
}
