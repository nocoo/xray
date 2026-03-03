"use client";

import { useState, useCallback } from "react";
import { AppShell } from "@/components/layout";
import { UserCardCompact } from "@/components/twitter/user-card";
import {
  LoadingSpinner,
  ErrorBanner,
  EmptyState,
} from "@/components/ui/feedback";
import { UserPlus, Search } from "lucide-react";

import type { UserInfo } from "../../../shared/types";

// =============================================================================
// Following Page — look up who a given Twitter user follows
// =============================================================================

export default function FollowingPage() {
  const [username, setUsername] = useState("");
  const [users, setUsers] = useState<UserInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = username.trim().replace(/^@/, "");
      if (!trimmed) return;

      setLoading(true);
      setError(null);
      setSearched(true);

      try {
        const res = await fetch(
          `/api/explore/users/following?username=${encodeURIComponent(trimmed)}`,
        );
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
          setError(json?.error ?? "Failed to load following list");
          setUsers(null);
        } else {
          setUsers(json.data ?? []);
        }
      } catch {
        setError("Network error — could not reach API");
        setUsers(null);
      } finally {
        setLoading(false);
      }
    },
    [username],
  );

  return (
    <AppShell breadcrumbs={[{ label: "Following" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Following</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter a Twitter/X username to see who they follow.
          </p>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username (e.g. elonmusk)"
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !username.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Search className="h-4 w-4" />
            Look up
          </button>
        </form>

        {/* Results */}
        {loading && <LoadingSpinner />}
        {error && <ErrorBanner error={error} />}

        {!loading && !error && users && users.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {users.length} user{users.length !== 1 ? "s" : ""}
            </div>
            {users.map((user) => (
              <UserCardCompact key={user.id} user={user} />
            ))}
          </div>
        )}

        {!loading && !error && searched && users && users.length === 0 && (
          <EmptyState
            icon={UserPlus}
            title="No following found."
            subtitle="This user may not be following anyone, or the username may be incorrect."
          />
        )}
      </div>
    </AppShell>
  );
}
