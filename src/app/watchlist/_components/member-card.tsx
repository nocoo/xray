"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Users } from "lucide-react";
import type { WatchlistMember } from "../_lib/types";

// We intentionally use <img> for external Twitter profile images.

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export const MemberCard = memo(function MemberCard({
  member,
  onEdit,
  onDelete,
}: {
  member: WatchlistMember;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const p = member.profile;
  const displayName = p?.displayName ?? null;
  const avatarUrl = p?.profileImageUrl ?? `https://unavatar.io/x/${member.twitterUsername}`;

  return (
    <div className="rounded-card bg-card border p-4 flex flex-col items-center text-center group relative">
      {/* Hover actions — top-right corner */}
      <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon-xs" onClick={onEdit} title="Edit">
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onDelete}
          title="Remove"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Avatar */}
      <a
        href={`https://x.com/${member.twitterUsername}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          src={avatarUrl}
          alt={member.twitterUsername}
          className="h-[90px] w-[90px] rounded-full bg-muted mb-2"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.parentElement?.insertAdjacentHTML("beforeend", `<div class="flex h-[90px] w-[90px] items-center justify-center rounded-full bg-muted text-2xl font-medium">${(displayName ?? member.twitterUsername)[0]?.toUpperCase() ?? "?"}</div>`);
            target.style.display = "none";
          }}
        />
      </a>

      {/* Display name + verified badge */}
      {displayName && (
        <div className="flex items-center justify-center gap-1 max-w-full">
          <span className="text-sm font-semibold truncate">{displayName}</span>
          {p?.isVerified && (
            <Badge variant="default" className="h-3.5 px-1 text-[9px] shrink-0">
              V
            </Badge>
          )}
        </div>
      )}

      {/* Username */}
      <a
        href={`https://x.com/${member.twitterUsername}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`text-sm hover:underline truncate max-w-full ${displayName ? "text-muted-foreground" : "font-medium"}`}
      >
        @{member.twitterUsername}
      </a>

      {/* Followers count */}
      {p && (
        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          <span>{formatCount(p.followersCount)}</span>
        </div>
      )}

      {/* Tags */}
      {member.tags.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1 mt-1.5">
          {member.tags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {/* Bio snippet (from profile) */}
      {p?.description && (
        <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">
          {p.description}
        </p>
      )}

      {/* Note (user's personal note, distinct from bio) */}
      {member.note && (
        <p className="text-[11px] text-muted-foreground/70 mt-1 italic line-clamp-1">
          {member.note}
        </p>
      )}
    </div>
  );
});
