import type { SourceType } from "@xray/shared";
import type { TranslateResult } from "@/api/ai";
import type { IngestLog, Member, TimelineItem, Watchlist } from "@/api/watchlists";
import { ITEMS_PAGE_LIMIT } from "@/lib/feed-columns";
import type { MockWatchlistMember } from "@/lib/mock-data";
import type { Tweet, TweetMedia } from "@/lib/tweet-types";
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
	updateWatchlist: (
		id: number,
		input: Partial<{
			name: string;
			description: string | null;
			icon: string;
			translateEnabled: boolean;
		}>,
	) => Promise<Watchlist>;
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
	logsLoading: boolean;
	logsError: string | null;
	loading: boolean;
	loadingMore: boolean;
	error: string | null;
	settingsSaving: boolean;
	settingsError: string | null;
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

type PayloadTweet = {
	id?: string;
	text?: string;
	author_id?: string;
	created_at?: string;
	lang?: string;
	public_metrics?: {
		retweet_count?: number;
		like_count?: number;
		reply_count?: number;
		quote_count?: number;
		impression_count?: number;
		bookmark_count?: number;
	};
	attachments?: { media_keys?: string[] };
	referenced_tweets?: Array<{ type?: string; id?: string }>;
};

type PayloadMedia = {
	media_key?: string;
	type?: string;
	url?: string;
	preview_image_url?: string;
};

type PayloadUser = {
	id?: string;
	username?: string;
	name?: string;
	profile_image_url?: string;
	verified?: boolean;
	public_metrics?: { followers_count?: number };
};

/** Prefer post `created_at` (RFC3339); never fall back to ingest/collection time here. */
function postCreatedAtIso(item: TimelineItem, tweetCreatedAt?: string): string {
	if (typeof tweetCreatedAt === "string" && Number.isFinite(Date.parse(tweetCreatedAt))) {
		return new Date(tweetCreatedAt).toISOString();
	}
	// API column createdAtMs is the post timestamp written at ingest (not ingestedAtMs).
	if (Number.isFinite(item.createdAtMs) && item.createdAtMs > 0) {
		return new Date(item.createdAtMs).toISOString();
	}
	return new Date(0).toISOString();
}

function mapMediaType(t: string | undefined): TweetMedia["type"] | null {
	if (t === "photo" || t === "PHOTO") return "PHOTO";
	if (t === "video" || t === "VIDEO") return "VIDEO";
	if (t === "animated_gif" || t === "GIF" || t === "gif") return "GIF";
	return null;
}

function mediaFromIncludes(
	keys: string[] | undefined,
	includesMedia: PayloadMedia[] | undefined,
): TweetMedia[] | undefined {
	if (!keys?.length || !includesMedia?.length) return undefined;
	const byKey = new Map<string, PayloadMedia>();
	for (const m of includesMedia) {
		if (m.media_key) byKey.set(m.media_key, m);
	}
	const out: TweetMedia[] = [];
	for (const key of keys) {
		const m = byKey.get(key);
		if (!m) continue;
		const type = mapMediaType(m.type);
		const url = typeof m.url === "string" ? m.url : undefined;
		if (!type || !url) continue;
		const row: TweetMedia = { id: key, type, url };
		if (typeof m.preview_image_url === "string" && m.preview_image_url) {
			row.thumbnail_url = m.preview_image_url;
		}
		out.push(row);
	}
	return out.length ? out : undefined;
}

function metricsFromTweet(t: PayloadTweet | undefined): Tweet["metrics"] {
	const pm = t?.public_metrics;
	return {
		retweet_count: pm?.retweet_count ?? 0,
		like_count: pm?.like_count ?? 0,
		reply_count: pm?.reply_count ?? 0,
		quote_count: pm?.quote_count ?? 0,
		view_count: pm?.impression_count ?? 0,
		bookmark_count: pm?.bookmark_count ?? 0,
	};
}

function resolveAuthor(
	authorId: string | undefined,
	users: PayloadUser[],
	payloadAuthor:
		| { id?: string; username?: string; display_name?: string; avatar_url?: string }
		| undefined,
	item: TimelineItem,
): Tweet["author"] {
	const fromIncludes = authorId ? users.find((u) => u.id === authorId) : undefined;
	const username =
		fromIncludes?.username || payloadAuthor?.username || item.authorUsername || "unknown";
	const displayName = fromIncludes?.name || payloadAuthor?.display_name || username;
	const avatar =
		fromIncludes?.profile_image_url ||
		payloadAuthor?.avatar_url ||
		(username !== "unknown" ? `https://unavatar.io/x/${username}` : undefined);
	return {
		id: authorId || fromIncludes?.id || username,
		username,
		name: displayName,
		profile_image_url: avatar,
		followers_count: fromIncludes?.public_metrics?.followers_count,
		is_verified: fromIncludes?.verified,
	};
}

