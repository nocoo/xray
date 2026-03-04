"use client";

import { useState, useEffect, useMemo, memo } from "react";
import { TweetCard } from "@/components/twitter/tweet-card";
import type { FetchedPostData } from "../_lib/types";

export const WatchlistPostCard = memo(function WatchlistPostCard({
  post,
}: {
  post: FetchedPostData;
}) {
  // Track SSE-synced translation data from parent
  const [translatedText, setTranslatedText] = useState(post.translatedText);
  const [commentText, setCommentText] = useState(post.commentText);
  const [quotedTranslatedText, setQuotedTranslatedText] = useState(
    post.quotedTranslatedText,
  );

  // Sync from parent when translation arrives via SSE
  useEffect(() => {
    if (post.translatedText && !translatedText) {
      setTranslatedText(post.translatedText);
      setCommentText(post.commentText);
      setQuotedTranslatedText(post.quotedTranslatedText);
    }
  }, [post.translatedText, post.commentText, post.quotedTranslatedText, translatedText]);

  const initialTranslation = useMemo(() => {
    if (!translatedText) return undefined;
    return {
      translatedText,
      commentText,
      quotedTranslatedText,
    };
  }, [translatedText, commentText, quotedTranslatedText]);

  return (
    <div className="shadow-[0_1px_4px_rgba(0,0,0,0.06)] rounded-card animate-in fade-in slide-in-from-top-2 duration-300">
      <TweetCard
        tweet={post.tweet}
        linkToDetail={false}
        initialTranslation={initialTranslation}
      />
    </div>
  );
});
