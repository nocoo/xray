/**
 * Sidebar geometry tokens — single source for layout classes and tests (S12-07).
 * Logo/avatar left edges stay stable across collapse; right chrome is a single pr-3 band.
 */
export const SIDEBAR_GEOMETRY = {
	expandedWidthPx: 260,
	collapsedWidthPx: 68,
	logoSizePx: 24,
	avatarSizePx: 36,
	/** pl-6 both modes */
	logoPadPx: 24,
	/** footer px-4 expanded; collapsed center = (68-36)/2 */
	expandedAvatarPadPx: 16,
	/** header pr-3 / group band */
	expandedRightPadPx: 12,
	/** items container px-3 */
	navPillInsetPx: 12,
	expandedWidthClass: "w-[260px]",
	collapsedWidthClass: "w-[68px]",
	headerPadClass: "pr-3 pl-6",
	footerPadClass: "px-4 py-3",
	navItemsPadClass: "px-3",
	groupBandPadClass: "px-3",
} as const;

export type SidebarGeometry = typeof SIDEBAR_GEOMETRY;
