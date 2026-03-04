"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { AppShell } from "@/components/layout";
import {
  LoadingSpinner,
  ErrorBanner,
} from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  UserPlus,
  FileUp,
  Search,
  ArrowLeft,
  Check,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseTwitterExportFile } from "@/lib/twitter-export";

// =============================================================================
// Types
// =============================================================================

interface UserCandidate {
  /** Username or numeric account ID (for twitter export) */
  username: string;
  /** Display name from profile resolution */
  displayName?: string;
  /** Avatar URL from profile resolution */
  avatarUrl?: string;
  /** Followers count from profile resolution */
  followersCount?: number;
  /** Following count from profile resolution */
  followingCount?: number;
  /** Whether this user is already in the group */
  alreadyInGroup: boolean;
  /** Whether this candidate is selected for adding */
  selected: boolean;
}

type TabId = "account" | "manual" | "file";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "account", label: "From Account", icon: Users },
  { id: "manual", label: "Manual", icon: UserPlus },
  { id: "file", label: "Import File", icon: FileUp },
];

// =============================================================================
// Add Members Page
// =============================================================================

export default function AddMembersPage() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const params = useParams();
  const groupId = params.id as string;

  const [activeTab, setActiveTab] = useState<TabId>("account");

  // Shared candidate list across all tabs
  const [candidates, setCandidates] = useState<UserCandidate[]>([]);

  // Existing member usernames (for "already in group" detection)
  const [existingUsernames, setExistingUsernames] = useState<Set<string>>(new Set());
  const existingLoaded = useRef(false);

  // Group name for breadcrumb
  const [groupName, setGroupName] = useState<string>("...");

  // Submitting state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load existing members on mount
  const loadExisting = useCallback(async () => {
    if (existingLoaded.current) return;
    existingLoaded.current = true;

    try {
      const [membersRes, groupsRes] = await Promise.all([
        fetch(`/api/groups/${groupId}/members`),
        fetch("/api/groups"),
      ]);

      const membersJson = await membersRes.json().catch(() => null);
      if (membersRes.ok && membersJson?.success) {
        const usernames = new Set<string>(
          (membersJson.data ?? []).map((m: { twitterUsername: string }) =>
            m.twitterUsername.toLowerCase(),
          ),
        );
        setExistingUsernames(usernames);
      }

      const groupsJson = await groupsRes.json().catch(() => null);
      if (groupsRes.ok && groupsJson?.success) {
        const found = (groupsJson.data as { id: number; name: string }[]).find(
          (g) => g.id === parseInt(groupId, 10),
        );
        if (found) setGroupName(found.name);
      }
    } catch {
      // silent
    }
  }, [groupId]);

  // Trigger load on mount
  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  // ---------------------------------------------------------------------------
  // Add candidates (deduplicating)
  // ---------------------------------------------------------------------------
  const addCandidates = useCallback(
    (newItems: Omit<UserCandidate, "alreadyInGroup" | "selected">[]) => {
      setCandidates((prev) => {
        const existingSet = new Set(prev.map((c) => c.username.toLowerCase()));
        const toAdd: UserCandidate[] = [];

        for (const item of newItems) {
          const key = item.username.toLowerCase();
          if (!existingSet.has(key)) {
            existingSet.add(key);
            const inGroup = existingUsernames.has(key);
            toAdd.push({
              ...item,
              alreadyInGroup: inGroup,
              selected: !inGroup,
            });
          }
        }

        return [...prev, ...toAdd];
      });
    },
    [existingUsernames],
  );

  const clearCandidates = useCallback(() => {
    setCandidates([]);
  }, []);

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------
  const selectableCandidates = useMemo(
    () => candidates.filter((c) => !c.alreadyInGroup),
    [candidates],
  );

  const selectedCount = useMemo(
    () => candidates.filter((c) => c.selected && !c.alreadyInGroup).length,
    [candidates],
  );

  const toggleSelect = useCallback((username: string) => {
    setCandidates((prev) =>
      prev.map((c) =>
        c.username.toLowerCase() === username.toLowerCase() && !c.alreadyInGroup
          ? { ...c, selected: !c.selected }
          : c,
      ),
    );
  }, []);

  const toggleSelectAll = useCallback(() => {
    const allSelected = selectableCandidates.every((c) => c.selected);
    setCandidates((prev) =>
      prev.map((c) =>
        c.alreadyInGroup ? c : { ...c, selected: !allSelected },
      ),
    );
  }, [selectableCandidates]);

  // ---------------------------------------------------------------------------
  // Submit: batch add selected candidates to the group
  // ---------------------------------------------------------------------------
  const handleSubmit = useCallback(async () => {
    const toAdd = candidates
      .filter((c) => c.selected && !c.alreadyInGroup)
      .map((c) => c.username);

    if (toAdd.length === 0) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: toAdd }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setSubmitError(json?.error ?? "Failed to add members");
        return;
      }

      // Navigate back to group detail
      routerRef.current.push(`/groups/${groupId}`);
    } catch {
      setSubmitError("Network error");
    } finally {
      setSubmitting(false);
    }
  }, [candidates, groupId]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <AppShell
      breadcrumbs={[
        { label: "Groups", href: "/groups" },
        { label: groupName, href: `/groups/${groupId}` },
        { label: "Add Members" },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => routerRef.current.push(`/groups/${groupId}`)}
            title="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">Add Members</h1>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 rounded-lg bg-muted/50 w-fit">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="min-h-[200px]">
          {activeTab === "account" && (
            <FromAccountTab addCandidates={addCandidates} />
          )}
          {activeTab === "manual" && (
            <ManualTab addCandidates={addCandidates} />
          )}
          {activeTab === "file" && (
            <ImportFileTab addCandidates={addCandidates} />
          )}
        </div>

        {/* Preview list */}
        {candidates.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">
                {candidates.length} candidate{candidates.length !== 1 ? "s" : ""}
                {selectedCount > 0 && (
                  <span className="text-muted-foreground ml-1">
                    ({selectedCount} selected)
                  </span>
                )}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCandidates}
                className="text-muted-foreground"
              >
                Clear all
              </Button>
            </div>

            <CandidateList
              candidates={candidates}
              selectableCandidates={selectableCandidates}
              onToggle={toggleSelect}
              onToggleAll={toggleSelectAll}
            />
          </div>
        )}

        {/* Submit bar */}
        {submitError && <ErrorBanner error={submitError} />}

        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="outline"
            onClick={() => routerRef.current.push(`/groups/${groupId}`)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || selectedCount === 0}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Add {selectedCount} Member{selectedCount !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

// =============================================================================
// Tab 1: From Account — load followers/following of a Twitter user
// =============================================================================

function FromAccountTab({
  addCandidates,
}: {
  addCandidates: (items: Omit<UserCandidate, "alreadyInGroup" | "selected">[]) => void;
}) {
  const [username, setUsername] = useState("");
  const [listType, setListType] = useState<"followers" | "following">("following");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultCount, setResultCount] = useState<number | null>(null);

  const handleLoad = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const clean = username.trim().replace(/^@/, "");
      if (!clean) return;

      setLoading(true);
      setError(null);
      setResultCount(null);

      try {
        const res = await fetch(
          `/api/explore/users/${listType}?username=${encodeURIComponent(clean)}`,
        );
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
          setError(json?.error ?? `Failed to load ${listType}`);
          return;
        }

        const users = json.data as {
          id: string;
          username: string;
          name: string;
          profile_image_url?: string;
          followers_count?: number;
          following_count?: number;
        }[];

        const items = users.map((u) => ({
          username: u.username,
          displayName: u.name,
          avatarUrl: u.profile_image_url,
          followersCount: u.followers_count,
          followingCount: u.following_count,
        }));

        addCandidates(items);
        setResultCount(items.length);
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    },
    [username, listType, addCandidates],
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter a Twitter username to load their followers or following list.
      </p>

      <form onSubmit={handleLoad} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Username
          </label>
          <Input
            placeholder="e.g. elonmusk"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            List type
          </label>
          <div className="flex gap-1 p-1 rounded-md bg-muted/50">
            {(["following", "followers"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setListType(type)}
                className={cn(
                  "px-3 py-1.5 rounded text-sm font-medium transition-colors capitalize",
                  listType === type
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <Button type="submit" disabled={loading || !username.trim()}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Load
            </>
          )}
        </Button>
      </form>

      {error && <ErrorBanner error={error} />}
      {resultCount !== null && !error && (
        <p className="text-sm text-muted-foreground">
          Loaded {resultCount} user{resultCount !== 1 ? "s" : ""} — they have been added to the candidate list below.
        </p>
      )}
    </div>
  );
}

