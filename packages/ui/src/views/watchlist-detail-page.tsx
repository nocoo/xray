import type { SourceType } from "@xray/shared";
import { Eye, Plus, RefreshCw, Settings, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
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
		body?: { tweet?: Partial<Tweet> & { text?: string; id?: string } };
	} | null;
	const t = payload?.body?.tweet;
	return {
		id: t?.id || item.externalId,
		text: t?.text || item.text,
		author: {
			id: item.authorUsername || "unknown",
			username: item.authorUsername || "unknown",
			name: item.authorUsername || "unknown",
			profile_image_url: item.authorUsername
				? `https://unavatar.io/x/${item.authorUsername}`
				: undefined,
		},
		created_at: new Date(item.createdAtMs).toISOString(),
		url: item.authorUsername
			? `https://x.com/${item.authorUsername}/status/${item.externalId}`
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
		...(t && typeof t === "object" ? t : {}),
	} as Tweet;
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
	const [loading, setLoading] = useState(true);
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
			const [w, m, it] = await Promise.all([
				fetchWatchlist(watchlistId),
				fetchMembers(watchlistId),
				fetchItems(watchlistId, { limit: 100 }),
			]);
			setWl(w);
			setMembers(m);
			setItems(it.items);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, [watchlistId]);

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

	const filteredItems = useMemo(() => {
		if (sourceFilter === "all") return items;
		return items.filter((i) => i.sourceType === sourceFilter);
	}, [items, sourceFilter]);

	const sourceCounts = useMemo(() => {
		const all = items.length;
		const x = items.filter((p) => p.sourceType === "x.com").length;
		const custom = items.filter((p) => p.sourceType === "custom").length;
		return { all, "x.com": x, custom } as const;
	}, [items]);

	const itemColumns = useMemo(() => {
		const cols: TimelineItem[][] = Array.from({ length: columnCount }, () => []);
		const heights = new Array<number>(columnCount).fill(0);
		for (const item of filteredItems) {
			const h = 80 + Math.ceil(item.text.length / 60) * 20;
			let minIdx = 0;
			for (let c = 1; c < columnCount; c++) {
				if ((heights[c] ?? 0) < (heights[minIdx] ?? 0)) minIdx = c;
			}
			cols[minIdx]?.push(item);
			heights[minIdx] = (heights[minIdx] ?? 0) + h;
		}
		return cols;
	}, [filteredItems, columnCount]);

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
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
							{filteredMembers.map((m) => (
								<div key={m.id} className="relative">
									<MemberCard member={memberToCard(m)} />
									<button
										type="button"
										className="absolute right-2 bottom-2 rounded-md bg-background/80 p-1 text-muted-foreground hover:text-destructive"
										title="Remove"
										onClick={() => void onRemoveMember(m.id)}
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								</div>
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
					{filteredItems.length === 0 ? (
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
				</div>
			)}
		</div>
	);
}
