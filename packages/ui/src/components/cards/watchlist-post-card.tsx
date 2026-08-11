import { AlertTriangle, ChevronDown, ChevronUp, Loader2, RotateCw } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { CustomItemCard } from "@/components/cards/custom-item-card";
import { TweetCard } from "@/components/cards/tweet-card";
import type { MockCustomPost, MockPost, MockXPost } from "@/lib/mock-data";

export const WatchlistPostCard = memo(function WatchlistPostCard({
	post,
	watchlistId,
	onRemove,
	onTranslated,
}: {
	post: MockPost;
	watchlistId?: number;
	onRemove?: (postId: number) => void;
	onTranslated?: () => void;
}) {
	if (post.sourceType === "custom") {
		return (
			<CustomTimelineCard
				post={post}
				watchlistId={watchlistId}
				onRemove={onRemove}
				onTranslated={onTranslated}
			/>
		);
	}
	return (
		<XTimelineCard
			post={post}
			watchlistId={watchlistId}
			onRemove={onRemove}
			onTranslated={onTranslated}
		/>
	);
});

const XTimelineCard = memo(function XTimelineCard({
	post,
	watchlistId,
	onRemove,
	onTranslated,
}: {
	post: MockXPost;
	watchlistId?: number;
	onRemove?: (postId: number) => void;
	onTranslated?: () => void;
}) {
	const [translatedText, setTranslatedText] = useState(post.translatedText);
	const [commentText, setCommentText] = useState(post.commentText);
	const [quotedTranslatedText, setQuotedTranslatedText] = useState(post.quotedTranslatedText);
	const [translationError, setTranslationError] = useState(post.translationError);
	const [retrying, setRetrying] = useState(false);
	const [errorExpanded, setErrorExpanded] = useState(false);
	const [retryKey, setRetryKey] = useState(0);

	useEffect(() => {
		if (post.translatedText && !translatedText) {
			setTranslatedText(post.translatedText);
			setCommentText(post.commentText);
			setQuotedTranslatedText(post.quotedTranslatedText);
		}
	}, [post.translatedText, post.commentText, post.quotedTranslatedText, translatedText]);

	useEffect(() => {
		if (post.translationError !== translationError && !retrying) {
			setTranslationError(post.translationError);
		}
	}, [post.translationError, translationError, retrying]);

	const initialTranslation = useMemo(() => {
		if (!translatedText) return undefined;
		return { translatedText, commentText, quotedTranslatedText };
	}, [translatedText, commentText, quotedTranslatedText]);

	const handleRemove = useCallback(() => {
		onRemove?.(post.id);
	}, [onRemove, post.id]);

	const handleRetry = useCallback(async () => {
		if (retrying || watchlistId == null) return;
		setRetrying(true);
		setTranslationError(null);
		try {
			const res = await fetch(`/api/watchlists/${watchlistId}/translate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "same-origin",
				body: JSON.stringify({ item_ids: [post.id], limit: 1 }),
			});
			const json = (await res.json().catch(() => null)) as {
				success?: boolean;
				error?: string;
				data?: {
					results?: Array<{
						id: number;
						ai_status: string;
						error?: string;
						translatedText?: string | null;
						summaryText?: string | null;
					}>;
				};
			} | null;
			if (!res.ok || !json?.success) {
				throw new Error(json?.error || res.statusText || `HTTP ${res.status}`);
			}
			const row = json.data?.results?.find((r) => r.id === post.id) ?? json.data?.results?.[0];
			if (row?.ai_status !== "succeeded" || !row.translatedText) {
				throw new Error(row?.error || "Translation failed — configure AI Settings");
			}
			setTranslatedText(row.translatedText);
			setCommentText(row.summaryText ?? null);
			setQuotedTranslatedText(null);
			setTranslationError(null);
			setRetryKey((k) => k + 1);
			onTranslated?.();
		} catch (e) {
			setTranslationError(e instanceof Error ? e.message : String(e));
		} finally {
			setRetrying(false);
		}
	}, [retrying, watchlistId, post.id, onTranslated]);

	const errorBanner =
		translationError && !translatedText ? (
			<div className="border border-t-0 border-red-200 bg-red-50/80 px-3 py-2 dark:border-red-900/50 dark:bg-red-950/20">
				<div className="flex items-center gap-2">
					<AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500 dark:text-red-400" />
					<span className="flex-1 truncate text-xs text-red-700 dark:text-red-300">
						Translation failed
					</span>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							setErrorExpanded((prev) => !prev);
						}}
						className="shrink-0 rounded p-0.5 text-red-500 transition-colors hover:bg-red-100 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/30 dark:hover:text-red-200"
						title={errorExpanded ? "Hide details" : "Show details"}
					>
						{errorExpanded ? (
							<ChevronUp className="h-3 w-3" />
						) : (
							<ChevronDown className="h-3 w-3" />
						)}
					</button>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							void handleRetry();
						}}
						disabled={retrying || watchlistId == null}
						className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/30"
						title="Retry translation"
					>
						{retrying ? (
							<Loader2 className="h-3 w-3 animate-spin" />
						) : (
							<RotateCw className="h-3 w-3" />
						)}
						Retry
					</button>
				</div>
				{errorExpanded && (
					<p className="mt-1.5 text-[11px] leading-relaxed break-all text-red-600/80 dark:text-red-400/80">
						{translationError}
					</p>
				)}
			</div>
		) : null;

	return (
		<div
			className="animate-in fade-in slide-in-from-top-2 rounded-card shadow-[0_1px_4px_rgba(0,0,0,0.06)] duration-300"
			data-source-type="x.com"
		>
			<TweetCard
				key={retryKey}
				tweet={post.tweet}
				sourceType="x.com"
				linkToDetail={false}
				watchlistId={watchlistId}
				itemId={post.id}
				initialTranslation={initialTranslation}
				renderBeforeActionBar={errorBanner}
				onRemove={onRemove ? handleRemove : undefined}
				onTranslated={onTranslated}
			/>
		</div>
	);
});

const CustomTimelineCard = memo(function CustomTimelineCard({
	post,
	watchlistId,
	onRemove,
	onTranslated,
}: {
	post: MockCustomPost;
	watchlistId?: number;
	onRemove?: (postId: number) => void;
	onTranslated?: () => void;
}) {
	return (
		<div
			className="animate-in fade-in slide-in-from-top-2 rounded-card shadow-[0_1px_4px_rgba(0,0,0,0.06)] duration-300"
			data-source-type="custom"
		>
			<CustomItemCard
				sourceType="custom"
				title={post.title}
				body={post.body}
				createdAt={post.createdAt}
				url={post.url}
				authorName={post.authorName}
				producer={post.producer}
				watchlistId={watchlistId}
				itemId={post.id}
				initialTranslation={
					post.translatedText
						? { translatedText: post.translatedText, summaryText: post.commentText }
						: undefined
				}
				onRemove={onRemove ? () => onRemove(post.id) : undefined}
				onTranslated={onTranslated}
			/>
		</div>
	);
});
