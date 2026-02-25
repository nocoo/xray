// =============================================================================
// TweAPI raw response types (provider-specific, not exposed to consumers)
// =============================================================================

export interface TweAPIAuthor {
  id: string;
  userName: string;
  fullName: string;
  description?: string;
  location?: string;
  profileImage: string;
  profileBanner?: string;
  followersCount: number;
  followingsCount: number;
  statusesCount: number;
  likeCount: number;
  isVerified: boolean;
  createdAt: string;
  pinnedTweet?: string;
}

export interface TweAPIMedia {
  id: string;
  type: "PHOTO" | "VIDEO" | "GIF";
  url: string;
  thumbnailUrl?: string;
}

export interface TweAPIEntities {
  hashtags: string[];
  mentionedUsers: string[];
  urls: string[];
}

export interface TweAPITweet {
  id: string;
  url: string;
  fullText: string;
  createdAt: string;
  lang: string;
  bookmarkCount: number;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  viewCount?: number;
  conversationId: string;
  tweetBy: TweAPIAuthor;
  entities: TweAPIEntities;
  media?: TweAPIMedia[];
  quoted?: TweAPITweet;
  replyTo?: string;
  retweetedTweet?: TweAPITweet;
}

export interface TweAPIResponse {
  code: number;
  msg: string;
  data: {
    list: TweAPITweet[];
    next?: string;
  };
}

export interface TweAPITweetDetailsResponse {
  code: number;
  msg: string;
  data: TweAPITweet;
}

export interface TweAPIUserInfoResponse {
  code: number;
  msg: string;
  data: TweAPIAuthor;
}

export interface TweAPIList {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  subscriberCount: number;
  createdAt: string;
  createdBy: string;
  isFollowing?: boolean;
  isMember?: boolean;
}

export interface TweAPIListsResponse {
  code: number;
  msg: string;
  data: {
    list: TweAPIList[];
    next?: string;
  };
}

export interface TweAPIMetricValue {
  metric_value?: number;
  metric_type: string;
}

export interface TweAPIMetricTimeSeries {
  metric_values: TweAPIMetricValue[];
  timestamp: {
    iso8601_time: string;
  };
}

export interface TweAPIAnalytics {
  createdAt: string;
  followers: number;
  verifiedFollowers?: number;
  impressions: number;
  profileVisits: number;
  engagements: number;
  follows?: number;
  replies?: number | null;
  likes?: number | null;
  retweets?: number | null;
  bookmarks?: number | null;
  shares?: number | null;
  createTweets?: number | null;
  createQuote?: number | null;
  unfollows?: number | null;
  createReply?: number | null;
  organicMetricsTimeSeries?: TweAPIMetricTimeSeries[];
}

export interface TweAPIAnalyticsResponse {
  code: number;
  msg: string;
  data: TweAPIAnalytics;
}

export interface TweAPIUserListResponse {
  code: number;
  msg: string;
  data: {
    list: TweAPIAuthor[];
    next?: string;
  };
}
