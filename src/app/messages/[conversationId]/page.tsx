"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout";
import { Loader2, ArrowLeft, MessageSquare } from "lucide-react";

import type { Conversation } from "../../../../shared/types";

// We intentionally use <img> for external Twitter profile images.
/* eslint-disable @next/next/no-img-element */

// =============================================================================
// Conversation Page — displays a single DM conversation thread
// =============================================================================

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `/api/explore/messages/${encodeURIComponent(conversationId)}`,
        );
        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(data.error ?? "Failed to load conversation");
        } else {
          setConversation(data.data ?? null);
        }
      } catch {
        setError("Network error — could not reach API");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [conversationId]);

  // Derive display title from participants
  const otherParticipants = conversation?.participants?.filter(
    (p) => p.username !== "me",
  );
  const title =
    otherParticipants && otherParticipants.length > 0
      ? otherParticipants.map((p) => p.name).join(", ")
      : "Conversation";

  return (
    <AppShell
      breadcrumbs={[
        { label: "Messages", href: "/messages" },
        { label: title },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link
            href="/messages"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to inbox
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Conversation {conversationId}
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

        {/* Messages Thread */}
        {!loading && !error && conversation && (
          <div className="space-y-3">
            {conversation.messages.length === 0 && (
              <div className="rounded-card bg-secondary p-12 text-center">
                <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/40 mb-4" />
                <p className="text-muted-foreground">
                  No messages in this conversation.
                </p>
              </div>
            )}
            {conversation.messages.map((msg) => {
              const sender = conversation.participants.find(
                (p) => p.id === msg.sender_id,
              );
              return (
                <MessageBubble
                  key={msg.id}
                  text={msg.text}
                  senderName={sender?.name ?? "Unknown"}
                  senderUsername={sender?.username ?? "unknown"}
                  senderAvatar={sender?.profile_image_url}
                  createdAt={msg.created_at}
                  mediaUrls={msg.media_urls}
                />
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

// =============================================================================
// MessageBubble — renders a single message
// =============================================================================

function MessageBubble({
  text,
  senderName,
  senderUsername,
  senderAvatar,
  createdAt,
  mediaUrls,
}: {
  text: string;
  senderName: string;
  senderUsername: string;
  senderAvatar?: string;
  createdAt: string;
  mediaUrls?: string[];
}) {
  return (
    <div className="flex items-start gap-3 rounded-card border bg-card p-4">
      {/* Avatar */}
      {senderAvatar ? (
        <img
          src={senderAvatar}
          alt={senderUsername}
          className="h-8 w-8 rounded-full bg-muted flex-shrink-0"
        />
      ) : (
        <div className="h-8 w-8 rounded-full bg-muted flex-shrink-0" />
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{senderName}</span>
          <span className="text-xs text-muted-foreground">
            @{senderUsername}
          </span>
          <span className="text-xs text-muted-foreground/70">
            {formatTime(createdAt)}
          </span>
        </div>
        <p className="mt-1 text-sm whitespace-pre-wrap">{text}</p>
        {mediaUrls && mediaUrls.length > 0 && (
          <div className="mt-2 flex gap-2 flex-wrap">
            {mediaUrls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Media ${i + 1}`}
                className="rounded-md max-h-48 object-cover"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString();
}
