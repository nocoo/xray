import type { SourceType } from "@xray/shared";
import type { TranslateResult } from "@/api/ai";
import type { IngestLog, Member, TimelineItem, Watchlist } from "@/api/watchlists";
import type { MockWatchlistMember } from "@/lib/mock-data";
import type { Tweet } from "@/lib/tweet-types";
import { createStore, errMsg } from "./store";

export type SourceFilterValue = "all" | SourceType;

export type WatchlistDetailApi = {
	fetchWatchlist: (id: number) => Promise<Watchlist>;
	fetchMembers: (id: number) => Promise<Member[]>;
	fetchItems: (
		id: number,
		opts?: { source_type?: SourceType; limit?: number; cursor?: string },
	) => Promise<{ items: TimelineItem[]; next_cursor: string | null }>;
	fetchWatchlistIngestLogs: (id: number, limit?: number) => Promise<IngestLog[]>;
	deleteMember: (watchlistId: number, memberId: number) => Promise<unknown>;
	translateWatchlist: (
		watchlistId: number,
		body?: { limit?: number; item_ids?: number[] },
	) => Promise<TranslateResult>;
};

export type WatchlistDetailState = {
	watchlistId: number;
	activeTab: "members" | "posts";
	sourceFilter: SourceFilterValue;
	wl: Watchlist | null;
	members: Member[];
	items: TimelineItem[];
	nextCursor: string | null;
	logs: IngestLog[];
	loading: boolean;
	loadingMore: boolean;
	error: string | null;
};

export function memberToCard(m: Member): MockWatchlistMember {
	return {
		id: m.id,
		sourceType: m.sourceType,
		handle: m.handle,
		note: m.note,
		profile: m.displayName
			? {
					displayName: m.displayName,
					profileImageUrl: m.sourceType === "x.com" ? `https://unavatar.io/x/${m.handle}` : "",
					followersCount: 0,
					isVerified: false,
				}
			: null,
		tags: m.tags,
	};
}

export function itemToTweet(item: TimelineItem): Tweet | null {
	if (item.sourceType !== "x.com") return null;
	const payload = item.payload as {
		body?: {
			tweet?: { id?: string; text?: string; author_id?: string };
			includes?: { users?: Array<{ id?: string; username?: string; name?: string }> };
		};
		author?: { id?: string; username?: string; display_name?: string; avatar_url?: string };
	} | null;
	const t = payload?.body?.tweet;
	const users = payload?.body?.includes?.users ?? [];
	const authorId = t?.author_id || payload?.author?.id;
	const fromIncludes = authorId ? users.find((u) => u.id === authorId) : undefined;
	const username =
		fromIncludes?.username || payload?.author?.username || item.authorUsername || "unknown";
	const displayName = fromIncludes?.name || payload?.author?.display_name || username;
	const avatar =
		payload?.author?.avatar_url ||
		(username !== "unknown" ? `https://unavatar.io/x/${username}` : undefined);
	return {
		id: (typeof t?.id === "string" && t.id) || item.externalId,
		text: (typeof t?.text === "string" && t.text) || item.text,
		author: {
			id: authorId || username,
			username,
			name: displayName,
			profile_image_url: avatar,
		},
		created_at: new Date(item.createdAtMs).toISOString(),
		url:
			username !== "unknown"
				? `https://x.com/${username}/status/${item.externalId}`
				: `https://x.com/i/status/${item.externalId}`,
		metrics: {
			retweet_count: 0,
			like_count: 0,
			reply_count: 0,
			quote_count: 0,
			view_count: 0,
			bookmark_count: 0,
		},
		is_retweet: false,
		is_quote: false,
		is_reply: false,
	};
}

export function filterMembers(members: Member[], sourceFilter: SourceFilterValue): Member[] {
	if (sourceFilter === "all") return members;
	return members.filter((m) => m.sourceType === sourceFilter);
}

export function sourceCounts(items: TimelineItem[]) {
	const all = items.length;
	const x = items.filter((p) => p.sourceType === "x.com").length;
	const custom = items.filter((p) => p.sourceType === "custom").length;
	return { all, "x.com": x, custom } as const;
}

