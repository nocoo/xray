import { describe, expect, test } from "vitest";
import { documentTitle, SITE_TITLE } from "./document-title";

describe("documentTitle", () => {
	test("prefixes the page name ahead of the site name", () => {
		expect(documentTitle("Watchlists")).toBe("Watchlists - X-Ray");
		expect(documentTitle("  Push tokens  ")).toBe("Push tokens - X-Ray");
	});

	test("keeps the bare site name when the page is missing", () => {
		expect(documentTitle()).toBe(SITE_TITLE);
		expect(documentTitle("")).toBe(SITE_TITLE);
		expect(documentTitle("X-Ray")).toBe(SITE_TITLE);
	});
});
