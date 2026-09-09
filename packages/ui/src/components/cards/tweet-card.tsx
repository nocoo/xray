/** Tweet card — layout ported from legacy/v1 (avatar, metrics, translate bar, AI insight). */

import {
	Badge,
	Button,
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
	LayerCard,
} from "@nocoo/basalt";
import type { SourceType } from "@xray/shared";
import {
	ArrowLeftRight,
	AtSign,
	Bookmark,
	Check,
	ChevronLeft,
	ChevronRight,
	ExternalLink,
	Eye,
	Hash,
	Heart,
	Image as ImageIcon,
	Languages,
	LinkIcon,
	MessageCircle,
	MessageSquareQuote,
	Play,
	Quote,
	Repeat2,
	Search,
	Trash2,
	X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExpandableText } from "@/components/expandable-text";
import { XVerified } from "@/components/icons/x-verified";
import { SourceChip } from "@/components/source-chip";
import { useNow } from "@/hooks/use-now";
import { POST_TEXT_CLAMP_LINES, QUOTED_TEXT_CLAMP_LINES } from "@/lib/expandable-text";
import { readTranslateRow } from "@/lib/translate-result";
import type { Tweet, TweetMedia } from "@/lib/tweet-types";
import { cn, formatCount, formatTimeAgo } from "@/lib/utils";

// External Twitter media/avatars use plain <img>/<video> via /api/media/proxy
// (twimg CDN hotlink protection).

// =============================================================================
// TweetCard — reusable tweet display component
// =============================================================================

export interface TweetCardProps {
	tweet: Tweet;
	/** Canonical source_type — always x.com for this card shell. */
	sourceType?: Extract<SourceType, "x.com">;
	linkToDetail?: boolean;
	className?: string;
	/** Hide the bottom action bar (e.g. when a parent component provides its own) */
	showActionBar?: boolean;
	/** Pre-populated translation from parent (e.g. SSE-synced watchlist) */
	initialTranslation?: {
		translatedText: string;
		commentText?: string | null;
		quotedTranslatedText?: string | null;
	};
	/** Slot rendered between card body and action bar (e.g. AI Insight) */
	renderBeforeActionBar?: React.ReactNode;
	/** Called when the user clicks "Remove" — parent should delete + unmount this card */
	onRemove?: () => void;
	/**
	 * Real translate: parent provides watchlist + item so we hit
	 * POST /api/watchlists/:id/translate { item_ids: [itemId] }.
	 * Without these, Translate shows an error (no mock).
	 */
	watchlistId?: number;
	itemId?: number;
	/** After successful translate — parent should patch item in place (no full-page reload). */
	onTranslated?: (result: { translatedText: string; summaryText?: string | null }) => void;
}

