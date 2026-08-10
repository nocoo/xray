import type { Bindings } from "../types.js";

/**
 * CF Rate Limiting binding stub (S3.10 / R2-06).
 * Real ingest path will call this; absent binding = allow (dev).
 */
export async function checkIngestRateLimit(
	env: Bindings,
	tokenId: string,
): Promise<{ allowed: boolean }> {
	const rl = env.XRAY_INGEST_RL;
	if (!rl) {
		return { allowed: true };
	}
	// Workers Rate Limiting API: { success: boolean }
	const result = await rl.limit({ key: tokenId });
	return { allowed: result.success };
}
