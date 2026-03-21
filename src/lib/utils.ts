import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// =============================================================================
// Number / date formatting utilities
// =============================================================================

/** Format a large number compactly: 1200 → "1.2K", 1500000 → "1.5M". */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/**
 * Format an ISO date string as a relative time ago.
 *
 * Styles:
 * - `"compact"`:  now / 5m / 3h / 5d → "Jan 15" after 7 days (tweet cards)
 * - `"long"`:     just now / 5m ago / 3h ago / 5d ago → locale date after 30d (messages)
 * - `"coarse"`:   today / 1d ago / 5d ago / 2mo ago / 1y ago (group profiles)
 *
 * Default is `"long"`.
 */
export type TimeAgoStyle = "compact" | "long" | "coarse";

export function formatTimeAgo(
  iso: string,
  style: TimeAgoStyle = "long",
): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (style === "compact") {
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  if (style === "coarse") {
    if (days < 1) return "today";
    if (days === 1) return "1d ago";
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(days / 365);
    return `${years}y ago`;
  }

  // "long" (default)
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Estimate the rendered pixel height of a tweet card for masonry layout.
 */
export function estimateTweetHeight(tweet: {
  text?: string | null;
  media?: unknown[] | null;
  quoted_tweet?: unknown | null;
}): number {
  let h = 100; // base (author row + action bar + metrics + padding)
  h += Math.ceil((tweet.text?.length ?? 0) / 60) * 20; // ~20px per line
  if (tweet.media && tweet.media.length > 0) h += 200;
  if (tweet.quoted_tweet) h += 120;
  return h;
}

/**
 * Concurrency-limited parallel map — processes items with at most
 * `concurrency` in-flight promises at a time, preserving order.
 */
export async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i] as T);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/**
 * Format an ISO date string as a localized date: "Jan 15, 2026".
 * Returns the original string on parse failure.
 */
export function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/** Generate a stable hash from a string. */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-pink-500",
  "bg-fuchsia-500",
  "bg-purple-500",
  "bg-violet-500",
  "bg-indigo-500",
  "bg-blue-500",
  "bg-sky-500",
  "bg-cyan-500",
  "bg-teal-500",
  "bg-emerald-500",
  "bg-green-500",
  "bg-lime-600",
  "bg-amber-500",
  "bg-orange-500",
  "bg-red-500",
] as const;

/** Get a consistent avatar background color based on name. */
export function getAvatarColor(name: string): string {
  const hash = hashString(name);
  const index = hash % AVATAR_COLORS.length;
  return AVATAR_COLORS[index] ?? AVATAR_COLORS[0];
}
