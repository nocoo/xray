import type { SourceType } from "@xray/shared";
import { SOURCE_TYPE_LABELS } from "@xray/shared";
import { XLogo } from "@/components/icons/x-logo";
import { cn } from "@/lib/utils";

const CHIP_STYLES: Record<SourceType, string> = {
	// X brand: black / white mark (not sky-blue “Twitter legacy”)
	"x.com":
		"border-neutral-900/15 bg-neutral-950 text-white dark:border-white/20 dark:bg-white dark:text-neutral-950",
	custom:
		"border-violet-500/30 bg-violet-500/15 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-300",
};

/** Visual discriminator for mix timeline (v2 vs v1 pure-X feeds). */
export function SourceChip({
	sourceType,
	className,
	size = "sm",
}: {
	sourceType: SourceType;
	className?: string;
	size?: "sm" | "md";
}) {
	const isX = sourceType === "x.com";
	return (
		<span
			data-testid="source-chip"
			data-source-type={sourceType}
			className={cn(
				"inline-flex items-center justify-center rounded-full border font-medium tracking-wide",
				// Logo-only X chip needs equal padding so the mark isn't flush to the edge.
				isX
					? size === "sm"
						? "size-5 p-1"
						: "size-6 p-1.5"
					: size === "sm"
						? "px-1.5 py-0 text-[10px] leading-4 uppercase"
						: "px-2 py-0.5 text-[11px] leading-5 uppercase",
				CHIP_STYLES[sourceType],
				className,
			)}
			title={`source_type=${sourceType}`}
		>
			{isX ? (
				<XLogo className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-label="X" />
			) : (
				SOURCE_TYPE_LABELS[sourceType]
			)}
		</span>
	);
}
