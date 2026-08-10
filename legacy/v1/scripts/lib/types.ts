// =============================================================================
// Script-layer Types
// Shared domain types are re-exported from shared/types.ts (single source of truth).
// Only script-specific types are defined here.
// =============================================================================

export type {
  Tweet,
  TweetAuthor,
  TweetMetrics,
  TweetMedia,
  TweetEntities,
  UserInfo,
  TwitterList,
  Analytics,
  DailyMetrics,
  AnalyticsWithTimeSeries,
  Message,
  Conversation,
  InboxItem,
  Credits,
  CreditsUsageRecord,
} from "../../shared/types";

import type {
  Tweet,
  TweetMetrics,
} from "../../shared/types";

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
