import type { Tweet } from "../../../../shared/types";

// =============================================================================
// Shared types for watchlist pages (mirroring API response shapes)
// =============================================================================

export interface TagData {
  id: number;
  name: string;
  color: string;
}

export interface WatchlistMember {
  id: number;
  twitterUsername: string;
  note: string | null;
  addedAt: string;
  tags: TagData[];
}

export interface FetchedPostData {
  id: number;
  tweetId: string;
  twitterUsername: string;
  text: string;
  translatedText: string | null;
  commentText: string | null;
  quotedTranslatedText: string | null;
  translatedAt: string | null;
  tweetCreatedAt: string;
  fetchedAt: string;
  tweet: Tweet;
}

// Fetch progress detail types

export interface MemberProgress {
  username: string;
  status: "pending" | "fetching" | "done" | "error";
  tweetsReceived?: number;
  filtered?: number;
  newPosts?: number;
  error?: string;
}

export interface TranslateProgress {
  current: number;
  total: number;
  lastPostId?: number;
  errors: number;
}

export type PipelinePhase = "idle" | "fetching" | "translating" | "done";
