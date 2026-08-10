import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
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
