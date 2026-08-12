/** Tweet card — layout ported from legacy/v1 (avatar, metrics, translate bar, AI insight). */

import type { SourceType } from "@xray/shared";
import {
	ArrowLeftRight,
	AtSign,
	Bookmark,
	Check,
	ExternalLink,
	Eye,
	Hash,
	Heart,
	Image as ImageIcon,
	Languages,
	LinkIcon,
	Loader2,
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
import { SourceChip } from "@/components/source-chip";
import { Badge } from "@/components/ui/badge";
import { useNow } from "@/hooks/use-now";
import type { Tweet, TweetMedia } from "@/lib/tweet-types";
import { cn, formatCount, formatTimeAgo } from "@/lib/utils";

// We intentionally use <img> for external Twitter profile images and media.
// next/image requires known hostnames in next.config, which is impractical
// for user-generated Twitter content.

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
	const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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
			if (row?.ai_status !== "succeeded" || !row.translatedText) {
				throw new Error(row?.error || "Translation failed — configure AI Settings");
			}
			setTranslatedText(row.translatedText);
			setCommentText(row.summaryText ?? null);
			setQuotedTranslatedText(null);
			setLang("zh");
			onTranslated?.({
				translatedText: row.translatedText,
				summaryText: row.summaryText ?? null,
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

	const card = (
		<div
			className={cn(
				"relative rounded-card bg-secondary p-4 transition-colors hover:bg-secondary/80",
				showActionBar && "rounded-b-none border border-border",
				className,
			)}
		>
			{/* source_type + tweet kind badges — top-right (v2 mix timeline) */}
			<div className="absolute top-2.5 right-2.5 flex items-center gap-1">
				<SourceChip sourceType={sourceType} />
				{tweet.is_retweet && (
					<Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
						<Repeat2 className="mr-0.5 h-2.5 w-2.5" /> RT
					</Badge>
				)}
				{tweet.is_reply && (
					<Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
						<MessageCircle className="mr-0.5 h-2.5 w-2.5" /> Reply
					</Badge>
				)}
				{tweet.is_quote && (
					<Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
						<Quote className="mr-0.5 h-2.5 w-2.5" /> Quote
					</Badge>
				)}
			</div>

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
				<div className="min-w-0 flex-1">
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
							{tweet.author.is_verified && (
								<Badge variant="default" className="h-4 px-1 text-[10px]">
									V
								</Badge>
							)}
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

			{/* Tweet text */}
			<p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">
				{linkifyText(displayTweet.text)}
			</p>

			{/* Media preview */}
			{tweet.media && tweet.media.length > 0 && (
				<div className="mt-3">
					<MediaGrid media={tweet.media} onPhotoClick={setLightboxUrl} />
				</div>
			)}

			{/* Entities */}
			{tweet.entities &&
				(tweet.entities.hashtags.length > 0 || tweet.entities.mentioned_users.length > 0) && (
					<div className="mt-2 flex flex-wrap gap-1.5">
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

			{/* Quoted tweet — rendered as a compact nested card */}
			{tweet.quoted_tweet && (
				<div className="relative mt-3 rounded-lg border border-border p-3 bg-secondary/50">
					{/* Open quoted tweet on X — top-right */}
					<a
						href={tweet.quoted_tweet.url}
						target="_blank"
						rel="noopener noreferrer"
						className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
						title="Open quoted tweet on X"
						onClick={(e) => e.stopPropagation()}
					>
						<ExternalLink className="h-3 w-3" />
					</a>

					{/* Quoted author row */}
					<div className="flex items-center gap-2 pr-6">
						<a
							href={`https://x.com/${tweet.quoted_tweet.author.username}`}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
							onClick={(e) => e.stopPropagation()}
						>
							{tweet.quoted_tweet.author.profile_image_url ? (
								<img
									src={tweet.quoted_tweet.author.profile_image_url}
									alt={tweet.quoted_tweet.author.name}
									className="h-5 w-5 shrink-0 rounded-full"
								/>
							) : (
								<div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
									{tweet.quoted_tweet.author.name[0]}
								</div>
							)}
							<span className="text-xs font-medium truncate">{tweet.quoted_tweet.author.name}</span>
						</a>
						{tweet.quoted_tweet.author.is_verified && (
							<Badge variant="default" className="h-3.5 px-1 text-[9px]">
								V
							</Badge>
						)}
						<a
							href={`https://x.com/${tweet.quoted_tweet.author.username}`}
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-muted-foreground truncate hover:underline"
							onClick={(e) => e.stopPropagation()}
						>
							@{tweet.quoted_tweet.author.username}
						</a>
						<span className="text-xs text-muted-foreground">·</span>
						<span className="text-xs text-muted-foreground shrink-0">
							{formatTimeAgo(tweet.quoted_tweet.created_at, "compact", nowMs)}
						</span>
					</div>

					{/* Quoted text */}
					<p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
						{linkifyText(displayTweet.quoted_tweet?.text ?? tweet.quoted_tweet.text)}
					</p>

					{/* Quoted media */}
					{tweet.quoted_tweet.media && tweet.quoted_tweet.media.length > 0 && (
						<div className="mt-2">
							<MediaGrid media={tweet.quoted_tweet.media} compact onPhotoClick={setLightboxUrl} />
						</div>
					)}

					{/* Quoted metrics */}
					<div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
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
			)}

			{/* Metrics row — overflow hidden with fade-out mask on the right */}
			<div
				className="mt-3 flex items-center gap-4 text-xs text-muted-foreground overflow-hidden"
				style={{
					maskImage: "linear-gradient(to right, black 80%, transparent 100%)",
					WebkitMaskImage: "linear-gradient(to right, black 80%, transparent 100%)",
				}}
			>
				<MetricItem
					icon={<MessageCircle className="h-3.5 w-3.5" />}
					value={tweet.metrics.reply_count}
				/>
				<MetricItem
					icon={<Repeat2 className="h-3.5 w-3.5" />}
					value={tweet.metrics.retweet_count}
				/>
				<MetricItem icon={<Quote className="h-3.5 w-3.5" />} value={tweet.metrics.quote_count} />
				<MetricItem icon={<Heart className="h-3.5 w-3.5" />} value={tweet.metrics.like_count} />
				<MetricItem icon={<Eye className="h-3.5 w-3.5" />} value={tweet.metrics.view_count} />
				<MetricItem
					icon={<Bookmark className="h-3.5 w-3.5" />}
					value={tweet.metrics.bookmark_count}
				/>
			</div>
		</div>
	);

	const actionBar = showActionBar ? (
		<div className="flex items-center gap-1 border border-t-0 border-border rounded-b-card bg-secondary px-2 py-1.5">
			{/* Open on X */}
			<a
				href={tweet.url}
				target="_blank"
				rel="noopener noreferrer"
				className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
				onClick={(e) => e.stopPropagation()}
			>
				<ExternalLink className="h-3 w-3" />
				Open
			</a>

			{/* Translate / Toggle language */}
			{hasTranslation ? (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						e.preventDefault();
						setLang((l) => (l === "zh" ? "en" : "zh"));
					}}
					className={cn(
						"flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
						lang === "zh"
							? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
							: "text-muted-foreground hover:text-foreground hover:bg-accent",
					)}
					title={lang === "zh" ? "Show original" : "Show translation"}
				>
					<ArrowLeftRight className="h-3 w-3" />
					{lang === "zh" ? "中文" : "EN"}
				</button>
			) : (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						e.preventDefault();
						handleTranslate();
					}}
					disabled={translating}
					className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
					title="Translate this post"
				>
					{translating ? (
						<Loader2 className="h-3 w-3 animate-spin" />
					) : (
						<Languages className="h-3 w-3" />
					)}
					{translating ? "Translating..." : "Translate"}
				</button>
			)}

			{/* Save to zhe.to */}
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					e.preventDefault();
					handleSaveToZheto();
				}}
				disabled={zhetoStatus === "saving" || zhetoStatus === "saved"}
				className={cn(
					"flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
					zhetoStatus === "saved"
						? "text-emerald-600 dark:text-emerald-400"
						: zhetoStatus === "error"
							? "text-red-500 dark:text-red-400"
							: "text-muted-foreground hover:text-foreground hover:bg-accent",
					(zhetoStatus === "saving" || zhetoStatus === "saved") && "opacity-60 cursor-default",
				)}
				title="Save to zhe.to"
			>
				{zhetoStatus === "saving" ? (
					<Loader2 className="h-3 w-3 animate-spin" />
				) : zhetoStatus === "saved" ? (
					<Check className="h-3 w-3" />
				) : (
					<LinkIcon className="h-3 w-3" />
				)}
				{zhetoStatus === "saving"
					? "Saving..."
					: zhetoStatus === "saved"
						? "Saved"
						: zhetoStatus === "error"
							? "Failed"
							: "zhe.to"}
			</button>

			{/* Remove post */}
			{onRemove && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						e.preventDefault();
						onRemove();
					}}
					className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors ml-auto"
					title="Remove this post"
				>
					<Trash2 className="h-3 w-3" />
					Remove
				</button>
			)}
		</div>
	) : null;

	// AI Insight — shown when viewing translated text and commentText exists
	const showComment = lang === "zh" && !!commentText;
	const aiInsight = showComment ? (
		<div className="relative border border-t-0 border-border bg-gradient-to-r from-violet-50/80 via-fuchsia-50/50 to-amber-50/40 dark:from-violet-950/30 dark:via-fuchsia-950/20 dark:to-amber-950/10 px-3 py-2.5">
			<div className="flex gap-2">
				<MessageSquareQuote className="h-3.5 w-3.5 mt-0.5 shrink-0 text-violet-500 dark:text-violet-400" />
				<div className="flex-1 min-w-0">
					<span className="text-[10px] font-semibold uppercase tracking-wider text-violet-600/80 dark:text-violet-400/80">
						AI Insight
					</span>
					<p className="mt-0.5 text-sm text-foreground/80 leading-relaxed">{commentText}</p>
				</div>
			</div>
		</div>
	) : null;

	const errorBanner =
		translateError && !hasTranslation ? (
			<div className="border border-t-0 border-red-200 bg-red-50/80 px-3 py-2 dark:border-red-900/50 dark:bg-red-950/20">
				<p className="text-xs text-red-700 dark:text-red-300 break-all">{translateError}</p>
			</div>
		) : null;

	return (
		<div>
			{card}
			{renderBeforeActionBar}
			{errorBanner}
			{aiInsight}
			{actionBar}
			<ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
		</div>
	);
});

