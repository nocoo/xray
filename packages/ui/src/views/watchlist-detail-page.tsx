import { Eye, Languages, Plus, RefreshCw, ScrollText, Settings } from "lucide-react";
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
import { SlidePanel } from "@/components/layout/slide-panel";
import { SourceFilter } from "@/components/source-filter";
import { Button } from "@/components/ui/button";
import { useColumns } from "@/hooks/use-columns";
import { cn } from "@/lib/utils";
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
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [activityOpen, setActivityOpen] = useState(false);
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
					updateWatchlist: watchlistsApi.updateWatchlist,
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

	const openActivity = () => {
		setActivityOpen(true);
		void vm.loadLogs();
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
					<button
						type="button"
						onClick={openActivity}
						className="max-w-full truncate rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
						title="Open activity / ingest logs"
					>
						{s.wl?.name ?? "…"}
						{s.wl?.translateEnabled ? " · Translate on" : " · Translate off"}
						{s.logs[0] ? (
							<span className="ml-2 tabular-nums opacity-80">
								· last +{s.logs[0].accepted}/{s.logs[0].attempted}
							</span>
						) : null}
					</button>
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
					<Button
						variant="ghost"
						size="icon-sm"
						type="button"
						onClick={openActivity}
						title="Activity / ingest logs"
						aria-label="Open activity panel"
					>
						<ScrollText className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						type="button"
						onClick={() => setSettingsOpen(true)}
						title="Settings"
						aria-label="Open settings panel"
					>
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
						/* Single-column: soft snap between cards. Multi-column skips snap (interleaved stops). */
						<div
							data-testid="posts-scroll"
							className={cn(
								"max-h-[calc(100dvh-11.5rem)] overflow-y-auto scroll-smooth pr-0.5",
								columnCount === 1 && "snap-y snap-proximity",
							)}
						>
							<div className="flex items-start gap-3">
								{itemColumns.map((col, colIdx) => (
									<div
										key={col[0] ? `col-${col[0].id}` : `col-empty-${String(colIdx)}`}
										className="flex min-w-0 flex-1 flex-col gap-3"
									>
										{col.map((item) =>
											item.sourceType === "custom" ? (
												<div
													key={item.id}
													data-source-type="custom"
													className={columnCount === 1 ? "snap-start" : undefined}
												>
													<CustomItemCard
														sourceType="custom"
														title={item.title}
														body={item.text}
														createdAt={new Date(item.createdAtMs).toISOString()}
														authorName={item.authorUsername}
														url={
															(item.payload as { body?: { url?: string } } | null)?.body?.url ??
															null
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
												<div
													key={item.id}
													data-source-type="x.com"
													className={columnCount === 1 ? "snap-start" : undefined}
												>
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
							{s.nextCursor && (
								<div className="mt-4 flex justify-center pb-2">
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
				</div>
			)}

			{/* Settings — right slide panel (legacy v1) */}
			<SlidePanel
				open={settingsOpen}
				onClose={() => setSettingsOpen(false)}
				title="Settings"
				data-testid="settings-panel"
			>
				<div className="space-y-6 p-4">
					{s.settingsError && (
						<div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
							{s.settingsError}
						</div>
					)}
					<div className="space-y-2">
						<p className="flex items-center gap-2 text-sm font-medium">
							<Languages className="h-4 w-4 text-muted-foreground" />
							Auto translate
						</p>
						<p className="text-xs text-muted-foreground">
							When on, new items are eligible for batch translation from the toolbar.
						</p>
						<button
							type="button"
							role="switch"
							aria-label="Auto translate"
							aria-checked={s.wl?.translateEnabled ?? false}
							disabled={!s.wl || s.settingsSaving}
							onClick={() => void vm.setTranslateEnabled(!(s.wl?.translateEnabled ?? false))}
							className={cn(
								"relative h-7 w-12 rounded-full transition-colors",
								s.wl?.translateEnabled ? "bg-emerald-500" : "bg-muted",
								(!s.wl || s.settingsSaving) && "opacity-60",
							)}
						>
							<span
								className={cn(
									"absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
									s.wl?.translateEnabled && "translate-x-5",
								)}
							/>
						</button>
					</div>
					<div className="space-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
						<p>
							<span className="font-medium text-foreground">Members</span> · {s.members.length}
						</p>
						<p>
							<span className="font-medium text-foreground">Posts loaded</span> · {s.items.length}
						</p>
						<p>
							<span className="font-medium text-foreground">Source model</span> · mix (x.com +
							custom)
						</p>
					</div>
				</div>
			</SlidePanel>

			{/* Activity / ingest logs — right slide panel (not under waterfall) */}
			<SlidePanel
				open={activityOpen}
				onClose={() => setActivityOpen(false)}
				title="Activity"
				data-testid="activity-panel"
			>
				<div className="flex h-full flex-col" data-testid="ingest-logs">
					<div className="flex items-center justify-between border-b border-border px-4 py-2">
						<p className="text-xs text-muted-foreground">Recent ingest pushes</p>
						<Button
							variant="ghost"
							size="xs"
							type="button"
							disabled={s.logsLoading}
							onClick={() => void vm.loadLogs()}
							title="Refresh logs"
						>
							<RefreshCw className={cn("h-3.5 w-3.5", s.logsLoading && "animate-spin")} />
							Refresh
						</Button>
					</div>
					{s.logsError && (
						<div
							role="alert"
							className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
						>
							{s.logsError}
						</div>
					)}
					{s.logsLoading && s.logs.length === 0 ? (
						<p role="status" aria-live="polite" className="p-4 text-xs text-muted-foreground">
							Loading logs…
						</p>
					) : s.logs.length === 0 ? (
						<p className="p-4 text-xs text-muted-foreground">No pushes logged yet.</p>
					) : (
						<ul className="divide-y divide-border">
							{s.logs.map((log) => (
								<li key={log.id} className="space-y-1 px-4 py-3 text-xs">
									<div className="flex items-center justify-between gap-2">
										<span className="font-medium text-foreground tabular-nums">
											+{log.accepted}
											<span className="font-normal text-muted-foreground">
												{" "}
												/ dup {log.deduped} / rej {log.rejected}
											</span>
										</span>
										<span className="shrink-0 text-muted-foreground tabular-nums">
											of {log.attempted}
										</span>
									</div>
									<p className="text-muted-foreground tabular-nums">
										{new Date(log.createdAtMs).toLocaleString()}
									</p>
								</li>
							))}
						</ul>
					)}
				</div>
			</SlidePanel>
		</div>
	);
}
