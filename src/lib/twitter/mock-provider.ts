// =============================================================================
// Mock Twitter Provider - Deterministic test data for dev/test environments
// =============================================================================

import type {
  Tweet,
  UserInfo,
  TwitterList,
  AnalyticsWithTimeSeries,
  InboxItem,
  Conversation,
} from "../../../shared/types";

import type {
  ITwitterProvider,
  FetchTweetsOptions,
  SearchTweetsOptions,
} from "./types";

export class MockTwitterProvider implements ITwitterProvider {
  async fetchUserTweets(
    username: string,
    options?: FetchTweetsOptions,
  ): Promise<Tweet[]> {
    const count = options?.count ?? 2;
    return Array.from({ length: count }, (_, i) =>
      createMockTweet({
        id: `mock-tweet-${username}-${i + 1}`,
        text: `Mock tweet ${i + 1} from @${username}`,
        authorUsername: username,
      }),
    );
  }

  async searchTweets(
    query: string,
    options?: SearchTweetsOptions,
  ): Promise<Tweet[]> {
    const count = options?.count ?? 3;
    return Array.from({ length: count }, (_, i) =>
      createMockTweet({
        id: `mock-search-${i + 1}`,
        text: `Mock search result ${i + 1} for "${query}"`,
        authorUsername: `searcher${i + 1}`,
      }),
    );
  }

  async getUserInfo(username: string): Promise<UserInfo> {
    return createMockUserInfo(username);
  }

  async getTweetDetails(tweetId: string): Promise<Tweet> {
    return createMockTweet({
      id: tweetId,
      text: `Mock tweet details for ${tweetId}`,
      authorUsername: "mockuser",
    });
  }

  async getTweetReplies(tweetId: string): Promise<Tweet[]> {
    return [
      createMockTweet({
        id: `mock-reply-${tweetId}-1`,
        text: `Mock reply 1 to tweet ${tweetId}`,
        authorUsername: "replier1",
        isReply: true,
        replyToId: tweetId,
      }),
      createMockTweet({
        id: `mock-reply-${tweetId}-2`,
        text: `Mock reply 2 to tweet ${tweetId}`,
        authorUsername: "replier2",
        isReply: true,
        replyToId: tweetId,
      }),
    ];
  }

  async searchUserTweets(
    username: string,
    query: string,
  ): Promise<Tweet[]> {
    return [
      createMockTweet({
        id: "mock-usersearch-1",
        text: `Mock result for "${query}" in @${username}'s tweets`,
        authorUsername: username,
      }),
    ];
  }

  // ---------------------------------------------------------------------------
  // User content endpoints (API Key only)
  // ---------------------------------------------------------------------------

  async getUserTimeline(username: string): Promise<Tweet[]> {
    return Array.from({ length: 3 }, (_, i) =>
      createMockTweet({
        id: `mock-timeline-${username}-${i + 1}`,
        text: `Mock timeline tweet ${i + 1} from @${username}`,
        authorUsername: username,
      }),
    );
  }

  async getUserReplies(username: string): Promise<Tweet[]> {
    return Array.from({ length: 2 }, (_, i) =>
      createMockTweet({
        id: `mock-user-reply-${username}-${i + 1}`,
        text: `Mock reply ${i + 1} by @${username}`,
        authorUsername: username,
        isReply: true,
        replyToId: `original-tweet-${i + 1}`,
      }),
    );
  }

  async getUserHighlights(username: string): Promise<Tweet[]> {
    return [
      createMockTweet({
        id: `mock-highlight-${username}-1`,
        text: `Mock highlighted tweet from @${username}`,
        authorUsername: username,
      }),
    ];
  }

  // ---------------------------------------------------------------------------
  // User connections endpoints (API Key only)
  // ---------------------------------------------------------------------------

  async getUserFollowers(username: string): Promise<UserInfo[]> {
    return Array.from({ length: 3 }, (_, i) =>
      createMockUserInfo(`${username}_follower_${i + 1}`),
    );
  }

  async getUserFollowing(username: string): Promise<UserInfo[]> {
    return Array.from({ length: 2 }, (_, i) =>
      createMockUserInfo(`${username}_following_${i + 1}`),
    );
  }

  async getUserAffiliates(username: string): Promise<UserInfo[]> {
    return [createMockUserInfo(`${username}_affiliate_1`)];
  }

  async getUserAnalytics(): Promise<AnalyticsWithTimeSeries> {
    return {
      impressions: 10000,
      engagements: 500,
      engagement_rate: 5.0,
      likes: 200,
      retweets: 100,
      replies: 80,
      profile_visits: 300,
      followers: 5000,
      following: 200,
      verified_followers: 50,
      bookmarks: 30,
      shares: 20,
      unfollows: 5,
      time_series: [
        {
          date: "2026-02-23",
          impressions: 1500,
          engagements: 75,
          profile_visits: 40,
          follows: 10,
          likes: 30,
          replies: 12,
          retweets: 15,
          bookmarks: 5,
        },
        {
          date: "2026-02-24",
          impressions: 1800,
          engagements: 90,
          profile_visits: 50,
          follows: 12,
          likes: 35,
          replies: 15,
          retweets: 18,
          bookmarks: 8,
        },
      ],
    };
  }

