"use client";

import { useState, useCallback } from "react";
import { AppShell } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TweetCard } from "@/components/twitter/tweet-card";
import { ErrorBanner, EmptyState } from "@/components/ui/feedback";
import { Search, ArrowUpDown, Loader2 } from "lucide-react";
import { useSearch } from "@/hooks/use-api";

import type { Tweet } from "../../../shared/types";

// =============================================================================
// Tweets Search Page
// =============================================================================

export default function TweetsPage() {
  const [query, setQuery] = useState("");
  const [sortByTop, setSortByTop] = useState(true);
  const { data: tweets, loading, error, searched, execute } = useSearch<Tweet[]>("Search failed");

  const handleSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const q = query.trim();
      if (!q) return;

      const params = new URLSearchParams({
        q,
        count: "20",
        sort_by_top: String(sortByTop),
      });
      await execute(`/api/explore/tweets?${params}`);
    },
    [query, sortByTop, execute],
  );

  return (
    <AppShell breadcrumbs={[{ label: "Tweets" }]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tweets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search tweets across Twitter/X and explore conversations.
          </p>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tweets... (e.g. 'AI agents', 'from:elonmusk')"
              className="pl-9"
            />
          </div>
          <button
            type="button"
            onClick={() => setSortByTop((v) => !v)}
            className={`flex items-center gap-1.5 rounded-widget px-3 text-xs font-medium transition-colors ${
              sortByTop
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
            title={sortByTop ? "Sorted by top" : "Sorted by recent"}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortByTop ? "Top" : "Recent"}
          </button>
          <Button type="submit" disabled={loading || !query.trim()}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Search"
            )}
          </Button>
        </form>

        {error && <ErrorBanner error={error} />}

        {searched && !loading && !error && (!tweets || tweets.length === 0) && (
          <div className="rounded-card bg-secondary p-8 text-center text-muted-foreground">
            No tweets found for &quot;{query}&quot;
          </div>
        )}

        {tweets && tweets.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {tweets.length} result{tweets.length !== 1 ? "s" : ""}
            </div>
            {tweets.map((tweet) => (
              <TweetCard key={tweet.id} tweet={tweet} />
            ))}
          </div>
        )}

        {!searched && (
          <EmptyState
            icon={Search}
            title="Enter a search query to discover tweets."
            subtitle='Tip: Use operators like from:username, min_likes:100, lang:en'
          />
        )}
      </div>
    </AppShell>
  );
}
