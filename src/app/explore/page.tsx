"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Heart,
  Repeat2,
  MessageCircle,
  Eye,
  Bookmark,
  Quote,
  ExternalLink,
  ArrowUpDown,
  Loader2,
  Image as ImageIcon,
  AtSign,
  Hash,
  User,
} from "lucide-react";

// We intentionally use <img> for external Twitter profile images and media.
// next/image requires known hostnames in next.config, which is impractical
// for user-generated Twitter content. The images are small (40px avatars)
// or lazy-loaded (media previews), so LCP impact is negligible.
/* eslint-disable @next/next/no-img-element */

// =============================================================================
// Types (mirrors shared/types.ts — keep in sync)
// =============================================================================

type TweetAuthor = {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
  followers_count?: number;
  is_verified?: boolean;
};

type TweetMetrics = {
  retweet_count: number;
  like_count: number;
  reply_count: number;
  quote_count: number;
  view_count: number;
  bookmark_count: number;
};

type TweetMedia = {
  id: string;
  type: "PHOTO" | "VIDEO" | "GIF";
  url: string;
  thumbnail_url?: string;
};

type TweetEntities = {
  hashtags: string[];
  mentioned_users: string[];
  urls: string[];
};

type Tweet = {
  id: string;
  text: string;
  author: TweetAuthor;
  created_at: string;
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
};

// =============================================================================
// Explore Page
// =============================================================================

type SearchMode = "tweets" | "users";