  async getUserBookmarks(): Promise<Tweet[]> {
    return [
      createMockTweet({
        id: "mock-bookmark-1",
        text: "Mock bookmarked tweet about AI agents",
        authorUsername: "ai_researcher",
      }),
      createMockTweet({
        id: "mock-bookmark-2",
        text: "Mock bookmarked tweet about TypeScript patterns",
        authorUsername: "ts_expert",
      }),
    ];
  }

  async getUserLikes(): Promise<Tweet[]> {
    return [
      createMockTweet({
        id: "mock-like-1",
        text: "Mock liked tweet about Bun runtime",
        authorUsername: "bun_dev",
      }),
    ];
  }

  async getUserLists(): Promise<TwitterList[]> {
    return [
      {
        id: "mock-list-1",
        name: "AI Researchers",
        description: "Top AI researchers to follow",
        member_count: 42,
        subscriber_count: 100,
        created_at: "2025-01-01T00:00:00Z",
        created_by: "mockuser",
        is_following: true,
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Messages endpoints (cookie required)
  // ---------------------------------------------------------------------------

  async getInbox(): Promise<InboxItem[]> {
    return [
      {
        conversation_id: "conv-mock-1",
        last_message: {
          id: "msg-mock-1",
          text: "Hey, have you seen the latest update?",
          sender_id: "user-alice",
          recipient_id: "user-me",
          created_at: "2026-02-25T10:30:00Z",
        },
        participants: [
          createMockUserInfo("alice"),
          createMockUserInfo("me"),
        ],
        unread_count: 2,
      },
      {
        conversation_id: "conv-mock-2",
        last_message: {
          id: "msg-mock-2",
          text: "Thanks for the feedback!",
          sender_id: "user-me",
          recipient_id: "user-bob",
          created_at: "2026-02-24T15:00:00Z",
        },
        participants: [
          createMockUserInfo("bob"),
          createMockUserInfo("me"),
        ],
        unread_count: 0,
      },
    ];
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    return {
      conversation_id: conversationId,
      messages: [
        {
          id: `${conversationId}-msg-1`,
          text: "Hello! How are you?",
          sender_id: "user-alice",
          recipient_id: "user-me",
          created_at: "2026-02-25T10:00:00Z",
        },
        {
          id: `${conversationId}-msg-2`,
          text: "I'm great, thanks! Working on the dashboard.",
          sender_id: "user-me",
          recipient_id: "user-alice",
          created_at: "2026-02-25T10:15:00Z",
        },
        {
          id: `${conversationId}-msg-3`,
          text: "Hey, have you seen the latest update?",
          sender_id: "user-alice",
          recipient_id: "user-me",
          created_at: "2026-02-25T10:30:00Z",
        },
      ],
      participants: [
        createMockUserInfo("alice"),
        createMockUserInfo("me"),
      ],
    };
  }
}

// =============================================================================
// Mock data factories
// =============================================================================

function createMockTweet(params: {
  id: string;
  text: string;
  authorUsername: string;
  isReply?: boolean;
  replyToId?: string;
}): Tweet {
  return {
    id: params.id,
    text: params.text,
    author: {
      id: `author-${params.authorUsername}`,
      username: params.authorUsername,
      name: `Mock ${params.authorUsername}`,
      profile_image_url: `https://pbs.twimg.com/profile_images/mock/${params.authorUsername}.jpg`,
      followers_count: 1000,
      is_verified: false,
    },
    created_at: new Date().toISOString(),
    url: `https://x.com/${params.authorUsername}/status/${params.id}`,
    metrics: {
      retweet_count: 5,
      like_count: 42,
      reply_count: 3,
      quote_count: 1,
      view_count: 1000,
      bookmark_count: 2,
    },
    is_retweet: false,
    is_quote: false,
    is_reply: params.isReply ?? false,
    lang: "en",
    entities: {
      hashtags: [],
      mentioned_users: [],
      urls: [],
    },
    ...(params.replyToId ? { reply_to_id: params.replyToId } : {}),
  };
}

function createMockUserInfo(username: string): UserInfo {
  return {
    id: `user-${username}`,
    username,
    name: `Mock ${username}`,
    description: `This is a mock profile for @${username}`,
    location: "San Francisco, CA",
    profile_image_url: `https://pbs.twimg.com/profile_images/mock/${username}.jpg`,
    profile_banner_url: `https://pbs.twimg.com/profile_banners/mock/${username}.jpg`,
    followers_count: 5000,
    following_count: 200,
    tweet_count: 1000,
    like_count: 3000,
    is_verified: false,
    created_at: "2020-01-01T00:00:00Z",
  };
}
