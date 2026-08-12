import type { SourceType } from "@xray/shared";
import { SOURCE_TYPES } from "@xray/shared";
import { cn } from "@/lib/utils";

export type SourceFilterValue = "all" | SourceType;

/** Timeline source filter: All / x.com / custom (docs/04). */
export function SourceFilter({
	value,
	onChange,
	counts,
}: {
	value: SourceFilterValue;
	onChange: (v: SourceFilterValue) => void;
	counts?: Partial<Record<SourceFilterValue, number>>;
}) {
	const options: { id: SourceFilterValue; label: string }[] = [
		{ id: "all", label: "All" },
		...SOURCE_TYPES.map((s) => ({
			id: s as SourceFilterValue,
			// Brand-facing label for x.com; keep filter value as canonical source_type.
			label: s === "x.com" ? "X" : s,
		})),
	];

	return (
		<div
			className="flex flex-wrap items-center gap-2"
			role="tablist"
			aria-label="Filter by source_type"
		>
			<span className="mr-0.5 text-xs text-muted-foreground">Source:</span>
			{options.map((opt) => {
				const active = value === opt.id;
				const n = counts?.[opt.id];
				return (
					<button
						key={opt.id}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onChange(opt.id)}
						className={cn(
							"rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
							active
								? "bg-foreground text-background"
								: "bg-secondary text-muted-foreground hover:bg-secondary/80",
						)}
					>
						{opt.label}
						{typeof n === "number" && (
							<span className={cn("ml-1 tabular-nums", active ? "opacity-80" : "opacity-70")}>
								{n}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
