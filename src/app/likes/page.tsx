"use client";

import { AppShell } from "@/components/layout";
import { TweetCard } from "@/components/twitter/tweet-card";
import { LoadingSpinner, ErrorBanner, EmptyState } from "@/components/ui/feedback";
import { Heart } from "lucide-react";
import { useFetch } from "@/hooks/use-api";

import type { Tweet } from "../../../shared/types";

// =============================================================================
// Likes Page — displays the user's liked tweets
// =============================================================================

export default function LikesPage() {
  const { data: tweets, loading, error } = useFetch<Tweet[]>(
    "/api/explore/likes",
    "Failed to load likes",
  );

  return (
    <AppShell breadcrumbs={[{ label: "Likes" }]}>
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
          <div className="space-y-4">
            {tweets.map((tweet) => (
              <TweetCard key={tweet.id} tweet={tweet} />
            ))}
          </div>
        )}

        {!loading && !error && (!tweets || tweets.length === 0) && (
          <EmptyState
            icon={Heart}
            title="No liked tweets found."
            subtitle="Like tweets on Twitter/X and they will appear here."
          />
        )}
      </div>
    </AppShell>
  );
}
