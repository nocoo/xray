import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/api/client";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("fetchMe via client", () => {
	test("parses authenticated response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							authenticated: true,
							user: { id: "1", email: "a@b.com", name: "A", image: null },
						}),
						{ status: 200 },
					),
			),
		);
		const { fetchMe } = await import("@/api/me");
		const res = await fetchMe();
		expect(res.authenticated).toBe(true);
		expect(res.user?.email).toBe("a@b.com");
	});

	test("throws ApiError on 401", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 401 })),
		);
		const { fetchMe } = await import("@/api/me");
		await expect(fetchMe()).rejects.toBeInstanceOf(ApiError);
	});
});
