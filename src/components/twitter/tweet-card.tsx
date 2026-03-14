"use client";

import { memo, useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  Repeat2,
  MessageCircle,
  Eye,
  Bookmark,
  Quote,
  Image as ImageIcon,
  ExternalLink,
  AtSign,
  Hash,
  X,
  Languages,
  ArrowLeftRight,
  LinkIcon,
  Loader2,
  Check,
  Search,
  MessageSquareQuote,
  Trash2,
} from "lucide-react";
import { cn, formatCount, formatTimeAgo } from "@/lib/utils";

import type { Tweet, TweetMedia } from "../../../shared/types";

// We intentionally use <img> for external Twitter profile images and media.
// next/image requires known hostnames in next.config, which is impractical
// for user-generated Twitter content.

// =============================================================================
// TweetCard — reusable tweet display component
// =============================================================================

export interface TweetCardProps {
  tweet: Tweet;
  linkToDetail?: boolean;
  className?: string;
  /** Hide the bottom action bar (e.g. when a parent component provides its own) */
  showActionBar?: boolean;
  /** Pre-populated translation from parent (e.g. SSE-synced watchlist) */
  initialTranslation?: {
    translatedText: string;
    commentText?: string | null;
    quotedTranslatedText?: string | null;
  };
  /** Slot rendered between card body and action bar (e.g. AI Insight) */
  renderBeforeActionBar?: React.ReactNode;
  /** Called when the user clicks "Remove" — parent should delete + unmount this card */
  onRemove?: () => void;
}

