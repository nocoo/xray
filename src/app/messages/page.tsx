"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout";
import { Loader2, Inbox, MessageSquare, Circle } from "lucide-react";

import type { InboxItem } from "../../../shared/types";

// We intentionally use <img> for external Twitter profile images.
/* eslint-disable @next/next/no-img-element */

// =============================================================================
// Messages Inbox Page — displays the user's DM inbox
// =============================================================================

export default function MessagesPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/explore/inbox");
        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(data.error ?? "Failed to load inbox");
        } else {
          setItems(data.data ?? []);
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
    <AppShell breadcrumbs={[{ label: "Messages" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your direct message inbox. Requires Twitter cookie authentication.
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
        {!loading && !error && items.length > 0 && (
          <div className="space-y-2">
            {items.map((item) => (
              <InboxCard key={item.conversation_id} item={item} />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && items.length === 0 && (
          <div className="rounded-card bg-secondary p-12 text-center">
            <Inbox className="mx-auto h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No messages found.</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Start a conversation on Twitter/X and it will appear here.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// =============================================================================
// InboxCard — renders a single conversation preview
// =============================================================================

function InboxCard({ item }: { item: InboxItem }) {
  const otherParticipants = item.participants.filter(
    (p) => p.id !== item.last_message.sender_id || item.participants.length === 1,
  );
  const displayUser = otherParticipants[0] ?? item.participants[0];

  return (
    <Link
      href={`/messages/${item.conversation_id}`}
      className="flex items-start gap-3 rounded-card border bg-card p-4 transition-colors hover:bg-accent/50"
    >
      {/* Avatar */}
      {displayUser?.profile_image_url ? (
        <img
          src={displayUser.profile_image_url}
          alt={displayUser.username}
          className="h-10 w-10 rounded-full bg-muted flex-shrink-0"
        />
      ) : (
        <div className="h-10 w-10 rounded-full bg-muted flex-shrink-0" />
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {displayUser?.name ?? "Unknown"}
          </span>
          <span className="text-xs text-muted-foreground">
            @{displayUser?.username ?? "unknown"}
          </span>
          {(item.unread_count ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-xs text-primary font-medium">
              <Circle className="h-2 w-2 fill-current" />
              {item.unread_count}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground truncate">
          {item.last_message.text}
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          {formatTimeAgo(item.last_message.created_at)}
        </p>
      </div>

      {/* Arrow */}
      <MessageSquare className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 mt-1" />
    </Link>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(dateStr).toLocaleDateString();
}
