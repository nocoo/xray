import { Badge, Button, ConfirmDialog, LayerCard } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@nocoo/basalt/components/dialog";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { extractArticleLinks } from "@xray/shared";
import {
	AArrowDown,
	AArrowUp,
	ArrowLeft,
	BookOpen,
	CalendarDays,
	Columns2,
	Inbox,
	Link2,
	ListFilter,
	LoaderCircle,
	Maximize2,
	Pencil,
	Radio,
	SearchX,
	Settings,
	Trash2,
	TriangleAlert,
	Type,
} from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ArticleEditor } from "@/components/article-editor";
import { ArticleFiltersBar } from "@/components/article-filters-bar";
import { ArticleLinksPanel } from "@/components/article-links-panel";
import { ChannelMarkdown } from "@/components/channel-markdown";
import { useChannels } from "@/components/channels-context";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { HeaderTooltip } from "@/components/layout/header-links";
import { TagLabels } from "@/components/tag-labels";
import { useAuthUser } from "@/hooks/me-context";
import { restoreReadingPosition } from "@/hooks/reading-position";
import {
	adjacentArticle,
	articlePath,
	initialArticle,
	readerAction,
	readerStorageKey,
	readPosition,
	readPreferences,
	writeReaderValue,
} from "@/lib/channel-reader";
import { getDataMode } from "@/lib/data-mode";
import { useVm } from "@/viewmodels/use-vm";

