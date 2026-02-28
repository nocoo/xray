"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout";
import {
  LoadingSpinner,
  ErrorBanner,
  EmptyState,
} from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Eye,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Tag,
  X,
  StickyNote,
} from "lucide-react";

// =============================================================================
// Types (mirroring API response shapes)
// =============================================================================

interface TagData {
  id: number;
  name: string;
  color: string;
}

interface WatchlistMember {
  id: number;
  twitterUsername: string;
  note: string | null;
  addedAt: string;
  tags: TagData[];
}

// =============================================================================
// Watchlist Page
// =============================================================================

export default function WatchlistPage() {
  const [members, setMembers] = useState<WatchlistMember[]>([]);
  const [allTags, setAllTags] = useState<TagData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<WatchlistMember | null>(null);
  const [deleteMember, setDeleteMember] = useState<WatchlistMember | null>(
    null
  );

  // Filter by tag
  const [filterTagId, setFilterTagId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersRes, tagsRes] = await Promise.all([
        fetch("/api/watchlist"),
        fetch("/api/tags"),
      ]);
      const membersJson = await membersRes.json().catch(() => null);
      const tagsJson = await tagsRes.json().catch(() => null);

      if (!membersRes.ok || !membersJson?.success) {
        setError(membersJson?.error ?? "Failed to load watchlist");
        return;
      }
      if (!tagsRes.ok || !tagsJson?.success) {
        setError(tagsJson?.error ?? "Failed to load tags");
        return;
      }

      setMembers(membersJson.data ?? []);
      setAllTags(tagsJson.data ?? []);
    } catch {
      setError("Network error — could not reach API");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = filterTagId
    ? members.filter((m) => m.tags.some((t) => t.id === filterTagId))
    : members;

  return (
    <AppShell breadcrumbs={[{ label: "Watchlist" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Watchlist</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track Twitter/X users you're interested in.
              {members.length > 0 && ` ${members.length} users tracked.`}
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)} size="sm">
            <Plus className="h-4 w-4" />
            Add User
          </Button>
        </div>

        {/* Tag filter bar */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Filter:</span>
            <button
              onClick={() => setFilterTagId(null)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                filterTagId === null
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() =>
                  setFilterTagId(filterTagId === tag.id ? null : tag.id)
                }
                className="rounded-full px-2.5 py-0.5 text-xs font-medium transition-opacity"
                style={{
                  backgroundColor: tag.color,
                  color: "#fff",
                  opacity: filterTagId === null || filterTagId === tag.id ? 1 : 0.4,
                }}
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && <LoadingSpinner />}

        {/* Error */}
        {error && <ErrorBanner error={error} />}

        {/* Members list */}
        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                onEdit={() => setEditMember(member)}
                onDelete={() => setDeleteMember(member)}
              />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && members.length === 0 && (
          <EmptyState
            icon={Eye}
            title="No users in your watchlist yet."
            subtitle="Add Twitter/X users to track them here."
          />
        )}

        {/* Filtered empty */}
        {!loading &&
          !error &&
          members.length > 0 &&
          filtered.length === 0 && (
            <div className="rounded-card bg-secondary p-8 text-center">
              <p className="text-muted-foreground">
                No users match the selected tag filter.
              </p>
            </div>
          )}
      </div>

      {/* Add dialog */}
      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        allTags={allTags}
        onSuccess={loadData}
        onTagCreated={(tag) => setAllTags((prev) => [...prev, tag])}
      />

      {/* Edit dialog */}
      {editMember && (
        <EditMemberDialog
          open={!!editMember}
          onOpenChange={(open) => !open && setEditMember(null)}
          member={editMember}
          allTags={allTags}
          onSuccess={loadData}
          onTagCreated={(tag) => setAllTags((prev) => [...prev, tag])}
        />
      )}

      {/* Delete confirmation */}
      {deleteMember && (
        <DeleteMemberDialog
          open={!!deleteMember}
          onOpenChange={(open) => !open && setDeleteMember(null)}
          member={deleteMember}
          onSuccess={loadData}
        />
      )}
    </AppShell>
  );
}

// =============================================================================
// MemberRow — single watchlist member display
// =============================================================================

