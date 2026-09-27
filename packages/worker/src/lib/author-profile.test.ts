import { afterEach, describe, expect, test } from "vitest";
import { externalBinding } from "../test/external-binding.js";
import {
	emailProfileHash,
	fetchAuthorProfile,
	normalizeProfileEmail,
	parseAuthorProfile,
	resetAuthorProfileCache,
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

describe("fetchAuthorProfile", () => {
	test("requests hash query and caches 200", async () => {
		const seen: string[] = [];
		const fetchFn = externalBinding(async (url) => {
			seen.push(String(url));
			return Response.json({ name: "Zheng Li", avatar: "https://cdn.example/a.jpg" });
		});
		const first = await fetchAuthorProfile("architie@gmail.com", { XRAY_EXTERNAL: fetchFn }, 1);
		const second = await fetchAuthorProfile("Architie@gmail.com", { XRAY_EXTERNAL: fetchFn }, 2);
		expect(first).toEqual({ name: "Zheng Li", avatar: "https://cdn.example/a.jpg" });
		expect(second).toEqual(first);
		expect(seen).toHaveLength(1);
		expect(seen[0]).toContain("https://lizheng.blog/api/authors/profile?hash=");
		expect(seen[0]).toContain(
			"hash=7ba563171c26fb9b82e9f7750840c0455602eb35025192027230bcb40aae1217",
		);
		expect(seen[0]).not.toContain("architie");
		expect(seen[0]).not.toContain("firefly.dev.hexly.ai");
	});

	test("profile caches stay scoped to their external binding", async () => {
		const first = { XRAY_EXTERNAL: externalBinding(async () => Response.json({ name: "First" })) };
		const second = {
			XRAY_EXTERNAL: externalBinding(async () => Response.json({ name: "Second" })),
		};
		expect((await fetchAuthorProfile("owner@xray.test", first)).name).toBe("First");
		expect((await fetchAuthorProfile("owner@xray.test", second)).name).toBe("Second");
		expect((await fetchAuthorProfile("owner@xray.test", first)).name).toBe("First");
	});

	test("429, network, and bad json fail closed", async () => {
		for (const fetch of [
			async () => new Response(null, { status: 429 }),
			async () => {
				throw new Error("offline");
			},
			async () => new Response("not JSON"),
		]) {
			expect(
				await fetchAuthorProfile("a@b.com", { XRAY_EXTERNAL: externalBinding(fetch) }),
			).toEqual({ name: null, avatar: null });
		}
	});
});
