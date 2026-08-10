"use client";

import { useCallback } from "react";
import { useBreadcrumbs } from "@/components/layout";
import { TweetCard } from "@/components/twitter/tweet-card";
import { MasonryGrid } from "@/components/ui/masonry-grid";
import { LoadingSpinner, ErrorBanner, EmptyState } from "@/components/ui/feedback";
import { Heart } from "lucide-react";
import { useFetch } from "@/hooks/use-api";
import { estimateTweetHeight } from "@/lib/utils";

import type { Tweet } from "../../../../shared/types";

// =============================================================================
// Likes Page — displays the user's liked tweets in masonry layout
// =============================================================================

export default function LikesPage() {
  useBreadcrumbs([{ label: "Likes" }]);
  const { data: tweets, loading, error } = useFetch<Tweet[]>(
    "/api/explore/likes",
    "Failed to load likes",
  );

  const renderTweet = useCallback(
    (tweet: Tweet) => <TweetCard tweet={tweet} />,
    [],
  );

  const keyExtractor = useCallback((tweet: Tweet) => tweet.id, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Likes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your liked tweets. Requires Twitter cookie authentication.
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
          icon={Heart}
          title="No liked tweets found."
          subtitle="Like tweets on Twitter/X and they will appear here."
        />
      )}
    </div>
  );
}
