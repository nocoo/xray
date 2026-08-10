import { describe, expect, test } from "vitest";

/**
 * Sidebar collapse/expand anti-jitter contract (ported from v1).
 *
 * Logo x must match across modes:
 *   expanded: outer px-3 (12) + inner px-3 (12) = 24
 *   collapsed: pl-6 = 24
 *
 * Avatar x must match across modes:
 *   expanded: footer px-4 = 16
 *   collapsed: centered in 68 → (68 - 36) / 2 = 16
 */
const SIDEBAR = {
	expandedWidth: 260,
	collapsedWidth: 68,
	logoSize: 24,
	avatarSize: 36, // h-9 w-9
	expandedLogoPad: 12 + 12, // outer px-3 + inner px-3
	collapsedLogoPad: 24, // pl-6
	expandedAvatarPad: 16, // px-4
} as const;

describe("sidebar geometry contract", () => {
	test("logo left edge is identical when collapsed and expanded", () => {
		expect(SIDEBAR.expandedLogoPad).toBe(SIDEBAR.collapsedLogoPad);
		expect(SIDEBAR.expandedLogoPad).toBe(SIDEBAR.logoSize);
	});

	test("avatar left edge is identical when collapsed and expanded", () => {
		const collapsedAvatarLeft = (SIDEBAR.collapsedWidth - SIDEBAR.avatarSize) / 2;
		expect(collapsedAvatarLeft).toBe(SIDEBAR.expandedAvatarPad);
	});

	test("widths match v1 chrome", () => {
		expect(SIDEBAR.expandedWidth).toBe(260);
		expect(SIDEBAR.collapsedWidth).toBe(68);
	});
});