function MemberRow({
  member,
  onEdit,
  onDelete,
}: {
  member: WatchlistMember;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-card bg-card border p-4 flex items-center gap-4 group">
      {/* Avatar placeholder — first letter */}
      <a
        href={`https://x.com/${member.twitterUsername}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0"
      >
        <img
          src={`https://unavatar.io/x/${member.twitterUsername}`}
          alt={member.twitterUsername}
          className="h-10 w-10 rounded-full bg-muted"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
            target.parentElement!.innerHTML = `<div class="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium">${member.twitterUsername[0]?.toUpperCase() ?? "?"}</div>`;
          }}
        />
      </a>

      {/* Name + note + tags */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <a
            href={`https://x.com/${member.twitterUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline"
          >
            @{member.twitterUsername}
          </a>
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </div>

        {/* Tags */}
        {member.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {member.tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {/* Note */}
        {member.note && (
          <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
            <StickyNote className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="line-clamp-2">{member.note}</span>
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon-xs" onClick={onEdit} title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onDelete}
          title="Remove"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// TagInput — inline tag picker with ability to create new tags
// =============================================================================

function TagInput({
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

// =============================================================================
// AddMemberDialog
// =============================================================================

function AddMemberDialog({
  open,
  onOpenChange,
  allTags,
  onSuccess,
  onTagCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allTags: TagData[];
  onSuccess: () => void;
  onTagCreated: (tag: TagData) => void;
}) {
  const [username, setUsername] = useState("");
  const [note, setNote] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setUsername("");
    setNote("");
    setSelectedTagIds([]);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twitterUsername: username.trim(),
          note: note.trim() || undefined,
          tagIds: selectedTagIds.length ? selectedTagIds : undefined,
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setError(json?.error ?? "Failed to add user");
        return;
      }

      reset();
      onOpenChange(false);
      onSuccess();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const toggleTag = (tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const createTag = async (name: string): Promise<TagData | null> => {
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) {
        onTagCreated(json.data);
        return json.data;
      }
    } catch {
      // silent
    }
    return null;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to Watchlist</DialogTitle>
          <DialogDescription>
            Enter a Twitter/X username to track.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Username</label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">@</span>
              <Input
                placeholder="elonmusk"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Note (optional)</label>
            <Input
              placeholder="Why are you tracking this user?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <TagInput
            allTags={allTags}
            selectedTagIds={selectedTagIds}
            onToggle={toggleTag}
            onCreateTag={createTag}
          />

          <DialogFooter>
            <Button type="submit" disabled={!username.trim() || saving}>
              {saving ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// EditMemberDialog
// =============================================================================

function EditMemberDialog({
  open,
  onOpenChange,
  member,
  allTags,
  onSuccess,
  onTagCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: WatchlistMember;
  allTags: TagData[];
  onSuccess: () => void;
  onTagCreated: (tag: TagData) => void;
}) {
  const [note, setNote] = useState(member.note ?? "");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(
    member.tags.map((t) => t.id)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/watchlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: member.id,
          note: note.trim() || null,
          tagIds: selectedTagIds,
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setError(json?.error ?? "Failed to update");
        return;
      }

      onOpenChange(false);
      onSuccess();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const toggleTag = (tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const createTag = async (name: string): Promise<TagData | null> => {
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) {
        onTagCreated(json.data);
        return json.data;
      }
    } catch {
      // silent
    }
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit @{member.twitterUsername}</DialogTitle>
          <DialogDescription>
            Update note and tags for this user.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Note</label>
            <Input
              placeholder="Why are you tracking this user?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
            />
          </div>

          <TagInput
            allTags={allTags}
            selectedTagIds={selectedTagIds}
            onToggle={toggleTag}
            onCreateTag={createTag}
          />

          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// DeleteMemberDialog
// =============================================================================

function DeleteMemberDialog({
  open,
  onOpenChange,
  member,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: WatchlistMember;
  onSuccess: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/watchlist?id=${member.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onOpenChange(false);
        onSuccess();
      }
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove @{member.twitterUsername}?</DialogTitle>
          <DialogDescription>
            This will remove the user from your watchlist. This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Removing..." : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
