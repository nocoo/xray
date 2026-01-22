import type { Tweet, RawTweetsFile, TweetThread, TweetMetrics } from "./types";

// =============================================================================
// Tweet Summary Types
// =============================================================================

export interface TweetSummary {
  id: string;
  url: string;
  author: {
    username: string;
    name: string;
    followers_count: number;
    is_verified: boolean;
  };
  created_at: string;
  text: string;
  text_length: number;
  metrics: {
    views: number;
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
    bookmarks: number;
  };
  type: "original" | "quote" | "reply" | "retweet";
  has_media: boolean;
  media_types: string[];
  has_urls: boolean;
  url_count: number;
  quoted_tweet?: {
    id: string;
    author_username: string;
    author_name: string;
    text: string;
    has_media: boolean;
    media_types: string[];
  };
}

export interface FilterOptions {
  exclude_replies?: boolean;
  exclude_retweets?: boolean;
  exclude_pure_links?: boolean;
  min_text_length?: number;
  min_views?: number;
  only_with_media?: boolean;
  only_with_quoted?: boolean;
}

export interface FilterResult {
  passed: Tweet[];
  filtered: {
    tweet: Tweet;
    reason: string;
  }[];
}

// =============================================================================
// Tweet Type Detection
// =============================================================================

export function getTweetType(tweet: Tweet): "original" | "quote" | "reply" | "retweet" {
  if (tweet.is_retweet) return "retweet";
  if (tweet.is_reply) return "reply";
  if (tweet.is_quote) return "quote";
  return "original";
}

// =============================================================================
// Pure Link Detection
// =============================================================================

export function isPureLink(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  const urlPattern = /^(https?:\/\/\S+\s*)+$/;
  if (urlPattern.test(trimmed)) return true;

  const textWithoutUrls = trimmed.replace(/https?:\/\/\S+/g, "").trim();
  return textWithoutUrls.length === 0;
}

// =============================================================================
// Text Content Extraction (removes URLs for length calculation)
// =============================================================================

export function getTextContent(text: string): string {
  return text.replace(/https?:\/\/\S+/g, "").trim();
}

export function getTextContentLength(text: string): number {
  return getTextContent(text).length;
}

// =============================================================================
// Media Type Extraction
// =============================================================================

export function getMediaTypes(tweet: Tweet): string[] {
  if (!tweet.media || tweet.media.length === 0) return [];
  return [...new Set(tweet.media.map((m) => m.type))];
}

// =============================================================================
// Tweet Summary Extraction
// =============================================================================

export function extractTweetSummary(tweet: Tweet): TweetSummary {
  const mediaTypes = getMediaTypes(tweet);

  const summary: TweetSummary = {
    id: tweet.id,
    url: tweet.url,
    author: {
      username: tweet.author.username,
      name: tweet.author.name,
      followers_count: tweet.author.followers_count ?? 0,
      is_verified: tweet.author.is_verified ?? false,
    },
    created_at: tweet.created_at,
    text: tweet.text,
    text_length: getTextContentLength(tweet.text),
    metrics: {
      views: tweet.metrics.view_count,
      likes: tweet.metrics.like_count,
      retweets: tweet.metrics.retweet_count,
      replies: tweet.metrics.reply_count,
      quotes: tweet.metrics.quote_count,
      bookmarks: tweet.metrics.bookmark_count,
    },
    type: getTweetType(tweet),
    has_media: mediaTypes.length > 0,
    media_types: mediaTypes,
    has_urls: (tweet.entities?.urls?.length ?? 0) > 0,
    url_count: tweet.entities?.urls?.length ?? 0,
  };

  if (tweet.quoted_tweet) {
    const quotedMediaTypes = getMediaTypes(tweet.quoted_tweet);
    summary.quoted_tweet = {
      id: tweet.quoted_tweet.id,
      author_username: tweet.quoted_tweet.author.username,
      author_name: tweet.quoted_tweet.author.name,
      text: tweet.quoted_tweet.text,
      has_media: quotedMediaTypes.length > 0,
      media_types: quotedMediaTypes,
    };
  }

  return summary;
}

