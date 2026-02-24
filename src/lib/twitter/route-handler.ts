// =============================================================================
// Shared route handler for Twitter API routes
//
// Encapsulates: webhook auth → provider creation → error mapping → usage stats
// =============================================================================

import { NextRequest } from "next/server";
import { authenticateWebhookKey } from "./webhook-auth";
import { createProviderForUser } from "./provider-factory";
import { ProviderError } from "./errors";
import { incrementCount } from "@/db/repositories/usage-stats";
import type { ITwitterProvider } from "./types";

type HandlerFn = (
  provider: ITwitterProvider,
  userId: string,
) => Promise<Response>;

/**
 * Extract a normalized endpoint name from the request URL path.
 * e.g. /api/twitter/users/elonmusk/tweets → /api/twitter/users/:username/tweets
 */
function extractEndpoint(pathname: string): string {
  return pathname
    .replace(/\/users\/[^/]+\//, "/users/:username/")
    .replace(/\/tweets\/[^/]+$/, "/tweets/:id");
}

/**
 * Get today's date as YYYY-MM-DD string.
 */
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Track usage stats for the request (fire-and-forget, never blocks response).
 */
function trackUsage(userId: string, pathname: string): void {
  try {
    incrementCount(userId, extractEndpoint(pathname), todayDate());
  } catch {
    // Usage tracking is best-effort — never fail the request
  }
}

/**
 * Wrap a Twitter API route handler with:
 * 1. Webhook key authentication
 * 2. Provider creation for the authenticated user
 * 3. ProviderError → HTTP status mapping
 * 4. Usage stats tracking (fire-and-forget)
 */
export async function withTwitterProvider(
  req: NextRequest,
  handler: HandlerFn,
): Promise<Response> {
  // 1. Authenticate via webhook key
  const webhookKey = req.headers.get("x-webhook-key");
  const authResult = authenticateWebhookKey(webhookKey);

  if (!authResult) {
    return Response.json(
      { success: false, error: "Missing or invalid webhook key" },
      { status: 401 },
    );
  }

  // 2. Create provider for the authenticated user
  const provider = createProviderForUser(authResult.userId);

  if (!provider) {
    return Response.json(
      {
        success: false,
        error: "API credentials not configured for this user",
      },
      { status: 503 },
    );
  }

  // 3. Execute handler with error mapping
  try {
    const response = await handler(provider, authResult.userId);

    // 4. Track usage on success
    trackUsage(authResult.userId, new URL(req.url).pathname);

    return response;
  } catch (err) {
    if (err instanceof ProviderError) {
      return Response.json(
        { success: false, error: err.message },
        { status: err.statusCode },
      );
    }
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
