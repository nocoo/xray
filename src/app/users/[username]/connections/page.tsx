"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout";
import { UserCardCompact } from "@/components/twitter/user-card";
import { Loader2 } from "lucide-react";

import type { UserInfo } from "../../../../../shared/types";

// =============================================================================
// Tab definitions
// =============================================================================

type TabKey = "followers" | "following" | "affiliates";

const TABS: { key: TabKey; label: string }[] = [
  { key: "followers", label: "Followers" },
  { key: "following", label: "Following" },
  { key: "affiliates", label: "Affiliates" },
];

// =============================================================================
// Connections Page
// =============================================================================

export default function ConnectionsPage() {
  const { username } = useParams<{ username: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>("followers");
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConnections = useCallback(
    async (tab: TabKey) => {
      setLoading(true);
      setError(null);
      setUsers([]);

      try {
        const u = encodeURIComponent(username);
        const res = await fetch(`/api/explore/users/${tab}?username=${u}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(data.error ?? "Failed to load connections");
        } else {
          setUsers(data.data ?? []);
        }
      } catch {
        setError("Network error — could not reach API");
      } finally {
        setLoading(false);
      }
    },
    [username],
  );

  useEffect(() => {
    fetchConnections(activeTab);
  }, [activeTab, fetchConnections]);

  return (
    <AppShell
      breadcrumbs={[
        { label: "Users", href: "/users" },
        { label: `@${username}`, href: `/users/${username}` },
        { label: "Connections" },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Social connections for @{username} — followers, following, and
            affiliated accounts.
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <nav className="flex gap-1 -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-card bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && users.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {users.length} user{users.length !== 1 ? "s" : ""}
            </div>
            {users.map((user) => (
              <UserCardCompact key={user.id} user={user} />
            ))}
          </div>
        )}

        {!loading && !error && users.length === 0 && (
          <div className="rounded-card bg-secondary p-8 text-center text-muted-foreground">
            No {activeTab} found.
          </div>
        )}
      </div>
    </AppShell>
  );
}
