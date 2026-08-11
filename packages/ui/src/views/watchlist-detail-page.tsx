import type { SourceType } from "@xray/shared";
import { Eye, Plus, RefreshCw, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { translateWatchlist } from "@/api/ai";
import {
	addMember,
	deleteMember,
	fetchItems,
	fetchMembers,
	fetchWatchlist,
	type Member,
	type TimelineItem,
	type Watchlist,
} from "@/api/watchlists";
import { CustomItemCard } from "@/components/cards/custom-item-card";
import { MemberCard } from "@/components/cards/member-card";
import { TweetCard } from "@/components/cards/tweet-card";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { SourceFilter, type SourceFilterValue } from "@/components/source-filter";
import { Button } from "@/components/ui/button";
import { useColumns } from "@/hooks/use-columns";
import type { MockWatchlistMember } from "@/lib/mock-data";
import type { Tweet } from "@/lib/tweet-types";

function memberToCard(m: Member): MockWatchlistMember {
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

function itemToTweet(item: TimelineItem): Tweet | null {
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

export function WatchlistDetailPage() {
	const { id } = useParams();
	const watchlistId = Number(id);
	const { setBreadcrumbs } = useBreadcrumbs();
	const [activeTab, setActiveTab] = useState<"members" | "posts">("posts");
	const [sourceFilter, setSourceFilter] = useState<SourceFilterValue>("all");
	const [wl, setWl] = useState<Watchlist | null>(null);
	const [members, setMembers] = useState<Member[]>([]);
	const [items, setItems] = useState<TimelineItem[]>([]);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const columnCount = useColumns();

	const load = useCallback(async () => {
		if (!Number.isInteger(watchlistId) || watchlistId <= 0) {
			setError("invalid watchlist");
			setLoading(false);
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const itemOpts =
				sourceFilter === "all"
					? { limit: 50 }
					: { limit: 50, source_type: sourceFilter as SourceType };
			const [w, m, it] = await Promise.all([
				fetchWatchlist(watchlistId),
				fetchMembers(watchlistId),
				fetchItems(watchlistId, itemOpts),
			]);
			setWl(w);
			setMembers(m);
			setItems(it.items);
			setNextCursor(it.next_cursor);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, [watchlistId, sourceFilter]);

	const loadMore = useCallback(async () => {
		if (!nextCursor || loadingMore) return;
		setLoadingMore(true);
		setError(null);
		try {
			const itemOpts =
				sourceFilter === "all"
					? { limit: 50, cursor: nextCursor }
					: {
							limit: 50,
							cursor: nextCursor,
							source_type: sourceFilter as SourceType,
						};
			const it = await fetchItems(watchlistId, itemOpts);
			setItems((prev) => [...prev, ...it.items]);
			setNextCursor(it.next_cursor);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoadingMore(false);
		}
	}, [nextCursor, loadingMore, sourceFilter, watchlistId]);

	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		setBreadcrumbs([
			{ label: "Watchlists", href: "/watchlist" },
			{ label: wl?.name ?? `#${watchlistId}` },
		]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs, wl?.name, watchlistId]);

	const filteredMembers = useMemo(() => {
		if (sourceFilter === "all") return members;
		return members.filter((m) => m.sourceType === sourceFilter);
	}, [members, sourceFilter]);

	const sourceCounts = useMemo(() => {
		const all = items.length;
		const x = items.filter((p) => p.sourceType === "x.com").length;
		const custom = items.filter((p) => p.sourceType === "custom").length;
		return { all, "x.com": x, custom } as const;
	}, [items]);

	const itemColumns = useMemo(() => {
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
	}, [items, columnCount]);

	const onAddMember = async () => {
		const handle = window.prompt("Handle (x.com username or custom handle)");
		if (!handle?.trim()) return;
		const stRaw = window.prompt("source_type: x.com or custom", "x.com") || "x.com";
		const sourceType = (stRaw === "custom" ? "custom" : "x.com") as SourceType;
		try {
			await addMember(watchlistId, { sourceType, handle });
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	const onTranslate = async () => {
		setError(null);
		try {
			const r = await translateWatchlist(watchlistId, { limit: 20 });
			await load();
			if (r.timed_out) setError("Translate timed out (partial results applied)");
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	const onRemoveMember = async (memberId: number) => {
		try {
			await deleteMember(watchlistId, memberId);
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-1">
				<div className="flex items-center">
					<button
						type="button"
						onClick={() => setActiveTab("members")}
						className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
							activeTab === "members"
								? "bg-secondary text-foreground"
								: "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
						}`}
					>
						Members
						<span className="ml-1.5 text-xs text-muted-foreground">({members.length})</span>
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("posts")}
						className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
							activeTab === "posts"
								? "bg-secondary text-foreground"
								: "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
						}`}
					>
						Posts
						<span className="ml-1.5 text-xs text-muted-foreground">({items.length})</span>
					</button>
				</div>

				<div className="flex flex-1 justify-center">
					<span className="text-xs text-muted-foreground">
						{wl?.name ?? "…"}
						{wl?.translateEnabled ? " · Translate on" : " · Translate off"}
						<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px]">
							mix · source_type
						</span>
					</span>
				</div>

				<div className="flex items-center gap-1.5">
					{activeTab === "members" && (
						<Button size="sm" type="button" onClick={() => void onAddMember()}>
							<Plus className="h-4 w-4" />
							Add
						</Button>
					)}
					{activeTab === "posts" && (
						<Button size="sm" type="button" onClick={() => void onTranslate()}>
							Translate
						</Button>
					)}
					<Button
						variant="outline"
						size="sm"
						type="button"
						onClick={() => void load()}
						title="Reload"
					>
						<RefreshCw className="h-4 w-4" />
						Reload
					</Button>
					<Button variant="ghost" size="icon-sm" type="button" disabled title="Settings S5">
						<Settings className="h-4 w-4" />
					</Button>
				</div>
			</div>

			<SourceFilter value={sourceFilter} onChange={setSourceFilter} counts={sourceCounts} />

			{loading && <p className="text-sm text-muted-foreground">Loading…</p>}
			{error && <p className="text-sm text-destructive">{error}</p>}

			{activeTab === "members" && !loading && (
				<div>
					{filteredMembers.length > 0 ? (
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
							{filteredMembers.map((m) => (
								<MemberCard
									key={m.id}
									member={memberToCard(m)}
									onDelete={() => void onRemoveMember(m.id)}
								/>
							))}
						</div>
					) : (
						<div className="rounded-card bg-secondary p-8 text-center">
							<p className="text-muted-foreground">
								No members yet. Add an x.com or custom handle.
							</p>
						</div>
					)}
				</div>
			)}

			{activeTab === "posts" && !loading && (
				<div>
					{items.length === 0 ? (
						<div className="flex flex-col items-center gap-2 rounded-card bg-secondary p-10 text-center">
							<Eye className="h-8 w-8 text-muted-foreground" />
							<p className="text-sm font-medium">No items yet.</p>
							<p className="max-w-md text-xs text-muted-foreground">
								Mint a push token under Settings → Push tokens, then{" "}
								<code className="rounded bg-muted px-1">POST /api/v1/ingest/push</code> on the
								ingest host with x.com + custom items.
							</p>
						</div>
					) : (
						<div className="flex items-start gap-3">
							{itemColumns.map((col, colIdx) => (
								<div
									key={col[0] ? `col-${col[0].id}` : `col-empty-${String(colIdx)}`}
									className="flex min-w-0 flex-1 flex-col gap-3"
								>
									{col.map((item) =>
										item.sourceType === "custom" ? (
											<div key={item.id} data-source-type="custom">
												<CustomItemCard
													sourceType="custom"
													title={item.title}
													body={item.text}
													createdAt={new Date(item.createdAtMs).toISOString()}
													authorName={item.authorUsername}
													url={
														(item.payload as { body?: { url?: string } } | null)?.body?.url ?? null
													}
												/>
											</div>
										) : (
											<div key={item.id} data-source-type="x.com">
												{(() => {
													const tweet = itemToTweet(item);
													if (!tweet) return null;
													return (
														<TweetCard
															tweet={tweet}
															sourceType="x.com"
															linkToDetail={false}
															initialTranslation={
																item.translatedText
																	? {
																			translatedText: item.translatedText,
																			commentText: item.summaryText,
																		}
																	: undefined
															}
														/>
													);
												})()}
											</div>
										),
									)}
								</div>
							))}
						</div>
					)}
					{nextCursor && (
						<div className="mt-4 flex justify-center">
							<Button
								variant="outline"
								size="sm"
								type="button"
								disabled={loadingMore}
								onClick={() => void loadMore()}
							>
								{loadingMore ? "Loading…" : "Load more"}
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
