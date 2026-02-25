"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout";
import { Loader2, List, Users, Eye } from "lucide-react";

import type { TwitterList } from "../../../shared/types";

// =============================================================================
// Lists Page — displays the user's Twitter lists
// =============================================================================

export default function ListsPage() {
  const [lists, setLists] = useState<TwitterList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/explore/lists");
        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(data.error ?? "Failed to load lists");
        } else {
          setLists(data.data ?? []);
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
    <AppShell breadcrumbs={[{ label: "Lists" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lists</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your Twitter lists. Requires Twitter cookie authentication.
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
        {!loading && !error && lists.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {lists.map((list) => (
              <ListCard key={list.id} list={list} />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && lists.length === 0 && (
          <div className="rounded-card bg-secondary p-12 text-center">
            <List className="mx-auto h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No lists found.</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Create lists on Twitter/X and they will appear here.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// =============================================================================
// ListCard component
// =============================================================================

function ListCard({ list }: { list: TwitterList }) {
  return (
    <div className="rounded-card bg-card border p-4 space-y-3">
      <div>
        <h3 className="font-medium">{list.name}</h3>
        {list.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {list.description}
          </p>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {list.member_count} members
        </span>
        <span className="flex items-center gap-1">
          <Eye className="h-3.5 w-3.5" />
          {list.subscriber_count} subscribers
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>by @{list.created_by}</span>
        {list.is_following && (
          <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[11px]">
            Following
          </span>
        )}
        {list.is_member && (
          <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[11px]">
            Member
          </span>
        )}
      </div>
    </div>
  );
}
