// =============================================================================
// Session-based Twitter provider handler
//
// Like route-handler.ts but uses NextAuth session instead of webhook keys.
// Used by internal web UI API routes (e.g. /api/explore/*).
// =============================================================================

import { requireAuth } from "@/lib/api-helpers";
import { createProviderForUser } from "./provider-factory";
import { ProviderError } from "./errors";
import type { ITwitterProvider } from "./types";

type HandlerFn = (
  provider: ITwitterProvider,
  userId: string,
) => Promise<Response>;

/**
 * Wrap a Twitter API route handler with session-based auth + provider creation.
 * For use in internal web UI routes (no webhook key needed).
 */
export async function withSessionProvider(
  handler: HandlerFn,
): Promise<Response> {
  const { user, error } = await requireAuth();
  if (error) return error;

  const provider = createProviderForUser(user.id);
  if (!provider) {
    return Response.json(
      {
        success: false,
        error: "API credentials not configured. Go to Settings to set them up.",
      },
      { status: 503 },
    );
  }

  try {
    return await handler(provider, user.id);
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
