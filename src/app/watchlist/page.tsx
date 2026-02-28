"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  ExternalLink,
  Tag,
  X,
  StickyNote,
  RefreshCw,
  Languages,
  Clock,
  Loader2,
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

interface FetchedPostData {
  id: number;
  tweetId: string;
  twitterUsername: string;
  text: string;
  translatedText: string | null;
  translatedAt: string | null;
  tweetCreatedAt: string;
  fetchedAt: string;
  tweet: {
    author?: { name?: string; profile_image_url?: string };
    metrics?: { like_count?: number; retweet_count?: number; view_count?: number };
    url?: string;
  };
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
        setFetchStatus(
          `Fetched ${d.newPosts} new post${d.newPosts !== 1 ? "s" : ""} from ${d.fetched} user${d.fetched !== 1 ? "s" : ""}` +
            (d.errors?.length ? ` (${d.errors.length} errors)` : "")
        );
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

  // ── Interval change handler ──

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
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Auto-fetch interval:</span>
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
            Fetched Posts
            {posts.length > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({posts.length})
              </span>
            )}
          </button>
        </div>

        {/* Members tab */}
        {activeTab === "members" && (
          <>
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

            {loading && <LoadingSpinner />}
            {error && <ErrorBanner error={error} />}

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
          </>
        )}

        {/* Posts tab */}
        {activeTab === "posts" && (
          <>
            {postsLoading && <LoadingSpinner />}

            {!postsLoading && posts.length === 0 && (
              <EmptyState
                icon={RefreshCw}
                title="No fetched posts yet."
                subtitle="Click 'Fetch Now' to fetch tweets from your watchlist."
              />
            )}

            {!postsLoading && posts.length > 0 && (
              <div className="space-y-3">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </>
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
// PostCard — displays a fetched tweet with optional translation
// =============================================================================

function PostCard({ post }: { post: FetchedPostData }) {
  const tweetDate = new Date(post.tweetCreatedAt);
  const timeAgo = formatTimeAgo(tweetDate);

  return (
    <div className="rounded-card bg-card border p-4 space-y-2">
      {/* Header: avatar + username + time */}
      <div className="flex items-center gap-3">
        <img
          src={`https://unavatar.io/x/${post.twitterUsername}`}
          alt={post.twitterUsername}
          className="h-8 w-8 rounded-full bg-muted"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
            target.parentElement!.innerHTML = `<div class="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">${post.twitterUsername[0]?.toUpperCase() ?? "?"}</div>`;
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {post.tweet.author?.name ?? `@${post.twitterUsername}`}
            </span>
            <span className="text-xs text-muted-foreground">
              @{post.twitterUsername}
            </span>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
          </div>
        </div>
        {post.tweet.url && (
          <a
            href={post.tweet.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Original text */}
      <p className="text-sm whitespace-pre-wrap">{post.text}</p>

      {/* Translation */}
      {post.translatedText && (
        <div className="bg-muted/50 rounded-md px-3 py-2 border-l-2 border-blue-400">
          <div className="flex items-center gap-1 mb-1">
            <Languages className="h-3 w-3 text-blue-500" />
            <span className="text-[11px] text-blue-500 font-medium">Translation</span>
          </div>
          <p className="text-sm whitespace-pre-wrap">{post.translatedText}</p>
        </div>
      )}

      {/* Metrics */}
      {post.tweet.metrics && (
        <div className="flex gap-4 text-xs text-muted-foreground">
          {post.tweet.metrics.view_count != null && (
            <span>{formatNumber(post.tweet.metrics.view_count)} views</span>
          )}
          {post.tweet.metrics.like_count != null && (
            <span>{formatNumber(post.tweet.metrics.like_count)} likes</span>
          )}
          {post.tweet.metrics.retweet_count != null && (
            <span>{formatNumber(post.tweet.metrics.retweet_count)} retweets</span>
          )}
        </div>
      )}
    </div>
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

// =============================================================================
// Utility functions
// =============================================================================

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