export const TweetCard = memo(function TweetCard({
  tweet,
  linkToDetail = true,
  className,
  showActionBar = true,
  initialTranslation,
  renderBeforeActionBar,
  onRemove,
}: TweetCardProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // --- Translation state ---
  const [lang, setLang] = useState<"zh" | "en">(
    initialTranslation?.translatedText ? "zh" : "en",
  );
  const [translatedText, setTranslatedText] = useState(
    initialTranslation?.translatedText ?? null,
  );
  const [commentText, setCommentText] = useState(
    initialTranslation?.commentText ?? null,
  );
  const [quotedTranslatedText, setQuotedTranslatedText] = useState(
    initialTranslation?.quotedTranslatedText ?? null,
  );
  const [translating, setTranslating] = useState(false);

  // --- zhe.to state ---
  const [zhetoStatus, setZhetoStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  // Sync from parent when initialTranslation changes (SSE push)
  const prevInitial = initialTranslation?.translatedText;
  useState(() => {
    // This runs once on mount; subsequent syncs handled in the effect below
  });
  // biome-ignore lint: sync on external prop change
  useEffect(() => {
    if (prevInitial && !translatedText) {
      setTranslatedText(prevInitial);
      setCommentText(initialTranslation?.commentText ?? null);
      setQuotedTranslatedText(initialTranslation?.quotedTranslatedText ?? null);
      setLang("zh");
    }
  }, [prevInitial]);

  const hasTranslation = !!translatedText;

  // Build the tweet object with translated text swapped in
  const displayTweet = useMemo(() => {
    if (lang !== "zh" || !hasTranslation) return tweet;
    const t = { ...tweet, text: translatedText ?? tweet.text };
    if (t.quoted_tweet && quotedTranslatedText) {
      t.quoted_tweet = { ...t.quoted_tweet, text: quotedTranslatedText };
    }
    return t;
  }, [lang, hasTranslation, tweet, translatedText, quotedTranslatedText]);

  const handleTranslate = useCallback(async () => {
    if (translating) return;
    setTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: tweet.text,
          quotedText: tweet.quoted_tweet?.text ?? undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && json.data?.translatedText) {
        setTranslatedText(json.data.translatedText);
        setCommentText(json.data.commentText ?? null);
        setQuotedTranslatedText(json.data.quotedTranslatedText ?? null);
        setLang("zh");
      }
    } catch {
      // silent
    } finally {
      setTranslating(false);
    }
  }, [translating, tweet.text, tweet.quoted_tweet?.text]);

  const handleSaveToZheto = useCallback(async () => {
    if (zhetoStatus === "saving" || zhetoStatus === "saved") return;
    setZhetoStatus("saving");
    try {
      const note = `@${tweet.author.username}: ${tweet.text.slice(0, 200)}`;
      const res = await fetch("/api/integrations/zheto/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: tweet.url, note }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setZhetoStatus("saved");
      } else {
        setZhetoStatus("error");
        setTimeout(() => setZhetoStatus("idle"), 3000);
      }
    } catch {
      setZhetoStatus("error");
      setTimeout(() => setZhetoStatus("idle"), 3000);
    }
  }, [zhetoStatus, tweet.url, tweet.author.username, tweet.text]);

  const card = (
    <div className={cn(
      "relative rounded-card bg-secondary p-4 transition-colors hover:bg-secondary/80",
      showActionBar && "rounded-b-none border border-border",
      className,
    )}>
      {/* Tweet type badges — top-right corner */}
      {(tweet.is_retweet || tweet.is_reply || tweet.is_quote) && (
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
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
      )}

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
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
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
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Link
                href={`/users/${tweet.author.username}`}
                className="truncate hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                @{tweet.author.username}
              </Link>
              <span>·</span>
              <span className="shrink-0">
                {formatTimeAgo(tweet.created_at)}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Tweet text */}
      <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">
        {linkifyText(displayTweet.text)}
      </p>

      {/* Media preview */}
      {tweet.media && tweet.media.length > 0 && (
        <div className="mt-3">
          <MediaGrid media={tweet.media} onPhotoClick={setLightboxUrl} />
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
        <div className="relative mt-3 rounded-lg border border-border p-3 bg-card/50">
          {/* Open quoted tweet on X — top-right */}
          <a
            href={tweet.quoted_tweet.url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Open quoted tweet on X"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
          </a>

          {/* Quoted author row */}
          <div className="flex items-center gap-2 pr-6">
            <a
              href={`https://x.com/${tweet.quoted_tweet.author.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
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
            </a>
            {tweet.quoted_tweet.author.is_verified && (
              <Badge variant="default" className="h-3.5 px-1 text-[9px]">V</Badge>
            )}
            <a
              href={`https://x.com/${tweet.quoted_tweet.author.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground truncate hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              @{tweet.quoted_tweet.author.username}
            </a>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatTimeAgo(tweet.quoted_tweet.created_at)}
            </span>
          </div>

          {/* Quoted text */}
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
            {linkifyText(displayTweet.quoted_tweet?.text ?? tweet.quoted_tweet.text)}
          </p>

          {/* Quoted media */}
          {tweet.quoted_tweet.media && tweet.quoted_tweet.media.length > 0 && (
            <div className="mt-2">
              <MediaGrid
                media={tweet.quoted_tweet.media}
                compact
                onPhotoClick={setLightboxUrl}
              />
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
          icon={<Quote className="h-3.5 w-3.5" />}
          value={tweet.metrics.quote_count}
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

  const actionBar = showActionBar ? (
    <div className="flex items-center gap-1 border border-t-0 border-border rounded-b-card bg-card px-2 py-1.5">
      {/* Open on X */}
      <a
        href={tweet.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="h-3 w-3" />
        Open
      </a>

      {/* Translate / Toggle language */}
      {hasTranslation ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setLang((l) => (l === "zh" ? "en" : "zh"));
          }}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
            lang === "zh"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
          title={lang === "zh" ? "Show original" : "Show translation"}
        >
          <ArrowLeftRight className="h-3 w-3" />
          {lang === "zh" ? "中文" : "EN"}
        </button>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            handleTranslate();
          }}
          disabled={translating}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          title="Translate this post"
        >
          {translating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Languages className="h-3 w-3" />
          )}
          {translating ? "Translating..." : "Translate"}
        </button>
      )}

      {/* Save to zhe.to */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          handleSaveToZheto();
        }}
        disabled={zhetoStatus === "saving" || zhetoStatus === "saved"}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
          zhetoStatus === "saved"
            ? "text-emerald-600 dark:text-emerald-400"
            : zhetoStatus === "error"
              ? "text-red-500 dark:text-red-400"
              : "text-muted-foreground hover:text-foreground hover:bg-accent",
          (zhetoStatus === "saving" || zhetoStatus === "saved") &&
            "opacity-60 cursor-default",
        )}
        title="Save to zhe.to"
      >
        {zhetoStatus === "saving" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : zhetoStatus === "saved" ? (
          <Check className="h-3 w-3" />
        ) : (
          <LinkIcon className="h-3 w-3" />
        )}
        {zhetoStatus === "saving"
          ? "Saving..."
          : zhetoStatus === "saved"
            ? "Saved"
            : zhetoStatus === "error"
              ? "Failed"
              : "zhe.to"}
      </button>

      {/* Remove post */}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors ml-auto"
          title="Remove this post"
        >
          <Trash2 className="h-3 w-3" />
          Remove
        </button>
      )}
    </div>
  ) : null;

  // AI Insight — shown when viewing translated text and commentText exists
  const showComment = lang === "zh" && !!commentText;
  const aiInsight = showComment ? (
    <div className="relative border border-t-0 border-border bg-gradient-to-r from-violet-50/80 via-fuchsia-50/50 to-amber-50/40 dark:from-violet-950/30 dark:via-fuchsia-950/20 dark:to-amber-950/10 px-3 py-2.5">
      <div className="flex gap-2">
        <MessageSquareQuote className="h-3.5 w-3.5 mt-0.5 shrink-0 text-violet-500 dark:text-violet-400" />
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-600/80 dark:text-violet-400/80">
            AI Insight
          </span>
          <p className="mt-0.5 text-sm text-foreground/80 leading-relaxed">
            {commentText}
          </p>
        </div>
      </div>
    </div>
  ) : null;

  if (linkToDetail) {
    return (
      <div>
        <Link
          href={`/tweets/${tweet.id}`}
          className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-card"
        >
          {card}
        </Link>
        {renderBeforeActionBar}
        {aiInsight}
        {actionBar}
        <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      </div>
    );
  }

  return (
    <div>
      {card}
      {renderBeforeActionBar}
      {aiInsight}
      {actionBar}
      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
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

// URL regex — matches http(s) URLs in tweet text.
// Captures common URL characters including path, query, and fragment.
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

/** Turn URLs in text into clickable <a> links, keep everything else as text. */
function linkifyText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;

  for (const match of text.matchAll(URL_RE)) {
    const url = match[0];
    const start = match.index;

    // Text before this URL
    if (start > lastIdx) {
      parts.push(text.slice(lastIdx, start));
    }

    parts.push(
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:underline dark:text-blue-400"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>,
    );

    lastIdx = start + url.length;
  }

  // Remaining text after the last URL
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  // If no URLs found, return the original string (no wrapper needed)
  return parts.length === 0 ? text : parts;
}

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

