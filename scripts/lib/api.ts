import type { Config, TweAPIResponse, TweAPITweet, Tweet, TweetAuthor, TweetMetrics, TweetMedia, TweetEntities } from "./types";

// =============================================================================
// API Client for api.tweapi.io
// =============================================================================

export class TwitterAPIClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: Config) {
    this.apiKey = config.api.api_key;
    this.baseUrl = config.api.base_url;
  }

  async fetchUserTweets(username: string): Promise<Tweet[]> {
    const url = `${this.baseUrl}/v1/twitter/user/userRecentTweetsByFilter`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          url: `https://x.com/${username}`,
          showPost: true,
          showReplies: false,
          showLinks: true,
          count: 20,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as TweAPIResponse;

      if (data.code !== 201 || data.msg !== "ok") {
        throw new Error(`API error: ${data.msg} (code: ${data.code})`);
      }

      if (!data.data?.list) {
        return [];
      }

      return data.data.list.map((tweet) => this.normalizeTweet(tweet));
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`API request timeout after 30s for @${username}`);
      }
      throw err;
    }
  }

  private normalizeTweet(apiTweet: TweAPITweet): Tweet {
    const author: TweetAuthor = {
      id: apiTweet.tweetBy.id,
      username: apiTweet.tweetBy.userName,
      name: apiTweet.tweetBy.fullName,
      profile_image_url: apiTweet.tweetBy.profileImage,
      followers_count: apiTweet.tweetBy.followersCount,
      is_verified: apiTweet.tweetBy.isVerified,
    };

    const metrics: TweetMetrics = {
      retweet_count: apiTweet.retweetCount || 0,
      like_count: apiTweet.likeCount || 0,
      reply_count: apiTweet.replyCount || 0,
      quote_count: apiTweet.quoteCount || 0,
      view_count: apiTweet.viewCount || 0,
      bookmark_count: apiTweet.bookmarkCount || 0,
    };

    const entities: TweetEntities = {
      hashtags: apiTweet.entities?.hashtags || [],
      mentioned_users: apiTweet.entities?.mentionedUsers || [],
      urls: apiTweet.entities?.urls || [],
    };

    let media: TweetMedia[] | undefined;
    if (apiTweet.media && apiTweet.media.length > 0) {
      media = apiTweet.media.map((m) => ({
        id: m.id,
        type: m.type,
        url: m.url,
        thumbnail_url: m.thumbnailUrl,
      }));
    }

    let quotedTweet: Tweet | undefined;
    if (apiTweet.quoted) {
      quotedTweet = this.normalizeTweet(apiTweet.quoted);
    }

    return {
      id: apiTweet.id,
      text: apiTweet.fullText,
      author,
      created_at: apiTweet.createdAt,
      url: apiTweet.url,
      metrics,
      is_retweet: false,
      is_quote: !!apiTweet.quoted,
      is_reply: !!apiTweet.replyTo,
      lang: apiTweet.lang,
      media,
      entities,
      quoted_tweet: quotedTweet,
      reply_to_id: apiTweet.replyTo,
    };
  }
}

// =============================================================================
// Factory function
// =============================================================================

export function createAPIClient(config: Config): TwitterAPIClient {
  return new TwitterAPIClient(config);
}