// =============================================================================
// Tweet Filtering
// =============================================================================

export function filterTweets(tweets: Tweet[], options: FilterOptions = {}): FilterResult {
  const {
    exclude_replies = true,
    exclude_retweets = true,
    exclude_pure_links = true,
    min_text_length = 10,
    min_views = 0,
    only_with_media = false,
    only_with_quoted = false,
  } = options;

  const passed: Tweet[] = [];
  const filtered: { tweet: Tweet; reason: string }[] = [];

  for (const tweet of tweets) {
    if (exclude_retweets && tweet.is_retweet) {
      filtered.push({ tweet, reason: "is_retweet" });
      continue;
    }

    if (exclude_replies && tweet.is_reply) {
      filtered.push({ tweet, reason: "is_reply" });
      continue;
    }

    if (exclude_pure_links && isPureLink(tweet.text)) {
      filtered.push({ tweet, reason: "pure_link" });
      continue;
    }

    const textLength = getTextContentLength(tweet.text);
    if (textLength < min_text_length) {
      filtered.push({ tweet, reason: `text_too_short (${textLength} < ${min_text_length})` });
      continue;
    }

    if (min_views > 0 && tweet.metrics.view_count < min_views) {
      filtered.push({ tweet, reason: `low_views (${tweet.metrics.view_count} < ${min_views})` });
      continue;
    }

    if (only_with_media && (!tweet.media || tweet.media.length === 0)) {
      filtered.push({ tweet, reason: "no_media" });
      continue;
    }

    if (only_with_quoted && !tweet.quoted_tweet) {
      filtered.push({ tweet, reason: "no_quoted_tweet" });
      continue;
    }

    passed.push(tweet);
  }

  return { passed, filtered };
}

// =============================================================================
// Load and Process Raw Tweets
// =============================================================================

export async function loadRawTweets(path: string): Promise<RawTweetsFile> {
  const file = Bun.file(path);
  const content = await file.json();
  return content as RawTweetsFile;
}

export async function loadAndFilterTweets(
  path: string,
  options: FilterOptions = {}
): Promise<FilterResult> {
  const rawTweets = await loadRawTweets(path);
  return filterTweets(rawTweets.tweets, options);
}

// =============================================================================
// Batch Summary Extraction
// =============================================================================

export function extractAllSummaries(tweets: Tweet[]): TweetSummary[] {
  return tweets.map(extractTweetSummary);
}

// =============================================================================
// Statistics
// =============================================================================

export interface TweetStats {
  total: number;
  by_type: {
    original: number;
    quote: number;
    reply: number;
    retweet: number;
  };
  with_media: number;
  with_quoted: number;
  with_urls: number;
  avg_text_length: number;
  avg_views: number;
  top_authors: { username: string; count: number }[];
}

