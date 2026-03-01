"use client";

import { useState, useEffect, useMemo, memo } from "react";
import { TweetCard } from "@/components/twitter/tweet-card";
import {
  ArrowLeftRight,
  Languages,
  Loader2,
  MessageSquareQuote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FetchedPostData } from "../_lib/types";

export const WatchlistPostCard = memo(function WatchlistPostCard({
  post,
  watchlistId,
}: {
  post: FetchedPostData;
  watchlistId: number;
}) {
  const [lang, setLang] = useState<"zh" | "en">(post.translatedText ? "zh" : "en");
  const [translatedText, setTranslatedText] = useState(post.translatedText);
  const [commentText, setCommentText] = useState(post.commentText);
  const [quotedTranslatedText, setQuotedTranslatedText] = useState(post.quotedTranslatedText);
  const [translating, setTranslating] = useState(false);

  // Sync from parent when translation arrives via SSE
  useEffect(() => {
    if (post.translatedText && !translatedText) {
      setTranslatedText(post.translatedText);
      setCommentText(post.commentText);
      setQuotedTranslatedText(post.quotedTranslatedText);
      setLang("zh");
    }
  }, [post.translatedText, post.commentText, post.quotedTranslatedText, translatedText]);

  const hasTranslation = !!translatedText;

  const displayTweet = useMemo(() => {
    if (lang !== "zh" || !hasTranslation) return post.tweet;
    const t = { ...post.tweet, text: translatedText! };
    if (t.quoted_tweet && quotedTranslatedText) {
      t.quoted_tweet = { ...t.quoted_tweet, text: quotedTranslatedText };
    }
    return t;
  }, [lang, hasTranslation, post.tweet, translatedText, quotedTranslatedText]);

  const showComment = lang === "zh" && commentText;

  const handleTranslate = async () => {
    setTranslating(true);
    try {
      const res = await fetch(`/api/watchlists/${watchlistId}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && json.data.translatedText) {
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
  };

  return (
    <div className="shadow-[0_1px_4px_rgba(0,0,0,0.06)] rounded-card animate-in fade-in slide-in-from-top-2 duration-300">
      <TweetCard
        tweet={displayTweet}
        linkToDetail={false}
        className={cn(
          "border border-border",
          showComment ? "rounded-b-none" : hasTranslation ? "rounded-b-none" : "rounded-b-none",
        )}
      />

      {/* AI Commentary — shown when viewing translation */}
      {showComment && (
        <div className="relative border border-t-0 border-border bg-gradient-to-r from-violet-50/80 via-fuchsia-50/50 to-amber-50/40 dark:from-violet-950/30 dark:via-fuchsia-950/20 dark:to-amber-950/10 px-3 py-2.5">
          <div className="flex gap-2">
            <MessageSquareQuote className="h-3.5 w-3.5 mt-0.5 shrink-0 text-violet-500 dark:text-violet-400" />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-600/80 dark:text-violet-400/80">
                AI Insight
              </span>
              <p className="mt-0.5 text-xs text-foreground/80 leading-relaxed">
                {commentText}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Per-card action bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border border-t-0 rounded-b-[14px] bg-card">
        {hasTranslation ? (
          <button
            onClick={() => setLang((l) => (l === "zh" ? "en" : "zh"))}
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
            onClick={handleTranslate}
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
      </div>
    </div>
  );
});
