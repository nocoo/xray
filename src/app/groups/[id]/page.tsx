"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
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
  Users,
  Plus,
  Trash2,
  RefreshCw,
  Upload,
  FileUp,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from "lucide-react";
import { cn, getAvatarColor } from "@/lib/utils";
import { resolveIcon } from "@/components/ui/icon-picker";
import { parseTwitterExportFile } from "@/lib/twitter-export";
import type { MemberProfileData } from "@/app/watchlist/_lib/types";

// =============================================================================
// Types
// =============================================================================

interface GroupDetail {
  id: number;
  name: string;
  description: string | null;
  icon: string;
  createdAt: string;
}

interface GroupMember {
  id: number;
  groupId: number;
  twitterUsername: string;
  twitterId: string | null;
  addedAt: string;
  profile: MemberProfileData | null;
}

type SortField =
  | "username"
  | "displayName"
  | "followers"
  | "following"
  | "tweets"
  | "addedAt";
type SortDir = "asc" | "desc";

// =============================================================================
// Group detail page
// =============================================================================

export default function GroupDetailPage() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const params = useParams();
  const groupId = params.id as string;

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add member
  const [addUsername, setAddUsername] = useState("");
  const [adding, setAdding] = useState(false);

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);

  // Refresh profiles
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null);

  // Delete member confirmation
  const [deleteMember, setDeleteMember] = useState<GroupMember | null>(null);

  // Sort
  const [sortField, setSortField] = useState<SortField>("followers");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Search/filter
  const [filterText, setFilterText] = useState("");

  // ---------------------------------------------------------------------------
  // Load group + members
  // ---------------------------------------------------------------------------
  const loadGroup = useCallback(async () => {
    try {
      // We get group info from the list endpoint and filter
      const res = await fetch("/api/groups");
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        const found = (json.data as GroupDetail[]).find(
          (g) => g.id === parseInt(groupId, 10),
        );
        if (found) setGroup(found);
        else setError("Group not found");
      }
    } catch {
      setError("Failed to load group");
    }
  }, [groupId]);

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/members`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setMembers(json.data ?? []);
      }
    } catch {
      // silent
    }
  }, [groupId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadGroup(), loadMembers()]).finally(() => setLoading(false));
  }, [loadGroup, loadMembers]);

  // ---------------------------------------------------------------------------
  // Add single member
  // ---------------------------------------------------------------------------
  const handleAddMember = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const username = addUsername.trim().replace(/^@/, "");
      if (!username) return;

      setAdding(true);
      setError(null);

      try {
        const res = await fetch(`/api/groups/${groupId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ twitterUsername: username }),
        });
        const json = await res.json().catch(() => null);

        if (!res.ok) {
          setError(json?.error ?? "Failed to add member");
          return;
        }

        setAddUsername("");
        await loadMembers();
      } catch {
        setError("Network error");
      } finally {
        setAdding(false);
      }
    },
    [addUsername, groupId, loadMembers],
  );

  // ---------------------------------------------------------------------------
  // Delete member
  // ---------------------------------------------------------------------------
  const handleDeleteMember = useCallback(
    async (memberId: number) => {
      try {
        const res = await fetch(
          `/api/groups/${groupId}/members?id=${memberId}`,
          { method: "DELETE" },
        );
        if (res.ok) {
          setMembers((prev) => prev.filter((m) => m.id !== memberId));
          setDeleteMember(null);
        }
      } catch {
        // silent
      }
    },
    [groupId],
  );

  // ---------------------------------------------------------------------------
  // Refresh profiles (resolve via batch API, then link)
  // ---------------------------------------------------------------------------
  const handleRefreshProfiles = useCallback(async () => {
    if (members.length === 0) return;

    setRefreshing(true);
    setRefreshStatus("Refreshing profiles...");
    setError(null);

    try {
      // 1. Collect all usernames (prefer twitterId for resolved accounts)
      const identifiers = members.map(
        (m) => m.profile?.twitterId ?? m.twitterUsername,
      );

      // 2. Batch resolve (auto-upserts to twitter_profiles)
      const res = await fetch("/api/explore/users/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: identifiers }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setError(json?.error ?? "Failed to refresh profiles");
        return;
      }

      const { resolved, failed } = json.data as {
        resolved: unknown[];
        failed: string[];
      };

      setRefreshStatus("Linking profiles...");

      // 3. Link profiles to members
      await fetch(`/api/groups/${groupId}/members/link-profiles`, {
        method: "POST",
      });

      // 4. Reload members to get updated profile data
      await loadMembers();

      if (failed.length > 0) {
        setRefreshStatus(
          `Refreshed ${resolved.length} profiles. ${failed.length} could not be resolved.`,
        );
      } else {
        setRefreshStatus(`Refreshed ${resolved.length} profiles.`);
      }
    } catch {
      setError("Network error during profile refresh");
    } finally {
      setRefreshing(false);
    }
  }, [members, groupId, loadMembers]);

  // ---------------------------------------------------------------------------
  // Sort + filter
  // ---------------------------------------------------------------------------
  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir(field === "username" || field === "displayName" ? "asc" : "desc");
      }
    },
    [sortField],
  );

  const sortedMembers = useMemo(() => {
    let list = [...members];

    // Filter
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.twitterUsername.toLowerCase().includes(q) ||
          m.profile?.displayName?.toLowerCase().includes(q) ||
          m.profile?.description?.toLowerCase().includes(q),
      );
    }

    // Sort
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortField) {
        case "username":
          return dir * a.twitterUsername.localeCompare(b.twitterUsername);
        case "displayName": {
          const an = a.profile?.displayName ?? a.twitterUsername;
          const bn = b.profile?.displayName ?? b.twitterUsername;
          return dir * an.localeCompare(bn);
        }
        case "followers":
          return dir * ((a.profile?.followersCount ?? 0) - (b.profile?.followersCount ?? 0));
        case "following":
          return dir * ((a.profile?.followingCount ?? 0) - (b.profile?.followingCount ?? 0));
        case "tweets":
          return dir * ((a.profile?.tweetCount ?? 0) - (b.profile?.tweetCount ?? 0));
        case "addedAt":
          return dir * a.addedAt.localeCompare(b.addedAt);
        default:
          return 0;
      }
    });

    return list;
  }, [members, filterText, sortField, sortDir]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <AppShell breadcrumbs={[{ label: "Groups", href: "/groups" }, { label: "..." }]}>
        <LoadingSpinner />
      </AppShell>
    );
  }

  if (!group) {
    return (
      <AppShell breadcrumbs={[{ label: "Groups", href: "/groups" }, { label: "Not Found" }]}>
        <EmptyState icon={Users} title="Group not found." />
      </AppShell>
    );
  }

  const GIcon = resolveIcon(group.icon);
  const color = getAvatarColor(group.name);

  return (
    <AppShell breadcrumbs={[{ label: "Groups", href: "/groups" }, { label: group.name }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-lg shrink-0",
                color,
              )}
            >
              <GIcon className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
              {group.description && (
                <p className="text-sm text-muted-foreground">{group.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                {members.length} member{members.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshProfiles}
              disabled={refreshing || members.length === 0}
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              {refreshing ? "Refreshing..." : "Refresh Profiles"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="h-4 w-4" />
              Import
            </Button>
          </div>
        </div>

        {/* Status messages */}
        {error && <ErrorBanner error={error} />}
        {refreshStatus && !error && (
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            {refreshStatus}
          </div>
        )}

        {/* Add member inline */}
        <form onSubmit={handleAddMember} className="flex gap-2">
          <Input
            placeholder="Add member by username (e.g. elonmusk)"
            value={addUsername}
            onChange={(e) => setAddUsername(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={adding || !addUsername.trim()}>
            <Plus className="h-4 w-4" />
            {adding ? "Adding..." : "Add"}
          </Button>
        </form>

        {/* Members table */}
        {members.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No members yet."
            subtitle="Add members manually or import from a file."
          />
        ) : (
          <>
            {/* Search filter */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter members..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="pl-9"
                />
              </div>
              <span className="text-sm text-muted-foreground">
                {sortedMembers.length === members.length
                  ? `${members.length} member${members.length !== 1 ? "s" : ""}`
                  : `${sortedMembers.length} of ${members.length}`}
              </span>
            </div>

            {/* Table */}
            <div className="rounded-card border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <SortHeader field="displayName" label="User" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader field="followers" label="Followers" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortHeader field="following" label="Following" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortHeader field="tweets" label="Tweets" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortHeader field="addedAt" label="Added" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground w-10" />
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      onDelete={() => setDeleteMember(m)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Import dialog */}
      <ImportMembersDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        groupId={groupId}
        onImported={loadMembers}
      />

      {/* Delete member confirmation */}
      {deleteMember && (
        <Dialog
          open={!!deleteMember}
          onOpenChange={(o) => !o && setDeleteMember(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove @{deleteMember.twitterUsername}?</DialogTitle>
              <DialogDescription>
                This member will be removed from the group.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteMember(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDeleteMember(deleteMember.id)}
              >
                Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}

// =============================================================================
// SortHeader — clickable table header cell
// =============================================================================

function SortHeader({
  field,
  label,
  sortField,
  sortDir,
  onSort,
  className,
}: {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const active = sortField === field;
  return (
    <th className={cn("px-4 py-3 font-medium text-muted-foreground", className)}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

// =============================================================================
// MemberRow — single table row
// =============================================================================

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function MemberRow({
  member,
  onDelete,
}: {
  member: GroupMember;
  onDelete: () => void;
}) {
  const p = member.profile;
  const displayName = p?.displayName ?? null;
  const avatarUrl =
    p?.profileImageUrl ??
    `https://unavatar.io/x/${member.twitterUsername}`;

  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/30 transition-colors group">
      {/* User */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <img
            src={avatarUrl}
            alt={member.twitterUsername}
            className="h-9 w-9 rounded-full bg-muted shrink-0"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
            }}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {displayName && (
                <span className="font-medium truncate">{displayName}</span>
              )}
              {p?.isVerified && (
                <Badge variant="default" className="h-3.5 px-1 text-[9px] shrink-0">
                  V
                </Badge>
              )}
              <a
                href={`https://x.com/${member.twitterUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                title="Open on X"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <span className="text-xs text-muted-foreground">
              @{member.twitterUsername}
            </span>
            {p?.description && (
              <p className="text-xs text-muted-foreground/70 line-clamp-1 mt-0.5 max-w-[300px]">
                {p.description}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Followers */}
      <td className="px-4 py-3 text-right tabular-nums">
        {p ? formatCount(p.followersCount) : "—"}
      </td>

      {/* Following */}
      <td className="px-4 py-3 text-right tabular-nums">
        {p ? formatCount(p.followingCount) : "—"}
      </td>

      {/* Tweets */}
      <td className="px-4 py-3 text-right tabular-nums">
        {p ? formatCount(p.tweetCount) : "—"}
      </td>

      {/* Added */}
      <td className="px-4 py-3 text-muted-foreground text-xs">
        {new Date(member.addedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-right">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onDelete}
          title="Remove"
          className="text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </td>
    </tr>
  );
}

// =============================================================================
// ImportMembersDialog — manual text, file drag-drop, Twitter export
// =============================================================================

function ImportMembersDialog({
  open,
  onOpenChange,
  groupId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  onImported: () => Promise<void>;
}) {
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importSource, setImportSource] = useState<
    "manual" | "twitter-export" | null
  >(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const reset = () => {
    setImportText("");
    setImportError(null);
    setImportProgress(null);
    setImportSource(null);
  };

  // ---------------------------------------------------------------------------
  // Parse textarea → deduplicated usernames/IDs
  // ---------------------------------------------------------------------------
  function parseUsernames(text: string): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const raw of text.split(/\n/)) {
      const cleaned = raw.trim().replace(/^@/, "");
      if (cleaned && !seen.has(cleaned.toLowerCase())) {
        seen.add(cleaned.toLowerCase());
        result.push(cleaned);
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // File handling
  // ---------------------------------------------------------------------------
  const handleFile = useCallback((file: File) => {
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) {
        setImportError("Could not read file.");
        return;
      }

      // Try parsing as Twitter export
      const accountIds = parseTwitterExportFile(content);
      if (accountIds && accountIds.length > 0) {
        setImportText(accountIds.join("\n"));
        setImportSource("twitter-export");
        return;
      }

      // Fall back: treat as plain text (one username per line)
      setImportText(content);
      setImportSource("manual");
    };
    reader.onerror = () => {
      setImportError("Failed to read file.");
    };
    reader.readAsText(file);
  }, []);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile],
  );

  // ---------------------------------------------------------------------------
  // Import: batch add usernames to the group
  // ---------------------------------------------------------------------------
  const handleImport = useCallback(async () => {
    const usernames = parseUsernames(importText);

    if (usernames.length === 0) {
      setImportError("No valid entries found. Enter one username per line.");
      return;
    }

    setImporting(true);
    setImportError(null);
    const label = importSource === "twitter-export" ? "account" : "username";
    setImportProgress(
      `Adding ${usernames.length} ${label}${usernames.length !== 1 ? "s" : ""} to group...`,
    );

    try {
      // 1. Batch add members to group
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setImportError(json?.error ?? "Failed to import members");
        return;
      }

      const { inserted, total } = json.data as { inserted: number; total: number };

      // 2. Reload members
      await onImported();

      // 3. Close dialog
      reset();
      onOpenChange(false);

      // Note: duplicates are silently skipped by the batch API
      if (inserted < usernames.length) {
        // Some were duplicates
      }
    } catch {
      setImportError("Network error — could not reach API");
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }, [importText, importSource, groupId, onImported, onOpenChange]);

  const parsedCount = parseUsernames(importText).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import members</DialogTitle>
          <DialogDescription>
            Drag and drop a Twitter/X data export file (
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              following.js
            </code>
            ), or paste usernames one per line.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Drop zone / textarea */}
          <div
            className={`relative rounded-lg border-2 border-dashed transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-input hover:border-muted-foreground/50"
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <textarea
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                setImportError(null);
                setImportSource("manual");
              }}
              placeholder={"elonmusk\n@karpathy\nvaboredition\nnatfriedman"}
              rows={10}
              className="w-full rounded-lg bg-transparent px-4 py-3 text-sm font-mono placeholder:text-muted-foreground focus:outline-none resize-y border-0"
              disabled={importing}
            />

            {/* Drag overlay */}
            {isDragging && (
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-primary/10 pointer-events-none">
                <FileUp className="h-8 w-8 text-primary mb-2" />
                <p className="text-sm font-medium text-primary">
                  Drop following.js here
                </p>
              </div>
            )}
          </div>

          {/* File picker + info row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <FileUp className="h-3.5 w-3.5" />
                Choose file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".js,.txt,.csv"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>

            {parsedCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {parsedCount} unique{" "}
                {importSource === "twitter-export" ? "account" : "username"}
                {parsedCount !== 1 ? "s" : ""} detected
                {importSource === "twitter-export" && (
                  <span className="ml-1 text-primary">(Twitter export)</span>
                )}
              </p>
            )}
          </div>

          {importError && <ErrorBanner error={importError} />}
          {importProgress && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoadingSpinner className="" size="sm" />
              {importProgress}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={importing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={importing || parsedCount === 0}
          >
            <Upload className="h-4 w-4" />
            {importing
              ? "Importing..."
              : `Import ${parsedCount} ${importSource === "twitter-export" ? "account" : "user"}${parsedCount !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