export function calculateStats(tweets: Tweet[]): TweetStats {
  const authorCounts: Record<string, number> = {};
  let totalTextLength = 0;
  let totalViews = 0;

  const stats: TweetStats = {
    total: tweets.length,
    by_type: { original: 0, quote: 0, reply: 0, retweet: 0 },
    with_media: 0,
    with_quoted: 0,
    with_urls: 0,
    avg_text_length: 0,
    avg_views: 0,
    top_authors: [],
  };

  for (const tweet of tweets) {
    const type = getTweetType(tweet);
    stats.by_type[type]++;

    if (tweet.media && tweet.media.length > 0) stats.with_media++;
    if (tweet.quoted_tweet) stats.with_quoted++;
    if (tweet.entities?.urls && tweet.entities.urls.length > 0) stats.with_urls++;

    totalTextLength += getTextContentLength(tweet.text);
    totalViews += tweet.metrics.view_count;

    authorCounts[tweet.author.username] = (authorCounts[tweet.author.username] || 0) + 1;
  }

  if (tweets.length > 0) {
    stats.avg_text_length = Math.round(totalTextLength / tweets.length);
    stats.avg_views = Math.round(totalViews / tweets.length);
  }

  stats.top_authors = Object.entries(authorCounts)
    .map(([username, count]) => ({ username, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return stats;
}

// =============================================================================
// Thread Detection and Merging
// =============================================================================

export function buildThreads(tweets: Tweet[]): TweetThread[] {
  const tweetMap = new Map<string, Tweet>();
  const childToParent = new Map<string, string>();
  const parentToChildren = new Map<string, Tweet[]>();

  for (const tweet of tweets) {
    tweetMap.set(tweet.id, tweet);
  }

  for (const tweet of tweets) {
    if (tweet.reply_to_id && tweetMap.has(tweet.reply_to_id)) {
      const parent = tweetMap.get(tweet.reply_to_id)!;
      if (parent.author.username === tweet.author.username) {
        childToParent.set(tweet.id, tweet.reply_to_id);
        if (!parentToChildren.has(tweet.reply_to_id)) {
          parentToChildren.set(tweet.reply_to_id, []);
        }
        parentToChildren.get(tweet.reply_to_id)!.push(tweet);
      }
    }
  }

  const processedIds = new Set<string>();
  const threads: TweetThread[] = [];

  function findRoot(tweetId: string): string {
    let current = tweetId;
    while (childToParent.has(current)) {
      current = childToParent.get(current)!;
    }
    return current;
  }

  function collectReplies(rootId: string): Tweet[] {
    const replies: Tweet[] = [];
    const queue = [...(parentToChildren.get(rootId) || [])];

    queue.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    while (queue.length > 0) {
      const tweet = queue.shift()!;
      replies.push(tweet);
      const children = parentToChildren.get(tweet.id) || [];
      children.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      queue.unshift(...children);
    }

    return replies;
  }

  function aggregateMetrics(tweets: Tweet[]): TweetMetrics {
    return tweets.reduce(
      (acc, t) => ({
        retweet_count: acc.retweet_count + t.metrics.retweet_count,
        like_count: acc.like_count + t.metrics.like_count,
        reply_count: acc.reply_count + t.metrics.reply_count,
        quote_count: acc.quote_count + t.metrics.quote_count,
        view_count: acc.view_count + t.metrics.view_count,
        bookmark_count: acc.bookmark_count + t.metrics.bookmark_count,
      }),
      { retweet_count: 0, like_count: 0, reply_count: 0, quote_count: 0, view_count: 0, bookmark_count: 0 }
    );
  }

  for (const tweet of tweets) {
    if (processedIds.has(tweet.id)) continue;

    const rootId = findRoot(tweet.id);
    if (processedIds.has(rootId)) continue;

    const root = tweetMap.get(rootId)!;
    const replies = collectReplies(rootId);

    processedIds.add(rootId);
    for (const reply of replies) {
      processedIds.add(reply.id);
    }

    const allTweets = [root, ...replies];
    const combinedText = allTweets.map((t) => t.text).join("\n\n---\n\n");

    threads.push({
      id: rootId,
      root,
      replies,
      reply_count: replies.length,
      combined_text: combinedText,
      total_metrics: aggregateMetrics(allTweets),
    });
  }

  threads.sort((a, b) => new Date(b.root.created_at).getTime() - new Date(a.root.created_at).getTime());

  return threads;
}

export interface ThreadSummary {
  id: string;
  author: string;
  reply_count: number;
  is_thread: boolean;
  root_text: string;
  combined_text: string;
  total_views: number;
  total_likes: number;
  url: string;
}

export function summarizeThreads(threads: TweetThread[]): ThreadSummary[] {
  return threads.map((t) => ({
    id: t.id,
    author: t.root.author.username,
    reply_count: t.reply_count,
    is_thread: t.reply_count > 0,
    root_text: t.root.text.slice(0, 100) + (t.root.text.length > 100 ? "..." : ""),
    combined_text: t.combined_text,
    total_views: t.total_metrics.view_count,
    total_likes: t.total_metrics.like_count,
    url: t.root.url,
  }));
}
