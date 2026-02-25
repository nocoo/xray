// =============================================================================
// Shared Types - Platform-agnostic internal models
// These types are the contract between the API server and all consumers.
// =============================================================================

// =============================================================================
// Tweet Types (Internal Model)
// =============================================================================

export interface TweetAuthor {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
  followers_count?: number;
  is_verified?: boolean;
}

export interface TweetMetrics {
  retweet_count: number;
  like_count: number;
  reply_count: number;
  quote_count: number;
  view_count: number;
  bookmark_count: number;
}

export interface TweetMedia {
  id: string;
  type: "PHOTO" | "VIDEO" | "GIF";
  url: string;
  thumbnail_url?: string;
}

export interface TweetEntities {
  hashtags: string[];
  mentioned_users: string[];
  urls: string[];
}

export interface Tweet {
  id: string;
  text: string;
  author: TweetAuthor;
  created_at: string; // ISO 8601
  url: string;
  metrics: TweetMetrics;
  is_retweet: boolean;
  is_quote: boolean;
  is_reply: boolean;
  lang?: string;
  media?: TweetMedia[];
  entities?: TweetEntities;
  quoted_tweet?: Tweet;
  reply_to_id?: string;
}

// =============================================================================
// User Types
// =============================================================================

export interface UserInfo {
  id: string;
  username: string;
  name: string;
  description?: string;
  location?: string;
  profile_image_url: string;
  profile_banner_url?: string;
  followers_count: number;
  following_count: number;
  tweet_count: number;
  like_count: number;
  is_verified: boolean;
  created_at: string;
  pinned_tweet_id?: string;
}

// =============================================================================
// List Types
// =============================================================================

export interface TwitterList {
  id: string;
  name: string;
  description?: string;
  member_count: number;
  subscriber_count: number;
  created_at: string;
  created_by: string;
  is_following?: boolean;
  is_member?: boolean;
}

// =============================================================================
// Analytics Types
// =============================================================================

export interface Analytics {
  impressions: number;
  engagements: number;
  engagement_rate: number;
  likes: number;
  retweets: number;
  replies: number;
  profile_visits: number;
  followers: number;
  following: number;
  verified_followers?: number;
  bookmarks?: number;
  shares?: number;
  unfollows?: number;
}

export interface DailyMetrics {
  date: string;
  impressions: number;
  engagements: number;
  profile_visits: number;
  follows: number;
  likes: number;
  replies: number;
  retweets: number;
  bookmarks: number;
}

export interface AnalyticsWithTimeSeries extends Analytics {
  time_series: DailyMetrics[];
}

// =============================================================================
// Message Types
// =============================================================================

export interface Message {
  id: string;
  text: string;
  sender_id: string;
  recipient_id: string;
  created_at: string;
  media_urls?: string[];
}

export interface Conversation {
  conversation_id: string;
  messages: Message[];
  participants: UserInfo[];
}

export interface InboxItem {
  conversation_id: string;
  last_message: Message;
  participants: UserInfo[];
  unread_count?: number;
}

// =============================================================================
// Credits Types
// =============================================================================

export interface Credits {
  remaining: number;
  total: number;
  expires_at?: string;
}

export interface CreditsUsageRecord {
  date: string;
  endpoint: string;
  credits_used: number;
  request_count: number;
}

// =============================================================================
// API Response Envelope
// =============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface ApiErrorResponse {
  success: boolean;
  error: string;
  details?: unknown;
}
