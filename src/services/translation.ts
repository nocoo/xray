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
  commentText: string;
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

// ── Prompt ──

const TRANSLATION_PROMPT = `你是一位兼具"信达雅"功力的翻译家，同时也是一位对世界充满好奇心的顶级报刊编辑。

请对以下推文完成两项任务，并严格按照指定格式输出：

## 任务一：翻译
以"信达雅"标准将推文翻译为简体中文。
- 保留技术术语、专有名词和 @提及原文不译。
- 保留 #话题标签 原文不译。
- 若推文本身已是中文，原样返回。
- 保持原文的语气和风格。

## 任务二：锐评
用1-2句中文写一段编辑锐评——以顶级报刊编辑的视角，用充满好奇心的笔触，点评这条推文为什么值得关注、背后有什么有趣的信号或洞察。要求犀利、有信息增量、不浮夸。

## 输出格式（严格遵守，不要添加任何额外文字）

[翻译]
{翻译内容}

[锐评]
{锐评内容}

推文内容：
`;

// ── Response parser ──

export interface ParsedTranslation {
  translatedText: string;
  commentText: string;
}

/**
 * Parse the structured AI response into translation and comment sections.
 * Falls back gracefully: if markers are missing, treat entire text as translation.
 */
export function parseTranslationResponse(raw: string): ParsedTranslation {
  const trimmed = raw.trim();

  const translateMarker = "[翻译]";
  const commentMarker = "[锐评]";

  const translateIdx = trimmed.indexOf(translateMarker);
  const commentIdx = trimmed.indexOf(commentMarker);

  // Both markers present — extract sections
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
 * Returns structured result with both translation and editorial comment.
 * Throws if AI is not configured or the call fails.
 */
export async function translateText(
  userId: string,
  text: string,
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

  const { text: rawResponse } = await generateText({
    model: client(config.model),
    prompt: TRANSLATION_PROMPT + text,
    maxOutputTokens: 1024,
  });

  return parseTranslationResponse(rawResponse);
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
      const result = await translateText(userId, post.text);
      translated.push({
        postId: post.id,
        translatedText: result.translatedText,
        commentText: result.commentText,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ postId: post.id, error: message });
    }
  }

  return { translated, errors };
}
