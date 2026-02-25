"use client";

import { AppShell } from "@/components/layout";
import { TweetCard } from "@/components/twitter/tweet-card";
import { LoadingSpinner, ErrorBanner, EmptyState } from "@/components/ui/feedback";
import { Bookmark } from "lucide-react";
import { useFetch } from "@/hooks/use-api";

import type { Tweet } from "../../../shared/types";

// =============================================================================
// Bookmarks Page — displays the user's bookmarked tweets
// =============================================================================

export default function BookmarksPage() {
  const { data: tweets, loading, error } = useFetch<Tweet[]>(
    "/api/explore/bookmarks",
    "Failed to load bookmarks",
  );

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
          <div className="space-y-4">
            {tweets.map((tweet) => (
              <TweetCard key={tweet.id} tweet={tweet} />
            ))}
          </div>
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
