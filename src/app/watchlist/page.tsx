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
import { Eye, Plus, Trash2, Pencil, Languages } from "lucide-react";
import { cn, getAvatarColor } from "@/lib/utils";
import { IconPicker, resolveIcon } from "@/components/ui/icon-picker";

// =============================================================================
// Types
// =============================================================================

interface WatchlistSummary {
  id: number;
  name: string;
  description: string | null;
  icon: string;
  translateEnabled: number;
  createdAt: string;
  memberCount?: number;
}

// =============================================================================
// Watchlist listing page — shows all watchlists as cards
// =============================================================================

export default function WatchlistListPage() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const searchParams = useSearchParams();
  const [watchlists, setWatchlists] = useState<WatchlistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editWatchlist, setEditWatchlist] = useState<WatchlistSummary | null>(null);
  const [deleteWatchlist, setDeleteWatchlist] = useState<WatchlistSummary | null>(null);

  const loadWatchlists = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/watchlists");
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setWatchlists(json.data ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWatchlists();
  }, [loadWatchlists]);

  // Auto-open create dialog via ?new=1 from sidebar
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setCreateOpen(true);
      // Clean URL without full navigation
      routerRef.current.replace("/watchlist", { scroll: false });
    }
  }, [searchParams]);

  const handleCreated = (id: number) => {
    routerRef.current.push(`/watchlist/${id}`);
  };

  return (
    <AppShell breadcrumbs={[{ label: "Watchlists" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Watchlists</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create and manage collections of Twitter/X users to track.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <Plus className="h-4 w-4" />
            New Watchlist
          </Button>
        </div>

        {loading && <LoadingSpinner />}

        {!loading && watchlists.length === 0 && (
          <EmptyState
            icon={Eye}
            title="No watchlists yet."
            subtitle="Create your first watchlist to start tracking Twitter/X users."
          />
        )}

        {!loading && watchlists.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {watchlists.map((wl) => {
              const WlIcon = resolveIcon(wl.icon);
              const color = getAvatarColor(wl.name);
              return (
                <Link
                  key={wl.id}
                  href={`/watchlist/${wl.id}`}
                  className="rounded-card bg-card border p-5 flex flex-col gap-3 hover:border-foreground/20 transition-colors group relative"
                >
                  {/* Edit/Delete actions */}
                  <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => { e.preventDefault(); setEditWatchlist(wl); }}
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => { e.preventDefault(); setDeleteWatchlist(wl); }}
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
                      <WlIcon className="h-5 w-5 text-white" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">{wl.name}</h3>
                      {wl.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {wl.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {wl.memberCount !== undefined && (
                      <span>{wl.memberCount} member{wl.memberCount !== 1 ? "s" : ""}</span>
                    )}
                    {wl.translateEnabled ? (
                      <span className="text-emerald-600 dark:text-emerald-400">Translate on</span>
                    ) : (
                      <span>Translate off</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <CreateWatchlistDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      {/* Edit dialog */}
      {editWatchlist && (
        <EditWatchlistDialog
          open={!!editWatchlist}
          onOpenChange={(o) => !o && setEditWatchlist(null)}
          watchlist={editWatchlist}
          onSuccess={loadWatchlists}
        />
      )}

      {/* Delete dialog */}
      {deleteWatchlist && (
        <DeleteWatchlistDialog
          open={!!deleteWatchlist}
          onOpenChange={(o) => !o && setDeleteWatchlist(null)}
          watchlist={deleteWatchlist}
          onSuccess={loadWatchlists}
        />
      )}
    </AppShell>
  );
}

// =============================================================================
// CreateWatchlistDialog
// =============================================================================

function CreateWatchlistDialog({
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
  const [icon, setIcon] = useState("eye");
  const [translateEnabled, setTranslateEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setDescription("");
    setIcon("eye");
    setTranslateEnabled(true);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/watchlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          icon,
          translateEnabled: translateEnabled ? 1 : 0,
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setError(json?.error ?? "Failed to create watchlist");
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
          <DialogTitle>New Watchlist</DialogTitle>
          <DialogDescription>
            Create a named collection to track Twitter/X users.
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
                  placeholder="e.g. Crypto KOLs"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Description (optional)</label>
                <Input
                  placeholder="What this watchlist tracks"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Auto-translate toggle */}
          <label className="flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-sm font-medium">Auto Translate</span>
                <p className="text-xs text-muted-foreground">
                  Translate fetched posts to Chinese automatically
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={translateEnabled}
              onClick={() => setTranslateEnabled((v) => !v)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                translateEnabled ? "bg-emerald-500" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform",
                  translateEnabled ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
          </label>

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
// EditWatchlistDialog
// =============================================================================

function EditWatchlistDialog({
  open,
  onOpenChange,
  watchlist,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  watchlist: WatchlistSummary;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(watchlist.name);
  const [description, setDescription] = useState(watchlist.description ?? "");
  const [icon, setIcon] = useState(watchlist.icon);
  const [translateEnabled, setTranslateEnabled] = useState(!!watchlist.translateEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/watchlists", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: watchlist.id,
          name: name.trim(),
          description: description.trim() || null,
          icon,
          translateEnabled: translateEnabled ? 1 : 0,
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setError(json?.error ?? "Failed to update watchlist");
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
          <DialogTitle>Edit Watchlist</DialogTitle>
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
                  placeholder="e.g. Crypto KOLs"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Description (optional)</label>
                <Input
                  placeholder="What this watchlist tracks"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Auto-translate toggle */}
          <label className="flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-sm font-medium">Auto Translate</span>
                <p className="text-xs text-muted-foreground">
                  Translate fetched posts to Chinese automatically
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={translateEnabled}
              onClick={() => setTranslateEnabled((v) => !v)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                translateEnabled ? "bg-emerald-500" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform",
                  translateEnabled ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
          </label>

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
// DeleteWatchlistDialog
// =============================================================================

function DeleteWatchlistDialog({
  open,
  onOpenChange,
  watchlist,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  watchlist: WatchlistSummary;
  onSuccess: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/watchlists?id=${watchlist.id}`, {
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
          <DialogTitle>Delete &quot;{watchlist.name}&quot;?</DialogTitle>
          <DialogDescription>
            This will permanently delete the watchlist and all its members,
            fetched posts, and logs. This action cannot be undone.
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
