/**
 * Translation service.
 *
 * Translates tweet text to Chinese and generates an AI editorial comment.
 * Reads AI settings from the settings KV table, creates a Vercel AI SDK client,
 * and calls generateText() for each untranslated post.
 *
 * Output format uses [翻译] and [锐评] delimiters for structured parsing.
 */

import { generateText } from "ai";
import { ScopedDB } from "@/db/scoped";
import {
  resolveAiConfig,
  createAiClient,
  type AiProvider,
  type SdkType,
} from "@/services/ai";
import { DEFAULT_TRANSLATION_TEMPLATE } from "@/services/prompt-defaults";

// Re-export for convenience (server-side consumers can import from here)
export { DEFAULT_TRANSLATION_TEMPLATE, PROMPT_TEMPLATE_VARIABLES } from "@/services/prompt-defaults";

// ── Types ──

export interface TranslationResult {
  postId: number;
  translatedText: string;
  commentText: string;
  quotedTranslatedText?: string;
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
  const db = new ScopedDB(userId);
  const all = db.settings.findAll();
  const map = new Map(all.map((s) => [s.key, s.value]));
  return {
    provider: map.get("ai.provider") ?? "",
    apiKey: map.get("ai.apiKey") ?? "",
    model: map.get("ai.model") ?? "",
    baseURL: map.get("ai.baseURL") ?? "",
    sdkType: map.get("ai.sdkType") ?? "",
    translationPrompt: map.get("ai.translationPrompt") ?? "",
  };
}

// ── Prompt template ──

/**
 * Render a prompt template with Mustache-style conditional blocks and variable substitution.
 *
 * 1. Process conditional blocks: `{{#引用原文}}...{{/引用原文}}`
 *    - If `引用原文` is provided and non-empty → keep block content, substitute variable inside
 *    - If absent or empty → remove entire block
 * 2. Substitute value variables: `{{推文内容}}`, `{{引用原文}}`
 * 3. Unknown variables are left as-is (no error, no removal)
 * 4. If template is empty or missing `{{推文内容}}`, falls back to DEFAULT_TRANSLATION_TEMPLATE
 */
export function renderPrompt(template: string, vars: { 推文内容: string; 引用原文?: string }): string {
  let t = template;

  // Fallback to default if template is empty or missing the required variable
  if (!t.trim() || !t.includes("{{推文内容}}")) {
    t = DEFAULT_TRANSLATION_TEMPLATE;
  }

  // 1. Process conditional blocks: {{#引用原文}}...{{/引用原文}}
  t = t.replace(
    /\{\{#引用原文\}\}([\s\S]*?)\{\{\/引用原文\}\}/g,
    (_, content) => (vars.引用原文 ? content : ""),
  );

  // 2. Substitute variables
  t = t.replace(/\{\{推文内容\}\}/g, vars.推文内容);
  t = t.replace(/\{\{引用原文\}\}/g, vars.引用原文 ?? "");

  return t.trim();
}

// ── Response parser ──

export interface ParsedTranslation {
  translatedText: string;
  commentText: string;
  quotedTranslatedText?: string;
}

/**
 * Parse the structured AI response into translation and comment sections.
 * Supports optional [引用翻译] section for quoted tweets.
 * Falls back gracefully: if markers are missing, treat entire text as translation.
 */
export function parseTranslationResponse(raw: string): ParsedTranslation {
  const trimmed = raw.trim();

  const translateMarker = "[翻译]";
  const quotedMarker = "[引用翻译]";
  const commentMarker = "[锐评]";

  const translateIdx = trimmed.indexOf(translateMarker);
  const quotedIdx = trimmed.indexOf(quotedMarker);
  const commentIdx = trimmed.indexOf(commentMarker);

  // All three markers present — quote tweet translation included
  if (translateIdx !== -1 && quotedIdx !== -1 && commentIdx !== -1) {
    const translatedText = trimmed
      .substring(translateIdx + translateMarker.length, quotedIdx)
      .trim();
    const quotedTranslatedText = trimmed
      .substring(quotedIdx + quotedMarker.length, commentIdx)
      .trim();
    const commentText = trimmed
      .substring(commentIdx + commentMarker.length)
      .trim();
    return { translatedText, commentText, quotedTranslatedText };
  }

  // Both translate + comment markers (no quoted) — original format
  if (translateIdx !== -1 && commentIdx !== -1) {
    const translatedText = trimmed
      .substring(translateIdx + translateMarker.length, commentIdx)
      .trim();
    const commentText = trimmed
      .substring(commentIdx + commentMarker.length)
      .trim();
    return { translatedText, commentText };
  }

  // Only translate marker — no comment
  if (translateIdx !== -1) {
    const translatedText = trimmed
      .substring(translateIdx + translateMarker.length)
      .trim();
    return { translatedText, commentText: "" };
  }

  // No markers at all — fallback: entire response is translation
  return { translatedText: trimmed, commentText: "" };
}

// ── Translation ──

/**
 * Translate a single text using the user's AI configuration.
 * If quotedText is provided, uses a combined prompt that translates both.
 * Returns structured result with translation, editorial comment, and optional quoted translation.
 * Throws if AI is not configured or the call fails.
 */
export async function translateText(
  userId: string,
  text: string,
  quotedText?: string,
): Promise<ParsedTranslation> {
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

  // Use custom template or fall back to default
  const template = settings.translationPrompt || DEFAULT_TRANSLATION_TEMPLATE;
  const prompt = renderPrompt(template, {
    推文内容: text,
    引用原文: quotedText,
  });

  const { text: rawResponse } = await generateText({
    model: client(config.model),
    prompt,
    maxOutputTokens: 2048,
  });

  return parseTranslationResponse(rawResponse);
}

/**
 * Translate multiple posts in batch with concurrency pool (max 3).
 * Each post is translated independently — failures don't block others.
 * If a post has quotedText, both the main and quoted text are translated together.
 * Processes in batches of CONCURRENCY to avoid overwhelming the AI provider.
 */
export async function translateBatch(
  userId: string,
  posts: { id: number; text: string; quotedText?: string }[],
): Promise<BatchTranslationResult> {
  const CONCURRENCY = 3;
  const translated: TranslationResult[] = [];
  const errors: TranslationError[] = [];

  for (let i = 0; i < posts.length; i += CONCURRENCY) {
    const batch = posts.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (post) => {
        const result = await translateText(userId, post.text, post.quotedText);
        return { postId: post.id, ...result };
      }),
    );

    for (let j = 0; j < results.length; j++) {
      const settled = results[j];
      if (!settled) continue;
      if (settled.status === "fulfilled") {
        translated.push({
          postId: settled.value.postId,
          translatedText: settled.value.translatedText,
          commentText: settled.value.commentText,
          quotedTranslatedText: settled.value.quotedTranslatedText,
        });
      } else {
        const post = batch[j];
        if (!post) continue;
        const message = settled.reason instanceof Error
          ? settled.reason.message
          : String(settled.reason);
        errors.push({ postId: post.id, error: message });
      }
    }
  }

  return { translated, errors };
}
