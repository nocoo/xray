import { describe, expect, test } from "vitest";
import { checkIngestRateLimit } from "./rate-limit.js";

describe("checkIngestRateLimit", () => {
	test("allows when binding missing", async () => {
		const r = await checkIngestRateLimit({} as never, "t1");
		expect(r.allowed).toBe(true);
	});

	test("respects binding result", async () => {
		const r = await checkIngestRateLimit(
			{
				XRAY_INGEST_RL: {
					limit: async () => ({ success: false }),
				},
			} as never,
			"t1",
		);
		expect(r.allowed).toBe(false);
	});
});
