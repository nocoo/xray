/**
 * Translation service.
 *
 * Translates tweet text to Chinese using the user's configured AI provider.
 * Reads AI settings from the settings KV table, creates a Vercel AI SDK client,
 * and calls generateText() for each untranslated post.
 */

import { generateText } from "ai";
import * as settingsRepo from "@/db/repositories/settings";
import {
  resolveAiConfig,
  createAiClient,
  type AiProvider,
  type SdkType,
} from "@/services/ai";

// ── Types ──

export interface TranslationResult {
  postId: number;
  translatedText: string;
}

export interface TranslationError {
  postId: number;
  error: string;
}

export interface BatchTranslationResult {
  translated: TranslationResult[];
  errors: TranslationError[];
}

// ── AI config resolution ──

function loadAiSettingsForUser(userId: string) {
  const all = settingsRepo.findByUserId(userId);
  const map = new Map(all.map((s) => [s.key, s.value]));
  return {
    provider: map.get("ai.provider") ?? "",
    apiKey: map.get("ai.apiKey") ?? "",
    model: map.get("ai.model") ?? "",
    baseURL: map.get("ai.baseURL") ?? "",
    sdkType: map.get("ai.sdkType") ?? "",
  };
}

// ── Translation ──

const TRANSLATION_PROMPT = `You are a professional translator. Translate the following tweet from English to Chinese (Simplified).

Rules:
- Preserve technical terms, proper nouns, and @mentions as-is.
- Keep hashtags as-is.
- If the tweet is already in Chinese, return it unchanged.
- Return ONLY the translated text, no explanations or prefixes.
- Maintain the original tone and style.

Tweet:
`;

/**
 * Translate a single text using the user's AI configuration.
 * Throws if AI is not configured or the call fails.
 */
export async function translateText(
  userId: string,
  text: string,
): Promise<string> {
  const settings = loadAiSettingsForUser(userId);

  if (!settings.provider || !settings.apiKey) {
    throw new Error("AI provider and API key must be configured first");
  }

  const config = resolveAiConfig({
    provider: settings.provider as AiProvider,
    apiKey: settings.apiKey,
    model: settings.model,
    baseURL: settings.baseURL || undefined,
    sdkType: (settings.sdkType || undefined) as SdkType | undefined,
  });

  const client = createAiClient(config);

  const { text: translated } = await generateText({
    model: client(config.model),
    prompt: TRANSLATION_PROMPT + text,
    maxOutputTokens: 1024,
  });

  return translated.trim();
}

/**
 * Translate multiple posts in batch.
 * Each post is translated independently — failures don't block others.
 */
export async function translateBatch(
  userId: string,
  posts: { id: number; text: string }[],
): Promise<BatchTranslationResult> {
  const translated: TranslationResult[] = [];
  const errors: TranslationError[] = [];

  for (const post of posts) {
    try {
      const translatedText = await translateText(userId, post.text);
      translated.push({ postId: post.id, translatedText });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ postId: post.id, error: message });
    }
  }

  return { translated, errors };
}
