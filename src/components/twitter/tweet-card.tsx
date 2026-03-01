"use client";

import { memo } from "react";
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

export const TweetCard = memo(function TweetCard({
  tweet,
  linkToDetail = true,
  className,
}: {
  tweet: Tweet;
  linkToDetail?: boolean;
  className?: string;
}) {
  const card = (
    <div className={`rounded-card bg-secondary p-4 transition-colors hover:bg-secondary/80 ${className ?? ""}`}>
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
            const containerClass = isSingle
              ? "overflow-hidden rounded-lg bg-muted"
              : "relative shrink-0 overflow-hidden rounded-lg bg-muted";
            const mediaClass = isSingle
              ? "w-full rounded-lg"
              : "h-40 w-auto max-w-[280px] object-cover";

            if (m.type === "PHOTO") {
              return (
                <div key={m.id} className={containerClass}>
                  <img
                    src={m.url}
                    alt=""
                    className={mediaClass}
                    loading="lazy"
                  />
                </div>
              );
            }

            // Twitter GIFs are actually silent looping .mp4 files
            if (m.type === "GIF") {
              return (
                <div key={m.id} className={containerClass}>
                  <video
                    src={proxyUrl(m.url)}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className={mediaClass}
                  />
                </div>
              );
            }

            // VIDEO: render with controls, click stops propagation to parent Link
            if (m.type === "VIDEO") {
              return (
                <div
                  key={m.id}
                  className={containerClass}
                  onClick={(e) => e.stopPropagation()}
                >
                  <video
                    src={proxyUrl(m.url)}
                    poster={m.thumbnail_url ? proxyUrl(m.thumbnail_url) : undefined}
                    controls
                    playsInline
                    preload="none"
                    className={mediaClass}
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

      {/* Quoted tweet — rendered as a compact nested card */}
      {tweet.quoted_tweet && (
        <div className="mt-3 rounded-lg border border-border p-3 bg-card/50">
          {/* Quoted author row */}
          <div className="flex items-center gap-2">
            {tweet.quoted_tweet.author.profile_image_url ? (
              <img
                src={tweet.quoted_tweet.author.profile_image_url}
                alt={tweet.quoted_tweet.author.name}
                className="h-5 w-5 shrink-0 rounded-full"
              />
            ) : (
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                {tweet.quoted_tweet.author.name[0]}
              </div>
            )}
            <span className="text-xs font-medium truncate">
              {tweet.quoted_tweet.author.name}
            </span>
            {tweet.quoted_tweet.author.is_verified && (
              <Badge variant="default" className="h-3.5 px-1 text-[9px]">V</Badge>
            )}
            <span className="text-xs text-muted-foreground truncate">
              @{tweet.quoted_tweet.author.username}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatTimeAgo(tweet.quoted_tweet.created_at)}
            </span>
          </div>

          {/* Quoted text */}
          <p className="mt-2 text-xs leading-relaxed whitespace-pre-wrap">
            {tweet.quoted_tweet.text}
          </p>

          {/* Quoted media */}
          {tweet.quoted_tweet.media && tweet.quoted_tweet.media.length > 0 && (
            <div
              className={
                tweet.quoted_tweet.media.length === 1
                  ? "mt-2"
                  : "mt-2 flex gap-1.5 overflow-x-auto"
              }
            >
              {tweet.quoted_tweet.media.map((m) => {
                const isSingle = tweet.quoted_tweet!.media!.length === 1;
                const containerClass = isSingle
                  ? "overflow-hidden rounded-md bg-muted"
                  : "relative shrink-0 overflow-hidden rounded-md bg-muted";
                const mediaClass = isSingle
                  ? "w-full max-h-60 object-cover rounded-md"
                  : "h-28 w-auto max-w-[200px] object-cover";

                if (m.type === "PHOTO") {
                  return (
                    <div key={m.id} className={containerClass}>
                      <img src={m.url} alt="" className={mediaClass} loading="lazy" />
                    </div>
                  );
                }
                if (m.type === "GIF") {
                  return (
                    <div key={m.id} className={containerClass}>
                      <video
                        src={proxyUrl(m.url)}
                        autoPlay loop muted playsInline
                        className={mediaClass}
                      />
                    </div>
                  );
                }
                if (m.type === "VIDEO") {
                  return (
                    <div key={m.id} className={containerClass} onClick={(e) => e.stopPropagation()}>
                      <video
                        src={proxyUrl(m.url)}
                        poster={m.thumbnail_url ? proxyUrl(m.thumbnail_url) : undefined}
                        controls playsInline preload="none"
                        className={mediaClass}
                      />
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}

          {/* Quoted metrics */}
          <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Heart className="h-3 w-3" /> {formatCount(tweet.quoted_tweet.metrics.like_count)}
            </span>
            <span className="flex items-center gap-0.5">
              <Repeat2 className="h-3 w-3" /> {formatCount(tweet.quoted_tweet.metrics.retweet_count)}
            </span>
            <span className="flex items-center gap-0.5">
              <Eye className="h-3 w-3" /> {formatCount(tweet.quoted_tweet.metrics.view_count)}
            </span>
          </div>
        </div>
      )}

      {/* Metrics row — overflow hidden with fade-out mask on the right */}
      <div
        className="mt-3 flex items-center gap-4 text-xs text-muted-foreground overflow-hidden"
        style={{
          maskImage: "linear-gradient(to right, black 80%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, black 80%, transparent 100%)",
        }}
      >
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
});

// =============================================================================
// Media proxy helper — routes Twitter video/GIF URLs through our server-side
// proxy to avoid 403 from Twitter CDN's Referer-based hotlink protection
// =============================================================================

function proxyUrl(url: string): string {
  return `/api/media/proxy?url=${encodeURIComponent(url)}`;
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
    <div className="flex shrink-0 items-center gap-1">
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
