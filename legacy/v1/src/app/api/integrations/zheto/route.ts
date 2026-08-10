import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

// =============================================================================
// GET — read zhe.to integration settings
// =============================================================================

export async function GET() {
  const { db, error } = await requireAuth();
  if (error) return error;

  const all = db.settings.findAll();
  const map = new Map(all.map((s) => [s.key, s.value]));

  return NextResponse.json({
    success: true,
    data: {
      webhookUrl: map.get("zheto.webhookUrl") ?? "",
      folder: map.get("zheto.folder") ?? "",
    },
  });
}

// =============================================================================
// PUT — update zhe.to integration settings
// =============================================================================

export async function PUT(request: Request) {
  const { db, error } = await requireAuth();
  if (error) return error;

  let body: { webhookUrl?: string; folder?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  // Validate webhook URL if provided and non-empty
  if (body.webhookUrl !== undefined && body.webhookUrl !== "") {
    try {
      new URL(body.webhookUrl);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid webhook URL" },
        { status: 400 },
      );
    }
  }

  // Upsert provided fields
  if (body.webhookUrl !== undefined) {
    db.settings.upsert("zheto.webhookUrl", body.webhookUrl);
  }
  if (body.folder !== undefined) {
    db.settings.upsert("zheto.folder", body.folder.slice(0, 50));
  }

  // Return current state
  const all = db.settings.findAll();
  const map = new Map(all.map((s) => [s.key, s.value]));

  return NextResponse.json({
    success: true,
    data: {
      webhookUrl: map.get("zheto.webhookUrl") ?? "",
      folder: map.get("zheto.folder") ?? "",
    },
  });
}
