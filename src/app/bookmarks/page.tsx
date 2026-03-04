"use client";

import { useCallback } from "react";
import { AppShell } from "@/components/layout";
import { TweetCard } from "@/components/twitter/tweet-card";
import { MasonryGrid } from "@/components/ui/masonry-grid";
import { LoadingSpinner, ErrorBanner, EmptyState } from "@/components/ui/feedback";
import { Bookmark } from "lucide-react";
import { useFetch } from "@/hooks/use-api";

import type { Tweet } from "../../../shared/types";

// =============================================================================
// Bookmarks Page — displays the user's bookmarked tweets in masonry layout
// =============================================================================

function estimateTweetHeight(tweet: Tweet): number {
  let h = 100; // base (author row + action bar + metrics + padding)
  h += Math.ceil((tweet.text?.length ?? 0) / 60) * 20; // ~20px per line
  if (tweet.media && tweet.media.length > 0) h += 200;
  if (tweet.quoted_tweet) h += 120;
  return h;
}

export default function BookmarksPage() {
  const { data: tweets, loading, error } = useFetch<Tweet[]>(
    "/api/explore/bookmarks",
    "Failed to load bookmarks",
  );

  const renderTweet = useCallback(
    (tweet: Tweet) => <TweetCard tweet={tweet} />,
    [],
  );

  const keyExtractor = useCallback((tweet: Tweet) => tweet.id, []);

  return (
    <AppShell breadcrumbs={[{ label: "Bookmarks" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bookmarks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your saved tweets. Requires Twitter cookie authentication.
          </p>
        </div>

        {loading && <LoadingSpinner />}
        {error && <ErrorBanner error={error} />}

        {!loading && !error && tweets && tweets.length > 0 && (
          <MasonryGrid
            items={tweets}
            keyExtractor={keyExtractor}
            estimateHeight={estimateTweetHeight}
            renderItem={renderTweet}
          />
        )}

        {!loading && !error && (!tweets || tweets.length === 0) && (
          <EmptyState
            icon={Bookmark}
            title="No bookmarks found."
            subtitle="Bookmark tweets on Twitter/X and they will appear here."
          />
        )}
      </div>
    </AppShell>
  );
}
