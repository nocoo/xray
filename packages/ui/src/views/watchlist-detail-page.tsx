import { Eye, Plus, RefreshCw, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import * as aiApi from "@/api/ai";
import type { Member } from "@/api/watchlists";
import * as watchlistsApi from "@/api/watchlists";
import { CustomItemCard } from "@/components/cards/custom-item-card";
import { MemberCard } from "@/components/cards/member-card";
import { TweetCard } from "@/components/cards/tweet-card";
import { useCreateDialogs } from "@/components/dialogs/create-dialogs-context";
import { EditMemberDialog } from "@/components/dialogs/edit-member-dialog";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { SourceFilter } from "@/components/source-filter";
import { Button } from "@/components/ui/button";
import { useColumns } from "@/hooks/use-columns";
import { useVm } from "@/viewmodels/use-vm";
import {
	createWatchlistDetailVm,
	distributeColumns,
	filterMembers,
	itemToTweet,
	memberToCard,
	sourceCounts,
} from "@/viewmodels/watchlist-detail-vm";

export function WatchlistDetailPage() {
	const { id } = useParams();
	const watchlistId = Number(id);
	const { setBreadcrumbs } = useBreadcrumbs();
	const { openAddMember } = useCreateDialogs();
	const [editMember, setEditMember] = useState<Member | null>(null);
	const columnCount = useColumns();

	const vm = useMemo(
		() =>
			createWatchlistDetailVm(
				{
					fetchWatchlist: watchlistsApi.fetchWatchlist,
					fetchMembers: watchlistsApi.fetchMembers,
					fetchItems: watchlistsApi.fetchItems,
					fetchWatchlistIngestLogs: watchlistsApi.fetchWatchlistIngestLogs,
					deleteMember: watchlistsApi.deleteMember,
					translateWatchlist: aiApi.translateWatchlist,
				},
				watchlistId,
			),
		[watchlistId],
	);
	const s = useVm(vm);

	useEffect(() => {
		void vm.load();
	}, [vm]);

	useEffect(() => {
		setBreadcrumbs([
			{ label: "Watchlists", href: "/watchlist" },
			{ label: s.wl?.name ?? `#${watchlistId}` },
		]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs, s.wl?.name, watchlistId]);

	const filteredMembers = useMemo(
		() => filterMembers(s.members, s.sourceFilter),
		[s.members, s.sourceFilter],
	);
	const counts = useMemo(() => sourceCounts(s.items), [s.items]);
	const itemColumns = useMemo(
		() => distributeColumns(s.items, columnCount),
		[s.items, columnCount],
	);

	const onAddMember = () => {
		openAddMember(
			{ kind: "watchlist", id: watchlistId, name: s.wl?.name },
			{ onAdded: () => void vm.load() },
		);
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-1">
				<div className="flex items-center">
					<button
						type="button"
						onClick={() => vm.setActiveTab("members")}
						className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
							s.activeTab === "members"
								? "bg-secondary text-foreground"
								: "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
						}`}
					>
						Members
						<span className="ml-1.5 text-xs text-muted-foreground">({s.members.length})</span>
					</button>
					<button
						type="button"
						onClick={() => vm.setActiveTab("posts")}
						className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
							s.activeTab === "posts"
								? "bg-secondary text-foreground"
								: "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
						}`}
					>
						Posts
						<span className="ml-1.5 text-xs text-muted-foreground">({s.items.length})</span>
					</button>
				</div>

				<div className="flex flex-1 justify-center">
					<span className="text-xs text-muted-foreground">
						{s.wl?.name ?? "…"}
						{s.wl?.translateEnabled ? " · Translate on" : " · Translate off"}
						<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px]">
							mix · source_type
						</span>
					</span>
				</div>

				<div className="flex items-center gap-1.5">
					{s.activeTab === "members" && (
						<Button size="sm" type="button" onClick={onAddMember}>
							<Plus className="h-4 w-4" />
							Add
						</Button>
					)}
					{s.activeTab === "posts" && (
						<Button size="sm" type="button" onClick={() => void vm.translate()}>
							Translate
						</Button>
					)}
					<Button
						variant="outline"
						size="sm"
						type="button"
						onClick={() => void vm.load()}
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

			<SourceFilter
				value={s.sourceFilter}
				onChange={(v) => vm.setSourceFilter(v)}
				counts={counts}
			/>

			{s.loading && <p className="text-sm text-muted-foreground">Loading…</p>}
			{s.error && <p className="text-sm text-destructive">{s.error}</p>}

			{s.activeTab === "members" && !s.loading && (
				<div>
					{filteredMembers.length > 0 ? (
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
							{filteredMembers.map((m) => (
								<MemberCard
									key={m.id}
									member={memberToCard(m)}
									onEdit={() => setEditMember(m)}
									onDelete={() => void vm.removeMember(m.id)}
								/>
							))}
						</div>
					) : (
						<div className="rounded-card bg-secondary p-10 text-center">
							<p className="text-muted-foreground">
								No members yet. Add an x.com or custom handle.
							</p>
						</div>
					)}
					<EditMemberDialog
						open={editMember != null}
						onOpenChange={(o) => {
							if (!o) setEditMember(null);
						}}
						watchlistId={watchlistId}
						member={editMember}
						onSaved={() => void vm.load()}
					/>
				</div>
			)}

			{s.activeTab === "posts" && !s.loading && (
				<div>
					{s.items.length === 0 ? (
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
													watchlistId={watchlistId}
													itemId={item.id}
													initialTranslation={
														item.translatedText
															? {
																	translatedText: item.translatedText,
																	summaryText: item.summaryText,
																}
															: undefined
													}
													onTranslated={(result) => vm.onItemTranslated(item.id, result)}
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
															watchlistId={watchlistId}
															itemId={item.id}
															initialTranslation={
																item.translatedText
																	? {
																			translatedText: item.translatedText,
																			commentText: item.summaryText,
																		}
																	: undefined
															}
															onTranslated={(result) => vm.onItemTranslated(item.id, result)}
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
					{s.nextCursor && (
						<div className="mt-4 flex justify-center">
							<Button
								variant="outline"
								size="sm"
								type="button"
								disabled={s.loadingMore}
								onClick={() => void vm.loadMore()}
							>
								{s.loadingMore ? "Loading…" : "Load more"}
							</Button>
						</div>
					)}
				</div>
			)}

			<div className="space-y-2 border-t border-border pt-4" data-testid="ingest-logs">
				<h2 className="text-sm font-medium">Ingest logs</h2>
				{s.logs.length === 0 ? (
					<p className="text-xs text-muted-foreground">No pushes logged yet.</p>
				) : (
					<ul className="space-y-1 text-xs text-muted-foreground">
						{s.logs.map((log) => (
							<li key={log.id} className="flex flex-wrap gap-x-2 tabular-nums">
								<span>{new Date(log.createdAtMs).toLocaleString()}</span>
								<span>
									+{log.accepted} / dup {log.deduped} / rej {log.rejected} (of {log.attempted})
								</span>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
