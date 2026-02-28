"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  Repeat2,
  MessageCircle,
  Eye,
  Bookmark,
  Quote,
  ExternalLink,
  Image as ImageIcon,
  AtSign,
  Hash,
} from "lucide-react";

import type { Tweet } from "../../../shared/types";

// We intentionally use <img> for external Twitter profile images and media.
// next/image requires known hostnames in next.config, which is impractical
// for user-generated Twitter content.

// =============================================================================
// TweetCard — reusable tweet display component
// =============================================================================

export function TweetCard({
  tweet,
  linkToDetail = true,
}: {
  tweet: Tweet;
  linkToDetail?: boolean;
}) {
  const card = (
    <div className="rounded-card bg-secondary p-4 transition-colors hover:bg-secondary/80">
      {/* Author row */}
      <div className="flex items-start gap-3">
        {tweet.author.profile_image_url ? (
          <Link
            href={`/users/${tweet.author.username}`}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={tweet.author.profile_image_url}
              alt={tweet.author.name}
              className="h-10 w-10 shrink-0 rounded-full hover:opacity-80 transition-opacity"
            />
          </Link>
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
            {tweet.author.name[0]}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/users/${tweet.author.username}`}
              className="font-medium truncate hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {tweet.author.name}
            </Link>
            {tweet.author.is_verified && (
              <Badge variant="default" className="h-4 px-1 text-[10px]">
                V
              </Badge>
            )}
            <Link
              href={`/users/${tweet.author.username}`}
              className="text-sm text-muted-foreground truncate hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              @{tweet.author.username}
            </Link>
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
          onClick={(e) => e.stopPropagation()}
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
        <div
          className={
            tweet.media.length === 1
              ? "mt-3"
              : "mt-3 flex gap-2 overflow-x-auto"
          }
        >
          {tweet.media.map((m) => {
            const isSingle = tweet.media!.length === 1;

            if (m.type === "PHOTO" || m.type === "GIF") {
              // GIFs from Twitter are just animated images — render as <img>
              return (
                <div
                  key={m.id}
                  className={
                    isSingle
                      ? "overflow-hidden rounded-lg bg-muted"
                      : "relative shrink-0 overflow-hidden rounded-lg bg-muted"
                  }
                >
                  <img
                    src={m.url}
                    alt=""
                    className={
                      isSingle
                        ? "w-full rounded-lg"
                        : "h-40 w-auto max-w-[280px] object-cover"
                    }
                    loading="lazy"
                  />
                </div>
              );
            }

            // VIDEO: render as <video> element with controls
            if (m.type === "VIDEO") {
              return (
                <div
                  key={m.id}
                  className={
                    isSingle
                      ? "overflow-hidden rounded-lg bg-muted"
                      : "relative shrink-0 overflow-hidden rounded-lg bg-muted"
                  }
                >
                  <video
                    src={m.url}
                    poster={m.thumbnail_url}
                    controls
                    playsInline
                    preload="metadata"
                    className={
                      isSingle
                        ? "w-full rounded-lg"
                        : "h-40 w-auto max-w-[280px] object-cover"
                    }
                  />
                </div>
              );
            }

            // Fallback for unknown media types
            return (
              <div
                key={m.id}
                className="relative shrink-0 overflow-hidden rounded-lg bg-muted"
              >
                <div className="flex h-40 w-40 items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  <span className="ml-1 text-xs text-muted-foreground">
                    {m.type}
                  </span>
                </div>
              </div>
            );
          })}
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

  if (linkToDetail) {
    return (
      <Link
        href={`/tweets/${tweet.id}`}
        className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-card"
      >
        {card}
      </Link>
    );
  }

  return card;
}

// =============================================================================
// Helpers
// =============================================================================

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

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatTimeAgo(iso: string): string {
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
