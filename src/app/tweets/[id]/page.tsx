"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout";
import { TweetCard } from "@/components/twitter/tweet-card";
import { Loader2, MessageCircle } from "lucide-react";

import type { Tweet } from "../../../../shared/types";

// =============================================================================
// Tweet Detail Page — shows tweet details + reply thread
// =============================================================================

export default function TweetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tweet, setTweet] = useState<Tweet | null>(null);
  const [replies, setReplies] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTweetDetail() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/explore/tweets/${encodeURIComponent(id)}`);
        const data = await res.json();

        if (cancelled) return;

        if (!res.ok || !data.success) {
          setError(data.error ?? "Failed to load tweet");
          return;
        }

        setTweet(data.data.tweet);
        setReplies(data.data.replies ?? []);
      } catch {
        if (!cancelled) {
          setError("Network error — could not reach API");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchTweetDetail();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <AppShell
      breadcrumbs={[
        { label: "Tweets", href: "/tweets" },
        { label: tweet ? `@${tweet.author.username}` : id },
      ]}
    >
      <div className="space-y-6">
        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-card bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Tweet detail */}
        {!loading && tweet && (
          <>
            <TweetCard tweet={tweet} linkToDetail={false} />

            {/* Replies section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MessageCircle className="h-4 w-4" />
                <span>
                  {replies.length} repl{replies.length !== 1 ? "ies" : "y"}
                </span>
              </div>

              {replies.length === 0 ? (
                <div className="rounded-card bg-secondary p-8 text-center text-muted-foreground">
                  No replies yet.
                </div>
              ) : (
                <div className="space-y-2 pl-4 border-l-2 border-border">
                  {replies.map((reply) => (
                    <TweetCard key={reply.id} tweet={reply} />
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
