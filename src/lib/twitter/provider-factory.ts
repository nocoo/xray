// =============================================================================
// Provider factory - Creates per-user Twitter provider instances
// Resolves credentials from the database for multi-tenant isolation.
// =============================================================================

import * as credentialsRepo from "@/db/repositories/credentials";
import type { ITwitterProvider } from "./types";
import { TweAPIProvider } from "./tweapi-provider";
import { MockTwitterProvider } from "./mock-provider";

const TWEAPI_BASE_URL =
  process.env.TWEAPI_BASE_URL ?? "https://api.tweapi.io";

/**
 * Create a Twitter provider for a specific user.
 *
 * Resolution order:
 * 1. If MOCK_PROVIDER=true → MockTwitterProvider (for dev/test)
 * 2. Lookup user's api_credentials in DB
 * 3. If tweapi_key exists → TweAPIProvider with user's credentials
 * 4. Otherwise → null (caller should return 503 or appropriate error)
 */
export function createProviderForUser(
  userId: string,
): ITwitterProvider | null {
  if (process.env.MOCK_PROVIDER === "true") {
    return new MockTwitterProvider();
  }

  const creds = credentialsRepo.findByUserId(userId);
  if (!creds?.tweapiKey) {
    return null;
  }

  return new TweAPIProvider({
    apiKey: creds.tweapiKey,
    baseUrl: TWEAPI_BASE_URL,
    cookie: creds.twitterCookie ?? undefined,
    timeoutMs: process.env.TWEAPI_TIMEOUT_MS
      ? parseInt(process.env.TWEAPI_TIMEOUT_MS, 10)
      : undefined,
  });
}
