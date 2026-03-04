"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout";
import { LoadingSpinner, EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Users, Plus, Trash2, Pencil } from "lucide-react";
import { cn, getAvatarColor } from "@/lib/utils";
import { IconPicker, resolveIcon } from "@/components/ui/icon-picker";

// =============================================================================
// Types
// =============================================================================

interface GroupSummary {
  id: number;
  name: string;
  description: string | null;
  icon: string;
  createdAt: string;
  memberCount?: number;
}

// =============================================================================
// Groups listing page — shows all groups as cards
// =============================================================================

export default function GroupsListPage() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const searchParams = useSearchParams();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<GroupSummary | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<GroupSummary | null>(null);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/groups");
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setGroups(json.data ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // Auto-open create dialog via ?new=1 from sidebar
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setCreateOpen(true);
      routerRef.current.replace("/groups", { scroll: false });
    }
  }, [searchParams]);

  const handleCreated = (id: number) => {
    routerRef.current.push(`/groups/${id}`);
  };

  return (
    <AppShell breadcrumbs={[{ label: "Groups" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Groups</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Organize Twitter/X users into groups for easy reference.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <Plus className="h-4 w-4" />
            New Group
          </Button>
        </div>

        {loading && <LoadingSpinner />}

        {!loading && groups.length === 0 && (
          <EmptyState
            icon={Users}
            title="No groups yet."
            subtitle="Create your first group to start organizing Twitter/X users."
          />
        )}

        {!loading && groups.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((g) => {
              const GIcon = resolveIcon(g.icon);
              const color = getAvatarColor(g.name);
              return (
                <Link
                  key={g.id}
                  href={`/groups/${g.id}`}
                  className="rounded-card bg-card border p-5 flex flex-col gap-3 hover:border-foreground/20 transition-colors group relative"
                >
                  {/* Edit/Delete actions */}
                  <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => { e.preventDefault(); setEditGroup(g); }}
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => { e.preventDefault(); setDeleteGroup(g); }}
                      title="Delete"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg",
                        color,
                      )}
                    >
                      <GIcon className="h-5 w-5 text-white" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">{g.name}</h3>
                      {g.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {g.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {g.memberCount !== undefined && (
                      <span>{g.memberCount} member{g.memberCount !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <CreateGroupDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      {/* Edit dialog */}
      {editGroup && (
        <EditGroupDialog
          open={!!editGroup}
          onOpenChange={(o) => !o && setEditGroup(null)}
          group={editGroup}
          onSuccess={loadGroups}
        />
      )}

      {/* Delete dialog */}
      {deleteGroup && (
        <DeleteGroupDialog
          open={!!deleteGroup}
          onOpenChange={(o) => !o && setDeleteGroup(null)}
          group={deleteGroup}
          onSuccess={loadGroups}
        />
      )}
    </AppShell>
  );
}

// =============================================================================
// CreateGroupDialog
// =============================================================================

function CreateGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("users");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setDescription("");
    setIcon("users");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          icon,
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setError(json?.error ?? "Failed to create group");
        return;
      }

      reset();
      onOpenChange(false);
      onCreated(json.data.id);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const color = name.trim() ? getAvatarColor(name.trim()) : "bg-muted";

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
          <DialogTitle>New Group</DialogTitle>
          <DialogDescription>
            Create a named group to organize Twitter/X users.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-start gap-4">
            <IconPicker value={icon} onChange={setIcon} color={color} />
            <div className="flex-1 space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Name</label>
                <Input
                  placeholder="e.g. Crypto Friends"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Description (optional)</label>
                <Input
                  placeholder="What this group is about"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// EditGroupDialog
// =============================================================================

function EditGroupDialog({
  open,
  onOpenChange,
  group,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: GroupSummary;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [icon, setIcon] = useState(group.icon);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: group.id,
          name: name.trim(),
          description: description.trim() || null,
          icon,
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setError(json?.error ?? "Failed to update group");
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

  const color = name.trim() ? getAvatarColor(name.trim()) : "bg-muted";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Group</DialogTitle>
          <DialogDescription>
            Update the name, icon, or description.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-start gap-4">
            <IconPicker value={icon} onChange={setIcon} color={color} />
            <div className="flex-1 space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Name</label>
                <Input
                  placeholder="e.g. Crypto Friends"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Description (optional)</label>
                <Input
                  placeholder="What this group is about"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// DeleteGroupDialog
// =============================================================================

function DeleteGroupDialog({
  open,
  onOpenChange,
  group,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: GroupSummary;
  onSuccess: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/groups?id=${group.id}`, {
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
          <DialogTitle>Delete &quot;{group.name}&quot;?</DialogTitle>
          <DialogDescription>
            This will permanently delete the group and all its members.
            This action cannot be undone.
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
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
