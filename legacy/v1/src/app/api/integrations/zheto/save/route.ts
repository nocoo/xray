import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

// =============================================================================
// POST — save a URL to zhe.to via webhook
// =============================================================================

export async function POST(request: Request) {
  const { db, error } = await requireAuth();
  if (error) return error;

  // Read body
  let body: { url: string; note?: string; folder?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body.url) {
    return NextResponse.json(
      { success: false, error: "url is required" },
      { status: 400 },
    );
  }

  // Get webhook URL from user settings
  const webhookUrlSetting = db.settings.findByKey("zheto.webhookUrl");
  const webhookUrl = webhookUrlSetting?.value;

  if (!webhookUrl) {
    return NextResponse.json(
      { success: false, error: "zhe.to webhook URL not configured. Go to Integrations > zhe.to to set it up." },
      { status: 400 },
    );
  }

  // Get default folder from settings (can be overridden by request)
  const defaultFolder = db.settings.findByKey("zheto.folder")?.value ?? "";
  const folder = body.folder ?? defaultFolder;

  // Build zhe.to payload
  const payload: Record<string, string> = { url: body.url };
  if (body.note) payload.note = body.note.slice(0, 500);
  if (folder) payload.folder = folder.slice(0, 50);

  // Proxy to zhe.to webhook
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data?.error ?? `zhe.to returned ${res.status}`,
        },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        shortUrl: data?.shortUrl ?? null,
        slug: data?.slug ?? null,
        originalUrl: data?.originalUrl ?? body.url,
        isExisting: res.status === 200, // 200 = already existed, 201 = newly created
      },
    });
  } catch (err) {
    console.error("[zheto/save] Failed to call zhe.to webhook:", err);
    return NextResponse.json(
      { success: false, error: "Failed to reach zhe.to webhook" },
      { status: 502 },
    );
  }
}
