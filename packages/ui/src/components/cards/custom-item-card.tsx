import type { SourceType } from "@xray/shared";
import { Bookmark, ExternalLink, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
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
}: CustomItemCardProps) {
	const [zhetoStatus, setZhetoStatus] = useState<ZhetoSaveState>("idle");
	const canSave = canSaveToZheto(url);

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
				{body}
			</p>

			{(url || onRemove || canSave) && (
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
