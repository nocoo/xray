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
          // Link profiles if this member has no twitter_id yet
          if (!m.twitterId) {
            await fetch(`/api/groups/${groupId}/members/link-profiles`, {
              method: "POST",
            });
          }
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
          if (!member.twitterId) {
            await fetch(`/api/groups/${groupId}/members/link-profiles`, {
              method: "POST",
            });
          }
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
              size="sm"
              onClick={() => routerRef.current.push(`/groups/${groupId}/add`)}
            >
              <Plus className="h-4 w-4" />
              Add
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
                    <SortHeader field="displayName" label="User" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-left" />
                    <SortHeader field="followers" label="Followers" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortHeader field="following" label="Following" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortHeader field="tweets" label="Tweets" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <SortHeader field="addedAt" label="Added" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground w-10" />
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
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
  onRefresh,
  refreshing,
}: {
  member: GroupMember;
  onDelete: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
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
      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
        {new Date(member.addedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </td>

      {/* Actions */}
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
    </tr>
  );
}
