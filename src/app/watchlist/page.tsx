"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout";
import {
  LoadingSpinner,
  ErrorBanner,
  EmptyState,
} from "@/components/ui/feedback";
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
import {
  Eye,
  Plus,
  Pencil,
  Trash2,
  Tag,
  X,
  RefreshCw,
  Languages,
  Clock,
  Loader2,
  CalendarClock,
  ArrowLeftRight,
  ScrollText,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { TweetCard } from "@/components/twitter/tweet-card";
import type { Tweet } from "../../../shared/types";

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

interface FetchedPostData {
  id: number;
  tweetId: string;
  twitterUsername: string;
  text: string;
  translatedText: string | null;
  commentText: string | null;
  quotedTranslatedText: string | null;
  translatedAt: string | null;
  tweetCreatedAt: string;
  fetchedAt: string;
  tweet: Tweet;
}

// =============================================================================
// Fetch progress detail types
// =============================================================================

interface MemberProgress {
  username: string;
  status: "pending" | "fetching" | "done" | "error";
  tweetsReceived?: number;
  filtered?: number;
  newPosts?: number;
  error?: string;
}

interface TranslateProgress {
  current: number;
  total: number;
  lastPostId?: number;
  errors: number;
}

// =============================================================================
// useColumns — responsive column count via matchMedia
// =============================================================================

const BREAKPOINTS = [
  { query: "(min-width: 1280px)", cols: 4 }, // xl
  { query: "(min-width: 1024px)", cols: 3 }, // lg
  { query: "(min-width: 640px)", cols: 2 },  // sm
];

function useColumns(): number {
  const [cols, setCols] = useState(1);

  useEffect(() => {
    function calc() {
      for (const bp of BREAKPOINTS) {
        if (window.matchMedia(bp.query).matches) {
          setCols(bp.cols);
          return;
        }
      }
      setCols(1);
    }
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  return cols;
}

// =============================================================================
// Constants
// =============================================================================

const INTERVAL_OPTIONS = [
  { value: 0, label: "Disabled" },
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 360, label: "6 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "24 hours" },
];

const RETENTION_OPTIONS = [
  { value: 1, label: "1 day" },
  { value: 3, label: "3 days" },
  { value: 7, label: "7 days" },
];

// =============================================================================
// SSE parser helper
// =============================================================================

function parseSSEBuffer(
  buffer: string,
  onEvent: (eventType: string, data: string) => void,
): string {
  let remaining = buffer;
  let boundary: number;
  while ((boundary = remaining.indexOf("\n\n")) !== -1) {
    const raw = remaining.slice(0, boundary);
    remaining = remaining.slice(boundary + 2);
    let eventType = "";
    let eventData = "";
    for (const line of raw.split("\n")) {
      if (line.startsWith("event: ")) eventType = line.slice(7);
      else if (line.startsWith("data: ")) eventData = line.slice(6);
    }
    if (eventType && eventData) {
      onEvent(eventType, eventData);
    }
  }
  return remaining;
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

  // Auto-fetch state
  const [fetchInterval, setFetchInterval] = useState(0);
  const [retentionDays, setRetentionDays] = useState(1);
  const [fetching, setFetching] = useState(false);
  const fetchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch + translate progress panel
  const [progressExpanded, setProgressExpanded] = useState(false);
  const [memberProgress, setMemberProgress] = useState<MemberProgress[]>([]);
  const [cleanupInfo, setCleanupInfo] = useState<{ purgedExpired: number; purgedOrphans: number } | null>(null);
  const [fetchSummary, setFetchSummary] = useState<string | null>(null);
  const [translateProgress, setTranslateProgress] = useState<TranslateProgress | null>(null);
  const [translateSummary, setTranslateSummary] = useState<string | null>(null);
  const [pipelinePhase, setPipelinePhase] = useState<"idle" | "fetching" | "translating" | "done">("idle");

  // Fetched posts
  const [posts, setPosts] = useState<FetchedPostData[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  // Tab state: "members" or "posts"
  const [activeTab, setActiveTab] = useState<"members" | "posts">("members");

  // Row-first masonry: distribute posts round-robin into columns
  const columnCount = useColumns();
  const postColumns = useMemo(() => {
    const cols: FetchedPostData[][] = Array.from({ length: columnCount }, () => []);
    posts.forEach((post, i) => cols[i % columnCount]!.push(post));
    return cols;
  }, [posts, columnCount]);

  // ── Data loading ──

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersRes, tagsRes, settingsRes] = await Promise.all([
        fetch("/api/watchlist"),
        fetch("/api/tags"),
        fetch("/api/watchlist/settings"),
      ]);
      const membersJson = await membersRes.json().catch(() => null);
      const tagsJson = await tagsRes.json().catch(() => null);
      const settingsJson = await settingsRes.json().catch(() => null);

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
      if (settingsJson?.success) {
        setFetchInterval(settingsJson.data.fetchIntervalMinutes ?? 0);
        setRetentionDays(settingsJson.data.retentionDays ?? 1);
      }
    } catch {
      setError("Network error — could not reach API");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const res = await fetch("/api/watchlist/posts?limit=500");
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setPosts(json.data ?? []);
      }
    } catch {
      // silent
    } finally {
      setPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadPosts();
  }, [loadData, loadPosts]);

  // Refresh posts when switching to posts tab
  useEffect(() => {
    if (activeTab === "posts") {
      loadPosts();
    }
  }, [activeTab, loadPosts]);

  // ── Auto-translate via SSE stream ──

  const doStreamTranslate = useCallback(async () => {
    setPipelinePhase("translating");
    setTranslateProgress({ current: 0, total: 0, errors: 0 });
    setTranslateSummary(null);

    try {
      const res = await fetch("/api/watchlist/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50, stream: true }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        // No untranslated posts or error
        const json = await res.json().catch(() => null);
        if (json?.success) {
          setTranslateSummary(
            json.data.translated === 0 ? "No posts to translate" : `Translated ${json.data.translated}`
          );
        }
        setPipelinePhase("done");
        return;
      }

      if (!res.body) {
        setPipelinePhase("done");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });

        buffer = parseSSEBuffer(buffer, (eventType, eventData) => {
          try {
            const d = JSON.parse(eventData);
            if (eventType === "translated") {
              setTranslateProgress((prev) => ({
                current: d.current,
                total: d.total,
                lastPostId: d.postId,
                errors: prev?.errors ?? 0,
              }));
              // Update the post in-place with translation
              setPosts((prev) =>
                prev.map((p) =>
                  p.id === d.postId
                    ? {
                        ...p,
                        translatedText: d.translatedText,
                        commentText: d.commentText,
                        quotedTranslatedText: d.quotedTranslatedText,
                        translatedAt: new Date().toISOString(),
                      }
                    : p
                )
              );
            } else if (eventType === "error") {
              setTranslateProgress((prev) => ({
                current: d.current,
                total: d.total,
                errors: (prev?.errors ?? 0) + 1,
              }));
            } else if (eventType === "done") {
              setTranslateSummary(
                `Translated ${d.translated} post${d.translated !== 1 ? "s" : ""}` +
                  (d.remaining > 0 ? ` · ${d.remaining} remaining` : "") +
                  (d.errors?.length ? ` · ${d.errors.length} errors` : "")
              );
            }
          } catch {
            // skip malformed
          }
        });

        if (streamDone) break;
      }
    } catch {
      setTranslateSummary("Network error during translation");
    } finally {
      setPipelinePhase("done");
    }
  }, []);

  // ── Fetch via SSE with real-time post injection + auto-translate ──

  const doFetch = useCallback(async () => {
    if (fetching) return;
    setFetching(true);
    setPipelinePhase("fetching");
    setProgressExpanded(true);
    setCleanupInfo(null);
    setFetchSummary(null);
    setTranslateProgress(null);
    setTranslateSummary(null);

    // Initialize member progress from current members
    setMemberProgress(
      members.map((m) => ({ username: m.twitterUsername, status: "pending" as const }))
    );

    try {
      const res = await fetch("/api/watchlist/fetch", { method: "POST" });

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success) {
          setFetchSummary(
            `Fetched ${json.data.newPosts} new post${json.data.newPosts !== 1 ? "s" : ""} from ${json.data.fetched} user${json.data.fetched !== 1 ? "s" : ""}`,
          );
        } else {
          setFetchSummary(json?.error ?? "Fetch failed");
        }
        setPipelinePhase("done");
        setFetching(false);
        return;
      }

      if (!res.body) {
        setFetchSummary("Fetch failed — no response body");
        setPipelinePhase("done");
        setFetching(false);
        return;
      }

      // Switch to posts tab so user sees cards appearing
      setActiveTab("posts");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let totalNewPosts = 0;

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });

        buffer = parseSSEBuffer(buffer, (eventType, eventData) => {
          try {
            const d = JSON.parse(eventData);

            if (eventType === "cleanup") {
              setCleanupInfo({ purgedExpired: d.purgedExpired, purgedOrphans: d.purgedOrphans });
              // Remove purged posts from local state
              if (d.purgedExpired > 0 || d.purgedOrphans > 0) {
                // Reload posts to reflect cleanup
                loadPosts();
              }
            } else if (eventType === "progress") {
              // Update the specific member's progress
              setMemberProgress((prev) => {
                const updated = [...prev];
                const idx = d.current - 1;
                if (idx >= 0 && idx < updated.length) {
                  updated[idx] = {
                    username: d.username,
                    status: d.error ? "error" : "done",
                    tweetsReceived: d.tweetsReceived,
                    filtered: d.filtered,
                    newPosts: d.newPosts,
                    error: d.error,
                  };
                }
                // Mark next member as "fetching"
                if (d.current < updated.length) {
                  updated[d.current] = { ...updated[d.current]!, status: "fetching" };
                }
                return updated;
              });
            } else if (eventType === "posts") {
              // Real-time: insert new posts at the beginning
              const newPosts: FetchedPostData[] = d.posts;
              setPosts((prev) => {
                const existingIds = new Set(prev.map((p) => p.id));
                const uniqueNew = newPosts.filter((p) => !existingIds.has(p.id));
                return [...uniqueNew, ...prev];
              });
            } else if (eventType === "done") {
              totalNewPosts = d.newPosts;
              const parts = [
                `${d.newPosts} new post${d.newPosts !== 1 ? "s" : ""} from ${d.fetched} user${d.fetched !== 1 ? "s" : ""}`,
              ];
              if (d.skippedOld > 0) parts.push(`${d.skippedOld} skipped`);
              if (d.purged > 0) parts.push(`${d.purged} purged`);
              if (d.errors?.length) parts.push(`${d.errors.length} errors`);
              setFetchSummary(parts.join(" · "));
            }
          } catch {
            // skip malformed
          }
        });

        if (streamDone) break;
      }

      setFetching(false);

      // Auto-trigger translate if new posts were fetched
      if (totalNewPosts > 0) {
        await doStreamTranslate();
      } else {
        setPipelinePhase("done");
      }
    } catch {
      setFetchSummary("Network error during fetch");
      setPipelinePhase("done");
      setFetching(false);
    }
  }, [fetching, members, loadPosts, doStreamTranslate]);

  // Set up polling timer
  useEffect(() => {
    if (fetchTimerRef.current) {
      clearInterval(fetchTimerRef.current);
      fetchTimerRef.current = null;
    }
    if (fetchInterval > 0) {
      fetchTimerRef.current = setInterval(doFetch, fetchInterval * 60 * 1000);
    }
    return () => {
      if (fetchTimerRef.current) {
        clearInterval(fetchTimerRef.current);
      }
    };
  }, [fetchInterval, doFetch]);

  // ── Settings change handlers ──

  const handleIntervalChange = async (minutes: number) => {
    setFetchInterval(minutes);
    try {
      await fetch("/api/watchlist/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fetchIntervalMinutes: minutes }),
      });
    } catch {
      // silent
    }
  };

  const handleRetentionChange = async (days: number) => {
    setRetentionDays(days);
    try {
      await fetch("/api/watchlist/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays: days }),
      });
    } catch {
      // silent
    }
  };

  const filtered = filterTagId
    ? members.filter((m) => m.tags.some((t) => t.id === filterTagId))
    : members;

  // Phase label for the progress panel header
  const phaseLabel = pipelinePhase === "fetching"
    ? "Fetching..."
    : pipelinePhase === "translating"
      ? "Translating..."
      : pipelinePhase === "done"
        ? "Done"
        : null;

  return (
    <AppShell breadcrumbs={[{ label: "Watchlist" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Watchlist</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track Twitter/X users you&apos;re interested in.
              {members.length > 0 && ` ${members.length} users tracked.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setAddOpen(true)} size="sm">
              <Plus className="h-4 w-4" />
              Add User
            </Button>
          </div>
        </div>

        {/* Controls bar */}
        <div className="rounded-card bg-card border p-4 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Interval selector */}
              <div className="relative flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Interval:</span>
                <div className="relative">
                  <select
                    value={fetchInterval}
                    onChange={(e) => handleIntervalChange(Number(e.target.value))}
                    className="h-8 rounded-md border bg-background pl-2 pr-7 text-sm appearance-none cursor-pointer"
                  >
                    {INTERVAL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>

              {/* Retention selector */}
              <div className="relative flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Retention:</span>
                <div className="relative">
                  <select
                    value={retentionDays}
                    onChange={(e) => handleRetentionChange(Number(e.target.value))}
                    className="h-8 rounded-md border bg-background pl-2 pr-7 text-sm appearance-none cursor-pointer"
                  >
                    {RETENTION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={doFetch}
                disabled={fetching || pipelinePhase === "translating" || members.length === 0}
              >
                {fetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {fetching ? "Fetching..." : "Fetch Now"}
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/watchlist/logs">
                  <ScrollText className="h-4 w-4" />
                  Logs
                </Link>
              </Button>
            </div>
          </div>

          {/* ── Expandable Progress Panel ── */}
          {pipelinePhase !== "idle" && (
            <div className="border rounded-lg overflow-hidden bg-background">
              {/* Header — always visible, clickable to expand/collapse */}
              <button
                onClick={() => setProgressExpanded((p) => !p)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50 transition-colors"
              >
                {pipelinePhase === "done" ? (
                  <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${progressExpanded ? "rotate-90" : ""}`} />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
                <span className="font-medium">{phaseLabel}</span>
                {fetchSummary && pipelinePhase !== "fetching" && (
                  <span className="text-muted-foreground ml-1">— {fetchSummary}</span>
                )}
                {pipelinePhase === "translating" && translateProgress && (
                  <span className="text-muted-foreground ml-1">
                    — {translateProgress.current}/{translateProgress.total}
                  </span>
                )}
                {translateSummary && pipelinePhase === "done" && (
                  <span className="text-muted-foreground ml-1">· {translateSummary}</span>
                )}
              </button>

              {/* Detail — expanded */}
              {progressExpanded && (
                <div className="border-t px-3 py-2 space-y-2 text-xs">
                  {/* Cleanup info */}
                  {cleanupInfo && (cleanupInfo.purgedExpired > 0 || cleanupInfo.purgedOrphans > 0) && (
                    <div className="text-muted-foreground">
                      Cleanup: {cleanupInfo.purgedExpired > 0 && `${cleanupInfo.purgedExpired} expired`}
                      {cleanupInfo.purgedExpired > 0 && cleanupInfo.purgedOrphans > 0 && ", "}
                      {cleanupInfo.purgedOrphans > 0 && `${cleanupInfo.purgedOrphans} orphaned`}
                    </div>
                  )}

                  {/* Per-member progress */}
                  {memberProgress.length > 0 && (
                    <div className="space-y-1">
                      {memberProgress.map((mp, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="w-4 text-right text-muted-foreground">{idx + 1}.</span>
                          {mp.status === "pending" && (
                            <span className="text-muted-foreground/50">@{mp.username}</span>
                          )}
                          {mp.status === "fetching" && (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                              <span className="text-blue-600 dark:text-blue-400">@{mp.username}</span>
                              <span className="text-muted-foreground">requesting...</span>
                            </>
                          )}
                          {mp.status === "done" && (
                            <>
                              <span className="text-green-600 dark:text-green-400">@{mp.username}</span>
                              <span className="text-muted-foreground">
                                {mp.tweetsReceived} received
                                {(mp.filtered ?? 0) > 0 && `, ${mp.filtered} filtered`}
                                , {mp.newPosts} new
                              </span>
                            </>
                          )}
                          {mp.status === "error" && (
                            <>
                              <span className="text-red-600 dark:text-red-400">@{mp.username}</span>
                              <span className="text-red-500 truncate">{mp.error}</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Translate progress */}
                  {(pipelinePhase === "translating" || (pipelinePhase === "done" && translateSummary)) && (
                    <div className="pt-1 border-t">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Languages className="h-3 w-3" />
                        <span className="font-medium">Translation</span>
                        {pipelinePhase === "translating" && translateProgress && (
                          <>
                            <span>{translateProgress.current}/{translateProgress.total}</span>
                            {translateProgress.errors > 0 && (
                              <span className="text-red-500">{translateProgress.errors} errors</span>
                            )}
                          </>
                        )}
                        {pipelinePhase === "done" && translateSummary && (
                          <span>{translateSummary}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab("members")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "members"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Members
          </button>
          <button
            onClick={() => setActiveTab("posts")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "posts"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Posts
            {posts.length > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({posts.length})
              </span>
            )}
          </button>
        </div>

        {/* Members tab */}
        {activeTab === "members" && (
          <div>
            {/* Tag filter bar */}
            {allTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-4">
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

            {loading && <LoadingSpinner />}
            {error && <ErrorBanner error={error} />}

            {!loading && !error && filtered.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {filtered.map((member) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    onEdit={() => setEditMember(member)}
                    onDelete={() => setDeleteMember(member)}
                  />
                ))}
              </div>
            )}

            {!loading && !error && members.length === 0 && (
              <EmptyState
                icon={Eye}
                title="No users in your watchlist yet."
                subtitle="Add Twitter/X users to track them here."
              />
            )}

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
        )}

        {/* Posts tab */}
        {activeTab === "posts" && (
          <div>
            {postsLoading && posts.length === 0 && <LoadingSpinner />}

            {!postsLoading && posts.length === 0 && (
              <EmptyState
                icon={RefreshCw}
                title="No fetched posts yet."
                subtitle="Click 'Fetch Now' to fetch tweets from your watchlist."
              />
            )}

            {posts.length > 0 && (
              <div className="flex gap-3 items-start">
                {postColumns.map((col, colIdx) => (
                  <div key={colIdx} className="flex-1 min-w-0 flex flex-col gap-3">
                    {col.map((post) => (
                      <WatchlistPostCard key={post.id} post={post} />
                    ))}
                  </div>
                ))}
              </div>
            )}
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
// WatchlistPostCard — TweetCard + auto-translate flow
// =============================================================================

function WatchlistPostCard({ post }: { post: FetchedPostData }) {
  const [lang, setLang] = useState<"zh" | "en">(post.translatedText ? "zh" : "en");
  const [translatedText, setTranslatedText] = useState(post.translatedText);
  const [commentText, setCommentText] = useState(post.commentText);
  const [quotedTranslatedText, setQuotedTranslatedText] = useState(post.quotedTranslatedText);
  const [translating, setTranslating] = useState(false);

  // Sync from parent when translation arrives via SSE
  useEffect(() => {
    if (post.translatedText && !translatedText) {
      setTranslatedText(post.translatedText);
      setCommentText(post.commentText);
      setQuotedTranslatedText(post.quotedTranslatedText);
      setLang("zh");
    }
  }, [post.translatedText, post.commentText, post.quotedTranslatedText, translatedText]);

  const hasTranslation = !!translatedText;

  const displayTweet = (() => {
    if (lang !== "zh" || !hasTranslation) return post.tweet;
    const t = { ...post.tweet, text: translatedText! };
    if (t.quoted_tweet && quotedTranslatedText) {
      t.quoted_tweet = { ...t.quoted_tweet, text: quotedTranslatedText };
    }
    return t;
  })();

  const showComment = lang === "zh" && commentText;

  const handleTranslate = async () => {
    setTranslating(true);
    try {
      const res = await fetch("/api/watchlist/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && json.data.translatedText) {
        setTranslatedText(json.data.translatedText);
        setCommentText(json.data.commentText ?? null);
        setQuotedTranslatedText(json.data.quotedTranslatedText ?? null);
        setLang("zh");
      }
    } catch {
      // silent
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div className="shadow-[0_1px_4px_rgba(0,0,0,0.06)] rounded-card animate-in fade-in slide-in-from-top-2 duration-300">
      <TweetCard
        tweet={displayTweet}
        linkToDetail={false}
        className="border border-border rounded-b-none"
      />
      {showComment && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-t-0 border-amber-200 dark:border-amber-800 px-3 py-2">
          <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
            <span className="font-semibold mr-1">锐评</span>
            {commentText}
          </p>
        </div>
      )}
      {/* Per-card action bar */}
      <div className={`flex items-center gap-1 px-2 py-1.5 border border-t-0 rounded-b-[14px] bg-card`}>
        {hasTranslation ? (
          <button
            onClick={() => setLang((l) => (l === "zh" ? "en" : "zh"))}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={lang === "zh" ? "Show original" : "Show translation"}
          >
            <ArrowLeftRight className="h-3 w-3" />
            {lang === "zh" ? "中文" : "EN"}
          </button>
        ) : (
          <button
            onClick={handleTranslate}
            disabled={translating}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            title="Translate this post"
          >
            {translating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Languages className="h-3 w-3" />
            )}
            {translating ? "翻译中..." : "翻译"}
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// MemberCard — avatar-on-top card for grid layout
// =============================================================================

function MemberCard({
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