// =============================================================================
// Media proxy helper — routes Twitter video/GIF URLs through our server-side
// proxy to avoid 403 from Twitter CDN's Referer-based hotlink protection
// =============================================================================

/** Route Twitter CDN media through worker proxy (Referer hotlink protection). */
function proxyUrl(url: string): string {
	return `/api/media/proxy?url=${encodeURIComponent(url)}`;
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
		<div className="flex shrink-0 items-center gap-1">
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
	onPhotoClick?: (url: string) => void;
}) {
	const photos = media.filter((m) => m.type === "PHOTO");
	const allPhotos = photos.length === media.length;
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
								onClick={onPhotoClick}
							/>
						))}
					</div>
				)}

				{media.length === 3 && (
					<div className="grid grid-cols-2 grid-rows-2 gap-1 h-full">
						<PhotoItem
							key={at(media, 0).id}
							media={at(media, 0)}
							className="w-full h-full object-cover row-span-2"
							onClick={onPhotoClick}
						/>
						<PhotoItem
							key={at(media, 1).id}
							media={at(media, 1)}
							className="w-full h-full object-cover"
							onClick={onPhotoClick}
						/>
						<PhotoItem
							key={at(media, 2).id}
							media={at(media, 2)}
							className="w-full h-full object-cover"
							onClick={onPhotoClick}
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
								onClick={onPhotoClick}
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
					onClick={onPhotoClick}
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
							onClick={onPhotoClick}
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
				const canvas = document.createElement("canvas");
				canvas.width = v.videoWidth;
				canvas.height = v.videoHeight;
				const ctx = canvas.getContext("2d");
				if (!ctx) return;
				ctx.drawImage(v, 0, 0);
				const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
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
	onClick?: (url: string) => void;
}) {
	const src = proxyUrl(media.url);
	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			if (!onClick) return;
			e.stopPropagation();
			e.preventDefault();
			// Lightbox gets the proxied URL so large view also bypasses CDN hotlink checks.
			onClick(src);
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

function ImageLightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
	if (!url) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-in fade-in-0 duration-200"
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
			role="dialog"
			aria-modal="true"
			tabIndex={-1}
			ref={(el) => el?.focus()}
		>
			{/* Close button */}
			<button
				type="button"
				className="absolute top-4 right-4 z-10 rounded-full bg-black/50 p-2 text-white/80 hover:text-white hover:bg-black/70 transition-colors"
				onClick={(e) => {
					e.stopPropagation();
					onClose();
				}}
				aria-label="Close"
			>
				<X className="h-5 w-5" />
			</button>

			{/* Full-res image */}
			<button
				type="button"
				className="border-0 bg-transparent p-0"
				onClick={(e) => e.stopPropagation()}
				aria-label="Image preview"
			>
				<img src={url} alt="" className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" />
			</button>
		</div>
	);
}
