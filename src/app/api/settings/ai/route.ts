/**
 * GET  /api/settings/ai — Read AI configuration for current user
 * PUT  /api/settings/ai — Save AI configuration (partial update)
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import * as settingsRepo from "@/db/repositories/settings";
import { isValidProvider, type AiProvider, type SdkType } from "@/services/ai";

export const dynamic = "force-dynamic";

// ── AI settings keys stored in the KV table ──

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const AI_KEYS = [
  "ai.provider",
  "ai.apiKey",
  "ai.model",
  "ai.baseURL",
  "ai.sdkType",
] as const;

/** Read all AI settings for a user into a typed object. */
function readAiSettings(userId: string) {
  const all = settingsRepo.findByUserId(userId);
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
  const { user, error } = await requireAuth();
  if (error) return error;

  const settings = readAiSettings(user.id);
  return NextResponse.json({
    ...settings,
    apiKey: maskApiKey(settings.apiKey),
    hasApiKey: !!settings.apiKey,
  });
}

// ── PUT ──

export async function PUT(request: Request) {
  const { user, error } = await requireAuth();
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
    settingsRepo.upsert(user.id, "ai.provider", body.provider);
  }
  if (body.apiKey !== undefined) {
    settingsRepo.upsert(user.id, "ai.apiKey", body.apiKey);
  }
  if (body.model !== undefined) {
    settingsRepo.upsert(user.id, "ai.model", body.model);
  }
  if (body.baseURL !== undefined) {
    settingsRepo.upsert(user.id, "ai.baseURL", body.baseURL);
  }
  if (body.sdkType !== undefined) {
    settingsRepo.upsert(user.id, "ai.sdkType", body.sdkType);
  }

  const updated = readAiSettings(user.id);
  return NextResponse.json({
    ...updated,
    apiKey: maskApiKey(updated.apiKey),
    hasApiKey: !!updated.apiKey,
  });
}
