"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  translatedAt: string | null;
  tweetCreatedAt: string;
  fetchedAt: string;
  tweet: Tweet;
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
  const [fetchStatus, setFetchStatus] = useState<string | null>(null);
  const fetchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Translate state
  const [translating, setTranslating] = useState(false);
  const [translateStatus, setTranslateStatus] = useState<string | null>(null);

  // Fetched posts
  const [posts, setPosts] = useState<FetchedPostData[]>([]);
  const [untranslatedCount, setUntranslatedCount] = useState(0);
  const [postsLoading, setPostsLoading] = useState(false);

  // Tab state: "members" or "posts"
  const [activeTab, setActiveTab] = useState<"members" | "posts">("members");

  // Global language toggle for posts: "zh" shows translation, "en" shows original
  const [postsLang, setPostsLang] = useState<"zh" | "en">("zh");

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
      const res = await fetch("/api/watchlist/posts?limit=200");
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setPosts(json.data ?? []);
        setUntranslatedCount(json.meta?.untranslatedCount ?? 0);
      }
    } catch {
      // silent
    } finally {
      setPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load posts when switching to posts tab
  useEffect(() => {
    if (activeTab === "posts") {
      loadPosts();
    }
  }, [activeTab, loadPosts]);

  // ── Auto-fetch polling ──

  const doFetch = useCallback(async () => {
    if (fetching) return;
    setFetching(true);
    setFetchStatus(null);
    try {
      const res = await fetch("/api/watchlist/fetch", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        const d = json.data;
        const parts = [
          `Fetched ${d.newPosts} new post${d.newPosts !== 1 ? "s" : ""} from ${d.fetched} user${d.fetched !== 1 ? "s" : ""}`,
        ];
        if (d.skippedOld > 0) parts.push(`${d.skippedOld} skipped (too old)`);
        if (d.purged > 0) parts.push(`${d.purged} purged`);
        if (d.errors?.length) parts.push(`${d.errors.length} errors`);
        setFetchStatus(parts.join(" · "));
        // Auto-trigger translate after fetch if there are new posts
        if (d.newPosts > 0) {
          doTranslate();
        }
        // Refresh posts if on posts tab
        if (activeTab === "posts") {
          loadPosts();
        }
      } else {
        setFetchStatus(json?.error ?? "Fetch failed");
      }
    } catch {
      setFetchStatus("Network error during fetch");
    } finally {
      setFetching(false);
    }
  }, [fetching, activeTab, loadPosts]);

  const doTranslate = useCallback(async () => {
    if (translating) return;
    setTranslating(true);
    setTranslateStatus(null);
    try {
      const res = await fetch("/api/watchlist/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20 }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        const d = json.data;
        setTranslateStatus(
          `Translated ${d.translated} post${d.translated !== 1 ? "s" : ""}` +
            (d.remaining > 0 ? ` (${d.remaining} remaining)` : "") +
            (d.errors?.length ? ` — ${d.errors.length} errors` : "")
        );
        setUntranslatedCount(d.remaining);
        if (activeTab === "posts") {
          loadPosts();
        }
      } else {
        setTranslateStatus(json?.error ?? "Translation failed");
      }
    } catch {
      setTranslateStatus("Network error during translation");
    } finally {
      setTranslating(false);
    }
  }, [translating, activeTab, loadPosts]);

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
      // silent — local state already updated
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
      // silent — local state already updated
    }
  };

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

        {/* Auto-fetch controls */}
        <div className="rounded-card bg-card border p-4 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Interval selector */}
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Interval:</span>
                <select
                  value={fetchInterval}
                  onChange={(e) => handleIntervalChange(Number(e.target.value))}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                >
                  {INTERVAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Retention selector */}
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Retention:</span>
                <select
                  value={retentionDays}
                  onChange={(e) => handleRetentionChange(Number(e.target.value))}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                >
                  {RETENTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={doFetch}
                disabled={fetching || members.length === 0}
              >
                {fetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {fetching ? "Fetching..." : "Fetch Now"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={doTranslate}
                disabled={translating || untranslatedCount === 0}
              >
                {translating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Languages className="h-4 w-4" />
                )}
                {translating ? "Translating..." : `Translate${untranslatedCount > 0 ? ` (${untranslatedCount})` : ""}`}
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/watchlist/logs">
                  <ScrollText className="h-4 w-4" />
                  Logs
                </Link>
              </Button>
            </div>
          </div>
          {fetchStatus && (
            <p className="text-xs text-muted-foreground">{fetchStatus}</p>
          )}
          {translateStatus && (
            <p className="text-xs text-muted-foreground">{translateStatus}</p>
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
            {/* Language toggle */}
            {posts.length > 0 && (
              <div className="flex justify-end mb-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPostsLang((l) => (l === "zh" ? "en" : "zh"))}
                  title={postsLang === "zh" ? "Show original English" : "Show Chinese translation"}
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  {postsLang === "zh" ? "中文" : "EN"}
                </Button>
              </div>
            )}

            {postsLoading && <LoadingSpinner />}

            {!postsLoading && posts.length === 0 && (
              <EmptyState
                icon={RefreshCw}
                title="No fetched posts yet."
                subtitle="Click 'Fetch Now' to fetch tweets from your watchlist."
              />
            )}

            {!postsLoading && posts.length > 0 && (
              <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-3 [column-fill:balance]">
                {posts.map((post) => (
                  <div key={post.id} className="mb-3 break-inside-avoid">
                    <WatchlistPostCard post={post} lang={postsLang} />
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
// WatchlistPostCard — TweetCard + translation overlay
// =============================================================================

function WatchlistPostCard({ post, lang }: { post: FetchedPostData; lang: "zh" | "en" }) {
  // When lang=zh and translation is available, swap the tweet text inline
  const displayTweet =
    lang === "zh" && post.translatedText
      ? { ...post.tweet, text: post.translatedText }
      : post.tweet;

  const showComment = lang === "zh" && post.commentText;

  return (
    <div className="space-y-0">
      <TweetCard tweet={displayTweet} linkToDetail={false} />
      {showComment && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-t-0 border-amber-200 dark:border-amber-800 rounded-b-lg px-3 py-2 -mt-1">
          <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
            <span className="font-semibold mr-1">锐评</span>
            {post.commentText}
          </p>
        </div>
      )}
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
