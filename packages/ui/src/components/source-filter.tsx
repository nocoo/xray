import { SegmentControl } from "@nocoo/basalt";
import type { SourceType } from "@xray/shared";
import { SOURCE_TYPES } from "@xray/shared";

export type SourceFilterValue = "all" | SourceType;

function labelFor(id: SourceFilterValue, count?: number): string {
	const base = id === "all" ? "All" : id === "x.com" ? "X" : id;
	return typeof count === "number" ? `${base} ${count}` : base;
}

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
	return (
		<SegmentControl
			legend="Source"
			value={value}
			onValueChange={(next) => onChange(next as SourceFilterValue)}
			allOption={{ value: "all", label: labelFor("all", counts?.all) }}
			options={SOURCE_TYPES.map((s) => ({
				value: s,
				label: labelFor(s as SourceFilterValue, counts?.[s as SourceFilterValue]),
			}))}
		/>
	);
}
