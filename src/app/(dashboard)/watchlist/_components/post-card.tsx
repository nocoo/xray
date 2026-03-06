"use client";

import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { AlertTriangle, RotateCw, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { TweetCard } from "@/components/twitter/tweet-card";
import type { FetchedPostData } from "../_lib/types";

export const WatchlistPostCard = memo(function WatchlistPostCard({
  post,
  watchlistId,
}: {
  post: FetchedPostData;
  watchlistId: number;
}) {
  // Track SSE-synced translation data from parent
  const [translatedText, setTranslatedText] = useState(post.translatedText);
  const [commentText, setCommentText] = useState(post.commentText);
  const [quotedTranslatedText, setQuotedTranslatedText] = useState(
    post.quotedTranslatedText,
  );
  const [translationError, setTranslationError] = useState(post.translationError);
  const [retrying, setRetrying] = useState(false);
  const [errorExpanded, setErrorExpanded] = useState(false);

  // Sync from parent when translation arrives via SSE
  useEffect(() => {
    if (post.translatedText && !translatedText) {
      setTranslatedText(post.translatedText);
      setCommentText(post.commentText);
      setQuotedTranslatedText(post.quotedTranslatedText);
    }
  }, [post.translatedText, post.commentText, post.quotedTranslatedText, translatedText]);

  // Sync error state from parent
  useEffect(() => {
    if (post.translationError !== translationError && !retrying) {
      setTranslationError(post.translationError);
    }
  }, [post.translationError, translationError, retrying]);

  const initialTranslation = useMemo(() => {
    if (!translatedText) return undefined;
    return {
      translatedText,
      commentText,
      quotedTranslatedText,
    };
  }, [translatedText, commentText, quotedTranslatedText]);

  const handleRetry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      const res = await fetch(`/api/watchlists/${watchlistId}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && json.data?.translatedText) {
        setTranslatedText(json.data.translatedText);
        setCommentText(json.data.commentText ?? null);
        setQuotedTranslatedText(json.data.quotedTranslatedText ?? null);
        setTranslationError(null);
      } else if (json?.data?.errors?.length) {
        setTranslationError(json.data.errors[0]);
      }
    } catch (err) {
      setTranslationError(
        err instanceof Error ? err.message : "Retry failed"
      );
    } finally {
      setRetrying(false);
    }
  }, [retrying, watchlistId, post.id]);

  const errorBanner = translationError && !translatedText ? (
    <div className="border border-t-0 border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/20 px-3 py-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500 dark:text-red-400" />
        <span className="flex-1 text-xs text-red-700 dark:text-red-300 truncate">
          Translation failed
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setErrorExpanded((prev) => !prev);
          }}
          className="shrink-0 rounded p-0.5 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          title={errorExpanded ? "Hide details" : "Show details"}
        >
          {errorExpanded
            ? <ChevronUp className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />
          }
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            handleRetry();
          }}
          disabled={retrying}
          className="shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
          title="Retry translation"
        >
          {retrying
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <RotateCw className="h-3 w-3" />
          }
          Retry
        </button>
      </div>
      {errorExpanded && (
        <p className="mt-1.5 text-[11px] text-red-600/80 dark:text-red-400/80 leading-relaxed break-all">
          {translationError}
        </p>
      )}
    </div>
  ) : null;

  return (
    <div className="shadow-[0_1px_4px_rgba(0,0,0,0.06)] rounded-card animate-in fade-in slide-in-from-top-2 duration-300">
      <TweetCard
        tweet={post.tweet}
        linkToDetail={false}
        initialTranslation={initialTranslation}
        renderBeforeActionBar={errorBanner}
      />
    </div>
  );
});
