"use client";

import { useState, useEffect } from "react";
import { TweetCard } from "@/components/twitter/tweet-card";
import { ArrowLeftRight, Languages, Loader2 } from "lucide-react";
import type { FetchedPostData } from "../_lib/types";

export function WatchlistPostCard({
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

  const displayTweet = (() => {
    if (lang !== "zh" || !hasTranslation) return post.tweet;
    const t = { ...post.tweet, text: translatedText! };
    if (t.quoted_tweet && quotedTranslatedText) {
      t.quoted_tweet = { ...t.quoted_tweet, text: quotedTranslatedText };
    }
    return t;
  })();

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
        className="border border-border rounded-b-none"
      />
      {showComment && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-t-0 border-amber-200 dark:border-amber-800 px-3 py-2">
          <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
            <span className="font-semibold mr-1">锐评</span>
            {commentText}
          </p>
        </div>
      )}
      {/* Per-card action bar */}
      <div className={`flex items-center gap-1 px-2 py-1.5 border border-t-0 rounded-b-[14px] bg-card`}>
        {hasTranslation ? (
          <button
            onClick={() => setLang((l) => (l === "zh" ? "en" : "zh"))}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={lang === "zh" ? "Show original" : "Show translation"}
          >
            <ArrowLeftRight className="h-3 w-3" />
            {lang === "zh" ? "中文" : "EN"}
          </button>
        ) : (
          <button
            onClick={handleTranslate}
            disabled={translating}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            title="Translate this post"
          >
            {translating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Languages className="h-3 w-3" />
            )}
            {translating ? "翻译中..." : "翻译"}
          </button>
        )}
      </div>
    </div>
  );
}
