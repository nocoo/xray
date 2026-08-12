import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/** Format a large number compactly: 1200 → "1.2K", 1500000 → "1.5M". */
export function formatCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toLocaleString();
}

export type TimeAgoStyle = "compact" | "long" | "coarse";

/**
 * Relative time for tweet cards / lists (legacy v1 parity).
 * Diff is always `nowMs − postTime` — pass `nowMs` from a ticking hook so the
 * label tracks wall clock, not collection/ingest time and not a frozen render.
 */
export function formatTimeAgo(
	iso: string,
	style: TimeAgoStyle = "long",
	nowMs: number = Date.now(),
): string {
	const postMs = new Date(iso).getTime();
	const diff = Number.isFinite(postMs) ? nowMs - postMs : 0;
	const mins = Math.floor(Math.max(0, diff) / 60_000);
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
		return `${Math.floor(days / 365)}y ago`;
	}

	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 30) return `${days}d ago`;
	return new Date(iso).toLocaleDateString();
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

function hashString(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
}

/** Stable avatar background from a name/email. */
export function getAvatarColor(name: string): string {
	return AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}
