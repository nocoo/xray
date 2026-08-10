import { describe, expect, test } from "vitest";
import { SIDEBAR_GEOMETRY as G } from "./sidebar-geometry";

describe("SIDEBAR_GEOMETRY", () => {
	test("logo left edge is identical when collapsed and expanded", () => {
		expect(G.logoPadPx).toBe(G.logoSizePx);
		expect(G.headerPadClass).toContain("pl-6");
	});

	test("avatar left edge is identical when collapsed and expanded", () => {
		const collapsedAvatarLeft = (G.collapsedWidthPx - G.avatarSizePx) / 2;
		expect(collapsedAvatarLeft).toBe(G.expandedAvatarPadPx);
		expect(G.footerPadClass).toContain("px-4");
	});

	test("expanded right chrome is a single pr-3 band, not double px-3", () => {
		expect(G.expandedRightPadPx).toBe(12);
		expect(G.headerPadClass).toContain("pr-3");
		expect(G.headerPadClass).not.toMatch(/px-3/);
	});

	test("nav pill inset matches v1 single items px-3", () => {
		expect(G.navPillInsetPx).toBe(12);
		expect(G.navItemsPadClass).toBe("px-3");
	});

	test("widths match v1 chrome classes", () => {
		expect(G.expandedWidthPx).toBe(260);
		expect(G.collapsedWidthPx).toBe(68);
		expect(G.expandedWidthClass).toBe("w-[260px]");
		expect(G.collapsedWidthClass).toBe("w-[68px]");
	});
});
