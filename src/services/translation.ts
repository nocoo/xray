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

const TRANSLATION_WITH_QUOTE_PROMPT = `你是一位兼具"信达雅"功力的翻译家，同时也是一位对世界充满好奇心的顶级报刊编辑。

以下推文引用了另一条推文。请对两条推文都进行翻译，并给出一段综合锐评。

## 任务一：翻译推文正文
以"信达雅"标准将推文正文翻译为简体中文。
- 保留技术术语、专有名词和 @提及原文不译。
- 保留 #话题标签 原文不译。
- 若推文本身已是中文，原样返回。
- 保持原文的语气和风格。

## 任务二：翻译引用原文
以同样标准翻译被引用的推文。

## 任务三：锐评
用1-2句中文写一段编辑锐评——以顶级报刊编辑的视角，结合推文正文和引用原文的上下文，点评这条推文为什么值得关注、背后有什么有趣的信号或洞察。要求犀利、有信息增量、不浮夸。

## 输出格式（严格遵守，不要添加任何额外文字）

[翻译]
{推文正文的翻译}

[引用翻译]
{被引用推文的翻译}

[锐评]
{锐评内容}

推文正文：
`;

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

  let prompt: string;
  if (quotedText) {
    prompt = TRANSLATION_WITH_QUOTE_PROMPT + text + "\n\n引用原文：\n" + quotedText;
  } else {
    prompt = TRANSLATION_PROMPT + text;
  }

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
      const settled = results[j]!;
      if (settled.status === "fulfilled") {
        translated.push({
          postId: settled.value.postId,
          translatedText: settled.value.translatedText,
          commentText: settled.value.commentText,
          quotedTranslatedText: settled.value.quotedTranslatedText,
        });
      } else {
        const post = batch[j]!;
        const message = settled.reason instanceof Error
          ? settled.reason.message
          : String(settled.reason);
        errors.push({ postId: post.id, error: message });
      }
    }
  }

  return { translated, errors };
}
