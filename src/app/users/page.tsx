"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserCard } from "@/components/twitter/user-card";
import { ErrorBanner, EmptyState } from "@/components/ui/feedback";
import { Search, Loader2 } from "lucide-react";
import { useSearch } from "@/hooks/use-api";

import type { UserInfo } from "../../../shared/types";

// =============================================================================
// Users Search Page
// =============================================================================

export default function UsersPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const { data: user, loading, error, searched, execute } = useSearch<UserInfo>("User lookup failed");

  const handleSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const u = username.trim().replace(/^@/, "");
      if (!u) return;

      await execute(`/api/explore/users?username=${encodeURIComponent(u)}`);
    },
    [username, execute],
  );

  return (
    <AppShell breadcrumbs={[{ label: "Users" }]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Look up any Twitter/X user to view their profile, timeline, and
            social connections.
          </p>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter a username (e.g. elonmusk)"
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={loading || !username.trim()}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Look up"
            )}
          </Button>
        </form>

        {error && <ErrorBanner error={error} />}

        {user && (
          <UserCard
            user={user}
            onClick={() => router.push(`/users/${user.username}`)}
          />
        )}

        {searched && !loading && !error && !user && (
          <div className="rounded-card bg-secondary p-8 text-center text-muted-foreground">
            No user found for &quot;{username}&quot;
          </div>
        )}

        {!searched && (
          <EmptyState
            icon={Search}
            title="Enter a username to view their profile."
            subtitle="You can enter with or without the @ symbol."
          />
        )}
      </div>
    </AppShell>
  );
}
