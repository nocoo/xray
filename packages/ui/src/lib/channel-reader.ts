import type { DataMode } from "./data-mode";

export function ingestEndpoint(mode: DataMode) {
	return `${mode === "mock" ? "http://localhost:37007" : "https://xray-ingest.worker.hexly.ai"}/api/v1/ingest/articles`;
}
export function articlePath(channelId: number, articleId: number | null, date: string) {
	return `/channels/${channelId}${articleId ? `/articles/${articleId}` : ""}${date ? `?date=${encodeURIComponent(date)}` : ""}`;
}
export function safeMarkdownUrl(value: string, image: boolean) {
	try {
		const url = new URL(value);
		return (image
			? url.protocol === "https:"
			: ["https:", "http:", "mailto:"].includes(url.protocol)) &&
			!url.username &&
			!url.password
			? url.href
			: "";
	} catch {
		return "";
	}
}
export type ReaderKey = {
	key: string;
	isComposing: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
};
export function readerAction(event: ReaderKey, blocked: boolean, inList: boolean) {
	if (
		blocked ||
		event.isComposing ||
		event.ctrlKey ||
		event.metaKey ||
		event.altKey ||
		event.shiftKey
	)
		return null;
	if (event.key === "j" || (inList && event.key === "ArrowDown")) return "next";
	if (event.key === "k" || (inList && event.key === "ArrowUp")) return "previous";
	if (event.key === "Enter" && inList) return "read";
	if (event.key === "Escape") return "list";
	return null;
}
export function adjacentArticle(ids: number[], selected: number, direction: "next" | "previous") {
	const index = ids.indexOf(selected);
	return ids[Math.max(0, Math.min(ids.length - 1, index + (direction === "next" ? 1 : -1)))];
}
export function readerStorageKey(userId: string, mode: DataMode) {
	return `xray:reader:${encodeURIComponent(userId)}:${mode}`;
}
export function readPosition(storage: Pick<Storage, "getItem">, key: string) {
	try {
		const value = Number(storage.getItem(key));
		return Number.isFinite(value) && value > 0 ? value : 0;
	} catch {
		return 0;
	}
}
export function writeReaderValue(storage: Pick<Storage, "setItem">, key: string, value: string) {
	try {
		storage.setItem(key, value);
	} catch {
		/* Storage can be unavailable in private browsing. */
	}
}
export function readPreferences(
	storage: Pick<Storage, "getItem">,
	key: string,
): { sans: boolean; size: number; fullWidth: boolean } {
	try {
		const value = JSON.parse(storage.getItem(key) || "{}");
		return {
			sans: value?.sans === true,
			fullWidth: value?.fullWidth === true,
			size: [16, 18, 20, 22].includes(value?.size) ? value.size : 18,
		};
	} catch {
		return { sans: false, size: 18, fullWidth: false };
	}
}

export const reportExample = JSON.stringify(
	{
		external_id: "daily-2026-09-22",
		title: "Daily report",
		report_date: "2026-09-22",
		markdown: "## Progress\n\nToday's findings.",
	},
	null,
	2,
);
export function channelRequest(mode: DataMode, token: string) {
	return `curl '${ingestEndpoint(mode)}' \\
  -H 'Authorization: Bearer ${token}' \\
  -H 'Content-Type: application/json' \\
  --data @report.json`;
}
export async function copyChannelText(
	text: string,
	clipboard: Pick<Clipboard, "writeText"> | undefined,
) {
	try {
		if (!clipboard) throw new Error("Clipboard unavailable");
		await clipboard.writeText(text);
		return "Copied";
	} catch {
		return "Copy failed. Select and copy the text manually.";
	}
}

export function initialArticle(
	list: {
		channelId: number;
		date: string;
		loading: boolean;
		pageCount: number;
		error: string | null;
		items: { id: number }[];
	},
	channelId: number,
	articleId: number,
	date: string,
) {
	if (
		!channelId ||
		articleId ||
		list.loading ||
		list.error ||
		!list.pageCount ||
		list.channelId !== channelId ||
		list.date !== date
	)
		return undefined;
	return list.items[0]?.id;
}
