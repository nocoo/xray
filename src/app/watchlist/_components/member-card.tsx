"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import type { WatchlistMember } from "../_lib/types";

export const MemberCard = memo(function MemberCard({
  member,
  onEdit,
  onDelete,
}: {
  member: WatchlistMember;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
          src={`https://unavatar.io/x/${member.twitterUsername}`}
          alt={member.twitterUsername}
          className="h-[90px] w-[90px] rounded-full bg-muted mb-2"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
            target.parentElement!.innerHTML = `<div class="flex h-[90px] w-[90px] items-center justify-center rounded-full bg-muted text-2xl font-medium">${member.twitterUsername[0]?.toUpperCase() ?? "?"}</div>`;
          }}
        />
      </a>

      {/* Username */}
      <a
        href={`https://x.com/${member.twitterUsername}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium hover:underline truncate max-w-full"
      >
        @{member.twitterUsername}
      </a>

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

      {/* Note */}
      {member.note && (
        <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">
          {member.note}
        </p>
      )}
    </div>
  );
});
