import { Button, LayerCard, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { Dock, DockBody } from "@nocoo/basalt/components/dock";
import { Empty } from "@nocoo/basalt/components/empty";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { Eye, Languages, Plus, RefreshCw, ScrollText, Settings, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { PageAside } from "@/components/layout/page-aside";
import { PostsColumnsPages } from "@/components/posts-columns-pages";
import { SourceFilter } from "@/components/source-filter";
import { useColumns } from "@/hooks/use-columns";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useVm } from "@/viewmodels/use-vm";
import {
	createWatchlistDetailVm,
	estimateItemHeight,
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
	const [panel, setPanel] = useState<"settings" | "activity" | null>(null);
	const isMobile = useIsMobile();
	const [wideEnoughForPush, setWideEnoughForPush] = useState(false);
	const [feedEl, setFeedEl] = useState<HTMLDivElement | null>(null);
	const columnCount = useColumns(feedEl);
	const postsScrollRef = useRef<HTMLDivElement>(null);
	const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

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

	useEffect(() => {
		if (s.activeTab !== "posts" || !s.nextCursor) return;
		const root = postsScrollRef.current;
		const target = loadMoreSentinelRef.current;
		if (!root || !target) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					void vm.loadMore();
				}
			},
			{ root, rootMargin: "240px 0px", threshold: 0 },
		);
		io.observe(target);
		return () => io.disconnect();
	}, [s.activeTab, s.nextCursor, vm]);

	const filteredMembers = useMemo(
		() => filterMembers(s.members, s.sourceFilter),
		[s.members, s.sourceFilter],
	);
	const counts = useMemo(() => sourceCounts(s.items), [s.items]);

	const onAddMember = () => {
		openAddMember(
			{ kind: "watchlist", id: watchlistId, name: s.wl?.name },
			{ onAdded: () => void vm.load() },
		);
	};

	const closePanel = () => setPanel(null);

	const toggleActivity = () => {
		setPanel((current) => (current === "activity" ? null : "activity"));
	};

	useEffect(() => {
		if (panel === "activity") void vm.loadLogs();
	}, [panel, vm]);

	useEffect(() => {
		if (!panel) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setPanel(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [panel]);

	useEffect(() => {
		const mql = window.matchMedia("(min-width: 1280px)");
		const apply = () => setWideEnoughForPush(mql.matches);
		apply();
		mql.addEventListener("change", apply);
		return () => mql.removeEventListener("change", apply);
	}, []);

	const postsFeedActive = s.activeTab === "posts" && !s.loading && s.items.length > 0;
	const title = s.wl?.name ?? "Watchlist";
	const panelTitle = panel === "activity" ? "Activity" : "Settings";
	const usePushDock = !isMobile && wideEnoughForPush;

	const dock = (
		<Dock
			open={panel != null}
			mode={usePushDock ? "push" : "overlay"}
			width="20rem"
			onDismiss={closePanel}
			aria-label={panelTitle}
			className={usePushDock ? "h-full rounded-[16px] md:rounded-basalt-island" : "h-full"}
		>
			<div className="flex shrink-0 items-center justify-between border-b border-basalt-border px-4 py-3">
				<p className="text-sm font-semibold">{panelTitle}</p>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-8 w-8"
					onClick={closePanel}
					aria-label="Close panel"
				>
					<X className="h-4 w-4" />
				</Button>
			</div>
			{panel === "settings" ? (
				<DockBody>
					<div className="space-y-6" data-testid="settings-panel">
						{s.settingsError && <Banner variant="error" size="sm" description={s.settingsError} />}
						<div className="space-y-2">
							<p className="flex items-center gap-2 text-sm font-medium">
								<Languages className="h-4 w-4 text-basalt-muted-foreground" />
								Auto translate
							</p>
							<p className="text-xs text-basalt-muted-foreground">
								When on, untranslated posts are translated when you open this watchlist.
							</p>
							<Switch
								aria-label="Auto translate"
								checked={s.wl?.translateEnabled ?? false}
								disabled={!s.wl || s.settingsSaving}
								onCheckedChange={(next) => void vm.setTranslateEnabled(next === true)}
							/>
						</div>
						<div className="space-y-1 border-t border-basalt-border pt-4 text-xs text-basalt-muted-foreground">
							<p>
								<span className="font-medium text-basalt-foreground">Members</span> ·{" "}
								{s.members.length}
							</p>
							<p>
								<span className="font-medium text-basalt-foreground">Posts loaded</span> ·{" "}
								{s.items.length}
							</p>
							<p>
								<span className="font-medium text-basalt-foreground">Source model</span> · mix
								(x.com + custom)
							</p>
						</div>
					</div>
				</DockBody>
			) : panel === "activity" ? (
				<div className="flex min-h-0 flex-1 flex-col" data-testid="activity-panel">
					<div className="flex items-center justify-between border-b border-basalt-border px-4 py-2">
						<p className="text-xs text-basalt-muted-foreground">Recent ingest pushes</p>
						<Button
							variant="ghost"
							size="sm"
							type="button"
							disabled={s.logsLoading}
							onClick={() => void vm.loadLogs()}
							title="Refresh logs"
						>
							<RefreshCw className={cn("h-3.5 w-3.5", s.logsLoading && "animate-spin")} />
							Refresh
						</Button>
					</div>
					<DockBody className="gap-0 p-0">
						<div data-testid="ingest-logs">
							{s.logsError && <Banner variant="error" size="sm" description={s.logsError} />}
							{s.logsLoading && s.logs.length === 0 ? (
								<p
									role="status"
									aria-live="polite"
									className="p-4 text-xs text-basalt-muted-foreground"
								>
									Loading logs…
								</p>
							) : s.logs.length === 0 ? (
								<p className="p-4 text-xs text-basalt-muted-foreground">No pushes logged yet.</p>
							) : (
								<ul className="divide-y divide-basalt-border">
									{s.logs.map((log) => (
										<li key={log.id} className="space-y-1 px-4 py-3 text-xs">
											<div className="flex items-center justify-between gap-2">
												<span className="font-medium text-basalt-foreground tabular-nums">
													+{log.accepted}
													<span className="font-normal text-basalt-muted-foreground">
														{" "}
														/ dup {log.deduped} / rej {log.rejected}
													</span>
												</span>
												<span className="shrink-0 text-basalt-muted-foreground tabular-nums">
													of {log.attempted}
												</span>
											</div>
											<p className="text-basalt-muted-foreground tabular-nums">
												{new Date(log.createdAtMs).toLocaleString()}
											</p>
										</li>
									))}
								</ul>
							)}
						</div>
					</DockBody>
				</div>
			) : null}
		</Dock>
	);

	return (
		<>
			<div
				className={cn(
					"relative min-h-0 flex-1",
					postsFeedActive ? "flex min-h-0 flex-col gap-3 md:gap-4" : "space-y-4",
				)}
			>
				<PageHeader
					title={title}
					description={
						s.wl
							? `${s.wl.translateEnabled ? "Translate on" : "Translate off"}${
									s.logs[0] ? ` · last +${s.logs[0].accepted}/${s.logs[0].attempted}` : ""
								}`
							: undefined
					}
					actions={
						<>
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
							<Button variant="outline" size="sm" type="button" onClick={() => void vm.load()}>
								<RefreshCw className="h-4 w-4" />
								Reload
							</Button>
							<Button
								variant="ghost"
								size="icon"
								className="h-8 w-8"
								type="button"
								onClick={toggleActivity}
								title="Activity / ingest logs"
								aria-label="Open activity panel"
								aria-pressed={panel === "activity"}
							>
								<ScrollText className="h-4 w-4" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								className="h-8 w-8"
								type="button"
								onClick={() => setPanel((current) => (current === "settings" ? null : "settings"))}
								title="Settings"
								aria-label="Open settings panel"
								aria-pressed={panel === "settings"}
							>
								<Settings className="h-4 w-4" />
							</Button>
						</>
					}
					filters={
						<SourceFilter
							value={s.sourceFilter}
							onChange={(v) => vm.setSourceFilter(v)}
							counts={counts}
						/>
					}
				/>
				{s.loading && <p className="text-sm text-basalt-muted-foreground">Loading…</p>}
				{s.error && <Banner variant="error" size="sm" description={s.error} />}

				<Tabs
					value={s.activeTab}
					onValueChange={(v) => vm.setActiveTab(v as "members" | "posts")}
					className={postsFeedActive ? "flex min-h-0 flex-1 flex-col" : undefined}
				>
					<TabsList>
						<TabsTrigger value="members">Members ({s.members.length})</TabsTrigger>
						<TabsTrigger value="posts">Posts ({s.items.length})</TabsTrigger>
					</TabsList>

					<TabsContent value="members">
						{!s.loading && (
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
									<LayerCard>
										<Empty title="No members yet." description="Add an x.com or custom handle." />
									</LayerCard>
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
					</TabsContent>

					<TabsContent
						value="posts"
						className={postsFeedActive ? "flex min-h-0 flex-1 flex-col" : undefined}
					>
						{!s.loading && s.items.length === 0 && (
							<LayerCard>
								<Empty
									icon={<Eye className="h-8 w-8 text-basalt-muted-foreground" />}
									title="No items yet."
									description="Mint a push token under Settings → Push tokens, then POST /api/v1/ingest/push on the ingest host with x.com + custom items."
								/>
							</LayerCard>
						)}

						{postsFeedActive && (
							<div
								ref={(el) => {
									postsScrollRef.current = el;
									setFeedEl(el);
								}}
								data-testid="posts-scroll"
								className={cn(
									"min-h-0 flex-1 overflow-y-auto scroll-smooth",
									"-mx-3 -mb-3 px-3 md:-mx-5 md:-mb-5 md:px-5",
									columnCount === 1 && "snap-y snap-proximity",
								)}
							>
								<PostsColumnsPages
									items={s.items}
									columnCount={columnCount}
									estimateHeight={estimateItemHeight}
									renderItem={(item) => {
										const snap = columnCount === 1 ? "snap-start" : undefined;
										if (item.sourceType === "custom") {
											return (
												<div key={item.id} data-source-type="custom" className={snap}>
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
											);
										}
										const tweet = itemToTweet(item);
										if (!tweet) return null;
										return (
											<div key={item.id} data-source-type="x.com" className={snap}>
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
											</div>
										);
									}}
								/>

								{s.nextCursor ? (
									<div
										ref={loadMoreSentinelRef}
										data-testid="load-more-sentinel"
										className="flex h-12 items-center justify-center"
										aria-hidden
									>
										{s.loadingMore ? (
											<span className="text-xs text-basalt-muted-foreground">Loading…</span>
										) : null}
									</div>
								) : (
									<div
										data-testid="feed-end"
										className="flex min-h-40 flex-col items-center justify-center gap-3 py-16 text-center"
									>
										<div className="h-px w-10 bg-basalt-border" aria-hidden />
										<p className="text-xs tracking-wide text-basalt-muted-foreground/80">
											End of feed
										</p>
									</div>
								)}
							</div>
						)}
					</TabsContent>
				</Tabs>
				{usePushDock ? null : dock}
			</div>
			{usePushDock ? <PageAside open={panel != null}>{dock}</PageAside> : null}
		</>
	);
}
