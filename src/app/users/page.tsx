"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserCard } from "@/components/twitter/user-card";
import { Search, Loader2 } from "lucide-react";

import type { UserInfo } from "../../../shared/types";

// =============================================================================
// Users Search Page
// =============================================================================

export default function UsersPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const u = username.trim().replace(/^@/, "");
      if (!u) return;

      setLoading(true);
      setError(null);
      setSearched(true);

      try {
        const res = await fetch(
          `/api/explore/users?username=${encodeURIComponent(u)}`,
        );
        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(data.error ?? "User lookup failed");
          setUser(null);
        } else {
          setUser(data.data ?? null);
        }
      } catch {
        setError("Network error — could not reach API");
        setUser(null);
      } finally {
        setLoading(false);
      }
    },
    [username],
  );

  return (
    <AppShell breadcrumbs={[{ label: "Users" }]}>
      <div className="space-y-6">
        {/* Header */}
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

        {/* Error state */}
        {error && (
          <div className="rounded-card bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* User result */}
        {user && (
          <UserCard
            user={user}
            onClick={() => router.push(`/users/${user.username}`)}
          />
        )}

        {/* No result */}
        {searched && !loading && !error && !user && (
          <div className="rounded-card bg-secondary p-8 text-center text-muted-foreground">
            No user found for &quot;{username}&quot;
          </div>
        )}

        {/* Initial empty state */}
        {!searched && (
          <div className="rounded-card bg-secondary p-12 text-center">
            <Search className="mx-auto h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">
              Enter a username to view their profile.
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              You can enter with or without the @ symbol.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
