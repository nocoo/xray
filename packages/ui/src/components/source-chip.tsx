import type { SourceType } from "@xray/shared";
import { SOURCE_TYPE_LABELS } from "@xray/shared";
import { cn } from "@/lib/utils";

const CHIP_STYLES: Record<SourceType, string> = {
	"x.com":
		"border-sky-500/30 bg-sky-500/15 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300",
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
	return (
		<span
			data-testid="source-chip"
			data-source-type={sourceType}
			className={cn(
				"inline-flex items-center rounded-full border font-medium tracking-wide uppercase",
				size === "sm" ? "px-1.5 py-0 text-[10px] leading-4" : "px-2 py-0.5 text-[11px] leading-5",
				CHIP_STYLES[sourceType],
				className,
			)}
			title={`source_type=${sourceType}`}
		>
			{SOURCE_TYPE_LABELS[sourceType]}
		</span>
	);
}