export function distributeColumns(items: TimelineItem[], columnCount: number): TimelineItem[][] {
	const cols: TimelineItem[][] = Array.from({ length: columnCount }, () => []);
	const heights = new Array<number>(columnCount).fill(0);
	for (const item of items) {
		const h = 80 + Math.ceil(item.text.length / 60) * 20;
		let minIdx = 0;
		for (let c = 1; c < columnCount; c++) {
			if ((heights[c] ?? 0) < (heights[minIdx] ?? 0)) minIdx = c;
		}
		cols[minIdx]?.push(item);
		heights[minIdx] = (heights[minIdx] ?? 0) + h;
	}
	return cols;
}

export function createWatchlistDetailVm(api: WatchlistDetailApi, watchlistId: number) {
	const store = createStore<WatchlistDetailState>({
		watchlistId,
		activeTab: "posts",
		sourceFilter: "all",
		wl: null,
		members: [],
		items: [],
		nextCursor: null,
		logs: [],
		loading: false,
		loadingMore: false,
		error: null,
	});

	const vm = {
		...store,
		setActiveTab(tab: "members" | "posts") {
			store.setState({ activeTab: tab });
		},
		setSourceFilter(filter: SourceFilterValue) {
			store.setState({ sourceFilter: filter });
			// Reload items when filter changes (View stays free of orchestration).
			void vm.load();
		},
		async load(opts?: { silent?: boolean }) {
			const id = store.getState().watchlistId;
			if (!Number.isInteger(id) || id <= 0) {
				store.setState({ error: "invalid watchlist", loading: false });
				return;
			}
			if (!opts?.silent) store.setState({ loading: true });
			store.setState({ error: null });
			try {
				const { sourceFilter } = store.getState();
				const itemOpts =
					sourceFilter === "all"
						? { limit: 50 }
						: { limit: 50, source_type: sourceFilter as SourceType };
				const [w, m, it, logRows] = await Promise.all([
					api.fetchWatchlist(id),
					api.fetchMembers(id),
					api.fetchItems(id, itemOpts),
					api.fetchWatchlistIngestLogs(id, 15),
				]);
				store.setState({
					wl: w,
					members: m,
					items: it.items,
					nextCursor: it.next_cursor,
					logs: logRows,
					loading: false,
				});
			} catch (e) {
				store.setState({ error: errMsg(e), loading: false });
			}
		},
		onItemTranslated(
			itemId: number,
			patch: { translatedText: string; summaryText?: string | null },
		) {
			const { items } = store.getState();
			store.setState({
				items: items.map((it) =>
					it.id === itemId
						? {
								...it,
								translatedText: patch.translatedText,
								summaryText: patch.summaryText ?? null,
							}
						: it,
				),
			});
		},
		async loadMore() {
			const { nextCursor, loadingMore, sourceFilter, watchlistId: id } = store.getState();
			if (!nextCursor || loadingMore) return;
			store.setState({ loadingMore: true, error: null });
			try {
				const itemOpts =
					sourceFilter === "all"
						? { limit: 50, cursor: nextCursor }
						: {
								limit: 50,
								cursor: nextCursor,
								source_type: sourceFilter as SourceType,
							};
				const it = await api.fetchItems(id, itemOpts);
				store.setState({
					items: [...store.getState().items, ...it.items],
					nextCursor: it.next_cursor,
					loadingMore: false,
				});
			} catch (e) {
				store.setState({ error: errMsg(e), loadingMore: false });
			}
		},
		async translate() {
			const id = store.getState().watchlistId;
			store.setState({ error: null });
			try {
				const r = await api.translateWatchlist(id, { limit: 20 });
				await vm.load({ silent: true });
				if (r.timed_out) store.setState({ error: "Translate timed out (partial results applied)" });
			} catch (e) {
				store.setState({ error: errMsg(e) });
			}
		},
		async removeMember(memberId: number) {
			const id = store.getState().watchlistId;
			try {
				await api.deleteMember(id, memberId);
				await vm.load();
			} catch (e) {
				store.setState({ error: errMsg(e) });
			}
		},
	};

	return vm;
}

export type WatchlistDetailVm = ReturnType<typeof createWatchlistDetailVm>;
