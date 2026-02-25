"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  UserPlus,
  MapPin,
  Calendar,
  ExternalLink,
} from "lucide-react";

import type { UserInfo } from "../../../shared/types";

// We intentionally use <img> for external Twitter profile images.

// =============================================================================
// UserCard — reusable user profile display component
// =============================================================================

export function UserCard({
  user,
  onClick,
  showConnections = true,
}: {
  user: UserInfo;
  onClick?: () => void;
  showConnections?: boolean;
}) {
  const card = (
    <div className="rounded-card bg-secondary p-5 transition-colors hover:bg-secondary/80">
      {/* Banner placeholder + avatar */}
      <div className="flex items-start gap-4">
        {user.profile_image_url ? (
          <img
            src={user.profile_image_url}
            alt={user.name}
            className="h-16 w-16 shrink-0 rounded-full"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-medium">
            {user.name[0]}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg truncate">{user.name}</span>
            {user.is_verified && (
              <Badge variant="default" className="h-4 px-1 text-[10px]">
                V
              </Badge>
            )}
            <a
              href={`https://x.com/${user.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Open on X"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
        </div>
      </div>

      {/* Bio */}
      {user.description && (
        <p className="mt-3 text-sm leading-relaxed">{user.description}</p>
      )}

      {/* Location + join date */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {user.location && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {user.location}
          </span>
        )}
        {user.created_at && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Joined{" "}
            {new Date(user.created_at).toLocaleDateString("en-US", {
              month: "short",
              year: "numeric",
            })}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="mt-3 flex items-center gap-5 text-sm">
        <span>
          <strong className="font-semibold">
            {formatStatCount(user.following_count)}
          </strong>{" "}
          <span className="text-muted-foreground">Following</span>
        </span>
        {showConnections ? (
          <Link
            href={`/users/${user.username}/connections`}
            className="hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <strong className="font-semibold">
              {formatStatCount(user.followers_count)}
            </strong>{" "}
            <span className="text-muted-foreground">Followers</span>
          </Link>
        ) : (
          <span>
            <strong className="font-semibold">
              {formatStatCount(user.followers_count)}
            </strong>{" "}
            <span className="text-muted-foreground">Followers</span>
          </span>
        )}
        <span>
          <strong className="font-semibold">
            {formatStatCount(user.tweet_count)}
          </strong>{" "}
          <span className="text-muted-foreground">Tweets</span>
        </span>
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-card"
      >
        {card}
      </button>
    );
  }

  return card;
}

// =============================================================================
// Compact UserCard for lists (followers, following, etc.)
// =============================================================================

export function UserCardCompact({ user }: { user: UserInfo }) {
  return (
    <Link
      href={`/users/${user.username}`}
      className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-card"
    >
      <div className="rounded-card bg-secondary p-4 transition-colors hover:bg-secondary/80">
        <div className="flex items-center gap-3">
          {user.profile_image_url ? (
            <img
              src={user.profile_image_url}
              alt={user.name}
              className="h-10 w-10 shrink-0 rounded-full"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
              {user.name[0]}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{user.name}</span>
              {user.is_verified && (
                <Badge variant="default" className="h-4 px-1 text-[10px]">
                  V
                </Badge>
              )}
              <span className="text-sm text-muted-foreground truncate">
                @{user.username}
              </span>
            </div>
            {user.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {user.description}
              </p>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {formatStatCount(user.followers_count)}
            </span>
            <span className="flex items-center gap-1">
              <UserPlus className="h-3 w-3" />
              {formatStatCount(user.following_count)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatStatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