export const TweetCard = memo(function TweetCard({
	tweet,
	sourceType = "x.com",
	linkToDetail = true,
	className,
	showActionBar = true,
	initialTranslation,
	renderBeforeActionBar,
	onRemove,
	watchlistId,
	itemId,
	onTranslated,
}: TweetCardProps) {
	void linkToDetail;
	const nowMs = useNow();
	const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
	const lightboxOpenerRef = useRef<HTMLElement | null>(null);

	const openLightbox = useCallback((urls: string[], index: number, opener: HTMLElement) => {
		lightboxOpenerRef.current = opener;
		setLightbox({ urls, index });
	}, []);

	// --- Translation state ---
	const [lang, setLang] = useState<"zh" | "en">(initialTranslation?.translatedText ? "zh" : "en");
	const [translatedText, setTranslatedText] = useState(initialTranslation?.translatedText ?? null);
	const [commentText, setCommentText] = useState(initialTranslation?.commentText ?? null);
	const [quotedTranslatedText, setQuotedTranslatedText] = useState(
		initialTranslation?.quotedTranslatedText ?? null,
	);
	const [translating, setTranslating] = useState(false);
	const [translateError, setTranslateError] = useState<string | null>(null);

	// --- zhe.to state ---
	const [zhetoStatus, setZhetoStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

	// Sync when parent reloads item (batch translate / SSE)
	useEffect(() => {
		if (initialTranslation?.translatedText) {
			setTranslatedText(initialTranslation.translatedText);
			setCommentText(initialTranslation.commentText ?? null);
			setQuotedTranslatedText(initialTranslation.quotedTranslatedText ?? null);
			setLang("zh");
			setTranslateError(null);
		}
	}, [
		initialTranslation?.translatedText,
		initialTranslation?.commentText,
		initialTranslation?.quotedTranslatedText,
	]);

	const hasTranslation = !!translatedText;

	// Build the tweet object with translated text swapped in
	const displayTweet = useMemo(() => {
		if (lang !== "zh" || !hasTranslation) return tweet;
		const t = { ...tweet, text: translatedText ?? tweet.text };
		if (t.quoted_tweet && quotedTranslatedText) {
			t.quoted_tweet = { ...t.quoted_tweet, text: quotedTranslatedText };
		}
		return t;
	}, [lang, hasTranslation, tweet, translatedText, quotedTranslatedText]);

	const handleTranslate = useCallback(async () => {
		if (translating) return;
		if (watchlistId == null || itemId == null) {
			setTranslateError("Translate requires watchlist context (open item from a watchlist).");
			return;
		}
		setTranslating(true);
		setTranslateError(null);
		try {
			const res = await fetch(`/api/watchlists/${watchlistId}/translate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "same-origin",
				body: JSON.stringify({ item_ids: [itemId], limit: 1 }),
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
			const row = json.data?.results?.find((r) => r.id === itemId) ?? json.data?.results?.[0];
			const parsed = readTranslateRow(row);
			if (parsed.status === "pending") return;
			if (parsed.status === "failed") {
				throw new Error(parsed.error);
			}
			setTranslatedText(parsed.translatedText);
			setCommentText(parsed.summaryText);
			setQuotedTranslatedText(null);
			setLang("zh");
			onTranslated?.({
				translatedText: parsed.translatedText,
				summaryText: parsed.summaryText,
			});
		} catch (e) {
			setTranslateError(e instanceof Error ? e.message : String(e));
		} finally {
			setTranslating(false);
		}
	}, [translating, watchlistId, itemId, onTranslated]);

	const handleSaveToZheto = useCallback(async () => {
		if (zhetoStatus === "saving" || zhetoStatus === "saved") return;
		setZhetoStatus("saving");
		try {
			const note = `@${tweet.author.username}: ${tweet.text.slice(0, 200)}`;
			const res = await fetch("/api/integrations/zheto/save", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: tweet.url, note }),
			});
			const json = await res.json().catch(() => null);
			if (res.ok && json?.success) {
				setZhetoStatus("saved");
			} else {
				setZhetoStatus("error");
				setTimeout(() => setZhetoStatus("idle"), 3000);
			}
		} catch {
			setZhetoStatus("error");
			setTimeout(() => setZhetoStatus("idle"), 3000);
		}
	}, [zhetoStatus, tweet.url, tweet.author.username, tweet.text]);

	const body = (
		<LayerCard.Body className="relative flex flex-col gap-3">
			<div className="absolute top-4 right-4 flex items-center gap-1">
				<SourceChip sourceType={sourceType} />
			</div>

			{(tweet.is_retweet || tweet.is_reply || tweet.is_quote) && (
				<div
					className="flex items-center gap-1.5 pr-14 text-xs font-medium text-muted-foreground"
					data-testid="tweet-context"
				>
					{tweet.is_retweet && (
						<>
							<Repeat2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
							{tweet.retweeted_by ? (
								<span>
									<a
										href={`https://x.com/${tweet.retweeted_by}`}
										target="_blank"
										rel="noopener noreferrer"
										className="hover:underline"
									>
										@{tweet.retweeted_by}
									</a>{" "}
									reposted
								</span>
							) : (
								<span>Reposted</span>
							)}
						</>
					)}
					{tweet.is_reply && (
						<>
							<MessageCircle className="h-3.5 w-3.5" aria-hidden />
							<span>Replying</span>
						</>
					)}
					{tweet.is_quote && (
						<>
							<Quote className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden />
							<span>
								{tweet.quoted_tweet?.author.username
									? `Quoting @${tweet.quoted_tweet.author.username}`
									: "Quoted a post"}
							</span>
						</>
					)}
				</div>
			)}

			{/* Author row */}
			<div className="flex items-start gap-3">
				{tweet.author.profile_image_url ? (
					<a
						href={`https://x.com/${tweet.author.username}`}
						target="_blank"
						rel="noopener noreferrer"
						onClick={(e) => e.stopPropagation()}
					>
						<img
							src={tweet.author.profile_image_url}
							alt={tweet.author.name}
							className="h-10 w-10 shrink-0 rounded-full transition-opacity hover:opacity-80"
						/>
					</a>
				) : (
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
						{tweet.author.name[0]}
					</div>
				)}
				<div className="min-w-0 flex-1 pr-12">
					<div className="flex flex-col">
						<div className="flex items-center gap-1.5">
							<a
								href={`https://x.com/${tweet.author.username}`}
								target="_blank"
								rel="noopener noreferrer"
								className="truncate font-medium hover:underline"
								onClick={(e) => e.stopPropagation()}
							>
								{tweet.author.name}
							</a>
							{tweet.author.is_verified && <XVerified className="h-4 w-4" />}
						</div>
						<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
							<a
								href={`https://x.com/${tweet.author.username}`}
								target="_blank"
								rel="noopener noreferrer"
								className="truncate hover:underline"
								onClick={(e) => e.stopPropagation()}
							>
								@{tweet.author.username}
							</a>
							<span>·</span>
							<span className="shrink-0">{formatTimeAgo(tweet.created_at, "compact", nowMs)}</span>
						</div>
					</div>
				</div>
			</div>

			<ExpandableText
				key={displayTweet.text}
				lines={POST_TEXT_CLAMP_LINES}
				className="text-sm leading-relaxed whitespace-pre-wrap"
			>
				{linkifyText(displayTweet.text)}
			</ExpandableText>

			{tweet.media && tweet.media.length > 0 && (
				<MediaGrid media={tweet.media} onPhotoClick={openLightbox} />
			)}

			{tweet.entities &&
				(tweet.entities.hashtags.length > 0 || tweet.entities.mentioned_users.length > 0) && (
					<div className="flex flex-wrap gap-1.5">
						{tweet.entities.hashtags.map((tag) => (
							<Badge key={tag} variant="secondary" className="h-5 text-[10px]">
								<Hash className="mr-0.5 h-2.5 w-2.5" />
								{tag}
							</Badge>
						))}
						{tweet.entities.mentioned_users.map((user) => (
							<Badge key={user} variant="secondary" className="h-5 text-[10px]">
								<AtSign className="mr-0.5 h-2.5 w-2.5" />
								{user}
							</Badge>
						))}
					</div>
				)}

			{tweet.quoted_tweet && (
				<div
					data-testid="quoted-embed"
					className="relative overflow-hidden rounded-xl ring-1 ring-basalt-border/30"
				>
					<Quote
						className="pointer-events-none absolute right-1 bottom-0 h-14 w-14 text-basalt-foreground/[0.08]"
						aria-hidden
					/>
					<div className="relative flex flex-col gap-3 p-3 pr-10">
						<div className="flex items-center gap-2">
							<a
								href={`https://x.com/${tweet.quoted_tweet.author.username}`}
								target="_blank"
								rel="noopener noreferrer"
								className="flex min-w-0 items-center gap-2 hover:opacity-80"
								onClick={(e) => e.stopPropagation()}
							>
								{tweet.quoted_tweet.author.profile_image_url ? (
									<img
										src={tweet.quoted_tweet.author.profile_image_url}
										alt=""
										className="h-5 w-5 shrink-0 rounded-full"
									/>
								) : (
									<div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
										{tweet.quoted_tweet.author.name[0]}
									</div>
								)}
								<span className="truncate text-xs font-medium">
									{tweet.quoted_tweet.author.name}
								</span>
							</a>
							{tweet.quoted_tweet.author.is_verified && <XVerified className="h-3.5 w-3.5" />}
							<a
								href={`https://x.com/${tweet.quoted_tweet.author.username}`}
								target="_blank"
								rel="noopener noreferrer"
								className="truncate text-xs text-muted-foreground hover:underline"
								onClick={(e) => e.stopPropagation()}
							>
								@{tweet.quoted_tweet.author.username}
							</a>
							{tweet.quoted_tweet.created_at ? (
								<>
									<span className="text-xs text-muted-foreground">·</span>
									<span className="shrink-0 text-xs text-muted-foreground">
										{formatTimeAgo(tweet.quoted_tweet.created_at, "compact", nowMs)}
									</span>
								</>
							) : null}
							<a
								href={tweet.quoted_tweet.url}
								target="_blank"
								rel="noopener noreferrer"
								className="ml-auto rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								title="Open quoted post on X"
								onClick={(e) => e.stopPropagation()}
							>
								<ExternalLink className="h-3 w-3" aria-hidden />
							</a>
						</div>

						<ExpandableText
							key={displayTweet.quoted_tweet?.text ?? tweet.quoted_tweet.text}
							lines={QUOTED_TEXT_CLAMP_LINES}
							className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90"
						>
							{linkifyText(displayTweet.quoted_tweet?.text ?? tweet.quoted_tweet.text)}
						</ExpandableText>

						{tweet.quoted_tweet.media && tweet.quoted_tweet.media.length > 0 && (
							<MediaGrid media={tweet.quoted_tweet.media} compact onPhotoClick={openLightbox} />
						)}

						<div className="flex items-center gap-3 text-[10px] text-muted-foreground">
							<span className="flex items-center gap-0.5">
								<Heart className="h-3 w-3" /> {formatCount(tweet.quoted_tweet.metrics.like_count)}
							</span>
							<span className="flex items-center gap-0.5">
								<Repeat2 className="h-3 w-3" />{" "}
								{formatCount(tweet.quoted_tweet.metrics.retweet_count)}
							</span>
							<span className="flex items-center gap-0.5">
								<Eye className="h-3 w-3" /> {formatCount(tweet.quoted_tweet.metrics.view_count)}
							</span>
						</div>
					</div>
				</div>
			)}
		</LayerCard.Body>
	);

	const metricRow = (
		<div
			className="flex h-8 items-center gap-1 overflow-hidden text-xs text-muted-foreground"
			style={{
				maskImage: "linear-gradient(to right, black 80%, transparent 100%)",
				WebkitMaskImage: "linear-gradient(to right, black 80%, transparent 100%)",
			}}
		>
			<MetricItem
				icon={<MessageCircle className="h-3.5 w-3.5" />}
				value={tweet.metrics.reply_count}
			/>
			<MetricItem icon={<Repeat2 className="h-3.5 w-3.5" />} value={tweet.metrics.retweet_count} />
			<MetricItem icon={<Quote className="h-3.5 w-3.5" />} value={tweet.metrics.quote_count} />
			<MetricItem icon={<Heart className="h-3.5 w-3.5" />} value={tweet.metrics.like_count} />
			<MetricItem icon={<Eye className="h-3.5 w-3.5" />} value={tweet.metrics.view_count} />
			<MetricItem
				icon={<Bookmark className="h-3.5 w-3.5" />}
				value={tweet.metrics.bookmark_count}
			/>
		</div>
	);

	const actionBar = showActionBar ? (
		<LayerCard.Footer className="flex-col items-stretch justify-start gap-0 px-2 py-1">
			{metricRow}
			<div className="flex h-8 items-center gap-1">
				<a
					href={tweet.url}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
					onClick={(e) => e.stopPropagation()}
				>
					<ExternalLink className="h-3.5 w-3.5" />
					Open
				</a>

				{/* Translate / Toggle language */}
				{hasTranslation ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							setLang((l) => (l === "zh" ? "en" : "zh"));
						}}
						className={cn(
							"h-8 px-2 text-xs font-medium",
							lang === "zh"
								? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
								: "text-muted-foreground",
						)}
						title={lang === "zh" ? "Show original" : "Show translation"}
					>
						<ArrowLeftRight className="h-3.5 w-3.5" />
						{lang === "zh" ? "中文" : "EN"}
					</Button>
				) : (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							void handleTranslate();
						}}
						loading={translating}
						icon={<Languages className="h-3.5 w-3.5" />}
						className="h-8 px-2 text-xs text-muted-foreground"
						title="Translate this post"
					>
						{translating ? "Translating..." : "Translate"}
					</Button>
				)}

				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={(e) => {
						e.stopPropagation();
						e.preventDefault();
						void handleSaveToZheto();
					}}
					loading={zhetoStatus === "saving"}
					disabled={zhetoStatus === "saved"}
					icon={
						zhetoStatus === "saved" ? (
							<Check className="h-3.5 w-3.5" />
						) : (
							<LinkIcon className="h-3.5 w-3.5" />
						)
					}
					className={cn(
						"h-8 px-2 text-xs font-medium",
						zhetoStatus === "saved"
							? "text-emerald-600 dark:text-emerald-400"
							: zhetoStatus === "error"
								? "text-red-500 dark:text-red-400"
								: "text-muted-foreground",
					)}
					title="Save to zhe.to"
				>
					{zhetoStatus === "saving"
						? "Saving..."
						: zhetoStatus === "saved"
							? "Saved"
							: zhetoStatus === "error"
								? "Failed"
								: "zhe.to"}
				</Button>

				{onRemove && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							onRemove();
						}}
						className="ml-auto h-8 px-2 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
						title="Remove this post"
					>
						<Trash2 className="h-3.5 w-3.5" />
						Remove
					</Button>
				)}
			</div>
		</LayerCard.Footer>
	) : null;

	// AI Insight — shown when viewing translated text and commentText exists
	const showComment = lang === "zh" && !!commentText;
	const aiInsight = showComment ? (
		<LayerCard.Well className="relative bg-gradient-to-r from-violet-50/80 via-fuchsia-50/50 to-amber-50/40 px-4 py-2.5 dark:from-violet-950/30 dark:via-fuchsia-950/20 dark:to-amber-950/10">
			<div className="flex gap-2">
				<MessageSquareQuote className="h-3.5 w-3.5 mt-0.5 shrink-0 text-violet-500 dark:text-violet-400" />
				<div className="flex-1 min-w-0">
					<span className="text-[10px] font-semibold uppercase tracking-wider text-violet-600/80 dark:text-violet-400/80">
						AI Insight
					</span>
					<p className="mt-0.5 text-sm text-foreground/80 leading-relaxed">{commentText}</p>
				</div>
			</div>
		</LayerCard.Well>
	) : null;

	const errorBanner =
		translateError && !hasTranslation ? (
			<div className="border-t border-basalt-destructive/30 bg-basalt-danger-tint px-4 py-2">
				<p className="break-all text-xs text-basalt-danger">{translateError}</p>
			</div>
		) : null;

	return (
		<>
			<LayerCard outlined className={cn("relative animate-fade-up", className)}>
				{body}
				{renderBeforeActionBar}
				{errorBanner}
				{aiInsight}
				{actionBar}
			</LayerCard>
			<ImageLightbox
				urls={lightbox?.urls ?? []}
				index={lightbox?.index ?? 0}
				open={lightbox != null}
				onClose={() => setLightbox(null)}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					lightboxOpenerRef.current?.focus();
				}}
			/>
		</>
	);
});

