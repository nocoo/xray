import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import {
  generateWebhookKey,
  hashWebhookKey,
  getKeyPrefix,
} from "@/lib/crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/webhooks
 * List all webhooks for the current user.
 * Returns metadata only (hash prefix, timestamps) — never the actual key.
 */
export async function GET() {
  const { db, error } = await requireAuth();
  if (error) return error;

  const hooks = db.webhooks.findAll();

  return NextResponse.json(
    hooks.map((h) => ({
      id: h.id,
      keyPrefix: h.keyPrefix,
      createdAt: h.createdAt,
      rotatedAt: h.rotatedAt,
    }))
  );
}

/**
 * POST /api/webhooks
 * Generate a new webhook key.
 * Returns the plaintext key ONCE — it will never be retrievable again.
 */
export async function POST() {
  const { db, error } = await requireAuth();
  if (error) return error;

  const plaintextKey = generateWebhookKey();
  const keyHash = hashWebhookKey(plaintextKey);
  const keyPrefix = getKeyPrefix(plaintextKey);

  const webhook = db.webhooks.create({ keyHash, keyPrefix });

  return NextResponse.json(
    {
      id: webhook.id,
      key: plaintextKey,
      keyPrefix,
      createdAt: webhook.createdAt,
      message:
        "Save this key now — it will not be shown again. Use it in the X-Webhook-Key header.",
    },
    { status: 201 }
  );
}

/**
 * DELETE /api/webhooks
 * Delete a webhook by ID (passed as query param).
 */
export async function DELETE(request: Request) {
  const { db, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const idStr = searchParams.get("id");

  if (!idStr) {
    return NextResponse.json(
      { error: "Missing 'id' query parameter" },
      { status: 400 }
    );
  }

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json(
      { error: "Invalid webhook ID" },
      { status: 400 }
    );
  }

  const deleted = db.webhooks.deleteById(id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Webhook not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ deleted: true });
}
