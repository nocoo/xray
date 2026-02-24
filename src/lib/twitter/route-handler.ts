// =============================================================================
// Shared route handler for Twitter API routes
//
// Encapsulates: webhook auth → provider creation → error mapping
// =============================================================================

import { NextRequest } from "next/server";
import { authenticateWebhookKey } from "./webhook-auth";
import { createProviderForUser } from "./provider-factory";
import { ProviderError } from "./errors";
import type { ITwitterProvider } from "./types";

type HandlerFn = (
  provider: ITwitterProvider,
  userId: string,
) => Promise<Response>;

/**
 * Wrap a Twitter API route handler with:
 * 1. Webhook key authentication
 * 2. Provider creation for the authenticated user
 * 3. ProviderError → HTTP status mapping
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
    return await handler(provider, authResult.userId);
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
