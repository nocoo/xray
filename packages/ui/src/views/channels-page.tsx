import { Button } from "@nocoo/basalt";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { TagBadge } from "@nocoo/basalt/components/tag-badge";
import {
	AArrowDown,
	AArrowUp,
	ArrowLeft,
	CalendarDays,
	Columns2,
	Maximize2,
	Pencil,
	Radio,
	Settings,
	Trash2,
	Type,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ArticleEditor } from "@/components/article-editor";
import { ChannelMarkdown } from "@/components/channel-markdown";
import { useChannels } from "@/components/channels-context";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { HeaderTooltip } from "@/components/layout/header-links";
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
	const date = query.get("date") || "";
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
	const list = useRef<HTMLElement>(null);
	const documentRef = useRef<HTMLDivElement>(null);
	const focusListSelection = useRef(false);
	const previousArticleId = useRef(articleId);
	const selectedButton = useRef<HTMLButtonElement>(null);
	const channel = state.channels.find((c) => c.id === channelId);
	const article =
		state.article?.channelId === channelId && state.article.id === articleId ? state.article : null;
	const matchingList = state.channelId === channelId && state.date === date;
	const listKey = `${scope}:list:${channelId}:${date}`;
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
			date,
			false,
			readPosition(sessionStorage, `${listKey}:pages`) || 1,
		);
	}, [vm, channelId, date, listKey]);
	useEffect(() => {
		if (state !== vm.getState()) return;
		const first = initialArticle(state, channelId, articleId, date);
		if (first !== undefined) void navigate(articlePath(channelId, first, date), { replace: true });
	}, [vm, state, channelId, articleId, date, navigate]);
	useEffect(() => {
		void vm.selectArticle(channelId, articleId);
		setEditing(false);
		setDeleting(false);
		setMobileList(false);
		return () => {
			void vm.selectArticle(0, 0);
		};
	}, [vm, channelId, articleId]);
	useLayoutEffect(() => {
		if ((editing || deleting) && documentRef.current) documentRef.current.scrollTop = 0;
	}, [editing, deleting]);
	useLayoutEffect(() => {
		if (state.loading || !list.current || state.channelId !== channelId || state.date !== date)
			return;
		list.current.scrollTop = readPosition(sessionStorage, listKey);
		writeReaderValue(sessionStorage, `${listKey}:pages`, String(state.pageCount));
	}, [state.loading, state.pageCount, state.channelId, state.date, channelId, date, listKey]);
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
						'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]',
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
				void navigate(articlePath(channelId, next, date));
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
		date,
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
		void navigate(articlePath(channelId, id, date));
	}
	function changePreferences(next: typeof preferences) {
		setPreferences(next);
		writeReaderValue(sessionStorage, `${scope}:preferences`, JSON.stringify(next));
	}

	return (
		<section className="channel-page" data-reading={Boolean(articleId && !mobileList)}>
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
							{channel && channel.tags.length > 0 && (
								<div className="flex max-w-xs flex-wrap justify-end gap-1">
									{channel.tags.map((tag) => (
										<TagBadge key={tag.id} name={tag.name} size="sm" />
									))}
								</div>
							)}
							<div className="flex items-center gap-2">
								<HeaderTooltip label="Edit article">
									<Button
										variant="outline"
										size="icon"
										className="h-8 w-8"
										aria-label="Edit article"
										disabled={!article || state.articleLoading || state.busy || editing || deleting}
										onClick={() => setEditing(true)}
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
										onClick={() => setDeleting(true)}
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
			{state.error && (
				<p role="alert" className="px-3 py-2 text-sm text-basalt-destructive">
					{state.error}
				</p>
			)}

			<div className="channel-panes" data-reading={Boolean(articleId && !mobileList)}>
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
					{state.loading || !matchingList ? (
						<p role="status" className="p-3 text-sm">
							Loading reports…
						</p>
					) : (
						state.items.length === 0 && (
							<p className="p-3 text-sm text-basalt-muted-foreground">No reports for this date.</p>
						)
					)}
					{matchingList && state.nextCursor !== null && (
						<Button
							variant="ghost"
							disabled={state.loading}
							className="m-2"
							onClick={() => void vm.loadArticles(channelId, date, true)}
						>
							Load more
						</Button>
					)}
				</section>
				<div className="channel-detail">
					<div
						ref={documentRef}
						role="document"
						aria-label="Article content"
						tabIndex={-1}
						className="channel-document"
						data-full-width={preferences.fullWidth}
						aria-busy={state.articleLoading}
					>
						{article && deleting && (
							<section
								aria-label="Confirm article deletion"
								className="m-4 rounded-lg border border-basalt-border bg-basalt-secondary p-4 font-sans text-sm"
							>
								<h2 className="font-semibold">Delete “{article.title}”?</h2>
								<p className="mt-1 text-basalt-muted-foreground">
									This permanently removes the article. Its producer can submit it again.
								</p>
								<div className="mt-3 flex justify-end gap-2">
									<Button
										variant="outline"
										size="sm"
										disabled={state.busy}
										onClick={() => setDeleting(false)}
									>
										Cancel
									</Button>
									<Button
										variant="destructive"
										size="sm"
										disabled={state.busy}
										onClick={async () => {
											const sourceUrl = window.location.href;
											if (
												(await vm.removeArticle(channelId, articleId)) &&
												window.location.href === sourceUrl
											) {
												setDeleting(false);
												void navigate(articlePath(channelId, 0, date), { replace: true });
											}
										}}
									>
										Confirm delete
									</Button>
								</div>
							</section>
						)}
						{article && editing ? (
							<ArticleEditor
								key={article.id}
								article={article}
								busy={state.busy}
								onCancel={() => setEditing(false)}
								onSave={async (input) => {
									if (await vm.editArticle(channelId, articleId, input)) setEditing(false);
								}}
							/>
						) : article ? (
							<article
								className={`channel-prose${preferences.sans ? " channel-sans" : ""}`}
								style={{ fontSize: preferences.size }}
							>
								<header className="mb-5 font-sans">
									<h1 className="text-xl font-semibold">{article.title}</h1>
									<p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-basalt-muted-foreground">
										<span className="inline-flex items-center gap-1.5">
											<CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
											{article.reportDate}
										</span>
										<span>
											{article.author ? `${article.author} · ` : ""}
											{article.sourceLabel}
										</span>
									</p>
								</header>
								<ChannelMarkdown markdown={article.markdown} />
							</article>
						) : (
							<p className="p-4 text-sm text-basalt-muted-foreground">
								{state.articleLoading ? "Loading report…" : "Select a report to start reading."}
							</p>
						)}
					</div>
				</div>
			</div>
		</section>
	);
}
