import { Button, Input } from "@nocoo/basalt";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { ArrowLeft, Columns2, Maximize2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ChannelMarkdown } from "@/components/channel-markdown";
import { useChannels } from "@/components/channels-context";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
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
		setMobileList(false);
	}, [vm, channelId, articleId]);
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
	}, [article, articleId, channelId, date, navigate, matchingList, state.loading, state.items]);
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
					title={channel?.name ?? "Channel"}
					description={channel?.description || "Published reports, ready to read."}
					actions={
						<>
							<Input
								type="date"
								aria-label="Report date"
								className="w-auto"
								value={date}
								onChange={(e) =>
									void navigate(articlePath(channelId, articleId || null, e.target.value))
								}
							/>
							<Button variant="outline" asChild>
								<Link to={`/channels/${channelId}/settings`}>Manage channel</Link>
							</Button>
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
							aria-current={item.id === articleId ? "true" : undefined}
							onClick={() => select(item.id)}
						>
							<span className="flex w-full min-w-0 flex-col gap-1 text-left">
								<span className="text-xs text-basalt-muted-foreground">
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
					<fieldset className="channel-reader-controls" aria-label="Reading preferences">
						<Button
							variant="ghost"
							className="channel-back"
							size="icon"
							aria-label="Back to reports"
							onClick={() => {
								setMobileList(true);
								requestAnimationFrame(() => selectedButton.current?.focus());
							}}
						>
							<ArrowLeft aria-hidden="true" className="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							aria-label="Use sans-serif font"
							aria-pressed={preferences.sans}
							onClick={() => changePreferences({ ...preferences, sans: !preferences.sans })}
						>
							{preferences.sans ? "Sans" : "Serif"}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							aria-label="Decrease font size"
							disabled={preferences.size <= 16}
							onClick={() => changePreferences({ ...preferences, size: preferences.size - 2 })}
						>
							A−
						</Button>
						<span className="text-xs text-basalt-muted-foreground">{preferences.size}px</span>
						<Button
							variant="ghost"
							size="sm"
							aria-label="Increase font size"
							disabled={preferences.size >= 22}
							onClick={() => changePreferences({ ...preferences, size: preferences.size + 2 })}
						>
							A+
						</Button>
						<Button
							variant="ghost"
							size="sm"
							aria-label="Use full reading width"
							aria-pressed={preferences.fullWidth}
							title={preferences.fullWidth ? "Use readable width" : "Use full width"}
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
					</fieldset>
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
								<header className="mb-5 font-sans">
									<h1 className="text-xl font-semibold">{article.title}</h1>
									<p className="mt-1 text-xs text-basalt-muted-foreground">
										{article.reportDate} · {article.author ? `${article.author} · ` : ""}
										{article.sourceLabel}
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
