"use client";

import { useState, useEffect, useCallback, use } from "react";
import { AppShell } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  Repeat2,
  MessageCircle,
  Eye,
  Bookmark,
  ExternalLink,
  MapPin,
  Calendar,
  ArrowLeft,
  Loader2,
  Quote,
  Hash,
  AtSign,
  Image as ImageIcon,
} from "lucide-react";
import Link from "next/link";

/* eslint-disable @next/next/no-img-element */

// =============================================================================
// Types
// =============================================================================

type UserInfo = {
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
};

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
// User Profile Page
// =============================================================================

export default function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [userRes, tweetsRes] = await Promise.all([
        fetch(`/api/explore/users?username=${encodeURIComponent(username)}`),
        fetch(
          `/api/explore/users/tweets?username=${encodeURIComponent(username)}&count=20`,
        ),
      ]);

      if (userRes.ok) {
        const userData = await userRes.json();
        if (userData.success) setUser(userData.data);
        else setError(userData.error);
      } else {
        const errData = await userRes.json().catch(() => null);
        setError(errData?.error ?? "Failed to load user profile");
      }

      if (tweetsRes.ok) {
        const tweetsData = await tweetsRes.json();
        if (tweetsData.success) setTweets(tweetsData.data ?? []);
      }
    } catch {
      setError("Network error — could not reach API");
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <AppShell
      breadcrumbs={[
        { label: "Explore", href: "/explore" },
        { label: `@${username}` },
      ]}
    >
      <div className="space-y-6">
        {/* Back link */}
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Explore
        </Link>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="rounded-card bg-destructive/10 p-6 text-center text-destructive">
            {error}
          </div>
        )}

        {/* Profile card */}
        {user && !loading && (
          <>
            <div className="rounded-card bg-secondary overflow-hidden">
              {/* Banner */}
              {user.profile_banner_url && (
                <div className="h-32 sm:h-40 overflow-hidden">
                  <img
                    src={user.profile_banner_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="p-5">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <img
                    src={user.profile_image_url}
                    alt={user.name}
                    className={`h-16 w-16 shrink-0 rounded-full border-4 border-secondary ${
                      user.profile_banner_url ? "-mt-12" : ""
                    }`}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h1 className="text-xl font-semibold truncate">
                        {user.name}
                      </h1>
                      {user.is_verified && (
                        <Badge variant="default" className="shrink-0">
                          Verified
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      @{user.username}
                    </p>
                  </div>

                  {/* External link */}
                  <a
                    href={`https://x.com/${user.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Open on X"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>

                {/* Bio */}
                {user.description && (
                  <p className="mt-3 text-sm leading-relaxed">
                    {user.description}
                  </p>
                )}

                {/* Meta row */}
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  {user.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {user.location}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Joined{" "}
                    {new Date(user.created_at).toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </div>

                {/* Stats row */}
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCell
                    label="Followers"
                    value={formatCount(user.followers_count)}
                  />
                  <StatCell
                    label="Following"
                    value={formatCount(user.following_count)}
                  />
                  <StatCell
                    label="Tweets"
                    value={formatCount(user.tweet_count)}
                  />
                  <StatCell
                    label="Likes"
                    value={formatCount(user.like_count)}
                  />
                </div>
              </div>
            </div>

            {/* Recent tweets */}
            <div>
              <h2 className="text-lg font-semibold mb-3">
                Recent Tweets ({tweets.length})
              </h2>
              {tweets.length === 0 ? (
                <div className="rounded-card bg-secondary p-8 text-center text-muted-foreground">
                  No recent tweets found.
                </div>
              ) : (
                <div className="space-y-3">
                  {tweets.map((tweet) => (
                    <TweetCard key={tweet.id} tweet={tweet} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-card p-3 text-center">
      <div className="text-lg font-bold font-display">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function TweetCard({ tweet }: { tweet: Tweet }) {
  return (
    <div className="rounded-card bg-secondary p-4 transition-colors hover:bg-secondary/80">
      {/* Author + time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">
            {tweet.author.name}
          </span>
          <span className="text-xs text-muted-foreground">
            @{tweet.author.username}
          </span>
          {/* Tweet type badges */}
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
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            {formatTimeAgo(tweet.created_at)}
          </span>
          <a
            href={tweet.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Text */}
      <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
        {tweet.text}
      </p>

      {/* Media */}
      {tweet.media && tweet.media.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {tweet.media.map((m) => (
            <div
              key={m.id}
              className="relative shrink-0 overflow-hidden rounded-lg bg-muted"
            >
              {m.type === "PHOTO" ? (
                <img
                  src={m.url}
                  alt=""
                  className="h-36 w-auto max-w-[260px] object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-36 w-36 items-center justify-center">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
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
            {tweet.entities.mentioned_users.map((u) => (
              <Badge key={u} variant="secondary" className="h-5 text-[10px]">
                <AtSign className="mr-0.5 h-2.5 w-2.5" />
                {u}
              </Badge>
            ))}
          </div>
        )}

      {/* Quoted tweet */}
      {tweet.quoted_tweet && (
        <div className="mt-2 rounded-lg border border-border p-3 bg-card/50">
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

      {/* Metrics */}
      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
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
