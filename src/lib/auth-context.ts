import { cache } from "react";
import { auth } from "@/auth";

/**
 * Deduplicated auth() — cached within a single React server render.
 * With JWT strategy, session validation is local (no DB call), but
 * caching still avoids redundant JWT verification within a render pass.
 */
export const getSession = cache(() => auth());

/**
 * Get the authenticated user's ID from the current session.
 * Returns null if not authenticated. Uses React.cache dedup.
 */
export async function getAuthUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}