// =============================================================================
// Media proxy helper — routes Twitter video/GIF URLs through our server-side
// proxy to avoid 403 from Twitter CDN's Referer-based hotlink protection
// =============================================================================

const TWIMG_HOSTS = new Set(["video.twimg.com", "pbs.twimg.com", "abs.twimg.com"]);

/** Route Twitter CDN media through worker proxy (Referer hotlink protection). */
function proxyUrl(url: string): string {
	try {
		const host = new URL(url).hostname.toLowerCase();
		if (TWIMG_HOSTS.has(host)) {
			return `/api/media/proxy?url=${encodeURIComponent(url)}`;
		}
	} catch {
		return url;
	}
	return url;
}

// =============================================================================
// Helpers
// =============================================================================

// URL regex — matches http(s) URLs in tweet text.
// Captures common URL characters including path, query, and fragment.
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

/** Turn URLs in text into clickable <a> links, keep everything else as text. */
function linkifyText(text: string): React.ReactNode {
	const parts: React.ReactNode[] = [];
	let lastIdx = 0;
	let key = 0;

	for (const match of text.matchAll(URL_RE)) {
		const url = match[0];
		const start = match.index;

		// Text before this URL
		if (start > lastIdx) {
			parts.push(text.slice(lastIdx, start));
		}

		parts.push(
			<a
				key={key++}
				href={url}
				target="_blank"
				rel="noopener noreferrer"
				className="text-blue-500 hover:underline dark:text-blue-400"
				onClick={(e) => e.stopPropagation()}
			>
				{url}
			</a>,
		);

		lastIdx = start + url.length;
	}

	// Remaining text after the last URL
	if (lastIdx < text.length) {
		parts.push(text.slice(lastIdx));
	}

	// If no URLs found, return the original string (no wrapper needed)
	return parts.length === 0 ? text : parts;
}

