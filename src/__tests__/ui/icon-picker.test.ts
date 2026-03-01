import { describe, test, expect } from "bun:test";
import {
  WATCHLIST_ICONS,
  WATCHLIST_ICON_KEYS,
  resolveIcon,
} from "@/components/ui/icon-picker";

describe("icon-picker exports", () => {
  test("WATCHLIST_ICONS has 24 curated icons", () => {
    expect(Object.keys(WATCHLIST_ICONS).length).toBe(24);
  });

  test("WATCHLIST_ICON_KEYS matches WATCHLIST_ICONS keys", () => {
    expect(WATCHLIST_ICON_KEYS).toEqual(Object.keys(WATCHLIST_ICONS));
  });

  test("every icon value is a valid React component", () => {
    for (const key of WATCHLIST_ICON_KEYS) {
      const icon = WATCHLIST_ICONS[key];
      // Lucide icons are ForwardRefExoticComponent (object with $$typeof)
      expect(icon).toBeDefined();
      expect(typeof icon === "function" || typeof icon === "object").toBe(true);
    }
  });

  test("resolveIcon returns the correct component for a known key", () => {
    const result = resolveIcon("brain");
    expect(result).toBe(WATCHLIST_ICONS["brain"]!);
  });

  test("resolveIcon falls back to Eye for unknown key", () => {
    const result = resolveIcon("nonexistent-icon");
    expect(result).toBe(WATCHLIST_ICONS["eye"]!);
  });

  test("resolveIcon falls back to Eye for empty string", () => {
    const result = resolveIcon("");
    expect(result).toBe(WATCHLIST_ICONS["eye"]!);
  });

  test("all icon keys are lowercase kebab-case", () => {
    for (const key of WATCHLIST_ICON_KEYS) {
      expect(key).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  test("default 'eye' icon is included", () => {
    expect(WATCHLIST_ICON_KEYS).toContain("eye");
  });
});
