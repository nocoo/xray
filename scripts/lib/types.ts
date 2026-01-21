// =============================================================================
// Configuration Types
// =============================================================================

export interface Config {
  api: {
    api_key: string;
    base_url: string;
  };
  settings: {
    time_range_hours: number;
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
// Tweet Types (from API)
// =============================================================================

export interface TweetAuthor {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
}

export interface TweetMetrics {
  retweet_count: number;
  like_count: number;
  reply_count: number;
  quote_count?: number;
  view_count?: number;
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
  lang?: string;
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

export interface TweetClassification {
  is_tech_related: boolean;
  is_hot_topic: boolean;
  category: string[];
  tags: string[]; // e.g. ["#LLM", "#Agent", "#RAG", "#OpenSource"]
  relevance_score: number; // 0-100
  reason: string;
}

export interface ClassifiedTweetResult {
  tweet_id: string;
  classification: TweetClassification;
}

export interface ClassifiedFile {
  classified_at: string; // ISO 8601
  source_file: string;
  results: ClassifiedTweetResult[];
}

// =============================================================================
// Report Types (Final output)
// =============================================================================

export interface ReportTweet extends Tweet {
  classification: TweetClassification;
}

export interface ReportFile {
  generated_at: string; // ISO 8601
  time_range: {
    from: string;
    to: string;
  };
  summary: {
    total_fetched: number;
    tech_related: number;
    hot_topics: number;
    categories: Record<string, number>;
  };
  filtered_tweets: ReportTweet[];
}

// =============================================================================
// API Response Types (from api.twitterapi.io)
// =============================================================================

export interface TwitterAPIAuthor {
  type: string;
  userName: string;
  url: string;
  id: string;
  name: string;
  isVerified: boolean;
  isBlueVerified: boolean;
  profilePicture: string;
  coverPicture?: string;
  description?: string;
  location?: string;
  followers: number;
  following: number;
  createdAt: string;
}

export interface TwitterAPITweet {
  type: string;
  id: string;
  url: string;
  text: string;
  source: string;
  retweetCount: number;
  replyCount: number;
  likeCount: number;
  quoteCount: number;
  viewCount: number;
  bookmarkCount: number;
  createdAt: string;
  lang: string;
  isReply: boolean;
  inReplyToId: string | null;
  conversationId: string;
  inReplyToUserId: string | null;
  inReplyToUsername: string | null;
  author: TwitterAPIAuthor;
  quoted_tweet: TwitterAPITweet | null;
  retweeted_tweet: TwitterAPITweet | null;
  entities?: {
    urls?: Array<{
      display_url: string;
      expanded_url: string;
      url: string;
    }>;
  };
}

export interface TwitterAPIResponse {
  status: string;
  code: number;
  msg: string;
  data?: {
    pin_tweet: TwitterAPITweet | null;
    tweets: TwitterAPITweet[];
    next_cursor?: string;
  };
}

// =============================================================================
// Processed Tweets Tracking (for deduplication)
// =============================================================================

export interface ProcessedTweet {
  tweet_id: string;
  processed_at: string; // ISO 8601
  classification_result?: "tech" | "non_tech" | "skipped";
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
