"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
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
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Pencil,
  X,
  Minus,
} from "lucide-react";
import { cn, getAvatarColor } from "@/lib/utils";
import { resolveIcon } from "@/components/ui/icon-picker";
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
  | "likes"
  | "lastTweet"
  | "activity"
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

  // Refresh profiles
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null);

  // Per-member refresh
  const [refreshingMemberId, setRefreshingMemberId] = useState<number | null>(null);

  // Delete member confirmation
  const [deleteMember, setDeleteMember] = useState<GroupMember | null>(null);

  // Batch edit mode
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

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
  // Batch edit helpers
  // ---------------------------------------------------------------------------
  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => {
      if (prev) setSelectedIds(new Set()); // exiting — clear selection
      return !prev;
    });
  }, []);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);



  // ---------------------------------------------------------------------------
  // Refresh profiles — one-by-one with incremental UI updates
  // ---------------------------------------------------------------------------
  const handleRefreshProfiles = useCallback(async () => {
    if (members.length === 0) return;

    setRefreshing(true);
    setRefreshStatus(null);
    setError(null);

    let resolved = 0;
    let failed = 0;

    for (const m of members) {
      const identifier = m.profile?.twitterId ?? m.twitterUsername;
      setRefreshStatus(`Refreshing ${resolved + failed + 1}/${members.length}: @${m.twitterUsername}...`);

      try {
        const res = await fetch("/api/profiles/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usernames: [identifier] }),
        });
        const json = await res.json().catch(() => null);

        if (res.ok && json?.success) {
          resolved++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }

      // Reload member list after each individual refresh
      await loadMembers();
    }

    // Backfill twitter_id on all members that are still missing it
    await fetch(`/api/groups/${groupId}/members/link-profiles`, { method: "POST" });
    await loadMembers();

    if (failed > 0) {
      setRefreshStatus(
        `Refreshed ${resolved} profile${resolved !== 1 ? "s" : ""}. ${failed} could not be resolved.`,
      );
    } else {
      setRefreshStatus(`Refreshed ${resolved} profile${resolved !== 1 ? "s" : ""}.`);
    }

    setRefreshing(false);
  }, [members, groupId, loadMembers]);

  // ---------------------------------------------------------------------------
  // Refresh a single member's profile
  // ---------------------------------------------------------------------------
  const refreshMemberProfile = useCallback(
    async (member: GroupMember) => {
      setRefreshingMemberId(member.id);
      try {
        const res = await fetch("/api/profiles/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usernames: [member.twitterUsername] }),
        });
        if (res.ok) {
          // Backfill twitter_id if missing
          await fetch(`/api/groups/${groupId}/members/link-profiles`, {
            method: "POST",
          });
          await loadMembers();
        }
      } catch {
        // ignore network errors
      } finally {
        setRefreshingMemberId(null);
      }
    },
    [groupId, loadMembers],
  );

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

    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.twitterUsername.toLowerCase().includes(q) ||
          m.profile?.displayName?.toLowerCase().includes(q) ||
          m.profile?.description?.toLowerCase().includes(q),
      );
    }

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
        case "likes":
          return dir * ((a.profile?.likeCount ?? 0) - (b.profile?.likeCount ?? 0));
        case "lastTweet": {
          const aTime = a.profile?.lastTweetAt ? new Date(a.profile.lastTweetAt).getTime() : 0;
          const bTime = b.profile?.lastTweetAt ? new Date(b.profile.lastTweetAt).getTime() : 0;
          return dir * (aTime - bTime);
        }
        case "activity": {
          const aScore = getActivityScore(a.profile);
          const bScore = getActivityScore(b.profile);
          return dir * (aScore - bScore);
        }
        case "addedAt":
          return dir * a.addedAt.localeCompare(b.addedAt);
        default:
          return 0;
      }
    });

    return list;
  }, [members, filterText, sortField, sortDir]);

  // ---------------------------------------------------------------------------
  // Batch edit helpers (must be after sortedMembers)
  // ---------------------------------------------------------------------------
  const toggleSelectAll = useCallback(() => {
    const visibleIds = sortedMembers.map((m) => m.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleIds));
    }
  }, [sortedMembers, selectedIds]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBatchDeleting(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => !selectedIds.has(m.id)));
        setSelectedIds(new Set());
        setEditMode(false);
      }
    } catch {
      // silent
    } finally {
      setBatchDeleting(false);
    }
  }, [groupId, selectedIds]);

  const allVisibleSelected = sortedMembers.length > 0 && sortedMembers.every((m) => selectedIds.has(m.id));
  const someVisibleSelected = sortedMembers.some((m) => selectedIds.has(m.id));

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
            {editMode ? (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBatchDelete}
                  disabled={selectedIds.size === 0 || batchDeleting}
                >
                  <Minus className="h-4 w-4" />
                  {batchDeleting
                    ? "Removing..."
                    : `Remove${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`}
                </Button>
                <Button variant="outline" size="sm" onClick={toggleEditMode}>
                  <X className="h-4 w-4" />
                  Done
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshProfiles}
                  disabled={refreshing || members.length === 0}
                >
                  <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
                  {refreshing ? "Refreshing..." : "Refresh Profiles"}
                </Button>
                {members.length > 0 && (
                  <Button variant="outline" size="sm" onClick={toggleEditMode}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => routerRef.current.push(`/groups/${groupId}/add`)}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Status messages */}
        {error && <ErrorBanner error={error} />}
        {refreshStatus && !error && (
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            {refreshStatus}
          </div>
        )}

        {/* Members table */}
        {members.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No members yet."
            subtitle="Click Add to start adding members to this group."
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
                    {editMode && (
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                          }}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-input accent-primary"
                        />
                      </th>
                    )}
                    <SortHeader field="displayName" label="User" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-left" />
                    <SortHeader field="followers" label="Followers" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortHeader field="following" label="Following" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortHeader field="tweets" label="Tweets" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortHeader field="likes" label="Likes" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortHeader field="lastTweet" label="Last Tweet" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortHeader field="activity" label="Activity" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-center" />
                    <SortHeader field="addedAt" label="Added" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    {!editMode && (
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground w-10" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      editMode={editMode}
                      selected={selectedIds.has(m.id)}
                      onToggleSelect={() => toggleSelect(m.id)}
                      onDelete={() => setDeleteMember(m)}
                      onRefresh={() => refreshMemberProfile(m)}
                      refreshing={refreshingMemberId === m.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

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
// Activity assessment helpers
// =============================================================================

type ActivityLevel = "active" | "low" | "inactive" | "unknown";

function getActivityLevel(profile: MemberProfileData | null): ActivityLevel {
  if (!profile) return "unknown";

  const { lastTweetAt, tweetCount, accountCreatedAt } = profile;

  // If we have last tweet date, use it as the primary signal
  if (lastTweetAt) {
    const daysSinceLastTweet = (Date.now() - new Date(lastTweetAt).getTime()) / (1000 * 60 * 60 * 24);

    // High-volume accounts (>= 5000 tweets) tweeting in last 90 days → Active
    if (tweetCount >= 5000 && daysSinceLastTweet <= 90) return "active";

    if (daysSinceLastTweet > 180) return "inactive";   // > 6 months
    if (daysSinceLastTweet > 90) return "low";          // 3-6 months

    // Tweeted in last 90 days — check yearly rate
    if (accountCreatedAt) {
      const accountAgeDays = (Date.now() - new Date(accountCreatedAt).getTime()) / (1000 * 60 * 60 * 24);
      const tweetsPerYear = accountAgeDays > 0 ? (tweetCount / accountAgeDays) * 365 : 0;
      if (tweetsPerYear < 5) return "low";
    }

    return "active";
  }

  // No lastTweetAt data — fallback to avg tweets/day heuristic
  if (accountCreatedAt) {
    const accountAgeDays = (Date.now() - new Date(accountCreatedAt).getTime()) / (1000 * 60 * 60 * 24);
    const tweetsPerYear = accountAgeDays > 0 ? (tweetCount / accountAgeDays) * 365 : 0;
    if (tweetsPerYear < 5) return "low";
  }

  return "unknown";
}

/** Numeric score for sorting: inactive=0, unknown=1, low=2, active=3. */
function getActivityScore(profile: MemberProfileData | null): number {
  const level = getActivityLevel(profile);
  switch (level) {
    case "inactive": return 0;
    case "unknown": return 1;
    case "low": return 2;
    case "active": return 3;
  }
}

const ACTIVITY_CONFIG: Record<ActivityLevel, { label: string; className: string }> = {
  active:   { label: "Active",   className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  low:      { label: "Low",      className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  inactive: { label: "Inactive", className: "bg-red-500/10 text-red-600 border-red-500/20" },
  unknown:  { label: "—",        className: "bg-muted text-muted-foreground border-border" },
};

function formatAccountAge(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years > 0) return months > 0 ? `${years}y ${months}m` : `${years}y`;
  if (months > 0) return `${months}m`;
  return `${days}d`;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

function formatAvgPerDay(tweetCount: number, createdAt: string): string {
  const days = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 0) return "—";
  const avg = tweetCount / days;
  if (avg >= 10) return avg.toFixed(0);
  if (avg >= 1) return avg.toFixed(1);
  if (avg >= 0.1) return avg.toFixed(2);
  return "<0.1";
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
  editMode,
  selected,
  onToggleSelect,
  onDelete,
  onRefresh,
  refreshing,
}: {
  member: GroupMember;
  editMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onDelete: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const p = member.profile;
  const displayName = p?.displayName ?? null;
  const avatarUrl =
    p?.profileImageUrl ??
    `https://unavatar.io/x/${member.twitterUsername}`;

  const activity = getActivityLevel(p);
  const activityCfg = ACTIVITY_CONFIG[activity];

  return (
    <tr
      className={cn(
        "border-b last:border-b-0 hover:bg-muted/30 transition-colors group",
        editMode && selected && "bg-primary/5",
      )}
      onClick={editMode ? onToggleSelect : undefined}
    >
      {/* Checkbox (edit mode only) */}
      {editMode && (
        <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelect}
            className="h-4 w-4 rounded border-input accent-primary"
          />
        </td>
      )}
      {/* User */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <a
            href={`https://x.com/${member.twitterUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
          >
            <img
              src={avatarUrl}
              alt={member.twitterUsername}
              className="h-9 w-9 rounded-full bg-muted hover:opacity-80 transition-opacity"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
              }}
            />
          </a>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {displayName && (
                <a
                  href={`https://x.com/${member.twitterUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium truncate hover:underline"
                >
                  {displayName}
                </a>
              )}
              {p?.isVerified && (
                <Badge variant="default" className="h-3.5 px-1 text-[9px] shrink-0">
                  V
                </Badge>
              )}
            </div>
            <a
              href={`https://x.com/${member.twitterUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground hover:underline"
            >
              @{member.twitterUsername}
            </a>
            {p?.description && (
              <p className="text-muted-foreground/70 line-clamp-1 mt-0.5 max-w-[300px]">
                {p.description}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Followers */}
      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
        {p ? formatCount(p.followersCount) : "—"}
      </td>

      {/* Following */}
      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
        {p ? formatCount(p.followingCount) : "—"}
      </td>

      {/* Tweets + avg/day */}
      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
        {p ? (
          <div>
            <span>{formatCount(p.tweetCount)}</span>
            {p.accountCreatedAt && (
              <span className="text-muted-foreground/60 ml-1 text-xs">
                ({formatAvgPerDay(p.tweetCount, p.accountCreatedAt)}/d)
              </span>
            )}
          </div>
        ) : "—"}
      </td>

      {/* Likes */}
      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
        {p ? formatCount(p.likeCount) : "—"}
      </td>

      {/* Last Tweet */}
      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
        {p?.lastTweetAt ? (
          <span title={new Date(p.lastTweetAt).toLocaleDateString()}>
            {formatRelativeTime(p.lastTweetAt)}
          </span>
        ) : "—"}
      </td>

      {/* Activity */}
      <td className="px-4 py-3 text-center">
        <Badge
          variant="outline"
          className={cn("text-[10px] font-medium", activityCfg.className)}
        >
          {activityCfg.label}
        </Badge>
      </td>

      {/* Added */}
      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
        {new Date(member.addedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </td>

      {/* Actions (hidden in edit mode) */}
      {!editMode && (
        <td className="px-4 py-3 text-right">
          <div className="inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onRefresh}
                disabled={refreshing}
                title="Refresh profile"
              >
                <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              </Button>
            )}
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
        </td>
      )}
    </tr>
  );
}
