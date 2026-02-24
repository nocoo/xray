"use client";

import { useState, useCallback } from "react";
import { AppShell } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TweetCard } from "@/components/twitter/tweet-card";
import { Search, ArrowUpDown, Loader2 } from "lucide-react";

import type { Tweet } from "../../../shared/types";

// =============================================================================
// Tweets Search Page
// =============================================================================

export default function TweetsPage() {
  const [query, setQuery] = useState("");
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortByTop, setSortByTop] = useState(true);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const q = query.trim();
      if (!q) return;

      setLoading(true);
      setError(null);
      setSearched(true);

      try {
        const params = new URLSearchParams({
          q,
          count: "20",
          sort_by_top: String(sortByTop),
        });
        const res = await fetch(`/api/explore/tweets?${params}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(data.error ?? "Search failed");
          setTweets([]);
        } else {
          setTweets(data.data ?? []);
        }
      } catch {
        setError("Network error — could not reach API");
        setTweets([]);
      } finally {
        setLoading(false);
      }
    },
    [query, sortByTop],
  );

  return (
    <AppShell breadcrumbs={[{ label: "Tweets" }]}>
      <div className="space-y-6">
        {/* Header */}
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

        {/* Error state */}
        {error && (
          <div className="rounded-card bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Empty results */}
        {searched && !loading && !error && tweets.length === 0 && (
          <div className="rounded-card bg-secondary p-8 text-center text-muted-foreground">
            No tweets found for &quot;{query}&quot;
          </div>
        )}

        {/* Results */}
        {tweets.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {tweets.length} result{tweets.length !== 1 ? "s" : ""}
            </div>
            {tweets.map((tweet) => (
              <TweetCard key={tweet.id} tweet={tweet} />
            ))}
          </div>
        )}

        {/* Initial empty state */}
        {!searched && (
          <div className="rounded-card bg-secondary p-12 text-center">
            <Search className="mx-auto h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">
              Enter a search query to discover tweets.
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Tip: Use operators like{" "}
              <code className="rounded bg-muted px-1">from:username</code>,{" "}
              <code className="rounded bg-muted px-1">min_likes:100</code>,{" "}
              <code className="rounded bg-muted px-1">lang:en</code>
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
