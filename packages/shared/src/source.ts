/** Canonical feed source types (docs/03 D10 / XR-04). */
export const SOURCE_TYPES = ["x.com", "custom"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
	"x.com": "x.com",
	custom: "custom",
};

export function isSourceType(value: unknown): value is SourceType {
	return typeof value === "string" && (SOURCE_TYPES as readonly string[]).includes(value);
}
