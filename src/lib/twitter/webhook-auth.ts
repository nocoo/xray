// =============================================================================
// Webhook auth - Resolve userId from X-Webhook-Key header
// =============================================================================

import { hashWebhookKey } from "@/lib/crypto";
import * as webhooksRepo from "@/db/repositories/webhooks";

/**
 * Authenticate an incoming request via webhook key.
 *
 * Workflow:
 * 1. Hash the provided key
 * 2. Look up the hash in the webhooks table
 * 3. Return the associated userId
 *
 * Returns null if key is missing, empty, or not found.
 */
export function authenticateWebhookKey(
  key: string | null | undefined,
): { userId: string } | null {
  if (!key) return null;

  const keyHash = hashWebhookKey(key);
  const webhook = webhooksRepo.findByKeyHash(keyHash);

  if (!webhook) return null;

  return { userId: webhook.userId };
}
