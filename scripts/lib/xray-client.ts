// =============================================================================
// XRayClient - HTTP client that calls the local X-Ray API Server
// Drop-in replacement for TwitterAPIClient with the same interface.
// =============================================================================

import type {
  Config,
  Tweet,
  UserInfo,
  TwitterList,
  Analytics,
  AnalyticsWithTimeSeries,
} from "./types";

export interface XRayClientConfig {
  baseUrl: string;
  timeoutMs?: number;
}

export class XRayClient {
  private baseUrl: string;
  private timeout: number;

  constructor(config: Config | XRayClientConfig) {
    if ("api" in config) {
      // Legacy Config object — derive server URL from env or default
      this.baseUrl = process.env.XRAY_SERVER_URL || "http://localhost:3456";
    } else {
      this.baseUrl = config.baseUrl;
    }
    const timeoutMs = "timeoutMs" in config ? config.timeoutMs : undefined;
    const envTimeout = Number(process.env.XRAY_API_TIMEOUT_MS);
    this.timeout = timeoutMs ?? (Number.isNaN(envTimeout) ? 30000 : envTimeout);
  }

  // ===========================================================================
  // Internal HTTP helpers
  // ===========================================================================

  private async get<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { "accept": "application/json" },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`X-Ray API error: ${response.status} ${response.statusText} - ${body}`);
      }

      const json = await response.json() as { success: boolean; data: T; error?: string };
      if (!json.success) {
        throw new Error(`X-Ray API error: ${json.error || "Unknown error"}`);
      }

      return json.data;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`API request timeout after ${this.timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ===========================================================================
  // URL parsing helpers (maintain backward compatibility with URL-based API)
  // ===========================================================================

  private extractUsername(userUrl: string): string {
    // Accept both "username" and "https://x.com/username" formats
    if (userUrl.startsWith("http")) {
      const url = new URL(userUrl);
      return url.pathname.split("/").filter(Boolean)[0] || userUrl;
    }
    return userUrl;
  }

  private extractTweetId(tweetUrl: string): string {
    // Accept both "1234567890" and "https://x.com/user/status/1234567890"
    if (tweetUrl.startsWith("http")) {
      const url = new URL(tweetUrl);
      const parts = url.pathname.split("/").filter(Boolean);
      // Pattern: /username/status/1234567890
      const statusIndex = parts.indexOf("status");
      if (statusIndex !== -1 && parts[statusIndex + 1]) {
        return parts[statusIndex + 1];
      }
    }
    return tweetUrl;
  }

  // ===========================================================================
  // Public API (same signatures as TwitterAPIClient)
  // ===========================================================================

  async fetchUserTweets(username: string): Promise<Tweet[]> {
    const cleanUsername = this.extractUsername(username);
    return this.get<Tweet[]>(`/twitter/users/${cleanUsername}/tweets`, { count: 20 });
  }

  async getTweetDetails(tweetUrl: string): Promise<Tweet> {
    const tweetId = this.extractTweetId(tweetUrl);
    return this.get<Tweet>(`/twitter/tweets/${tweetId}`);
  }

  async searchTweets(
    words: string,
    count?: number,
    sortByTop?: boolean,
  ): Promise<Tweet[]> {
    return this.get<Tweet[]>("/twitter/tweets/search", {
      q: words,
      count,
      sort_by_top: sortByTop,
    });
  }

  async getUserInfo(userUrl: string): Promise<UserInfo> {
    const username = this.extractUsername(userUrl);
    return this.get<UserInfo>(`/twitter/users/${username}/info`);
  }

  async searchUserTweets(userUrl: string, words: string): Promise<Tweet[]> {
    const username = this.extractUsername(userUrl);
    return this.get<Tweet[]>(`/twitter/users/${username}/search`, { q: words });
  }

  async getUserAnalytics(): Promise<Analytics> {
    const data = await this.get<AnalyticsWithTimeSeries>("/twitter/me/analytics");
    // Strip time_series to match the Analytics-only interface
    const { time_series, ...analytics } = data;
    return analytics;
  }

  async getUserAnalyticsWithTimeSeries(): Promise<AnalyticsWithTimeSeries> {
    return this.get<AnalyticsWithTimeSeries>("/twitter/me/analytics");
  }

  async getUserBookmarks(): Promise<Tweet[]> {
    return this.get<Tweet[]>("/twitter/me/bookmarks");
  }

  async getUserLikes(): Promise<Tweet[]> {
    return this.get<Tweet[]>("/twitter/me/likes");
  }

  async getUserLists(): Promise<TwitterList[]> {
    return this.get<TwitterList[]>("/twitter/me/lists");
  }
}

// =============================================================================
// Factory function (drop-in replacement for createAPIClient)
// =============================================================================

export function createXRayClient(config: Config): XRayClient {
  return new XRayClient(config);
}
