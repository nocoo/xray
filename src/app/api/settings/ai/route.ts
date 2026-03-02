/**
 * GET  /api/settings/ai — Read AI configuration for current user
 * PUT  /api/settings/ai — Save AI configuration (partial update)
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { isValidProvider, type AiProvider, type SdkType } from "@/services/ai";
import type { ScopedDB } from "@/db/scoped";

export const dynamic = "force-dynamic";

/** Read all AI settings for a user into a typed object. */
function readAiSettings(db: ScopedDB) {
  const all = db.settings.findAll();
  const map = new Map(all.map((s) => [s.key, s.value]));
  return {
    provider: (map.get("ai.provider") ?? "") as AiProvider | "",
    apiKey: map.get("ai.apiKey") ?? "",
    model: map.get("ai.model") ?? "",
    baseURL: map.get("ai.baseURL") ?? "",
    sdkType: (map.get("ai.sdkType") ?? "") as SdkType | "",
  };
}

export type AiSettingsResponse = ReturnType<typeof readAiSettings>;

function maskApiKey(key: string): string {
  if (!key) return "";
  return `${"*".repeat(Math.max(0, key.length - 4))}${key.slice(-4)}`;
}

// ── GET ──

export async function GET() {
  const { db, error } = await requireAuth();
  if (error) return error;

  const settings = readAiSettings(db);
  return NextResponse.json({
    ...settings,
    apiKey: maskApiKey(settings.apiKey),
    hasApiKey: !!settings.apiKey,
  });
}

// ── PUT ──

export async function PUT(request: Request) {
  const { db, error } = await requireAuth();
  if (error) return error;

  let body: {
    provider?: string;
    apiKey?: string;
    model?: string;
    baseURL?: string;
    sdkType?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate provider if provided
  if (body.provider !== undefined && body.provider !== "") {
    if (!isValidProvider(body.provider)) {
      return NextResponse.json(
        { error: `Invalid provider: ${body.provider}` },
        { status: 400 },
      );
    }
  }

  // Validate sdkType if provided
  if (body.sdkType !== undefined && body.sdkType !== "") {
    if (body.sdkType !== "openai" && body.sdkType !== "anthropic") {
      return NextResponse.json(
        { error: `Invalid SDK type: ${body.sdkType}` },
        { status: 400 },
      );
    }
  }

  // Save each provided field
  if (body.provider !== undefined) {
    db.settings.upsert("ai.provider", body.provider);
  }
  if (body.apiKey !== undefined) {
    db.settings.upsert("ai.apiKey", body.apiKey);
  }
  if (body.model !== undefined) {
    db.settings.upsert("ai.model", body.model);
  }
  if (body.baseURL !== undefined) {
    db.settings.upsert("ai.baseURL", body.baseURL);
  }
  if (body.sdkType !== undefined) {
    db.settings.upsert("ai.sdkType", body.sdkType);
  }

  const updated = readAiSettings(db);
  return NextResponse.json({
    ...updated,
    apiKey: maskApiKey(updated.apiKey),
    hasApiKey: !!updated.apiKey,
  });
}
