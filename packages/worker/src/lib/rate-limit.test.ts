import { describe, expect, test } from "vitest";
import { checkIngestRateLimit } from "./rate-limit.js";

describe("checkIngestRateLimit", () => {
	test("allows when binding missing in development", async () => {
		const r = await checkIngestRateLimit({ ENVIRONMENT: "development" } as never, "t1");
		expect(r.allowed).toBe(true);
	});

	test("fail-closed in production when binding missing", async () => {
		const r = await checkIngestRateLimit({ ENVIRONMENT: "production" } as never, "t1");
		expect(r.allowed).toBe(false);
		expect(r.reason).toBe("rate_limit_unavailable");
	});

	test("respects binding result", async () => {
		const r = await checkIngestRateLimit(
			{
				ENVIRONMENT: "production",
				XRAY_INGEST_RL: {
					limit: async () => ({ success: false }),
				},
			} as never,
			"t1",
		);
		expect(r.allowed).toBe(false);
		const ok = await checkIngestRateLimit(
			{
				ENVIRONMENT: "production",
				XRAY_INGEST_RL: {
					limit: async () => ({ success: true }),
				},
			} as never,
			"t1",
		);
		expect(ok.allowed).toBe(true);
	});

	test("missing env name allows without binding", async () => {
		const r = await checkIngestRateLimit({} as never, "t1");
		expect(r.allowed).toBe(true);
	});
});