// =============================================================================
// Tab 2: Manual — add individual usernames
// =============================================================================

function ManualTab({
  addCandidates,
}: {
  addCandidates: (items: Omit<UserCandidate, "alreadyInGroup" | "selected">[]) => void;
}) {
  const [username, setUsername] = useState("");

  const handleAdd = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const clean = username.trim().replace(/^@/, "");
      if (!clean) return;

      addCandidates([{ username: clean }]);
      setUsername("");
    },
    [username, addCandidates],
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Type a username and press Enter to add it to the candidate list.
      </p>

      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          placeholder="e.g. karpathy"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="flex-1 max-w-sm"
          autoFocus
        />
        <Button type="submit" variant="outline" disabled={!username.trim()}>
          <UserPlus className="h-4 w-4" />
          Add to list
        </Button>
      </form>
    </div>
  );
}

// =============================================================================
// Tab 3: Import File — drag-drop or file picker
// =============================================================================

function ImportFileTab({
  addCandidates,
}: {
  addCandidates: (items: Omit<UserCandidate, "alreadyInGroup" | "selected">[]) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultInfo, setResultInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const processContent = useCallback(
    (content: string) => {
      setError(null);
      setResultInfo(null);

      // Try Twitter export format first
      const accountIds = parseTwitterExportFile(content);
      if (accountIds && accountIds.length > 0) {
        addCandidates(accountIds.map((id) => ({ username: id })));
        setResultInfo(`Parsed ${accountIds.length} accounts from Twitter export`);
        return;
      }

      // Fallback: one username per line
      const lines = content
        .split(/\n/)
        .map((l) => l.trim().replace(/^@/, ""))
        .filter(Boolean);

      const seen = new Set<string>();
      const unique: string[] = [];
      for (const line of lines) {
        const key = line.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(line);
        }
      }

      if (unique.length === 0) {
        setError("No valid usernames found in the file.");
        return;
      }

      addCandidates(unique.map((u) => ({ username: u })));
      setResultInfo(`Parsed ${unique.length} usernames from file`);
    },
    [addCandidates],
  );

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (!content) {
          setError("Could not read file.");
          return;
        }
        processContent(content);
      };
      reader.onerror = () => setError("Failed to read file.");
      reader.readAsText(file);
    },
    [processContent],
  );

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

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Drag and drop a Twitter/X data export file (
        <code className="text-xs bg-muted px-1 py-0.5 rounded">following.js</code>
        ), or any text file with one username per line.
      </p>

      {/* Drop zone */}
      <div
        className={cn(
          "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 transition-colors cursor-pointer",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-input hover:border-muted-foreground/50",
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <FileUp className="h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm font-medium">
          {isDragging ? "Drop file here" : "Click to browse or drag and drop"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Supports .js, .json, .txt, .csv
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".js,.json,.txt,.csv"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {error && <ErrorBanner error={error} />}
      {resultInfo && !error && (
        <p className="text-sm text-muted-foreground">{resultInfo}</p>
      )}
    </div>
  );
}

// =============================================================================
// CandidateList — shared preview list with multi-select
// =============================================================================

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function CandidateList({
  candidates,
  selectableCandidates,
  onToggle,
  onToggleAll,
}: {
  candidates: UserCandidate[];
  selectableCandidates: UserCandidate[];
  onToggle: (username: string) => void;
  onToggleAll: () => void;
}) {
  const allSelected =
    selectableCandidates.length > 0 &&
    selectableCandidates.every((c) => c.selected);

  return (
    <div className="rounded-card border overflow-hidden">
      {/* Select all header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/50">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          className="h-4 w-4 rounded border-input accent-primary"
          disabled={selectableCandidates.length === 0}
        />
        <span className="text-xs font-medium text-muted-foreground">
          Select all
        </span>
      </div>

      {/* Scrollable list */}
      <div className="max-h-[400px] overflow-y-auto divide-y">
        {candidates.map((c) => (
          <CandidateRow
            key={c.username}
            candidate={c}
            onToggle={() => onToggle(c.username)}
          />
        ))}
      </div>
    </div>
  );
}

function CandidateRow({
  candidate: c,
  onToggle,
}: {
  candidate: UserCandidate;
  onToggle: () => void;
}) {
  const avatarUrl =
    c.avatarUrl ?? `https://unavatar.io/x/${c.username}`;

  return (
    <label
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors",
        c.alreadyInGroup && "opacity-50 cursor-default",
      )}
    >
      <input
        type="checkbox"
        checked={c.selected}
        onChange={onToggle}
        disabled={c.alreadyInGroup}
        className="h-4 w-4 rounded border-input accent-primary shrink-0"
      />

      <img
        src={avatarUrl}
        alt={c.username}
        className="h-8 w-8 rounded-full bg-muted shrink-0"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {c.displayName && (
            <span className="text-sm font-medium truncate">
              {c.displayName}
            </span>
          )}
          <span className={cn("text-xs truncate", c.displayName ? "text-muted-foreground" : "text-sm font-medium")}>
            @{c.username}
          </span>
        </div>
      </div>

      {/* Stats */}
      {c.followersCount !== undefined && (
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {formatCount(c.followersCount)} followers
        </span>
      )}

      {/* Already in group badge */}
      {c.alreadyInGroup && (
        <Badge variant="outline" className="text-[10px] shrink-0">
          Already in group
        </Badge>
      )}
    </label>
  );
}
