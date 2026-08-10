import type { Bindings } from "../types.js";

/**
 * CF Rate Limiting binding stub (S3.10 / R2-06).
 * Real ingest path will call this; absent binding = allow (dev).
 */
export async function checkIngestRateLimit(
	env: Bindings,
	tokenId: string,
): Promise<{ allowed: boolean; reason?: string }> {
	const rl = env.XRAY_INGEST_RL;
	if (!rl) {
		// S45-04: production fail-closed when binding missing
		const envName = (env.ENVIRONMENT || "").toLowerCase();
		if (envName === "production") {
			return { allowed: false, reason: "rate_limit_unavailable" };
		}
		return { allowed: true };
	}
	const result = await rl.limit({ key: tokenId });
	return { allowed: result.success };
}
