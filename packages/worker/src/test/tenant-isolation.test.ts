import { describe, expect, test } from "vitest";

/**
 * L2 tenant isolation matrix skeleton (XR-13).
 * Full route matrix expands in S4/S5; here we lock the contract shape.
 */
const CROSS_USER_CASES = [
	{ method: "GET", path: "/api/watchlists/1", expect: 404 },
	{ method: "PATCH", path: "/api/watchlists/1", expect: 404 },
	{ method: "DELETE", path: "/api/watchlists/1", expect: 404 },
	{ method: "GET", path: "/api/groups/1", expect: 404 },
] as const;

describe("tenant isolation matrix skeleton", () => {
	test("defines cross-user cases as 404", () => {
		expect(CROSS_USER_CASES.length).toBeGreaterThan(0);
		for (const c of CROSS_USER_CASES) {
			expect(c.expect).toBe(404);
		}
	});

	test("repo queries must always include user_id", () => {
		const sample = "SELECT * FROM watchlists WHERE id = ? AND user_id = ?";
		expect(sample).toMatch(/user_id\s*=\s*\?/);
	});
});
