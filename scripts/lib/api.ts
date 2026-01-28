import type {
  Config,
  TweAPIResponse,
  TweAPITweet,
  TweAPITweetDetailsResponse,
  TweAPIUserInfoResponse,
  TweAPIUserListResponse,
  TweAPIListsResponse,
  TweAPIList,
  TweAPIConversationResponse,
  TweAPIConversation,
  TweAPIInboxResponse,
  TweAPIInboxItem,
  TweAPIAnalyticsResponse,
  TweAPIAnalytics,
  TweAPIAuthor,
  TweAPIMessage,
  Tweet,
  TweetAuthor,
  TweetMetrics,
  TweetMedia,
  TweetEntities,
  UserInfo,
  TwitterList,
  Message,
  Conversation,
  InboxItem,
  Analytics,
} from "./types";

// =============================================================================
// API Client for api.tweapi.io
// =============================================================================

export class TwitterAPIClient {
  private apiKey: string;
  private baseUrl: string;
  private cookie?: string;
  private timeout: number = 30000;

  constructor(config: Config) {
    this.apiKey = config.api.api_key;
    this.baseUrl = config.api.base_url;
    this.cookie = config.api.cookie;
  }

  private async request<T>(endpoint: string, body: object): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as T & { code: number; msg: string };

      if (data.code !== 201 || data.msg !== "ok") {
        throw new Error(`API error: ${data.msg} (code: ${data.code})`);
      }

      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`API request timeout after ${this.timeout}ms`);
      }
      throw err;
    }
  }

  private requireCookie(): void {
    if (!this.cookie) {
      throw new Error("Cookie is required for this API. Please set api.cookie in config.");
    }
  }

  async fetchUserTweets(username: string): Promise<Tweet[]> {
    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/user/userRecentTweetsByFilter",
      {
        url: `https://x.com/${username}`,
        showPost: true,
        showReplies: false,
        showLinks: true,
        count: 20,
      }
    );

    if (!data.data?.list) {
      return [];
    }

    return data.data.list.map((tweet) => this.normalizeTweet(tweet));
  }

  async getTweetDetails(tweetUrl: string): Promise<Tweet> {
    const data = await this.request<TweAPITweetDetailsResponse>(
      "/v1/twitter/tweet/details",
      { url: tweetUrl }
    );
    return this.normalizeTweet(data.data);
  }

  async getTweetReplies(tweetUrl: string): Promise<Tweet[]> {
    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/tweet/replys",
      { url: tweetUrl }
    );
    if (!data.data?.list) {
      return [];
    }
    return data.data.list.map((tweet) => this.normalizeTweet(tweet));
  }

  async searchTweets(
    words: string,
    count?: number,
    sortByTop?: boolean
  ): Promise<Tweet[]> {
    const body: Record<string, unknown> = { words };
    if (count !== undefined) body.count = count;
    if (sortByTop !== undefined) body.sortByTop = sortByTop;

    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/tweet/search",
      body
    );
    if (!data.data?.list) {
      return [];
    }
    return data.data.list.map((tweet) => this.normalizeTweet(tweet));
  }

  async getUserInfo(userUrl: string): Promise<UserInfo> {
    const data = await this.request<TweAPIUserInfoResponse>(
      "/v1/twitter/user/info",
      { url: userUrl }
    );
    return this.normalizeUserInfo(data.data);
  }

  async getUserTimeline(userUrl: string): Promise<Tweet[]> {
    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/user/timeline",
      { url: userUrl }
    );
    if (!data.data?.list) {
      return [];
    }
    return data.data.list.map((tweet) => this.normalizeTweet(tweet));
  }

  async getUserReplies(userUrl: string): Promise<Tweet[]> {
    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/user/replies",
      { url: userUrl }
    );
    if (!data.data?.list) {
      return [];
    }
    return data.data.list.map((tweet) => this.normalizeTweet(tweet));
  }

  async getUserFollowers(userUrl: string): Promise<UserInfo[]> {
    const data = await this.request<TweAPIUserListResponse>(
      "/v1/twitter/user/follower",
      { url: userUrl }
    );
    if (!data.data?.list) {
      return [];
    }
    return data.data.list.map((user) => this.normalizeUserInfo(user));
  }

  async getUserFollowing(userUrl: string): Promise<UserInfo[]> {
    const data = await this.request<TweAPIUserListResponse>(
      "/v1/twitter/user/following",
      { url: userUrl }
    );
    if (!data.data?.list) {
      return [];
    }
    return data.data.list.map((user) => this.normalizeUserInfo(user));
  }

  async getUserAffiliates(userUrl: string): Promise<UserInfo[]> {
    const data = await this.request<TweAPIUserListResponse>(
      "/v1/twitter/user/affiliates",
      { url: userUrl }
    );
    if (!data.data?.list) {
      return [];
    }
    return data.data.list.map((user) => this.normalizeUserInfo(user));
  }

  async getUserHighlights(userUrl: string): Promise<Tweet[]> {
    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/user/highLights",
      { url: userUrl }
    );
    if (!data.data?.list) {
      return [];
    }
    return data.data.list.map((tweet) => this.normalizeTweet(tweet));
  }

  async searchUserTweets(userUrl: string, words: string): Promise<Tweet[]> {
    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/user/getUserTweetsBySearch",
      { userUrl, words }
    );
    if (!data.data?.list) {
      return [];
    }
    return data.data.list.map((tweet) => this.normalizeTweet(tweet));
  }

  async getUserAnalytics(): Promise<Analytics> {
    this.requireCookie();
    const data = await this.request<TweAPIAnalyticsResponse>(
      "/v1/twitter/user/analytics",
      { cookie: this.cookie }
    );
    return this.normalizeAnalytics(data.data);
  }

  async getUserBookmarks(): Promise<Tweet[]> {
    this.requireCookie();
    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/user/bookmarks",
      { cookie: this.cookie }
    );
    if (!data.data?.list) {
      return [];
    }
    return data.data.list.map((tweet) => this.normalizeTweet(tweet));
  }

  async getUserLikes(): Promise<Tweet[]> {
    this.requireCookie();
    const data = await this.request<TweAPIResponse>(
      "/v1/twitter/user/likes",
      { cookie: this.cookie }
    );
    if (!data.data?.list) {
      return [];
    }
    return data.data.list.map((tweet) => this.normalizeTweet(tweet));
  }

  async getUserLists(): Promise<TwitterList[]> {
    this.requireCookie();
    const data = await this.request<TweAPIListsResponse>(
      "/v1/twitter/user/lists",
      { cookie: this.cookie }
    );
    if (!data.data?.list) {
      return [];
    }
    return data.data.list.map((list) => this.normalizeList(list));
  }

  async getConversation(conversationUrl: string): Promise<Conversation> {
    const data = await this.request<TweAPIConversationResponse>(
      "/v1/twitter/message/conversation",
      { conversationUrl }
    );
    return this.normalizeConversation(data.data);
  }

  async getInbox(): Promise<InboxItem[]> {
    this.requireCookie();
    const data = await this.request<TweAPIInboxResponse>(
      "/v1/twitter/message/inbox",
      { cookie: this.cookie }
    );
    if (!data.data?.list) {
      return [];
    }
    return data.data.list.map((item) => this.normalizeInboxItem(item));
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

  private normalizeUserInfo(apiUser: TweAPIAuthor): UserInfo {
    return {
      id: apiUser.id,
      username: apiUser.userName,
      name: apiUser.fullName,
      description: apiUser.description,
      location: apiUser.location,
      profile_image_url: apiUser.profileImage,
      profile_banner_url: apiUser.profileBanner,
      followers_count: apiUser.followersCount,
      following_count: apiUser.followingsCount,
      tweet_count: apiUser.statusesCount,
      like_count: apiUser.likeCount,
      is_verified: apiUser.isVerified,
      created_at: apiUser.createdAt,
      pinned_tweet_id: apiUser.pinnedTweet,
    };
  }

  private normalizeList(apiList: TweAPIList): TwitterList {
    return {
      id: apiList.id,
      name: apiList.name,
      description: apiList.description,
      member_count: apiList.memberCount,
      subscriber_count: apiList.subscriberCount,
      created_at: apiList.createdAt,
      created_by: apiList.createdBy,
      is_following: apiList.isFollowing,
      is_member: apiList.isMember,
    };
  }

  private normalizeMessage(apiMessage: TweAPIMessage): Message {
    return {
      id: apiMessage.id,
      text: apiMessage.text,
      sender_id: apiMessage.senderId,
      recipient_id: apiMessage.recipientId,
      created_at: apiMessage.createdAt,
      media_urls: apiMessage.mediaUrls,
    };
  }

  private normalizeConversation(apiConv: TweAPIConversation): Conversation {
    return {
      conversation_id: apiConv.conversationId,
      messages: apiConv.messages.map((m) => this.normalizeMessage(m)),
      participants: apiConv.participants.map((p) => this.normalizeUserInfo(p)),
    };
  }

  private normalizeInboxItem(apiItem: TweAPIInboxItem): InboxItem {
    return {
      conversation_id: apiItem.conversationId,
      last_message: this.normalizeMessage(apiItem.lastMessage),
      participants: apiItem.participants.map((p) => this.normalizeUserInfo(p)),
      unread_count: apiItem.unreadCount,
    };
  }

  private normalizeAnalytics(apiAnalytics: TweAPIAnalytics): Analytics {
    return {
      impressions: apiAnalytics.impressions,
      engagements: apiAnalytics.engagements,
      engagement_rate: apiAnalytics.engagementRate,
      likes: apiAnalytics.likes,
      retweets: apiAnalytics.retweets,
      replies: apiAnalytics.replies,
      profile_visits: apiAnalytics.profileVisits,
      followers: apiAnalytics.followers,
      following: apiAnalytics.following,
    };
  }
}

// =============================================================================
// Factory function
// =============================================================================

export function createAPIClient(config: Config): TwitterAPIClient {
  return new TwitterAPIClient(config);
}
