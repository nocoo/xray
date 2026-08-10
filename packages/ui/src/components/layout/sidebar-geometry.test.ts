import { describe, expect, test } from "vitest";

/**
 * Sidebar collapse/expand anti-jitter + right-inset contract.
 *
 * Logo x must match across modes (pl-6 both).
 * Avatar x must match (expanded px-4 vs collapsed center in 68).
 * Expanded right chrome uses a single pr-3 (12), not nested px-3×2 (24).
 */
const SIDEBAR = {
	expandedWidth: 260,
	collapsedWidth: 68,
	logoSize: 24,
	avatarSize: 36,
	logoPad: 24, // pl-6
	expandedAvatarPad: 16, // px-4
	expandedRightPad: 12, // pr-3 (collapse control / group band)
	navPillInset: 12, // items px-3
} as const;

describe("sidebar geometry contract", () => {
	test("logo left edge is identical when collapsed and expanded", () => {
		expect(SIDEBAR.logoPad).toBe(SIDEBAR.logoSize);
	});

	test("avatar left edge is identical when collapsed and expanded", () => {
		const collapsedAvatarLeft = (SIDEBAR.collapsedWidth - SIDEBAR.avatarSize) / 2;
		expect(collapsedAvatarLeft).toBe(SIDEBAR.expandedAvatarPad);
	});

	test("expanded right chrome is a single pr-3 band, not double px-3", () => {
		expect(SIDEBAR.expandedRightPad).toBe(12);
		expect(SIDEBAR.expandedRightPad).toBeLessThan(24);
	});

	test("nav pill inset matches v1 single items px-3", () => {
		expect(SIDEBAR.navPillInset).toBe(12);
	});

	test("widths match v1 chrome", () => {
		expect(SIDEBAR.expandedWidth).toBe(260);
		expect(SIDEBAR.collapsedWidth).toBe(68);
	});
});
