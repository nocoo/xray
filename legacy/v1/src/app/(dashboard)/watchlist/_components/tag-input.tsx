"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag, X, Plus } from "lucide-react";
import type { TagData } from "../_lib/types";

export function TagInput({
  allTags,
  selectedTagIds,
  onToggle,
  onCreateTag,
}: {
  allTags: TagData[];
  selectedTagIds: number[];
  onToggle: (tagId: number) => void;
  onCreateTag: (name: string) => Promise<TagData | null>;
}) {
  const [newTagName, setNewTagName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    const name = newTagName.trim();
    if (!name) return;
    setCreating(true);
    const tag = await onCreateTag(name);
    if (tag) {
      onToggle(tag.id);
      setNewTagName("");
    }
    setCreating(false);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium flex items-center gap-1">
        <Tag className="h-3.5 w-3.5" />
        Tags
      </label>

      {/* Existing tags */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => {
            const selected = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => onToggle(tag.id)}
                className="rounded-full px-2.5 py-0.5 text-xs font-medium transition-all border"
                style={{
                  backgroundColor: selected ? tag.color : "transparent",
                  color: selected ? "#fff" : tag.color,
                  borderColor: tag.color,
                }}
              >
                {tag.name}
                {selected && <X className="inline h-3 w-3 ml-1" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Create new tag */}
      <div className="flex gap-2">
        <Input
          placeholder="New tag name..."
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCreate())}
          className="h-7 text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={handleCreate}
          disabled={!newTagName.trim() || creating}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
