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
				"inline-flex items-center gap-0.5 rounded-full border font-medium tracking-wide",
				size === "sm" ? "px-1.5 py-0 text-[10px] leading-4" : "px-2 py-0.5 text-[11px] leading-5",
				!isX && "uppercase",
				CHIP_STYLES[sourceType],
				className,
			)}
			title={`source_type=${sourceType}`}
		>
			{isX ? (
				<XLogo className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} aria-label="X" />
			) : (
				SOURCE_TYPE_LABELS[sourceType]
			)}
		</span>
	);
}
