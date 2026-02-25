// =============================================================================
// XRayAPIClient - HTTP client for the production X-Ray API
//
// Calls the deployed Next.js API at https://xray.hexly.ai (or configured URL)
// using webhook key authentication. Drop-in replacement for TwitterAPIClient.
// =============================================================================

import type {
  Tweet,
  UserInfo,
  TwitterList,
  Analytics,
  AnalyticsWithTimeSeries,
} from "./types";

export interface XRayAPIConfig {
  baseUrl: string;
  webhookKey: string;
  timeoutMs?: number;
}

const DEFAULT_CONFIG_PATH = "config/api-key.json";

export class XRayAPIClient {
  private baseUrl: string;
  private webhookKey: string;
  private timeout: number;

  constructor(config: XRayAPIConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, ""); // strip trailing slash
    this.webhookKey = config.webhookKey;
    const envTimeout = Number(process.env.XRAY_API_TIMEOUT_MS);
    this.timeout = config.timeoutMs ?? (Number.isNaN(envTimeout) ? 30000 : envTimeout);
  }

  // ===========================================================================
  // Internal HTTP helpers
  // ===========================================================================

  private async get<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
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
        headers: {
          "accept": "application/json",
          "x-webhook-key": this.webhookKey,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `X-Ray API error: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
        );
      }

      const json = (await response.json()) as {
        success: boolean;
        data: T;
        error?: string;
      };

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
  // Public API (same signatures as TwitterAPIClient)
  // ===========================================================================

  async fetchUserTweets(username: string, count = 20): Promise<Tweet[]> {
    return this.get<Tweet[]>(`/api/twitter/users/${username}/tweets`, { count });
  }

  async getTweetDetails(tweetIdOrUrl: string): Promise<Tweet> {
    const id = this.extractTweetId(tweetIdOrUrl);
    return this.get<Tweet>(`/api/twitter/tweets/${id}`);
  }

  async searchTweets(
    query: string,
    count?: number,
    sortByTop?: boolean,
  ): Promise<Tweet[]> {
    return this.get<Tweet[]>("/api/twitter/tweets/search", {
      q: query,
      count,
      sort_by_top: sortByTop,
    });
  }

  async getUserInfo(usernameOrUrl: string): Promise<UserInfo> {
    const username = this.extractUsername(usernameOrUrl);
    return this.get<UserInfo>(`/api/twitter/users/${username}/info`);
  }

  async searchUserTweets(
    usernameOrUrl: string,
    query: string,
  ): Promise<Tweet[]> {
    const username = this.extractUsername(usernameOrUrl);
    return this.get<Tweet[]>(`/api/twitter/users/${username}/search`, {
      q: query,
    });
  }

  async getUserTimeline(usernameOrUrl: string): Promise<Tweet[]> {
    const username = this.extractUsername(usernameOrUrl);
    return this.get<Tweet[]>(`/api/twitter/users/${username}/timeline`);
  }

  async getUserReplies(usernameOrUrl: string): Promise<Tweet[]> {
    const username = this.extractUsername(usernameOrUrl);
    return this.get<Tweet[]>(`/api/twitter/users/${username}/replies`);
  }

  async getUserFollowers(usernameOrUrl: string): Promise<UserInfo[]> {
    const username = this.extractUsername(usernameOrUrl);
    return this.get<UserInfo[]>(`/api/twitter/users/${username}/followers`);
  }

  async getUserFollowing(usernameOrUrl: string): Promise<UserInfo[]> {
    const username = this.extractUsername(usernameOrUrl);
    return this.get<UserInfo[]>(`/api/twitter/users/${username}/following`);
  }

  async getUserHighlights(usernameOrUrl: string): Promise<Tweet[]> {
    const username = this.extractUsername(usernameOrUrl);
    return this.get<Tweet[]>(`/api/twitter/users/${username}/highlights`);
  }

  async getUserAffiliates(usernameOrUrl: string): Promise<UserInfo[]> {
    const username = this.extractUsername(usernameOrUrl);
    return this.get<UserInfo[]>(`/api/twitter/users/${username}/affiliates`);
  }

  async getUserAnalytics(): Promise<Analytics> {
    const data = await this.get<AnalyticsWithTimeSeries>(
      "/api/twitter/me/analytics",
    );
    const { time_series, ...analytics } = data;
    void time_series;
    return analytics;
  }

  async getUserAnalyticsWithTimeSeries(): Promise<AnalyticsWithTimeSeries> {
    return this.get<AnalyticsWithTimeSeries>("/api/twitter/me/analytics");
  }

  async getUserBookmarks(): Promise<Tweet[]> {
    return this.get<Tweet[]>("/api/twitter/me/bookmarks");
  }

  async getUserLikes(): Promise<Tweet[]> {
    return this.get<Tweet[]>("/api/twitter/me/likes");
  }

  async getUserLists(): Promise<TwitterList[]> {
    return this.get<TwitterList[]>("/api/twitter/me/lists");
  }

  // ===========================================================================
  // URL parsing helpers (backward compatibility)
  // ===========================================================================

  private extractUsername(input: string): string {
    if (input.startsWith("http")) {
      const url = new URL(input);
      return url.pathname.split("/").filter(Boolean)[0] || input;
    }
    return input.replace(/^@/, "");
  }

  private extractTweetId(input: string): string {
    if (input.startsWith("http")) {
      const url = new URL(input);
      const parts = url.pathname.split("/").filter(Boolean);
      const statusIndex = parts.indexOf("status");
      if (statusIndex !== -1 && parts[statusIndex + 1]) {
        return parts[statusIndex + 1];
      }
    }
    return input;
  }
}

// =============================================================================
// Factory: load config from file and create client
// =============================================================================

export async function loadAPIKeyConfig(
  configPath = DEFAULT_CONFIG_PATH,
): Promise<XRayAPIConfig> {
  const file = Bun.file(configPath);
  if (!(await file.exists())) {
    throw new Error(
      `API key config not found at ${configPath}. ` +
        `Copy config/api-key.example.json to config/api-key.json and fill in your webhook key.`,
    );
  }
  const raw = (await file.json()) as Record<string, unknown>;

  if (!raw.base_url || typeof raw.base_url !== "string") {
    throw new Error(`Missing or invalid "base_url" in ${configPath}`);
  }
  if (!raw.webhook_key || typeof raw.webhook_key !== "string") {
    throw new Error(`Missing or invalid "webhook_key" in ${configPath}`);
  }

  return {
    baseUrl: raw.base_url,
    webhookKey: raw.webhook_key,
    timeoutMs:
      typeof raw.timeout_ms === "number" ? raw.timeout_ms : undefined,
  };
}

export async function createXRayAPIClient(
  configPath?: string,
): Promise<XRayAPIClient> {
  const config = await loadAPIKeyConfig(configPath);
  return new XRayAPIClient(config);
}
