import { afterEach, describe, expect, test } from "vitest";
import {
	emailProfileHash,
	fetchAuthorProfile,
	normalizeProfileEmail,
	parseAuthorProfile,
	resetAuthorProfileCache,
	shouldLookupAuthorProfile,
} from "./author-profile.js";

afterEach(() => {
	resetAuthorProfileCache();
});

describe("emailProfileHash", () => {
	test("normalizes and matches known firefly hash", async () => {
		expect(normalizeProfileEmail("  Architie@Gmail.com  ")).toBe("architie@gmail.com");
		expect(await emailProfileHash("  Architie@Gmail.com  ")).toBe(
			"7ba563171c26fb9b82e9f7750840c0455602eb35025192027230bcb40aae1217",
		);
	});
});

describe("parseAuthorProfile", () => {
	test("hit, miss, and invalid shapes", () => {
		expect(parseAuthorProfile({ name: "Zheng Li", avatar: "https://cdn.example/a.jpg" })).toEqual({
			name: "Zheng Li",
			avatar: "https://cdn.example/a.jpg",
		});
		expect(parseAuthorProfile({ name: null, avatar: null })).toEqual({ name: null, avatar: null });
		expect(parseAuthorProfile({ name: "  ", avatar: "http://insecure" })).toEqual({
			name: null,
			avatar: null,
		});
		expect(parseAuthorProfile(null)).toEqual({ name: null, avatar: null });
		expect(parseAuthorProfile([])).toEqual({ name: null, avatar: null });
	});
});

describe("shouldLookupAuthorProfile", () => {
	test("production/development or injected fetch", () => {
		expect(shouldLookupAuthorProfile(undefined)).toBe(false);
		expect(shouldLookupAuthorProfile({ ENVIRONMENT: "test" })).toBe(false);
		expect(shouldLookupAuthorProfile({ ENVIRONMENT: "production" })).toBe(true);
		expect(shouldLookupAuthorProfile({ ENVIRONMENT: "development" })).toBe(true);
		expect(
			shouldLookupAuthorProfile({
				ENVIRONMENT: "test",
				AUTHOR_PROFILE_FETCH: async () => ({ status: 200, json: async () => ({}) }),
			}),
		).toBe(true);
	});
});

describe("fetchAuthorProfile", () => {
	test("requests hash query and caches 200", async () => {
		const seen: string[] = [];
		const fetchFn = async (url: string) => {
			seen.push(url);
			return {
				status: 200,
				json: async () => ({ name: "Zheng Li", avatar: "https://cdn.example/a.jpg" }),
			};
		};
		const first = await fetchAuthorProfile("architie@gmail.com", fetchFn, 1);
		const second = await fetchAuthorProfile("Architie@gmail.com", fetchFn, 2);
		expect(first).toEqual({ name: "Zheng Li", avatar: "https://cdn.example/a.jpg" });
		expect(second).toEqual(first);
		expect(seen).toHaveLength(1);
		expect(seen[0]).toContain(
			"hash=7ba563171c26fb9b82e9f7750840c0455602eb35025192027230bcb40aae1217",
		);
		expect(seen[0]).not.toContain("architie");
	});

	test("429, network, and bad json fail closed", async () => {
		expect(
			await fetchAuthorProfile("a@b.com", async () => ({ status: 429, json: async () => ({}) })),
		).toEqual({ name: null, avatar: null });
		expect(
			await fetchAuthorProfile("a@b.com", async () => {
				throw new Error("offline");
			}),
		).toEqual({ name: null, avatar: null });
		expect(
			await fetchAuthorProfile("c@d.com", async () => ({
				status: 200,
				json: async () => {
					throw new Error("bad json");
				},
			})),
		).toEqual({ name: null, avatar: null });
	});
});