export function itemToTweet(item: TimelineItem): Tweet | null {
	if (item.sourceType !== "x.com") return null;
	const payload = item.payload as {
		body?: {
			tweet?: PayloadTweet;
			includes?: {
				users?: PayloadUser[];
				media?: PayloadMedia[];
				tweets?: PayloadTweet[];
			};
		};
		author?: { id?: string; username?: string; display_name?: string; avatar_url?: string };
		meta?: { is_retweet?: unknown; retweeted_by?: unknown };
	} | null;
	const t = payload?.body?.tweet;
	const users = payload?.body?.includes?.users ?? [];
	const includesMedia = payload?.body?.includes?.media ?? [];
	const includesTweets = payload?.body?.includes?.tweets ?? [];
	const authorId = t?.author_id || payload?.author?.id;
	const author = resolveAuthor(authorId, users, payload?.author, item);
	const username = author.username;
	const id = (typeof t?.id === "string" && t.id) || item.externalId;
	const refs = t?.referenced_tweets ?? [];
	const metaRtBy =
		typeof payload?.meta?.retweeted_by === "string" && payload.meta.retweeted_by.trim()
			? payload.meta.retweeted_by.trim().replace(/^@/, "").toLowerCase()
			: undefined;
	const is_retweet =
		refs.some((r) => r.type === "retweeted") ||
		payload?.meta?.is_retweet === true ||
		Boolean(metaRtBy);
	const is_quote = refs.some((r) => r.type === "quoted");
	const replyRef = refs.find((r) => r.type === "replied_to");
	const is_reply = Boolean(replyRef);

	let quoted_tweet: Tweet | undefined;
	const quotedRef = refs.find((r) => r.type === "quoted" && r.id);
	if (quotedRef?.id) {
		const qt = includesTweets.find((x) => x.id === quotedRef.id);
		if (qt) {
			// Isolate from parent item author so missing quote user stays "unknown".
			const qAuthor = resolveAuthor(qt.author_id, users, undefined, {
				...item,
				authorUsername: null,
			});
			// Only use the quoted tweet's own created_at — never fabricate from parent post.
			const qCreated =
				typeof qt.created_at === "string" && Number.isFinite(Date.parse(qt.created_at))
					? new Date(qt.created_at).toISOString()
					: "";
			quoted_tweet = {
				id: qt.id || quotedRef.id,
				text: typeof qt.text === "string" ? qt.text : "",
				author: qAuthor,
				created_at: qCreated,
				url:
					qAuthor.username !== "unknown"
						? `https://x.com/${qAuthor.username}/status/${qt.id || quotedRef.id}`
						: `https://x.com/i/status/${qt.id || quotedRef.id}`,
				metrics: metricsFromTweet(qt),
				is_retweet: false,
				is_quote: false,
				is_reply: false,
				media: mediaFromIncludes(qt.attachments?.media_keys, includesMedia),
			};
		}
	}

	return {
		id,
		text: (typeof t?.text === "string" && t.text) || item.text,
		author,
		// Relative UI time = now − post time (payload tweet.created_at / createdAtMs).
		created_at: postCreatedAtIso(item, t?.created_at),
		url:
			username !== "unknown"
				? `https://x.com/${username}/status/${id}`
				: `https://x.com/i/status/${id}`,
		metrics: metricsFromTweet(t),
		is_retweet,
		is_quote,
		is_reply,
		retweeted_by: metaRtBy,
		lang: typeof t?.lang === "string" ? t.lang : undefined,
		media: mediaFromIncludes(t?.attachments?.media_keys, includesMedia),
		quoted_tweet,
		reply_to_id: replyRef?.id,
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
		logsLoading: false,
		logsError: null,
		loading: false,
		loadingMore: false,
		error: null,
		settingsSaving: false,
		settingsError: null,
	});

	/** Monotonic token so late translate failures only roll back their own optimistic flip. */
	let translateMutationSeq = 0;
	/** Monotonic token so late loadLogs responses cannot clobber fresher results. */
	let logsLoadSeq = 0;

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
						? { limit: ITEMS_PAGE_LIMIT }
						: { limit: ITEMS_PAGE_LIMIT, source_type: sourceFilter as SourceType };
				// Core data only — logs go through sequenced loadLogs so a logs outage
				// cannot wipe a successful watchlist/members/items load.
				const [w, m, it] = await Promise.all([
					api.fetchWatchlist(id),
					api.fetchMembers(id),
					api.fetchItems(id, itemOpts),
				]);
				store.setState({
					wl: w,
					members: m,
					items: it.items,
					nextCursor: it.next_cursor,
					loading: false,
				});
				void vm.loadLogs();
			} catch (e) {
				store.setState({ error: errMsg(e), loading: false });
			}
		},
		async loadLogs() {
			const id = store.getState().watchlistId;
			if (!Number.isInteger(id) || id <= 0) return;
			const seq = ++logsLoadSeq;
			store.setState({ logsLoading: true, logsError: null });
			try {
				const logRows = await api.fetchWatchlistIngestLogs(id, 30);
				if (seq !== logsLoadSeq) return;
				store.setState({ logs: logRows, logsLoading: false, logsError: null });
			} catch (e) {
				if (seq !== logsLoadSeq) return;
				store.setState({ logsLoading: false, logsError: errMsg(e) });
			}
		},
		async setTranslateEnabled(enabled: boolean) {
			const id = store.getState().watchlistId;
			const prev = store.getState().wl;
			if (!prev) return;
			const seq = ++translateMutationSeq;
			const prevEnabled = prev.translateEnabled;
			store.setState({
				settingsSaving: true,
				settingsError: null,
				wl: { ...prev, translateEnabled: enabled },
			});
			try {
				const w = await api.updateWatchlist(id, { translateEnabled: enabled });
				if (seq !== translateMutationSeq) return;
				store.setState({ wl: w, settingsSaving: false });
			} catch (e) {
				if (seq !== translateMutationSeq) return;
				const current = store.getState().wl;
				store.setState({
					// Roll back only the toggled field so concurrent reloads keep fresher name/counts.
					wl: current ? { ...current, translateEnabled: prevEnabled } : current,
					settingsSaving: false,
					settingsError: errMsg(e),
				});
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
						? { limit: ITEMS_PAGE_LIMIT, cursor: nextCursor }
						: {
								limit: ITEMS_PAGE_LIMIT,
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
