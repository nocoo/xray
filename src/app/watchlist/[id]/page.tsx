"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout";
import {
  LoadingSpinner,
  ErrorBanner,
  EmptyState,
} from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import {
  Eye,
  Plus,
  RefreshCw,
  Loader2,
  Settings,
} from "lucide-react";
import {
  MemberCard,
  WatchlistPostCard,
  AddMemberDialog,
  EditMemberDialog,
  DeleteMemberDialog,
  SlidePanel,
  SettingsPanel,
  ActivityPanel,
  PipelineStatus,
} from "../_components";
import {
  type TagData,
  type WatchlistMember,
  type FetchedPostData,
  type MemberProgress,
  type TranslateProgress,
  type PipelinePhase,
  useColumns,
  parseSSEBuffer,
} from "../_lib";

// =============================================================================
// Watchlist Detail Page — /watchlist/[id]
// =============================================================================

export default function WatchlistDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const watchlistId = Number(params.id);

  // Stable refs to avoid re-creating useCallbacks on every render.
  // vinext's useRouter() may return a new object each render, and members
  // changes after every loadData — both would cascade through useCallback
  // deps → useEffect deps → infinite fetch loops → ERR_INSUFFICIENT_RESOURCES.
  const routerRef = useRef(router);
  routerRef.current = router;
  const membersRef = useRef<WatchlistMember[]>([]);

  // Watchlist metadata
  const [watchlistName, setWatchlistName] = useState<string>("");
  const [translateEnabled, setTranslateEnabled] = useState(true);
  const translateEnabledRef = useRef(true);

  const [members, setMembers] = useState<WatchlistMember[]>([]);
  const [allTags, setAllTags] = useState<TagData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const settingsErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Flash a brief settings error that auto-clears after 3 seconds */
  const flashSettingsError = (msg: string) => {
    setSettingsError(msg);
    if (settingsErrorTimerRef.current) clearTimeout(settingsErrorTimerRef.current);
    settingsErrorTimerRef.current = setTimeout(() => setSettingsError(null), 3000);
  };

  // Keep refs in sync
  useEffect(() => { membersRef.current = members; }, [members]);
  useEffect(() => { translateEnabledRef.current = translateEnabled; }, [translateEnabled]);

  // Dialog states
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<WatchlistMember | null>(null);
  const [deleteMember, setDeleteMember] = useState<WatchlistMember | null>(null);

  // Filter by tag
  const [filterTagId, setFilterTagId] = useState<number | null>(null);

  // Profile refresh state
  const [refreshingProfiles, setRefreshingProfiles] = useState(false);
  const [refreshingMemberId, setRefreshingMemberId] = useState<number | null>(null);

  // Auto-fetch state
  const [fetchInterval, setFetchInterval] = useState(0);
  const [retentionDays, setRetentionDays] = useState(1);
  const [fetching, setFetching] = useState(false);
  const fetchingRef = useRef(false);
  useEffect(() => { fetchingRef.current = fetching; }, [fetching]);
  const fetchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // AbortController — aborted on unmount to cancel all in-flight requests
  const abortRef = useRef<AbortController>(new AbortController());
  useEffect(() => {
    return () => { abortRef.current.abort(); };
  }, []);

  // Side panels
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  // Fetch + translate progress
  const [memberProgress, setMemberProgress] = useState<MemberProgress[]>([]);
  const [cleanupInfo, setCleanupInfo] = useState<{ purgedExpired: number; purgedOrphans: number } | null>(null);
  const [fetchSummary, setFetchSummary] = useState<string | null>(null);
  const [translateProgress, setTranslateProgress] = useState<TranslateProgress | null>(null);
  const [translateSummary, setTranslateSummary] = useState<string | null>(null);
  const [pipelinePhase, setPipelinePhase] = useState<PipelinePhase>("idle");
  const pipelinePhaseRef = useRef<PipelinePhase>("idle");
  useEffect(() => { pipelinePhaseRef.current = pipelinePhase; }, [pipelinePhase]);

  // Fetched posts
  const [posts, setPosts] = useState<FetchedPostData[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  // Tab state: "members" or "posts"
  const [activeTab, setActiveTab] = useState<"members" | "posts">("members");

  // Pagination: show posts incrementally to avoid DOM bloat
  const PAGE_SIZE = 100;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Shortest-column masonry: place each post into the shortest column
  // (estimated by text length + media/quote presence). This is more stable
  // than round-robin because prepending new posts only affects the top of
  // the shortest column(s) — existing posts keep their column assignment
  // as long as the estimation is consistent.
  const columnCount = useColumns();
  const visiblePosts = useMemo(() => posts.slice(0, visibleCount), [posts, visibleCount]);
  const hasMore = posts.length > visibleCount;
  const postColumns = useMemo(() => {
    const cols: FetchedPostData[][] = Array.from({ length: columnCount }, () => []);
    const heights = new Array<number>(columnCount).fill(0);

    for (const post of visiblePosts) {
      // Estimate card height using STATIC content only — dynamic fields
      // (translatedText, commentText) are excluded so that column
      // assignments remain stable when translations arrive via SSE.
      let h = 80; // base (author row + action bar + padding)
      h += Math.ceil((post.text?.length ?? 0) / 60) * 20; // ~20px per line (60 chars)
      if (post.tweet.media && post.tweet.media.length > 0) h += 200;
      if (post.tweet.quoted_tweet) h += 120;

      // Find shortest column
      let minIdx = 0;
      for (let c = 1; c < columnCount; c++) {
        if ((heights[c] ?? 0) < (heights[minIdx] ?? 0)) minIdx = c;
      }
      cols[minIdx]?.push(post);
      heights[minIdx] = (heights[minIdx] ?? 0) + h;
    }

    return cols;
  }, [visiblePosts, columnCount]);

  // Base URL for API calls scoped to this watchlist
  const api = `/api/watchlists/${watchlistId}`;

  // ── Data loading ──

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const signal = abortRef.current.signal;
    try {
      const [membersRes, tagsRes, settingsRes, watchlistRes] = await Promise.all([
        fetch(`${api}/members`, { signal }),
        fetch("/api/tags", { signal }),
        fetch(`${api}/settings`, { signal }),
        fetch("/api/watchlists", { signal }),
      ]);
      const membersJson = await membersRes.json().catch(() => null);
      const tagsJson = await tagsRes.json().catch(() => null);
      const settingsJson = await settingsRes.json().catch(() => null);
      const watchlistsJson = await watchlistRes.json().catch(() => null);

      if (!membersRes.ok || !membersJson?.success) {
        // Watchlist might not exist — redirect to listing
        if (membersRes.status === 404) {
          routerRef.current.replace("/watchlist");
          return;
        }
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

      // Extract watchlist name + translateEnabled for breadcrumbs and auto-translate gating
      if (watchlistsJson?.success && Array.isArray(watchlistsJson.data)) {
        const wl = watchlistsJson.data.find((w: { id: number }) => w.id === watchlistId);
        if (wl) {
          setWatchlistName(wl.name);
          const enabled = !!wl.translateEnabled;
          setTranslateEnabled(enabled);
          // Sync ref immediately — the useEffect sync runs next render cycle,
          // which can be too late if doFetch fires before the re-render.
          translateEnabledRef.current = enabled;
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Network error — could not reach API");
    } finally {
      setLoading(false);
    }
  }, [api, watchlistId]);

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const res = await fetch(`${api}/posts?limit=500`, { signal: abortRef.current.signal });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setPosts(json.data ?? []);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // silent
    } finally {
      setPostsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!watchlistId || isNaN(watchlistId)) {
      routerRef.current.replace("/watchlist");
      return;
    }
    loadData();
    loadPosts();
  }, [watchlistId]); // only re-run when watchlistId changes

  // Refresh posts when switching to posts tab — but NOT while the
  // fetch/translate pipeline is running, because it already injects posts
  // in real-time via setPosts().  A competing loadPosts() would
  // overwrite the SSE-injected posts with a stale DB snapshot.
  // pipelinePhase is read via ref (not a dep) so phase transitions
  // never trigger a reload — only explicit tab switches do.
  useEffect(() => {
    if (activeTab === "posts" && !fetchingRef.current && pipelinePhaseRef.current === "idle") {
      loadPosts();
    }
  }, [activeTab, loadPosts]);

  // ── Refresh profiles via POST /api/profiles/refresh ──

  const doRefreshProfiles = useCallback(async () => {
    const usernames = membersRef.current.map((m) => m.twitterUsername);
    if (usernames.length === 0) return;

    setRefreshingProfiles(true);
    try {
      const res = await fetch("/api/profiles/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames }),
        signal: abortRef.current.signal,
      });
      if (res.ok) {
        // Link profiles to members that don't have twitter_id yet
        await fetch(`${api}/members/link-profiles`, {
          method: "POST",
          signal: abortRef.current.signal,
        });
        // Reload members to pick up updated profile data
        await loadData();
      }
    } catch {
      // ignore abort / network errors
    } finally {
      setRefreshingProfiles(false);
    }
  }, [api, loadData]);

  // ── Refresh a single member's profile ──

  const refreshMemberProfile = useCallback(async (member: WatchlistMember) => {
    setRefreshingMemberId(member.id);
    try {
      const res = await fetch("/api/profiles/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [member.twitterUsername] }),
        signal: abortRef.current.signal,
      });
      if (res.ok) {
        if (!member.twitterId) {
          await fetch(`${api}/members/link-profiles`, {
            method: "POST",
            signal: abortRef.current.signal,
          });
        }
        // Reload only this member instead of the entire list
        const memberRes = await fetch(`${api}/members`, { signal: abortRef.current.signal });
        const memberJson = await memberRes.json().catch(() => null);
        if (memberRes.ok && memberJson?.success) {
          const updated = (memberJson.data as WatchlistMember[])?.find((m) => m.id === member.id);
          if (updated) {
            setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
          }
        }
      }
    } catch {
      // ignore abort / network errors
    } finally {
      setRefreshingMemberId(null);
    }
  }, [api]);

  // ── Auto-translate via SSE stream ──

  const doStreamTranslate = useCallback(async () => {
    setPipelinePhase("translating");
    setTranslateProgress({ current: 0, total: 0, errors: 0 });
    setTranslateSummary(null);

    try {
      const res = await fetch(`${api}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50, stream: true }),
        signal: abortRef.current.signal,
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
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
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setTranslateSummary("Network error during translation");
    } finally {
      setPipelinePhase("done");
    }
  }, [api]);

  // ── Fetch via SSE with real-time post injection + auto-translate ──

  const doFetch = useCallback(async () => {
    if (fetchingRef.current) return;
    setFetching(true);
    setPipelinePhase("fetching");
    setActivityOpen(true);
    setCleanupInfo(null);
    setFetchSummary(null);
    setTranslateProgress(null);
    setTranslateSummary(null);

    // Initialize member progress from current members (via ref to avoid dep)
    setMemberProgress(
      membersRef.current.map((m) => ({ username: m.twitterUsername, status: "pending" as const }))
    );

    try {
      const res = await fetch(`${api}/fetch`, { method: "POST", signal: abortRef.current.signal });

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success) {
          const newPosts = json.data.newPosts ?? 0;
          setFetchSummary(
            `Fetched ${newPosts} new post${newPosts !== 1 ? "s" : ""} from ${json.data.fetched} user${json.data.fetched !== 1 ? "s" : ""}`,
          );
          // Auto-translate even on JSON fallback — let server decide via findUntranslated()
          if (translateEnabledRef.current) {
            setFetching(false);
            await doStreamTranslate();
            return;
          }
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

      // Active member usernames — used to locally purge orphaned posts
      const activeMemberUsernames = new Set(
        membersRef.current.map((m) => m.twitterUsername.toLowerCase()),
      );

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });

        buffer = parseSSEBuffer(buffer, (eventType, eventData) => {
          try {
            const d = JSON.parse(eventData);

            if (eventType === "cleanup") {
              setCleanupInfo({ purgedExpired: d.purgedExpired, purgedOrphans: d.purgedOrphans });
              // Locally remove posts that the server just purged, so we
              // don't need a competing loadPosts() call later.
              if (d.purgedExpired > 0 || d.purgedOrphans > 0) {
                setPosts((prev) =>
                  prev.filter((p) =>
                    activeMemberUsernames.has(p.twitterUsername.toLowerCase()),
                  ),
                );
              }
            } else if (eventType === "progress") {
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
                if (d.current < updated.length) {
                  const current = updated[d.current];
                  if (current) {
                    updated[d.current] = { ...current, status: "fetching" };
                  }
                }
                return updated;
              });
            } else if (eventType === "posts") {
              const newPosts: FetchedPostData[] = d.posts;
              setPosts((prev) => {
                const existingIds = new Set(prev.map((p) => p.id));
                const uniqueNew = newPosts.filter((p) => !existingIds.has(p.id));
                if (uniqueNew.length === 0) return prev;
                const merged = [...uniqueNew, ...prev];
                merged.sort((a, b) =>
                  b.tweetCreatedAt.localeCompare(a.tweetCreatedAt)
                );
                return merged;
              });
            } else if (eventType === "done") {
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

      // Auto-trigger translate whenever translation is enabled — the server's
      // findUntranslated() decides whether there's actually work to do.
      // Previously gated on `totalNewPosts > 0`, which missed the case where
      // posts were already in DB (deduped by insertMany) but never translated.
      if (translateEnabledRef.current) {
        await doStreamTranslate();
      } else {
        setPipelinePhase("done");
      }

      // Final reconciliation: silently sync local state with the DB to
      // catch any SSE events that were missed or arrived out-of-order.
      // This runs AFTER the pipeline is fully done (phase = "done"),
      // so the tab-switch useEffect won't race with it.
      loadPosts();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setFetchSummary("Network error during fetch");
      setPipelinePhase("done");
      setFetching(false);
    }
  }, [api, loadPosts, doStreamTranslate]);

  // Set up polling timer + pause when tab is hidden (Page Visibility API)
  const fetchIntervalRef = useRef(fetchInterval);
  useEffect(() => { fetchIntervalRef.current = fetchInterval; }, [fetchInterval]);
  const doFetchRef = useRef(doFetch);
  useEffect(() => { doFetchRef.current = doFetch; }, [doFetch]);

  useEffect(() => {
    const startTimer = () => {
      if (fetchTimerRef.current) clearInterval(fetchTimerRef.current);
      fetchTimerRef.current = null;
      if (fetchIntervalRef.current > 0) {
        fetchTimerRef.current = setInterval(() => doFetchRef.current(), fetchIntervalRef.current * 60 * 1000);
      }
    };
    const stopTimer = () => {
      if (fetchTimerRef.current) {
        clearInterval(fetchTimerRef.current);
        fetchTimerRef.current = null;
      }
    };

    startTimer();

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopTimer();
      } else {
        startTimer();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchInterval]); // doFetch accessed via doFetchRef — no need in deps

  // ── Settings change handlers ──

  const handleIntervalChange = async (minutes: number) => {
    const prev = fetchInterval;
    setFetchInterval(minutes);
    try {
      const res = await fetch(`${api}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fetchIntervalMinutes: minutes }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setFetchInterval(prev);
      flashSettingsError("Failed to save interval setting");
    }
  };

  const handleRetentionChange = async (days: number) => {
    const prev = retentionDays;
    setRetentionDays(days);
    try {
      const res = await fetch(`${api}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays: days }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setRetentionDays(prev);
      flashSettingsError("Failed to save retention setting");
    }
  };

  const filtered = useMemo(
    () => filterTagId
      ? members.filter((m) => m.tags.some((t) => t.id === filterTagId))
      : members,
    [members, filterTagId],
  );

  return (
    <AppShell
      breadcrumbs={[
        { label: "Watchlists", href: "/watchlist" },
        { label: watchlistName || `#${watchlistId}` },
      ]}
    >
      <div className="space-y-4">
        {/* ── Toolbar: tabs + status + actions ── */}
        <div className="flex items-center gap-1">
          {/* Left: Tab buttons */}
          <div className="flex items-center">
            <button
              onClick={() => setActiveTab("members")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === "members"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
            >
              Members
              {members.length > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({members.length})
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("posts")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === "posts"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
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

          {/* Center: Pipeline status indicator */}
          <div className="flex-1 flex justify-center">
            <PipelineStatus
              phase={pipelinePhase}
              fetchSummary={fetchSummary}
              translateSummary={translateSummary}
              translateProgress={translateProgress}
              memberProgress={memberProgress}
              fetchInterval={fetchInterval}
              onClick={() => setActivityOpen(true)}
            />
          </div>

          {/* Right: Action buttons */}
          <div className="flex items-center gap-1.5">
            {activeTab === "members" && (
              <Button onClick={() => setAddOpen(true)} size="sm">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            )}
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
              Fetch
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSettingsOpen(true)}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
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
                    onRefresh={() => refreshMemberProfile(member)}
                    refreshing={refreshingMemberId === member.id}
                  />
                ))}
              </div>
            )}

            {!loading && !error && members.length === 0 && (
              <EmptyState
                icon={Eye}
                title="No users in this watchlist yet."
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
              <>
                <div className="flex gap-3 items-start">
                  {postColumns.map((col, colIdx) => (
                    <div key={colIdx} className="flex-1 min-w-0 flex flex-col gap-3">
                      {col.map((post) => (
                        <WatchlistPostCard
                          key={post.id}
                          post={post}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    >
                      Load More ({posts.length - visibleCount} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Add dialog */}
      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        allTags={allTags}
        onSuccess={(newMember) => setMembers((prev) => [...prev, newMember])}
        onTagCreated={(tag) => setAllTags((prev) => [...prev, tag])}
        watchlistId={watchlistId}
      />

      {/* Edit dialog */}
      {editMember && (
        <EditMemberDialog
          open={!!editMember}
          onOpenChange={(open) => !open && setEditMember(null)}
          member={editMember}
          allTags={allTags}
          onSuccess={(updated) => {
            setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
            setEditMember(null);
          }}
          onTagCreated={(tag) => setAllTags((prev) => [...prev, tag])}
          watchlistId={watchlistId}
        />
      )}

      {/* Delete confirmation */}
      {deleteMember && (
        <DeleteMemberDialog
          open={!!deleteMember}
          onOpenChange={(open) => !open && setDeleteMember(null)}
          member={deleteMember}
          onSuccess={(memberId) => {
            setMembers((prev) => prev.filter((m) => m.id !== memberId));
            setDeleteMember(null);
          }}
          watchlistId={watchlistId}
        />
      )}

      {/* Settings side panel */}
      <SlidePanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Settings"
      >
        <SettingsPanel
          fetchInterval={fetchInterval}
          retentionDays={retentionDays}
          onIntervalChange={handleIntervalChange}
          onRetentionChange={handleRetentionChange}
          onRefreshProfiles={doRefreshProfiles}
          refreshingProfiles={refreshingProfiles}
          memberCount={members.length}
          settingsError={settingsError}
        />
      </SlidePanel>

      {/* Activity side panel */}
      <SlidePanel
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        title="Activity"
        width="w-96"
      >
        <ActivityPanel
          watchlistId={watchlistId}
          pipelinePhase={pipelinePhase}
          memberProgress={memberProgress}
          cleanupInfo={cleanupInfo}
          fetchSummary={fetchSummary}
          translateProgress={translateProgress}
          translateSummary={translateSummary}
        />
      </SlidePanel>
    </AppShell>
  );
}
