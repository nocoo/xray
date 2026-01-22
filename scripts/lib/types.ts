// =============================================================================
// Configuration Types
// =============================================================================

export interface Config {
  api: {
    api_key: string;
    base_url: string;
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
  time_range: {
    from: string;
    to: string;
  };
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
  time_range: {
    from: string;
    to: string;
  };
  summary: {
    total_fetched: number;
    selected_count: number;
  };
  tweets: ReportTweet[];
}

// =============================================================================
// TweAPI Response Types (from api.tweapi.io)
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
  createdAt: string; // ISO 8601
  lang: string;
  bookmarkCount: number;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  viewCount: number;
  conversationId: string;
  tweetBy: TweAPIAuthor;
  entities: TweAPIEntities;
  media?: TweAPIMedia[];
  quoted?: TweAPITweet;
  replyTo?: string;
}

export interface TweAPIResponse {
  code: number;
  msg: string;
  data: {
    list: TweAPITweet[];
    next?: string;
  };
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
