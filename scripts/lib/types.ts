// =============================================================================
// Configuration Types
// =============================================================================

export interface Config {
  api: {
    api_key: string;
    base_url: string;
    cookie?: string;
  };
  me: {
    username: string;
    is_blue_verified: boolean;
  };
  settings: {
    max_tweets_per_user: number;
  };
  classification: {
    interests: string[];
    filter_retweets_without_comment: boolean;
  };
}

// =============================================================================
// Watchlist Types
// =============================================================================

export interface WatchlistUser {
  username: string;
  url: string;
  added_at: string; // ISO 8601
}

export interface Watchlist {
  users: WatchlistUser[];
}

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
// Raw Tweets File (Script output -> Skill input)
// =============================================================================

export interface RawTweetsFile {
  fetched_at: string; // ISO 8601
  tweets: Tweet[];
  errors?: {
    username: string;
    error: string;
  }[];
}

// =============================================================================
// Classification Types (Skill output -> Script input)
// =============================================================================

export interface ClassifiedTweetResult {
  tweet_id: string;
  reason: string; // Chinese explanation of why this tweet is worth reading
}

// =============================================================================
// Thread Types (for grouping related tweets)
// =============================================================================

export interface TweetThread {
  id: string; // Root tweet ID
  root: Tweet; // The main/first tweet
  replies: Tweet[]; // Author's self-replies in order
  reply_count: number; // Number of replies in thread
  combined_text: string; // All text combined for context
  total_metrics: TweetMetrics; // Aggregated metrics
}

export interface ClassifiedFile {
  classified_at: string; // ISO 8601
  source_file: string;
  total_count: number; // Total tweets in source file
  thread_count?: number; // Number of threads after merging
  results: ClassifiedTweetResult[]; // Top 20 tweets/threads, ordered by value
}

// =============================================================================
// Report Types (Final output)
// =============================================================================

export interface ReportTweet extends Tweet {
  reason: string; // Why this tweet is worth reading
  thread_replies?: Tweet[]; // Self-replies in this thread
  is_thread?: boolean; // Whether this is a multi-tweet thread
}

export interface ReportFile {
  generated_at: string; // ISO 8601
  summary: {
    total_fetched: number;
    selected_count: number;
  };
  tweets: ReportTweet[];
}

// =============================================================================
// Internal Normalized Types
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
// Processed Tweets Tracking (for deduplication)
// =============================================================================

export interface ProcessedTweet {
  tweet_id: string;
  processed_at: string; // ISO 8601
  classification_result?: "selected" | "skipped";
}

export interface ProcessedFile {
  last_updated: string; // ISO 8601
  tweets: Record<string, ProcessedTweet>; // tweet_id -> ProcessedTweet
}

// =============================================================================
// Command Result Types
// =============================================================================

export interface CommandResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}
