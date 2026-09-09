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

type LightboxPhoto = { id: string; src: string };

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
	onTranslated?: (result: {
		translatedText: string;
		quotedTranslatedText?: string | null;
		summaryText?: string | null;
	}) => void;
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
	const [lightbox, setLightbox] = useState<{ photos: LightboxPhoto[]; index: number } | null>(null);
	const lightboxOpenerRef = useRef<HTMLElement | null>(null);
	const [videoPlayer, setVideoPlayer] = useState<{ src: string; poster?: string } | null>(null);
	const videoOpenerRef = useRef<HTMLElement | null>(null);

	const openLightbox = useCallback(
		(photos: LightboxPhoto[], index: number, opener: HTMLElement) => {
			lightboxOpenerRef.current = opener;
			setLightbox({ photos, index });
		},
		[],
	);

	const openVideo = useCallback((src: string, poster: string | undefined, opener: HTMLElement) => {
		videoOpenerRef.current = opener;
		setVideoPlayer({ src, poster });
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
						quotedTranslatedText?: string | null;
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
			setQuotedTranslatedText(parsed.quotedTranslatedText);
			setLang("zh");
			onTranslated?.({
				translatedText: parsed.translatedText,
				quotedTranslatedText: parsed.quotedTranslatedText,
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
				<MediaGrid media={tweet.media} onPhotoClick={openLightbox} onVideoPlay={openVideo} />
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
								title={tweet.is_quote ? "Open quoted post on X" : "Open original post on X"}
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
							<MediaGrid
								media={tweet.quoted_tweet.media}
								compact
								onPhotoClick={openLightbox}
								onVideoPlay={openVideo}
							/>
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
					className="inline-flex h-8 items-center gap-1.5 rounded-md bg-transparent px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
							"h-8 px-2 text-xs font-medium focus-visible:ring-offset-0",
							lang === "zh"
								? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
								: "bg-transparent text-muted-foreground",
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
						className="h-8 bg-transparent px-2 text-xs text-muted-foreground focus-visible:ring-offset-0"
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
						"h-8 bg-transparent px-2 text-xs font-medium focus-visible:ring-offset-0",
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
						className="ml-auto h-8 bg-transparent px-2 text-xs text-muted-foreground focus-visible:ring-offset-0 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
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
				photos={lightbox?.photos ?? []}
				index={lightbox?.index ?? 0}
				open={lightbox != null}
				onClose={() => setLightbox(null)}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					lightboxOpenerRef.current?.focus();
				}}
			/>
			<VideoLightbox
				src={videoPlayer?.src ?? null}
				poster={videoPlayer?.poster}
				onClose={() => setVideoPlayer(null)}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					videoOpenerRef.current?.focus();
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
	onVideoPlay,
}: {
	media: TweetMedia[];
	compact?: boolean;
	onPhotoClick?: (photos: LightboxPhoto[], index: number, opener: HTMLElement) => void;
	onVideoPlay?: (src: string, poster: string | undefined, opener: HTMLElement) => void;
}) {
	const photos = media.filter((m) => m.type === "PHOTO");
	const allPhotos = photos.length === media.length;
	const galleryPhotos = photos.map((m) => ({ id: m.id, src: proxyUrl(m.url) }));
	const handlePhotoClick = onPhotoClick
		? (id: string, opener: HTMLElement) => {
				const index = galleryPhotos.findIndex((photo) => photo.id === id);
				onPhotoClick(galleryPhotos, index < 0 ? 0 : index, opener);
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
				<VideoMedia
					key={m.id}
					media={m}
					className={`w-full ${roundedClass}`}
					onPlay={onVideoPlay}
				/>
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
							<VideoMedia key={m.id} media={m} className={scrollMediaClass} onPlay={onVideoPlay} />
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
// VideoMedia — GIF loops inline; VIDEO is a fake poster that opens VideoLightbox
// twitter-cli media is {type,url,width,height} only — no preview_image_url.
// When thumbnail_url is missing, capture the first decoded frame via canvas
// (proxied same-origin) so the feed still shows a still behind the play button.
// =============================================================================

function VideoMedia({
	media,
	className,
	onPlay,
}: {
	media: TweetMedia;
	className: string;
	onPlay?: (src: string, poster: string | undefined, opener: HTMLElement) => void;
}) {
	const isGif = media.type === "GIF";
	const src = proxyUrl(media.url);
	const givenPoster = media.thumbnail_url ? proxyUrl(media.thumbnail_url) : undefined;
	const videoRef = useRef<HTMLVideoElement>(null);
	const [capturedPoster, setCapturedPoster] = useState<string | undefined>(undefined);
	const poster = givenPoster ?? capturedPoster;

	// media.url is the clip identity; swapping src reuses this element.
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

	if (isGif) {
		return (
			<div className="relative bg-black">
				<video
					src={src}
					poster={poster}
					controls={false}
					autoPlay
					loop
					muted
					playsInline
					preload="auto"
					className={className}
					onClick={(e) => e.stopPropagation()}
				>
					<track kind="captions" />
				</video>
			</div>
		);
	}

	return (
		<div className="relative bg-black">
			<button
				type="button"
				className="group relative block w-full cursor-pointer appearance-none border-0 bg-transparent p-0 outline-none"
				onClick={(e) => {
					e.stopPropagation();
					e.preventDefault();
					onPlay?.(src, poster, e.currentTarget);
				}}
				aria-label="Play video"
			>
				{givenPoster ? null : (
					<video
						ref={videoRef}
						src={`${src}#t=0.001`}
						muted
						playsInline
						preload="metadata"
						className={cn("pointer-events-none block", className, poster ? "hidden" : null)}
						aria-hidden
					>
						<track kind="captions" />
					</video>
				)}
				{poster ? (
					<img src={poster} alt="" className={cn("block", className)} loading="lazy" />
				) : null}
				<span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 opacity-80 transition-opacity group-hover:opacity-100">
					<span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white shadow-lg ring-1 ring-white/30 backdrop-blur-sm">
						<Play className="ml-0.5 h-7 w-7 fill-current" aria-hidden />
					</span>
				</span>
			</button>
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
	onClick?: (id: string, opener: HTMLElement) => void;
}) {
	const src = proxyUrl(media.url);
	const handleClick = useCallback(
		(e: React.MouseEvent<HTMLButtonElement>) => {
			if (!onClick) return;
			e.stopPropagation();
			e.preventDefault();
			onClick(media.id, e.currentTarget);
		},
		[onClick, media.id],
	);

	const content = (
		<div className={cn("relative group", containerClass)}>
			{onClick ? (
				<button
					type="button"
					className="relative block h-full w-full cursor-zoom-in appearance-none overflow-hidden border-0 bg-transparent p-0 outline-none"
					onClick={handleClick}
					aria-label="Open image"
				>
					<img src={src} alt="" className={cn("block", className)} loading="lazy" />
					<div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
						<Search className="h-6 w-6 text-white opacity-90 drop-shadow-md" />
					</div>
				</button>
			) : (
				<img src={src} alt="" className={cn("block", className)} loading="lazy" />
			)}
		</div>
	);

	return content;
}

// =============================================================================
// ImageLightbox — media at 80% on the Dialog overlay blur, no panel chrome
// =============================================================================

const LIGHTBOX_SHELL =
	"h-[80dvh] w-[80vw] max-h-[80dvh] max-w-[80vw] overflow-visible rounded-none border-0 bg-transparent p-0 shadow-none ring-0 sm:w-[80vw] sm:max-w-[80vw]";

const LIGHTBOX_BUTTON =
	"rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white focus-visible:ring-offset-0";

function LightboxCloseButton() {
	return (
		<DialogClose asChild>
			<Button
				variant="ghost"
				size="icon"
				className={cn(
					LIGHTBOX_BUTTON,
					"absolute right-0 bottom-full z-10 mb-[min(0.5rem,1dvh)] h-[min(2rem,8dvh)] w-[min(2rem,8dvh)]",
				)}
				aria-label="Close"
			>
				<X className="h-5 w-5" />
			</Button>
		</DialogClose>
	);
}

function LightboxMedia({
	src,
	poster,
	kind,
}: {
	src: string;
	poster?: string;
	kind: "image" | "video";
}) {
	const [failed, setFailed] = useState(false);

	if (failed) {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white">
				<p role="alert" className="text-sm">
					Unable to load this {kind}.
				</p>
				<Button variant="secondary" onClick={() => setFailed(false)}>
					Retry
				</Button>
			</div>
		);
	}

	if (kind === "image") {
		return (
			<img
				src={src}
				alt=""
				draggable={false}
				className="block h-full w-full object-contain"
				onError={() => setFailed(true)}
			/>
		);
	}

	return (
		<video
			src={src}
			poster={poster}
			controls
			autoPlay
			playsInline
			className="block h-full w-full object-contain"
			onError={() => setFailed(true)}
		>
			<track kind="captions" />
		</video>
	);
}

function ImageLightbox({
	photos,
	index: initialIndex,
	open,
	onClose,
	onCloseAutoFocus,
}: {
	photos: LightboxPhoto[];
	index: number;
	open: boolean;
	onClose: () => void;
	onCloseAutoFocus?: (event: { preventDefault: () => void }) => void;
}) {
	const [index, setIndex] = useState(initialIndex);
	const dialogRef = useRef<HTMLDivElement>(null);
	const [thumbnailStrip, setThumbnailStrip] = useState<HTMLDivElement | null>(null);
	const count = photos.length;
	const canNav = count > 1;

	useEffect(() => {
		if (open) setIndex(initialIndex);
	}, [open, initialIndex]);

	useEffect(() => {
		if (!thumbnailStrip) return;
		const revealCurrent = () => {
			thumbnailStrip
				.querySelector(`[data-image-index="${index}"]`)
				?.scrollIntoView({ block: "nearest", inline: "nearest" });
		};
		revealCurrent();
		const observer = new ResizeObserver(revealCurrent);
		observer.observe(thumbnailStrip);
		return () => observer.disconnect();
	}, [thumbnailStrip, index]);

	const selectImage = useCallback((next: React.SetStateAction<number>) => {
		const dialog = dialogRef.current;
		// A focused retry button becomes inert when its slide is no longer active.
		if (
			dialog?.querySelector('[data-testid="media-preview-stage"]')?.contains(document.activeElement)
		) {
			dialog.focus();
		}
		setIndex(next);
	}, []);

	const go = useCallback(
		(delta: number) => {
			if (!canNav) return;
			selectImage((current) => (current + delta + count) % count);
		},
		[canNav, count, selectImage],
	);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogContent
				ref={dialogRef}
				size="xl"
				aria-describedby={undefined}
				className={LIGHTBOX_SHELL}
				style={{ background: "transparent" }}
				onCloseAutoFocus={onCloseAutoFocus}
				onKeyDown={(event) => {
					if (!canNav || event.altKey || event.ctrlKey || event.metaKey) return;
					if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
						event.preventDefault();
						event.stopPropagation();
						go(event.key === "ArrowLeft" ? -1 : 1);
					}
				}}
			>
				<DialogTitle className="sr-only">
					{count > 0 ? `Image ${index + 1} of ${count}` : "Image preview"}
				</DialogTitle>
				<LightboxCloseButton />
				<div className="h-full w-full overflow-hidden" data-testid="media-preview-stage">
					<div
						className="flex h-full w-full transition-transform duration-300 ease-out motion-reduce:transition-none"
						style={{ transform: `translateX(-${index * 100}%)` }}
					>
						{photos.map((photo, i) => (
							<div
								key={photo.id}
								aria-hidden={i !== index}
								inert={i !== index}
								className={cn(
									"flex h-full w-full min-w-0 shrink-0 items-center justify-center transition-opacity duration-300 motion-reduce:transition-none",
									i === index ? "opacity-100" : "opacity-0",
								)}
							>
								<LightboxMedia key={photo.src} src={photo.src} kind="image" />
							</div>
						))}
					</div>
				</div>
				{canNav ? (
					<>
						<Button
							variant="ghost"
							size="icon"
							className={cn(
								LIGHTBOX_BUTTON,
								"absolute top-1/2 left-0 z-10 h-10 w-10 -translate-x-1/2 -translate-y-1/2",
							)}
							aria-label="Previous image"
							aria-keyshortcuts="ArrowLeft"
							onClick={() => go(-1)}
						>
							<ChevronLeft className="h-6 w-6" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className={cn(
								LIGHTBOX_BUTTON,
								"absolute top-1/2 right-0 z-10 h-10 w-10 translate-x-1/2 -translate-y-1/2",
							)}
							aria-label="Next image"
							aria-keyshortcuts="ArrowRight"
							onClick={() => go(1)}
						>
							<ChevronRight className="h-6 w-6" />
						</Button>
						<p
							aria-live="polite"
							aria-atomic="true"
							className="absolute bottom-full left-1/2 mb-[min(0.5rem,1dvh)] flex h-[min(2rem,8dvh)] -translate-x-1/2 items-center text-xs text-white/90 tabular-nums"
						>
							{index + 1} / {count}
						</p>
						<div className="absolute top-full left-0 mt-[min(0.5rem,1dvh)] flex h-[min(4rem,8dvh)] w-full justify-center">
							<div
								ref={setThumbnailStrip}
								className="flex h-full min-w-0 max-w-full gap-2 overflow-x-auto p-[min(0.25rem,0.5dvh)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
							>
								{photos.map((photo, i) => (
									<Button
										key={photo.id}
										variant="ghost"
										size="icon"
										data-image-index={i}
										aria-label={`Show image ${i + 1}`}
										aria-current={i === index ? "true" : undefined}
										className={cn(
											"aspect-square h-full w-auto shrink-0 overflow-hidden rounded-md border-2 p-0 transition-opacity hover:bg-transparent focus-visible:ring-offset-0",
											i === index
												? "border-white opacity-100"
												: "border-transparent opacity-50 hover:opacity-80",
										)}
										onClick={() => selectImage(i)}
									>
										<img
											src={photo.src}
											alt=""
											draggable={false}
											className="block h-full w-full object-cover"
										/>
									</Button>
								))}
							</div>
						</div>
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

// =============================================================================
// VideoLightbox — centered popup player (same 80% stage as ImageLightbox)
// =============================================================================

function VideoLightbox({
	src,
	poster,
	onClose,
	onCloseAutoFocus,
}: {
	src: string | null;
	poster?: string;
	onClose: () => void;
	onCloseAutoFocus?: (event: { preventDefault: () => void }) => void;
}) {
	return (
		<Dialog
			open={src != null}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogContent
				size="xl"
				aria-describedby={undefined}
				className={LIGHTBOX_SHELL}
				style={{ background: "transparent" }}
				onCloseAutoFocus={onCloseAutoFocus}
			>
				<DialogTitle className="sr-only">Video player</DialogTitle>
				<LightboxCloseButton />
				<div className="h-full w-full" data-testid="media-preview-stage">
					{src ? <LightboxMedia key={src} src={src} poster={poster} kind="video" /> : null}
				</div>
			</DialogContent>
		</Dialog>
	);
}
