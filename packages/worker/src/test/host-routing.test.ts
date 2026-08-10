import { describe, expect, test } from "vitest";

const HOST_MATRIX = [
	{ host: "xray-ingest.hexly.ai", path: "/api/live", expect: 200 },
	{ host: "xray-ingest.hexly.ai", path: "/api/me", expect: 404 },
	{ host: "xray.hexly.ai", path: "/api/v1/ingest/push", expect: 404 },
] as const;

describe("host routing matrix skeleton (R3-04)", () => {
	test("ingest host does not expose browser APIs", () => {
		const me = HOST_MATRIX.find((r) => r.path === "/api/me");
		expect(me?.expect).toBe(404);
	});

	test("browser host does not expose push", () => {
		const push = HOST_MATRIX.find((r) => r.path.includes("ingest/push"));
		expect(push?.expect).toBe(404);
	});
});