// =============================================================================
// MediaGrid — smart layout based on photo count (1/2/3/4 grid, 5+ scroll)
// Video/GIF always fall back to horizontal scroll.
// =============================================================================

// Safe indexed access — length is pre-validated before each call site
function at<T>(arr: T[], i: number): T {
  return arr[i] as T;
}

function MediaGrid({
  media,
  compact = false,
  onPhotoClick,
}: {
  media: TweetMedia[];
  compact?: boolean;
  onPhotoClick?: (url: string) => void;
}) {
  const photos = media.filter((m) => m.type === "PHOTO");
  const allPhotos = photos.length === media.length;
  const gridHeight = compact ? "h-44" : "h-60";
  const roundedClass = compact ? "rounded-md" : "rounded-lg";

  // Only pure-photo sets with 2-4 items get grid layout
  if (allPhotos && media.length >= 2 && media.length <= 4) {
    return (
      <div className={`${gridHeight} ${roundedClass} overflow-hidden`}>
        {media.length === 2 && (
          <div className="grid grid-cols-2 gap-1 h-full">
            {media.map((m) => (
              <PhotoItem
                key={m.id}
                media={m}
                className="w-full h-full object-cover"
                onClick={onPhotoClick}
              />
            ))}
          </div>
        )}

        {media.length === 3 && (
          <div className="grid grid-cols-2 grid-rows-2 gap-1 h-full">
            <PhotoItem
              key={at(media, 0).id}
              media={at(media, 0)}
              className="w-full h-full object-cover row-span-2"
              onClick={onPhotoClick}
            />
            <PhotoItem
              key={at(media, 1).id}
              media={at(media, 1)}
              className="w-full h-full object-cover"
              onClick={onPhotoClick}
            />
            <PhotoItem
              key={at(media, 2).id}
              media={at(media, 2)}
              className="w-full h-full object-cover"
              onClick={onPhotoClick}
            />
          </div>
        )}

        {media.length === 4 && (
          <div className="grid grid-cols-2 grid-rows-2 gap-1 h-full">
            {media.map((m) => (
              <PhotoItem
                key={m.id}
                media={m}
                className="w-full h-full object-cover"
                onClick={onPhotoClick}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 1 image (full-width) or 5+ images (horizontal scroll) or mixed media types
  if (allPhotos && media.length === 1) {
    return (
      <div className={`overflow-hidden ${roundedClass} bg-muted`}>
        <PhotoItem
          media={at(media, 0)}
          className={`w-full ${roundedClass}`}
          onClick={onPhotoClick}
        />
      </div>
    );
  }

  // Single video/GIF → full-width
  if (media.length === 1 && (at(media, 0).type === "VIDEO" || at(media, 0).type === "GIF")) {
    const m = at(media, 0);
    return (
      <div
        className={`overflow-hidden ${roundedClass} bg-muted`}
        onClick={m.type === "VIDEO" ? (e) => e.stopPropagation() : undefined}
      >
        <video
          src={proxyUrl(m.url)}
          poster={m.thumbnail_url ? proxyUrl(m.thumbnail_url) : undefined}
          controls={m.type === "VIDEO"}
          autoPlay={m.type === "GIF"}
          loop={m.type === "GIF"}
          muted={m.type === "GIF"}
          playsInline
          preload={m.type === "VIDEO" ? "none" : undefined}
          className={`w-full ${roundedClass}`}
        />
      </div>
    );
  }

  // 5+ photos or mixed media → horizontal scroll
  const scrollMediaClass = compact
    ? "h-28 w-auto max-w-[200px] object-cover"
    : "h-40 w-auto max-w-[280px] object-cover";

  return (
    <div className={compact ? "flex gap-1.5 overflow-x-auto" : "flex gap-2 overflow-x-auto"}>
      {media.map((m) => {
        const containerClass = `relative shrink-0 overflow-hidden ${roundedClass} bg-muted`;

        if (m.type === "PHOTO") {
          return (
            <PhotoItem
              key={m.id}
              media={m}
              className={scrollMediaClass}
              containerClass={containerClass}
              onClick={onPhotoClick}
            />
          );
        }

        if (m.type === "GIF") {
          return (
            <div key={m.id} className={containerClass}>
              <video
                src={proxyUrl(m.url)}
                autoPlay
                loop
                muted
                playsInline
                className={scrollMediaClass}
              />
            </div>
          );
        }

        if (m.type === "VIDEO") {
          return (
            <div
              key={m.id}
              className={containerClass}
              onClick={(e) => e.stopPropagation()}
            >
              <video
                src={proxyUrl(m.url)}
                poster={
                  m.thumbnail_url ? proxyUrl(m.thumbnail_url) : undefined
                }
                controls
                playsInline
                preload="none"
                className={scrollMediaClass}
              />
            </div>
          );
        }

        return (
          <div
            key={m.id}
            className={`relative shrink-0 overflow-hidden ${roundedClass} bg-muted`}
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
  );
}

// =============================================================================
// PhotoItem — clickable photo thumbnail that opens lightbox
// =============================================================================

function PhotoItem({
  media,
  className,
  containerClass,
  onClick,
}: {
  media: TweetMedia;
  className: string;
  containerClass?: string;
  onClick?: (url: string) => void;
}) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onClick) return;
      e.stopPropagation();
      e.preventDefault();
      onClick(media.url);
    },
    [onClick, media.url],
  );

  const content = (
    <div className={cn("relative group", containerClass)}>
      <img
        src={media.url}
        alt=""
        className={`${className}${onClick ? " cursor-zoom-in" : ""}`}
        loading="lazy"
        onClick={handleClick}
      />
      {onClick && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none">
          <Search className="h-6 w-6 text-white opacity-0 group-hover:opacity-90 drop-shadow-md transition-opacity" />
        </div>
      )}
    </div>
  );

  return content;
}

// =============================================================================
// ImageLightbox — fullscreen popup to view a high-res photo
// =============================================================================

function ImageLightbox({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}) {
  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-in fade-in-0 duration-200"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      ref={(el) => el?.focus()}
    >
      {/* Close button */}
      <button
        className="absolute top-4 right-4 z-10 rounded-full bg-black/50 p-2 text-white/80 hover:text-white hover:bg-black/70 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Full-res image */}
      <img
        src={url}
        alt=""
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
