import { Button, LayerCard } from "@nocoo/basalt";
import type { SourceType } from "@xray/shared";
import {
	ArrowLeftRight,
	Bookmark,
	ExternalLink,
	Languages,
	MessageSquareQuote,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ExpandableText } from "@/components/expandable-text";
import { SourceChip } from "@/components/source-chip";
import { useNow } from "@/hooks/use-now";
import { POST_TEXT_CLAMP_LINES } from "@/lib/expandable-text";
import { readTranslateRow } from "@/lib/translate-result";
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
	const nowMs = useNow();
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
			const parsed = readTranslateRow(row);
			if (parsed.status === "pending") return;
			if (parsed.status === "failed") {
				throw new Error(parsed.error);
			}
			setTranslatedText(parsed.translatedText);
			setSummaryText(parsed.summaryText);
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

	const hasActions = url || onRemove || canSave || watchlistId != null;

	return (
		<LayerCard
			data-testid="custom-item-card"
			data-source-type={sourceType}
			outlined
			className="relative animate-fade-up"
		>
			<LayerCard.Body className="relative flex flex-col gap-3">
				<div className="absolute top-4 right-4 flex items-center gap-1">
					<SourceChip sourceType={sourceType} />
				</div>

				<div className="flex flex-wrap items-center gap-2 pr-16">
					{producer && (
						<span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
							{producer}
						</span>
					)}
					<span className="text-xs text-muted-foreground">
						{formatTimeAgo(createdAt, "compact", nowMs)}
					</span>
					{authorName && <span className="text-xs text-muted-foreground">· {authorName}</span>}
				</div>

				{title && <h3 className="pr-14 text-sm font-semibold">{title}</h3>}
				<ExpandableText
					key={displayBody}
					lines={POST_TEXT_CLAMP_LINES}
					className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90"
				>
					{displayBody}
				</ExpandableText>
			</LayerCard.Body>

			{showInsight && (
				<LayerCard.Well className="bg-gradient-to-r from-violet-50/80 via-fuchsia-50/50 to-amber-50/40 px-4 py-2.5 dark:from-violet-950/30 dark:via-fuchsia-950/20 dark:to-amber-950/10">
					<div className="flex gap-2">
						<MessageSquareQuote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500 dark:text-violet-400" />
						<div className="min-w-0 flex-1">
							<span className="text-[10px] font-semibold tracking-wider text-violet-600/80 uppercase dark:text-violet-400/80">
								AI Insight
							</span>
							<p className="mt-0.5 text-sm leading-relaxed text-foreground/80">{summaryText}</p>
						</div>
					</div>
				</LayerCard.Well>
			)}

			{translateError && !hasTranslation && (
				<div className="border-t border-basalt-destructive/30 bg-basalt-danger-tint px-4 py-2">
					<p className="break-all text-xs text-basalt-danger">{translateError}</p>
				</div>
			)}

			{hasActions && (
				<LayerCard.Footer className="items-center justify-start gap-1 px-2 py-1">
					{url && (
						<a
							href={url}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							<ExternalLink className="h-3.5 w-3.5" />
							Open
						</a>
					)}
					{hasTranslation ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setLang((l) => (l === "zh" ? "en" : "zh"))}
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
							onClick={() => void handleTranslate()}
							loading={translating}
							icon={<Languages className="h-3.5 w-3.5" />}
							className="h-8 px-2 text-xs text-muted-foreground"
							title="Translate this post"
						>
							{translating ? "Translating..." : "Translate"}
						</Button>
					)}
					{canSave && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => void onSave()}
							loading={zhetoStatus === "saving"}
							disabled={zhetoStatus === "saved"}
							icon={<Bookmark className="h-3.5 w-3.5" />}
							className={cn(
								"h-8 px-2 text-xs",
								zhetoStatus === "saved"
									? "text-emerald-600"
									: zhetoStatus === "error"
										? "text-destructive"
										: "text-muted-foreground",
							)}
						>
							{zhetoStatus === "saving"
								? "Saving…"
								: zhetoStatus === "saved"
									? "Saved"
									: zhetoStatus === "error"
										? "Error"
										: "zhe.to"}
						</Button>
					)}
					{onRemove && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={onRemove}
							className="ml-auto h-8 px-2 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
						>
							Remove
						</Button>
					)}
				</LayerCard.Footer>
			)}
		</LayerCard>
	);
}