function MetricItem({ icon, value }: { icon: React.ReactNode; value: number }) {
	return (
		<div className="inline-flex h-8 shrink-0 items-center gap-1.5 px-2">
			{icon}
			<span className="font-display">{formatCount(value)}</span>
		</div>
	);
}

// =============================================================================
// MediaGrid — smart layout based on photo count (1/2/3/4 grid, 5+ scroll)
// Video/GIF always fall back to horizontal scroll.
// =============================================================================

// Safe indexed access — length is pre-validated before each call site
function at<T>(arr: T[], i: number): T {
	return arr[i] as T;
}

function MediaGrid({
	media,
	compact = false,
	onPhotoClick,
}: {
	media: TweetMedia[];
	compact?: boolean;
	onPhotoClick?: (urls: string[], index: number, opener: HTMLElement) => void;
}) {
	const photos = media.filter((m) => m.type === "PHOTO");
	const allPhotos = photos.length === media.length;
	const photoUrls = photos.map((m) => proxyUrl(m.url));
	const handlePhotoClick = onPhotoClick
		? (url: string, opener: HTMLElement) => {
				const index = photoUrls.indexOf(url);
				onPhotoClick(photoUrls, index < 0 ? 0 : index, opener);
			}
		: undefined;
	const gridHeight = compact ? "h-44" : "h-60";
	const roundedClass = compact ? "rounded-md" : "rounded-lg";

	// Only pure-photo sets with 2-4 items get grid layout
	if (allPhotos && media.length >= 2 && media.length <= 4) {
		return (
			<div className={`${gridHeight} ${roundedClass} overflow-hidden`}>
				{media.length === 2 && (
					<div className="grid grid-cols-2 gap-1 h-full">
						{media.map((m) => (
							<PhotoItem
								key={m.id}
								media={m}
								className="w-full h-full object-cover"
								onClick={handlePhotoClick}
							/>
						))}
					</div>
				)}

				{media.length === 3 && (
					<div className="grid grid-cols-2 grid-rows-2 gap-1 h-full">
						<PhotoItem
							key={at(media, 0).id}
							media={at(media, 0)}
							className="w-full h-full object-cover"
							containerClass="row-span-2 h-full min-h-0"
							onClick={handlePhotoClick}
						/>
						<PhotoItem
							key={at(media, 1).id}
							media={at(media, 1)}
							className="w-full h-full object-cover"
							containerClass="h-full min-h-0"
							onClick={handlePhotoClick}
						/>
						<PhotoItem
							key={at(media, 2).id}
							media={at(media, 2)}
							className="w-full h-full object-cover"
							containerClass="h-full min-h-0"
							onClick={handlePhotoClick}
						/>
					</div>
				)}

				{media.length === 4 && (
					<div className="grid grid-cols-2 grid-rows-2 gap-1 h-full">
						{media.map((m) => (
							<PhotoItem
								key={m.id}
								media={m}
								className="w-full h-full object-cover"
								onClick={handlePhotoClick}
							/>
						))}
					</div>
				)}
			</div>
		);
	}

	// 1 image (full-width) or 5+ images (horizontal scroll) or mixed media types
	if (allPhotos && media.length === 1) {
		return (
			<div className={`overflow-hidden ${roundedClass} bg-muted`}>
				<PhotoItem
					media={at(media, 0)}
					className={`w-full ${roundedClass}`}
					onClick={handlePhotoClick}
				/>
			</div>
		);
	}

	// Single video/GIF → full-width
	if (media.length === 1 && (at(media, 0).type === "VIDEO" || at(media, 0).type === "GIF")) {
		const m = at(media, 0);
		return (
			<div className={`overflow-hidden ${roundedClass} bg-muted`}>
				<VideoMedia media={m} className={`w-full ${roundedClass}`} />
			</div>
		);
	}

	// 5+ photos or mixed media → horizontal scroll
	const scrollMediaClass = compact
		? "h-28 w-auto max-w-[200px] object-cover"
		: "h-40 w-auto max-w-[280px] object-cover";

	return (
		<div className={compact ? "flex gap-1.5 overflow-x-auto" : "flex gap-2 overflow-x-auto"}>
			{media.map((m) => {
				const containerClass = `relative shrink-0 overflow-hidden ${roundedClass} bg-muted`;

				if (m.type === "PHOTO") {
					return (
						<PhotoItem
							key={m.id}
							media={m}
							className={scrollMediaClass}
							containerClass={containerClass}
							onClick={handlePhotoClick}
						/>
					);
				}

				if (m.type === "GIF" || m.type === "VIDEO") {
					return (
						<div key={m.id} className={containerClass}>
							<VideoMedia media={m} className={scrollMediaClass} />
						</div>
					);
				}

				return (
					<div key={m.id} className={`relative shrink-0 overflow-hidden ${roundedClass} bg-muted`}>
						<div className="flex h-40 w-40 items-center justify-center">
							<ImageIcon className="h-8 w-8 text-muted-foreground" />
							<span className="ml-1 text-xs text-muted-foreground">{m.type}</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}

// =============================================================================
// VideoMedia — X.com-like poster frame before play
// twitter-cli drops GraphQL media_url_https (the real thumb). When we lack
// thumbnail_url, capture the first decoded frame via canvas (same-origin proxy).
// =============================================================================

function VideoMedia({ media, className }: { media: TweetMedia; className: string }) {
	const isGif = media.type === "GIF";
	const src = proxyUrl(media.url);
	const givenPoster = media.thumbnail_url ? proxyUrl(media.thumbnail_url) : undefined;
	const videoRef = useRef<HTMLVideoElement>(null);
	const [capturedPoster, setCapturedPoster] = useState<string | undefined>(undefined);
	const [playing, setPlaying] = useState(isGif);
	const poster = givenPoster ?? capturedPoster;

	// Capture a still from the proxied mp4 when API/CLI gave no preview image.
	// media.url kept so swapping the clip re-runs capture (element instance is reused).
	// biome-ignore lint/correctness/useExhaustiveDependencies: media.url is the intentional identity key
	useEffect(() => {
		if (isGif || givenPoster) return;
		const v = videoRef.current;
		if (!v) return;
		let cancelled = false;
		setCapturedPoster(undefined);

		const snap = () => {
			if (cancelled || !v.videoWidth || !v.videoHeight) return;
			try {
				// Downscale large sources (4K) so N cards don't keep full-res base64 posters.
				const maxEdge = 720;
				const scale = Math.min(1, maxEdge / Math.max(v.videoWidth, v.videoHeight));
				const w = Math.max(1, Math.round(v.videoWidth * scale));
				const h = Math.max(1, Math.round(v.videoHeight * scale));
				const canvas = document.createElement("canvas");
				canvas.width = w;
				canvas.height = h;
				const ctx = canvas.getContext("2d");
				if (!ctx) return;
				ctx.drawImage(v, 0, 0, w, h);
				const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
				if (!cancelled && dataUrl.startsWith("data:image")) {
					setCapturedPoster(dataUrl);
				}
			} catch {
				/* tainted canvas / decode race */
			}
		};

		const onSeeked = () => {
			snap();
			try {
				v.pause();
				v.currentTime = 0;
			} catch {
				/* ignore */
			}
		};

		const kick = () => {
			if (cancelled) return;
			v.addEventListener("seeked", onSeeked, { once: true });
			try {
				// Slight seek — some encodes have a black keyframe at t=0.
				const t =
					Number.isFinite(v.duration) && v.duration > 0 ? Math.min(0.25, v.duration * 0.05) : 0.1;
				v.currentTime = t;
			} catch {
				snap();
			}
		};

		if (v.readyState >= 2) kick();
		else v.addEventListener("loadeddata", kick, { once: true });

		return () => {
			cancelled = true;
			v.removeEventListener("seeked", onSeeked);
			v.removeEventListener("loadeddata", kick);
		};
	}, [media.url, isGif, givenPoster]);

	const onPlayClick = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		e.preventDefault();
		const v = videoRef.current;
		if (!v) return;
		setPlaying(true);
		void v.play().catch(() => undefined);
	}, []);

	return (
		<div className="relative bg-black">
			<video
				ref={videoRef}
				// #t=0.001 helps some browsers paint a frame before JS capture finishes
				src={isGif ? src : `${src}#t=0.001`}
				poster={poster}
				controls={isGif ? false : playing}
				autoPlay={isGif}
				loop={isGif}
				muted={isGif}
				playsInline
				preload={isGif ? "auto" : "metadata"}
				className={className}
				onClick={(e) => e.stopPropagation()}
				onPlay={() => setPlaying(true)}
				onPause={() => {
					if (!isGif) setPlaying(false);
				}}
				onEnded={() => {
					if (!isGif) setPlaying(false);
				}}
			>
				<track kind="captions" />
			</video>
			{/* X-style play affordance until the user starts the video */}
			{!isGif && !playing && (
				<button
					type="button"
					className="absolute inset-0 flex items-center justify-center border-0 bg-black/20 transition-colors hover:bg-black/30"
					onClick={onPlayClick}
					aria-label="Play video"
				>
					<span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white shadow-lg ring-1 ring-white/30 backdrop-blur-sm">
						<Play className="ml-0.5 h-7 w-7 fill-current" aria-hidden />
					</span>
				</button>
			)}
		</div>
	);
}

// =============================================================================
// PhotoItem — clickable photo thumbnail that opens lightbox
// =============================================================================

function PhotoItem({
	media,
	className,
	containerClass,
	onClick,
}: {
	media: TweetMedia;
	className: string;
	containerClass?: string;
	onClick?: (url: string, opener: HTMLElement) => void;
}) {
	const src = proxyUrl(media.url);
	const handleClick = useCallback(
		(e: React.MouseEvent<HTMLButtonElement>) => {
			if (!onClick) return;
			e.stopPropagation();
			e.preventDefault();
			onClick(src, e.currentTarget);
		},
		[onClick, src],
	);

	const content = (
		<div className={cn("relative group", containerClass)}>
			{onClick ? (
				<button
					type="button"
					className="block h-full w-full cursor-zoom-in border-0 bg-transparent p-0"
					onClick={handleClick}
					aria-label="Open image"
				>
					<img src={src} alt="" className={className} loading="lazy" />
					<div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
						<Search className="h-6 w-6 text-white opacity-0 drop-shadow-md transition-opacity group-hover:opacity-90" />
					</div>
				</button>
			) : (
				<img src={src} alt="" className={className} loading="lazy" />
			)}
		</div>
	);

	return content;
}

// =============================================================================
// ImageLightbox — fullscreen popup to view a high-res photo
// =============================================================================

function ImageLightbox({
	urls,
	index: initialIndex,
	open,
	onClose,
	onCloseAutoFocus,
}: {
	urls: string[];
	index: number;
	open: boolean;
	onClose: () => void;
	onCloseAutoFocus?: (event: { preventDefault: () => void }) => void;
}) {
	const [index, setIndex] = useState(initialIndex);
	const count = urls.length;
	const canNav = count > 1;

	useEffect(() => {
		if (open) setIndex(initialIndex);
	}, [open, initialIndex]);

	const go = useCallback(
		(delta: number) => {
			if (!canNav) return;
			setIndex((current) => (current + delta + count) % count);
		},
		[canNav, count],
	);

	useEffect(() => {
		if (!open || !canNav) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				go(-1);
			} else if (event.key === "ArrowRight") {
				event.preventDefault();
				go(1);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, canNav, go]);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogContent
				size="xl"
				aria-describedby={undefined}
				className="flex h-[80vh] w-[80vw] max-h-[80vh] max-w-[80vw] flex-col overflow-hidden bg-zinc-950 p-0 shadow-none ring-0 sm:w-[80vw]"
				onCloseAutoFocus={onCloseAutoFocus}
			>
				<DialogTitle className="sr-only">
					{count > 0 ? `Image ${index + 1} of ${count}` : "Image preview"}
				</DialogTitle>
				<DialogClose asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white"
						aria-label="Close"
					>
						<X className="h-5 w-5" />
					</Button>
				</DialogClose>
				<div className="relative min-h-0 flex-1 overflow-hidden">
					<div
						className="flex h-full transition-transform duration-300 ease-out motion-reduce:transition-none"
						style={{ transform: `translateX(-${index * 100}%)` }}
					>
						{urls.map((src) => (
							<div
								key={src}
								className="flex h-full w-full shrink-0 items-center justify-center px-12"
							>
								<img src={src} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
							</div>
						))}
					</div>
					{canNav ? (
						<>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="absolute top-1/2 left-2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white"
								aria-label="Previous image"
								onClick={() => go(-1)}
							>
								<ChevronLeft className="h-6 w-6" />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="absolute top-1/2 right-2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white"
								aria-label="Next image"
								onClick={() => go(1)}
							>
								<ChevronRight className="h-6 w-6" />
							</Button>
						</>
					) : null}
				</div>
				{canNav ? (
					<div className="flex shrink-0 flex-col items-center gap-2 px-4 py-3">
						<p className="text-xs tabular-nums text-white/70">
							{index + 1} / {count}
						</p>
						<div className="flex max-w-full gap-2 overflow-x-auto">
							{urls.map((src, i) => (
								<button
									key={src}
									type="button"
									aria-label={`Show image ${i + 1}`}
									aria-current={i === index ? "true" : undefined}
									className={cn(
										"h-14 w-14 shrink-0 overflow-hidden rounded-md ring-2 transition-opacity",
										i === index
											? "ring-white opacity-100"
											: "ring-transparent opacity-50 hover:opacity-80",
									)}
									onClick={() => setIndex(i)}
								>
									<img src={src} alt="" className="h-full w-full object-cover" />
								</button>
							))}
						</div>
					</div>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