export default function ExplorePage() {
  const router = useRouter();
  const [mode, setMode] = useState<SearchMode>("tweets");
  const [query, setQuery] = useState("");
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortByTop, setSortByTop] = useState(true);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const q = query.trim();
      if (!q) return;

      // User mode: navigate to profile page
      if (mode === "users") {
        const username = q.replace(/^@/, "");
        router.push(`/explore/user/${encodeURIComponent(username)}`);
        return;
      }

      // Tweet mode: search API
      setLoading(true);
      setError(null);
      setSearched(true);

      try {
        const params = new URLSearchParams({
          q,
          count: "20",
          sort_by_top: String(sortByTop),
        });
        const res = await fetch(`/api/explore/tweets?${params}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(data.error ?? "Search failed");
          setTweets([]);
        } else {
          setTweets(data.data ?? []);
        }
      } catch {
        setError("Network error — could not reach API");
        setTweets([]);
      } finally {
        setLoading(false);
      }
    },
    [query, sortByTop, mode, router],
  );

  return (
    <AppShell breadcrumbs={[{ label: "Explore" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Explore</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search tweets or look up user profiles on Twitter/X.
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 rounded-widget bg-secondary p-1 w-fit">
          <button
            type="button"
            onClick={() => setMode("tweets")}
            className={`flex items-center gap-1.5 rounded-widget px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "tweets"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            Tweets
          </button>
          <button
            type="button"
            onClick={() => setMode("users")}
            className={`flex items-center gap-1.5 rounded-widget px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "users"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <User className="h-3.5 w-3.5" />
            Users
          </button>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            {mode === "tweets" ? (
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            ) : (
              <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            )}
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === "tweets"
                  ? "Search tweets... (e.g. 'AI agents', 'from:elonmusk')"
                  : "Enter username... (e.g. 'elonmusk' or '@elonmusk')"
              }
              className="pl-9"
            />
          </div>
          {mode === "tweets" && (
            <button
              type="button"
              onClick={() => setSortByTop((v) => !v)}
              className={`flex items-center gap-1.5 rounded-widget px-3 text-xs font-medium transition-colors ${
                sortByTop
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
              title={sortByTop ? "Sorted by top" : "Sorted by recent"}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sortByTop ? "Top" : "Recent"}
            </button>
          )}
          <Button type="submit" disabled={loading || !query.trim()}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "tweets" ? (
              "Search"
            ) : (
              "Look Up"
            )}
          </Button>
        </form>

        {/* Error state */}
        {error && (
          <div className="rounded-card bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Results (tweet mode only) */}
        {mode === "tweets" && searched && !loading && !error && tweets.length === 0 && (
          <div className="rounded-card bg-secondary p-8 text-center text-muted-foreground">
            No tweets found for &quot;{query}&quot;
          </div>
        )}

        {mode === "tweets" && tweets.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {tweets.length} result{tweets.length !== 1 ? "s" : ""}
            </div>
            {tweets.map((tweet) => (
              <TweetCard key={tweet.id} tweet={tweet} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!searched && mode === "tweets" && (
          <div className="rounded-card bg-secondary p-12 text-center">
            <Search className="mx-auto h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">
              Enter a search query to discover tweets.
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Tip: Use operators like{" "}
              <code className="rounded bg-muted px-1">from:username</code>,{" "}
              <code className="rounded bg-muted px-1">min_likes:100</code>,{" "}
              <code className="rounded bg-muted px-1">lang:en</code>
            </p>
          </div>
        )}

        {mode === "users" && !loading && (
          <div className="rounded-card bg-secondary p-12 text-center">
            <User className="mx-auto h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">
              Enter a Twitter/X username to view their profile and recent
              tweets.
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              The @ symbol is optional — both{" "}
              <code className="rounded bg-muted px-1">elonmusk</code> and{" "}
              <code className="rounded bg-muted px-1">@elonmusk</code> work.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// =============================================================================
// Tweet Card
// =============================================================================

function TweetCard({ tweet }: { tweet: Tweet }) {
  return (
    <div className="rounded-card bg-secondary p-4 transition-colors hover:bg-secondary/80">
      {/* Author row */}
      <div className="flex items-start gap-3">
        {tweet.author.profile_image_url ? (
          <img
            src={tweet.author.profile_image_url}
            alt={tweet.author.name}
            className="h-10 w-10 shrink-0 rounded-full"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
            {tweet.author.name[0]}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{tweet.author.name}</span>
            {tweet.author.is_verified && (
              <Badge variant="default" className="h-4 px-1 text-[10px]">
                V
              </Badge>
            )}
            <span className="text-sm text-muted-foreground truncate">
              @{tweet.author.username}
            </span>
            <span className="text-sm text-muted-foreground">·</span>
            <span className="text-sm text-muted-foreground shrink-0">
              {formatTimeAgo(tweet.created_at)}
            </span>
          </div>

          {/* Tweet type badges */}
          <div className="flex items-center gap-1.5 mt-0.5">
            {tweet.is_retweet && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                <Repeat2 className="mr-0.5 h-2.5 w-2.5" /> RT
              </Badge>
            )}
            {tweet.is_reply && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                <MessageCircle className="mr-0.5 h-2.5 w-2.5" /> Reply
              </Badge>
            )}
            {tweet.is_quote && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                <Quote className="mr-0.5 h-2.5 w-2.5" /> Quote
              </Badge>
            )}
          </div>
        </div>

        {/* External link */}
        <a
          href={tweet.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Open on X"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {/* Tweet text */}
      <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">
        {tweet.text}
      </p>

      {/* Media preview */}
      {tweet.media && tweet.media.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {tweet.media.map((m) => (
            <div
              key={m.id}
              className="relative shrink-0 overflow-hidden rounded-lg bg-muted"
            >
              {m.type === "PHOTO" ? (
                <img
                  src={m.url}
                  alt=""
                  className="h-40 w-auto max-w-[280px] object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-40 w-40 items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  <span className="ml-1 text-xs text-muted-foreground">
                    {m.type}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Entities */}
      {tweet.entities &&
        (tweet.entities.hashtags.length > 0 ||
          tweet.entities.mentioned_users.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tweet.entities.hashtags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="h-5 text-[10px]"
              >
                <Hash className="mr-0.5 h-2.5 w-2.5" />
                {tag}
              </Badge>
            ))}
            {tweet.entities.mentioned_users.map((user) => (
              <Badge
                key={user}
                variant="secondary"
                className="h-5 text-[10px]"
              >
                <AtSign className="mr-0.5 h-2.5 w-2.5" />
                {user}
              </Badge>
            ))}
          </div>
        )}

      {/* Quoted tweet */}
      {tweet.quoted_tweet && (
        <div className="mt-3 rounded-lg border border-border p-3 bg-card/50">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium">
              {tweet.quoted_tweet.author.name}
            </span>
            <span className="text-xs text-muted-foreground">
              @{tweet.quoted_tweet.author.username}
            </span>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {tweet.quoted_tweet.text}
          </p>
        </div>
      )}

      {/* Metrics row */}
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <MetricItem
          icon={<MessageCircle className="h-3.5 w-3.5" />}
          value={tweet.metrics.reply_count}
        />
        <MetricItem
          icon={<Repeat2 className="h-3.5 w-3.5" />}
          value={tweet.metrics.retweet_count}
        />
        <MetricItem
          icon={<Heart className="h-3.5 w-3.5" />}
          value={tweet.metrics.like_count}
        />
        <MetricItem
          icon={<Eye className="h-3.5 w-3.5" />}
          value={tweet.metrics.view_count}
        />
        <MetricItem
          icon={<Bookmark className="h-3.5 w-3.5" />}
          value={tweet.metrics.bookmark_count}
        />
      </div>
    </div>
  );
}

function MetricItem({
  icon,
  value,
}: {
  icon: React.ReactNode;
  value: number;
}) {
  return (
    <div className="flex items-center gap-1">
      {icon}
      <span className="font-display">{formatCount(value)}</span>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
