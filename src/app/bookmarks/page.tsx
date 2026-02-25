"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout";
import { TweetCard } from "@/components/twitter/tweet-card";
import { Loader2, Bookmark } from "lucide-react";

import type { Tweet } from "../../../shared/types";

// =============================================================================
// Bookmarks Page — displays the user's bookmarked tweets
// =============================================================================

export default function BookmarksPage() {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/explore/bookmarks");
        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(data.error ?? "Failed to load bookmarks");
        } else {
          setTweets(data.data ?? []);
        }
      } catch {
        setError("Network error — could not reach API");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-card bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Results */}
        {!loading && !error && tweets.length > 0 && (
          <div className="space-y-4">
            {tweets.map((tweet) => (
              <TweetCard key={tweet.id} tweet={tweet} />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && tweets.length === 0 && (
          <div className="rounded-card bg-secondary p-12 text-center">
            <Bookmark className="mx-auto h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No bookmarks found.</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Bookmark tweets on Twitter/X and they will appear here.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
