import type { Config, TwitterAPIResponse, TwitterAPITweet, Tweet, TweetAuthor } from "./types";

// =============================================================================
// API Client
// =============================================================================

export class TwitterAPIClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: Config) {
    this.apiKey = config.api.api_key;
    this.baseUrl = config.api.base_url;
  }

  /**
   * Fetch tweets for a user by their username
   */
  async fetchUserTweets(username: string, pageSize: number = 50): Promise<Tweet[]> {
    const url = new URL(`${this.baseUrl}/twitter/user/last_tweets`);
    url.searchParams.set("userName", username);
    url.searchParams.set("pageSize", String(pageSize));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-API-Key": this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as TwitterAPIResponse;

    if (data.status !== "success") {
      throw new Error(`API error: ${data.msg}`);
    }

    if (!data.data?.tweets) {
      return [];
    }

    return data.data.tweets.map((tweet) => this.normalizeTweet(tweet));
  }

  /**
   * Normalize API response to our Tweet type
   */
  private normalizeTweet(apiTweet: TwitterAPITweet): Tweet {
    const author: TweetAuthor = {
      id: apiTweet.author.id,
      username: apiTweet.author.userName,
      name: apiTweet.author.name,
      profile_image_url: apiTweet.author.profilePicture,
    };

    return {
      id: apiTweet.id,
      text: apiTweet.text,
      author,
      created_at: this.parseTwitterDate(apiTweet.createdAt),
      url: apiTweet.url,
      metrics: {
        retweet_count: apiTweet.retweetCount || 0,
        like_count: apiTweet.likeCount || 0,
        reply_count: apiTweet.replyCount || 0,
        quote_count: apiTweet.quoteCount,
        view_count: apiTweet.viewCount,
      },
      is_retweet: !!apiTweet.retweeted_tweet,
      is_quote: !!apiTweet.quoted_tweet,
      lang: apiTweet.lang,
    };
  }

  /**
   * Parse Twitter's date format to ISO 8601
   * Twitter format: "Wed Oct 10 20:19:24 +0000 2018"
   */
  private parseTwitterDate(dateStr: string): string {
    // If already ISO format, return as is
    if (dateStr.includes("T")) {
      return dateStr;
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      // Fallback to current time if parsing fails
      return new Date().toISOString();
    }
    return date.toISOString();
  }
}

// =============================================================================
// Factory function for testing
// =============================================================================

export function createAPIClient(config: Config): TwitterAPIClient {
  return new TwitterAPIClient(config);
}
