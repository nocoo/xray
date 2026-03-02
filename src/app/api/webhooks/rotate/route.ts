import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import {
  generateWebhookKey,
  hashWebhookKey,
  getKeyPrefix,
} from "@/lib/crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/rotate
 * Rotate an existing webhook key.
 * Generates a new key, replaces the stored hash, returns the new plaintext key once.
 *
 * Body: { id: number }
 */
export async function POST(request: Request) {
  const { db, error } = await requireAuth();
  if (error) return error;

  let body: { id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id || typeof body.id !== "number") {
    return NextResponse.json(
      { error: "Missing or invalid 'id' field" },
      { status: 400 }
    );
  }

  // Generate new key and rotate (ScopedDB verifies ownership internally)
  const newPlaintextKey = generateWebhookKey();
  const newKeyHash = hashWebhookKey(newPlaintextKey);
  const newKeyPrefix = getKeyPrefix(newPlaintextKey);

  const rotated = db.webhooks.rotateKey(body.id, newKeyHash, newKeyPrefix);

  if (!rotated) {
    return NextResponse.json(
      { error: "Webhook not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    id: rotated.id,
    key: newPlaintextKey,
    keyPrefix: newKeyPrefix,
    rotatedAt: rotated.rotatedAt,
    message:
      "Save this new key now — the previous key has been invalidated and this key will not be shown again.",
  });
}