export function ChannelsPage() {
	const vm = useChannels();
	const state = useVm(vm);
	const params = useParams();
	const channelId = Number(params.channelId) || 0;
	const articleId = Number(params.articleId) || 0;
	const [query] = useSearchParams();
	const filterQuery = query.toString();
	const navigate = useNavigate();
	const { setBreadcrumbs } = useBreadcrumbs();
	const user = useAuthUser();
	const scope = readerStorageKey(user.id, getDataMode());
	const [preferences, setPreferences] = useState(() =>
		readPreferences(sessionStorage, `${scope}:preferences`),
	);
	const [mobileList, setMobileList] = useState(false);
	const [editing, setEditing] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const pageRef = useRef<HTMLElement>(null);
	const linksButton = useRef<HTMLButtonElement>(null);
	const [stackedLinks, setStackedLinks] = useState(false);
	const linksId = useId();
	const [showLinks, setShowLinks] = useState(true);
	const editButton = useRef<HTMLButtonElement>(null);
	const list = useRef<HTMLElement>(null);
	const documentRef = useRef<HTMLDivElement>(null);
	const focusListSelection = useRef(false);
	const previousArticleId = useRef(articleId);
	const selectedButton = useRef<HTMLButtonElement>(null);
	const channel = state.channels.find((c) => c.id === channelId);
	const article =
		state.article?.channelId === channelId && state.article.id === articleId ? state.article : null;
	const links = useMemo(() => extractArticleLinks(article?.markdown ?? ""), [article?.markdown]);
	const hasLinks = Boolean(article && links.length > 0);
	useEffect(() => {
		const observer = new ResizeObserver(([entry]) =>
			setStackedLinks(entry.contentRect.width <= 560),
		);
		if (pageRef.current) observer.observe(pageRef.current);
		return () => observer.disconnect();
	}, []);
	const matchingList = state.channelId === channelId && state.filterQuery === filterQuery;
	const listLoading = state.loading || !matchingList;
	const emptyList = !listLoading && state.items.length === 0;
	const listKey = `${scope}:list:${channelId}:${filterQuery}`;
	const positionKey = `${scope}:article:${article?.channelId}:${article?.id}`;

	useEffect(() => {
		setBreadcrumbs([
			{ label: "Channels", href: "/channels" },
			...(channel ? [{ label: channel.name }] : []),
		]);
	}, [channel, setBreadcrumbs]);
	useEffect(() => {
		void vm.loadArticles(
			channelId,
			filterQuery,
			false,
			readPosition(sessionStorage, `${listKey}:pages`) || 1,
		);
	}, [vm, channelId, filterQuery, listKey]);
	useEffect(() => {
		if (state !== vm.getState()) return;
		const first = initialArticle(state, channelId, articleId, filterQuery);
		if (first !== undefined)
			void navigate(articlePath(channelId, first, filterQuery), { replace: true });
	}, [vm, state, channelId, articleId, filterQuery, navigate]);
	useEffect(() => {
		void channelId;
		setMobileList(false);
	}, [channelId]);
	useEffect(() => {
		void vm.selectArticle(channelId, articleId);
		setEditing(false);
		setDeleting(false);
		return () => {
			void vm.selectArticle(0, 0);
		};
	}, [vm, channelId, articleId]);
	useLayoutEffect(() => {
		if (
			state.loading ||
			!list.current ||
			state.channelId !== channelId ||
			state.filterQuery !== filterQuery
		)
			return;
		list.current.scrollTop = readPosition(sessionStorage, listKey);
		writeReaderValue(sessionStorage, `${listKey}:pages`, String(state.pageCount));
	}, [
		state.loading,
		state.pageCount,
		state.channelId,
		state.filterQuery,
		channelId,
		filterQuery,
		listKey,
	]);
	useLayoutEffect(() => {
		if (!article || !documentRef.current) return;
		return restoreReadingPosition(
			documentRef.current,
			readPosition(sessionStorage, positionKey),
			(top) => writeReaderValue(sessionStorage, positionKey, String(top)),
		);
	}, [article, positionKey]);
	useLayoutEffect(() => {
		if (
			(previousArticleId.current !== articleId || focusListSelection.current) &&
			state.items.some((item) => item.id === articleId) &&
			(focusListSelection.current || list.current?.contains(document.activeElement))
		) {
			selectedButton.current?.focus({ preventScroll: true });
			selectedButton.current?.scrollIntoView({ block: "nearest" });
			focusListSelection.current = false;
		}
		previousArticleId.current = articleId;
	}, [articleId, state.items]);
	useEffect(() => {
		function keydown(event: KeyboardEvent) {
			if (event.defaultPrevented || editing || deleting || state.busy) return;
			const target = event.target instanceof Element ? event.target : null;
			const blocked = Boolean(
				document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]') ||
					target?.closest(
						'.channel-related-links, .channel-list-filters, input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]',
					),
			);
			const inList = Boolean(list.current?.contains(target));
			const action = readerAction(event, blocked, inList);
			if (!action) return;
			if (action === "next" || action === "previous") {
				if (!matchingList || state.loading) return;
				const next = adjacentArticle(
					state.items.map((item) => item.id),
					articleId,
					action,
				);
				if (next === undefined) return;
				event.preventDefault();
				focusListSelection.current = inList;
				void navigate(articlePath(channelId, next, filterQuery));
			} else if (action === "read") {
				if (!article) return;
				event.preventDefault();
				setMobileList(false);
				documentRef.current?.focus({ preventScroll: true });
			} else {
				event.preventDefault();
				setMobileList(true);
				requestAnimationFrame(() => {
					(selectedButton.current ?? list.current)?.focus({ preventScroll: true });
				});
			}
		}
		window.addEventListener("keydown", keydown);
		return () => window.removeEventListener("keydown", keydown);
	}, [
		article,
		articleId,
		channelId,
		filterQuery,
		navigate,
		matchingList,
		state.loading,
		state.items,
		editing,
		deleting,
		state.busy,
	]);
	function select(id: number) {
		setMobileList(false);
		void navigate(articlePath(channelId, id, filterQuery));
	}
	function changePreferences(next: typeof preferences) {
		setPreferences(next);
		writeReaderValue(sessionStorage, `${scope}:preferences`, JSON.stringify(next));
	}

	const linksPanel = article && hasLinks && (
		<ArticleLinksPanel
			key={`${channelId}/${articleId}`}
			id={linksId}
			article={article}
			links={links}
			open={showLinks}
			onClose={() => {
				setShowLinks(false);
				linksButton.current?.focus({ preventScroll: true });
			}}
		/>
	);

	return (
		<section
			ref={pageRef}
			className="channel-page"
			data-reading={Boolean(articleId && !mobileList)}
		>
			<div className="channel-header">
				<PageHeader
					title={
						<span className="flex items-center gap-2">
							<Radio className="h-5 w-5 shrink-0 text-basalt-muted-foreground" aria-hidden="true" />
							{channel?.name ?? "Channel"}
						</span>
					}
					description={channel?.description || "Published reports, ready to read."}
					actions={
						<>
							<div className="flex items-center gap-2">
								<HeaderTooltip label="Edit article">
									<Button
										variant="outline"
										size="icon"
										className="h-8 w-8"
										aria-label="Edit article"
										disabled={!article || state.articleLoading || state.busy || editing || deleting}
										ref={editButton}
										onClick={() => {
											vm.setState({ error: null });
											setEditing(true);
										}}
									>
										<Pencil aria-hidden="true" className="h-4 w-4" />
									</Button>
								</HeaderTooltip>
								<HeaderTooltip label="Delete article">
									<Button
										variant="outline"
										size="icon"
										className="h-8 w-8 text-basalt-destructive"
										aria-label="Delete article"
										disabled={!article || state.articleLoading || state.busy || editing || deleting}
										onClick={() => {
											vm.setState({ error: null });
											setDeleting(true);
										}}
									>
										<Trash2 aria-hidden="true" className="h-4 w-4" />
									</Button>
								</HeaderTooltip>
							</div>
							{articleId > 0 && !mobileList && (
								<HeaderTooltip label="Back to reports">
									<Button
										variant="outline"
										className="channel-back h-8 w-8"
										size="icon"
										aria-label="Back to reports"
										onClick={() => {
											setMobileList(true);
											requestAnimationFrame(() => selectedButton.current?.focus());
										}}
									>
										<ArrowLeft aria-hidden="true" className="h-4 w-4" />
									</Button>
								</HeaderTooltip>
							)}
							<div className="flex items-center gap-2">
								<fieldset
									className="flex min-w-0 items-center gap-2"
									aria-label="Reading preferences"
								>
									<HeaderTooltip
										label={preferences.sans ? "Use serif font" : "Use sans-serif font"}
									>
										<Button
											variant="outline"
											size="icon"
											className="h-8 w-8 aria-pressed:border-basalt-primary aria-pressed:text-basalt-primary"
											aria-label="Use sans-serif font"
											aria-pressed={preferences.sans}
											onClick={() => changePreferences({ ...preferences, sans: !preferences.sans })}
										>
											<Type aria-hidden="true" className="h-4 w-4" />
										</Button>
									</HeaderTooltip>
									<HeaderTooltip label={`Decrease font size · ${preferences.size}px`}>
										<Button
											variant="outline"
											size="icon"
											className="h-8 w-8"
											aria-label="Decrease font size"
											disabled={preferences.size <= 16}
											onClick={() =>
												changePreferences({ ...preferences, size: preferences.size - 2 })
											}
										>
											<AArrowDown aria-hidden="true" className="h-4 w-4" />
										</Button>
									</HeaderTooltip>
									<HeaderTooltip label={`Increase font size · ${preferences.size}px`}>
										<Button
											variant="outline"
											size="icon"
											className="h-8 w-8"
											aria-label="Increase font size"
											disabled={preferences.size >= 22}
											onClick={() =>
												changePreferences({ ...preferences, size: preferences.size + 2 })
											}
										>
											<AArrowUp aria-hidden="true" className="h-4 w-4" />
										</Button>
									</HeaderTooltip>
									<HeaderTooltip
										label={preferences.fullWidth ? "Use readable width" : "Use full width"}
									>
										<Button
											variant="outline"
											size="icon"
											className="h-8 w-8 aria-pressed:border-basalt-primary aria-pressed:text-basalt-primary"
											aria-label="Use full reading width"
											aria-pressed={preferences.fullWidth}
											onClick={() =>
												changePreferences({ ...preferences, fullWidth: !preferences.fullWidth })
											}
										>
											{preferences.fullWidth ? (
												<Columns2 aria-hidden="true" className="h-4 w-4" />
											) : (
												<Maximize2 aria-hidden="true" className="h-4 w-4" />
											)}
										</Button>
									</HeaderTooltip>
								</fieldset>
								<HeaderTooltip label={`Related links (${links.length})`}>
									<Button
										ref={linksButton}
										variant="outline"
										size="icon"
										className="h-8 w-8"
										aria-label="Related links"
										aria-expanded={hasLinks && showLinks}
										aria-controls={hasLinks ? linksId : undefined}
										disabled={!article || links.length === 0}
										onClick={() => setShowLinks(!showLinks)}
									>
										<Link2 className="h-4 w-4" aria-hidden="true" />
									</Button>
								</HeaderTooltip>
								<HeaderTooltip label="Manage channel">
									<Button variant="outline" size="icon" className="h-8 w-8" asChild>
										<Link to={`/channels/${channelId}/settings`} aria-label="Manage channel">
											<Settings aria-hidden="true" className="h-4 w-4" />
										</Link>
									</Button>
								</HeaderTooltip>
							</div>
						</>
					}
				/>
			</div>
			{state.error && !editing && !deleting && (
				<p role="alert" className="px-3 py-2 text-sm text-basalt-destructive">
					{state.error}
				</p>
			)}

			<div
				className="channel-panes"
				data-reading={Boolean(articleId && !mobileList)}
				data-has-links={hasLinks && !stackedLinks}
			>
				<LayerCard outlined padding="none" className="channel-list-column channel-side-panel">
					<div className="channel-panel-heading">
						<h2 className="inline-flex items-center gap-2 text-sm font-semibold">
							<ListFilter className="h-4 w-4 text-basalt-muted-foreground" aria-hidden="true" />
							Reports
						</h2>
						<Badge
							variant="secondary"
							className="h-6 min-w-7 justify-center border-basalt-border/40 px-2 py-0 tabular-nums text-basalt-muted-foreground"
						>
							{matchingList ? state.items.length : 0}
							{matchingList && state.nextCursor !== null ? "+" : ""}
							<span className="sr-only"> reports loaded</span>
						</Badge>
					</div>
					<ArticleFiltersBar
						key={channelId}
						filterQuery={filterQuery}
						disabled={editing || deleting || state.busy}
						onApply={(next) => {
							setMobileList(true);
							void navigate(articlePath(channelId, 0, next));
						}}
					/>
					<section
						className="channel-list"
						ref={list}
						aria-label="Articles"
						tabIndex={-1}
						onScroll={(e) => {
							if (!state.loading && matchingList)
								writeReaderValue(sessionStorage, listKey, String(e.currentTarget.scrollTop));
						}}
					>
						{(matchingList ? state.items : []).map((item) => (
							<Button
								key={item.id}
								ref={item.id === articleId ? selectedButton : undefined}
								variant="ghost"
								className="channel-list-item"
								disabled={editing || deleting || state.busy}
								aria-current={item.id === articleId ? "true" : undefined}
								onClick={() => select(item.id)}
							>
								<span className="flex w-full min-w-0 flex-col gap-1 text-left">
									<span className="flex items-center gap-1.5 text-xs text-basalt-muted-foreground">
										<CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
										{item.reportDate} · {item.sourceLabel}
									</span>
									<span className="whitespace-normal font-medium">{item.title}</span>
									{item.summary && (
										<span className="line-clamp-2 whitespace-normal text-sm font-normal text-basalt-muted-foreground">
											{item.summary}
										</span>
									)}
								</span>
							</Button>
						))}
						{listLoading ? (
							<p role="status" className="p-3 text-sm">
								Loading reports…
							</p>
						) : (
							state.items.length === 0 && (
								<LayerCard.Empty
									className="channel-empty"
									role="status"
									icon={
										state.error ? (
											<TriangleAlert aria-hidden="true" />
										) : filterQuery ? (
											<SearchX aria-hidden="true" />
										) : (
											<Inbox aria-hidden="true" />
										)
									}
									title={
										state.error
											? "Reports unavailable"
											: filterQuery
												? "No matching reports"
												: "No reports yet"
									}
									description={
										state.error
											? "Please try loading this channel again."
											: filterQuery
												? "Try another keyword, date range, or tag."
												: "New reports will appear here when they arrive."
									}
									action={
										state.error ? (
											<Button
												variant="outline"
												size="sm"
												onClick={() => void vm.loadArticles(channelId, filterQuery)}
											>
												Retry reports
											</Button>
										) : undefined
									}
								/>
							)
						)}
						{matchingList && state.nextCursor !== null && (
							<Button
								variant="ghost"
								disabled={state.loading}
								className="m-2"
								onClick={() => void vm.loadArticles(channelId, filterQuery, true)}
							>
								Load more
							</Button>
						)}
					</section>
				</LayerCard>
				<LayerCard outlined padding="none" className="channel-reading-panel">
					<LayerCard.Well className="channel-detail p-0">
						<div
							ref={documentRef}
							role="document"
							aria-label="Article content"
							tabIndex={-1}
							className="channel-document"
							data-full-width={preferences.fullWidth}
							aria-busy={state.articleLoading}
						>
							{article ? (
								<article
									className={`channel-prose${preferences.sans ? " channel-sans" : ""}`}
									style={{ fontSize: preferences.size }}
								>
									<header className="mb-6 space-y-3 font-sans">
										<h1 className="text-xl font-semibold leading-snug">{article.title}</h1>
										<TagLabels tags={article.tags} />
										<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-basalt-muted-foreground">
											<span className="inline-flex items-center gap-1.5">
												<CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
												{article.reportDate}
											</span>
											<span>
												{article.author ? `${article.author} · ` : ""}
												{article.sourceLabel}
											</span>
										</div>
									</header>
									<ChannelMarkdown markdown={article.markdown} />
								</article>
							) : (
								<LayerCard.Empty
									className="channel-empty"
									role="status"
									icon={
										state.articleLoading || listLoading ? (
											<LoaderCircle aria-hidden="true" className="animate-spin" />
										) : state.error ? (
											<TriangleAlert aria-hidden="true" />
										) : emptyList && filterQuery ? (
											<SearchX aria-hidden="true" />
										) : (
											<BookOpen aria-hidden="true" />
										)
									}
									title={
										state.articleLoading || listLoading
											? "Loading report…"
											: state.error
												? "Report unavailable"
												: emptyList
													? filterQuery
														? "No matching reports"
														: "Ready for your first report"
													: "Select a report"
									}
									description={
										state.articleLoading || listLoading
											? "Fetching the latest content."
											: state.error
												? "Please try loading this report again."
												: emptyList
													? filterQuery
														? "Adjust the filters to find something to read."
														: "Once a report arrives, it opens here for reading."
													: "Choose a report from the list to start reading."
									}
									action={
										state.error && articleId ? (
											<Button
												variant="outline"
												size="sm"
												onClick={() => void vm.selectArticle(channelId, articleId)}
											>
												Retry report
											</Button>
										) : undefined
									}
								/>
							)}
							{stackedLinks && linksPanel}
						</div>
					</LayerCard.Well>
				</LayerCard>
				{!stackedLinks && linksPanel}
			</div>
			{article && (
				<>
					<Dialog
						open={editing}
						onOpenChange={(open) => {
							if (!state.busy) setEditing(open);
						}}
					>
						<DialogContent
							size="xl"
							disablePointerDismissal
							onCloseAutoFocus={(event) => {
								event.preventDefault();
								editButton.current?.focus();
							}}
						>
							<DialogHeader>
								<DialogTitle>Edit article</DialogTitle>
								<DialogDescription>
									Update the report details and Markdown content.
								</DialogDescription>
							</DialogHeader>
							{state.error && (
								<Banner
									role="alert"
									variant="error"
									size="sm"
									className="mt-4"
									description={state.error}
								/>
							)}
							<ArticleEditor
								key={article.id}
								article={article}
								busy={state.busy}
								onCancel={() => setEditing(false)}
								onSave={async (input) => {
									if (await vm.editArticle(channelId, articleId, input)) {
										setEditing(false);
										const refreshed = vm.getState();
										if (
											filterQuery &&
											!refreshed.error &&
											!refreshed.items.some((item) => item.id === articleId)
										) {
											setMobileList(true);
											void navigate(articlePath(channelId, 0, filterQuery), { replace: true });
											requestAnimationFrame(() => list.current?.focus({ preventScroll: true }));
										}
									}
								}}
							/>
						</DialogContent>
					</Dialog>
					<ConfirmDialog
						open={deleting}
						onOpenChange={setDeleting}
						title="Delete article?"
						description={
							<>
								<span>
									Delete “{article.title}”? This permanently removes the article. Its producer can
									submit it again.
								</span>
								{state.error && (
									<span role="alert" className="mt-2 block text-basalt-destructive">
										{state.error}
									</span>
								)}
							</>
						}
						confirmLabel="Delete article"
						variant="destructive"
						loading={state.busy}
						onConfirm={async () => {
							const sourceUrl = window.location.href;
							if (
								(await vm.removeArticle(channelId, articleId)) &&
								window.location.href === sourceUrl
							) {
								setDeleting(false);
								void navigate(articlePath(channelId, 0, filterQuery), { replace: true });
							}
						}}
					/>
				</>
			)}
		</section>
	);
}
