import type { SourceType } from "@xray/shared";
import {
	ArrowLeftRight,
	Bookmark,
	ExternalLink,
	Languages,
	Loader2,
	MessageSquareQuote,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SourceChip } from "@/components/source-chip";
import { cn, formatTimeAgo } from "@/lib/utils";
import { canSaveToZheto, postZhetoSave, type ZhetoSaveState } from "@/lib/zheto-save";

export type CustomItemCardProps = {
	title: string | null;
	body: string;
	createdAt: string;
	url?: string | null;
	authorName?: string | null;
	sourceType?: Extract<SourceType, "custom">;
	producer?: string | null;
	onRemove?: () => void;
	watchlistId?: number;
	itemId?: number;
	initialTranslation?: {
		translatedText: string;
		summaryText?: string | null;
	};
	onTranslated?: (result: { translatedText: string; summaryText?: string | null }) => void;
};

/** Custom / push item card — source_type=custom, distinct from x.com tweet cards. */
export function CustomItemCard({
	title,
	body,
	createdAt,
	url,
	authorName,
	sourceType = "custom",
	producer,
	onRemove,
	watchlistId,
	itemId,
	initialTranslation,
	onTranslated,
}: CustomItemCardProps) {
	const [zhetoStatus, setZhetoStatus] = useState<ZhetoSaveState>("idle");
	const canSave = canSaveToZheto(url);

	const [lang, setLang] = useState<"zh" | "en">(initialTranslation?.translatedText ? "zh" : "en");
	const [translatedText, setTranslatedText] = useState(initialTranslation?.translatedText ?? null);
	const [summaryText, setSummaryText] = useState(initialTranslation?.summaryText ?? null);
	const [translating, setTranslating] = useState(false);
	const [translateError, setTranslateError] = useState<string | null>(null);

	useEffect(() => {
		if (initialTranslation?.translatedText) {
			setTranslatedText(initialTranslation.translatedText);
			setSummaryText(initialTranslation.summaryText ?? null);
			setLang("zh");
			setTranslateError(null);
		}
	}, [initialTranslation?.translatedText, initialTranslation?.summaryText]);

	const hasTranslation = !!translatedText;
	const displayBody = lang === "zh" && hasTranslation ? (translatedText ?? body) : body;

	const handleTranslate = useCallback(async () => {
		if (translating) return;
		if (watchlistId == null || itemId == null) {
			setTranslateError("Translate requires watchlist context.");
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
			setSummaryText(row.summaryText ?? null);
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

	const onSave = useCallback(async () => {
		if (!canSaveToZheto(url) || zhetoStatus === "saving" || zhetoStatus === "saved") return;
		setZhetoStatus("saving");
		const res = await postZhetoSave({ url, note: title || body.slice(0, 200) });
		if (res.ok) {
			setZhetoStatus("saved");
		} else {
			setZhetoStatus("error");
			setTimeout(() => setZhetoStatus("idle"), 3000);
		}
	}, [url, zhetoStatus, title, body]);

	const showInsight = lang === "zh" && !!summaryText;

	return (
		<article
			data-testid="custom-item-card"
			data-source-type={sourceType}
			className="relative rounded-card border border-dashed border-violet-500/35 bg-secondary p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
		>
			<div className="absolute top-2.5 right-2.5 flex items-center gap-1">
				<SourceChip sourceType={sourceType} />
			</div>

			<div className="mb-2 flex flex-wrap items-center gap-2 pr-16">
				{producer && (
					<span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
						{producer}
					</span>
				)}
				<span className="text-xs text-muted-foreground">{formatTimeAgo(createdAt, "compact")}</span>
				{authorName && <span className="text-xs text-muted-foreground">· {authorName}</span>}
			</div>

			{title && <h3 className="pr-14 text-sm font-semibold">{title}</h3>}
			<p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
				{displayBody}
			</p>

			{showInsight && (
				<div className="mt-3 rounded-md bg-gradient-to-r from-violet-50/80 via-fuchsia-50/50 to-amber-50/40 px-3 py-2 dark:from-violet-950/30 dark:via-fuchsia-950/20 dark:to-amber-950/10">
					<div className="flex gap-2">
						<MessageSquareQuote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500 dark:text-violet-400" />
						<div className="min-w-0 flex-1">
							<span className="text-[10px] font-semibold tracking-wider text-violet-600/80 uppercase dark:text-violet-400/80">
								AI Insight
							</span>
							<p className="mt-0.5 text-sm leading-relaxed text-foreground/80">{summaryText}</p>
						</div>
					</div>
				</div>
			)}

			{translateError && !hasTranslation && (
				<p className="mt-2 text-xs break-all text-red-600 dark:text-red-400">{translateError}</p>
			)}

			{(url || onRemove || canSave || watchlistId != null) && (
				<div className="mt-3 flex items-center gap-1 border-t border-border/60 pt-2">
					{url && (
						<a
							href={url}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							<ExternalLink className="h-3 w-3" />
							Open
						</a>
					)}
					{hasTranslation ? (
						<button
							type="button"
							onClick={() => setLang((l) => (l === "zh" ? "en" : "zh"))}
							className={cn(
								"flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
								lang === "zh"
									? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
									: "text-muted-foreground hover:bg-accent hover:text-foreground",
							)}
							title={lang === "zh" ? "Show original" : "Show translation"}
						>
							<ArrowLeftRight className="h-3 w-3" />
							{lang === "zh" ? "中文" : "EN"}
						</button>
					) : (
						<button
							type="button"
							onClick={() => void handleTranslate()}
							disabled={translating}
							className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
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
					{canSave && (
						<button
							type="button"
							onClick={() => void onSave()}
							disabled={zhetoStatus === "saving" || zhetoStatus === "saved"}
							className={cn(
								"flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors",
								zhetoStatus === "saved"
									? "text-emerald-600"
									: zhetoStatus === "error"
										? "text-destructive"
										: "text-muted-foreground hover:bg-accent hover:text-foreground",
								(zhetoStatus === "saving" || zhetoStatus === "saved") &&
									"opacity-60 cursor-default",
							)}
						>
							{zhetoStatus === "saving" ? (
								<Loader2 className="h-3 w-3 animate-spin" />
							) : (
								<Bookmark className="h-3 w-3" />
							)}
							{zhetoStatus === "saving"
								? "Saving…"
								: zhetoStatus === "saved"
									? "Saved"
									: zhetoStatus === "error"
										? "Error"
										: "zhe.to"}
						</button>
					)}
					{onRemove && (
						<button
							type="button"
							onClick={onRemove}
							className="ml-auto rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
						>
							Remove
						</button>
					)}
				</div>
			)}
		</article>
	);
}
