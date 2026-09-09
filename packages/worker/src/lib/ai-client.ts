/**
 * Worker-side OpenAI-compatible chat client (lyre/gecko-style base AI layer).
 * Uses resolveAiBaseUrl + bounded body reads — safe for Cloudflare Workers.
 */

import { readResponseBounded, resolveAiBaseUrl } from "./ai-endpoint.js";

export type ChatMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

export type ChatCompletionInput = {
	apiKey: string;
	model?: string | null;
	baseUrl?: string | null;
	messages: ChatMessage[];
	temperature?: number;
	maxTokens?: number;
	signal?: AbortSignal;
};

export type ChatCompletionResult = {
	content: string;
	raw: unknown;
};

const DEFAULT_MODEL = "gpt-4o-mini";
const BODY_MAX = 32_768;

/**
 * Single chat.completions call against an OpenAI-compatible endpoint.
 * Throws Error with actionable message on config/upstream failure.
 */
export async function chatCompletion(input: ChatCompletionInput): Promise<ChatCompletionResult> {
	const ep = resolveAiBaseUrl(input.baseUrl);
	if (!ep.ok) throw new Error(ep.error);

	const res = await fetch(ep.chatCompletionsUrl, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${input.apiKey}`,
		},
		body: JSON.stringify({
			model: input.model?.trim() || DEFAULT_MODEL,
			messages: input.messages,
			temperature: input.temperature ?? 0.2,
			...(input.maxTokens != null ? { max_tokens: input.maxTokens } : {}),
		}),
		signal: input.signal,
	});

	const bodyText = await readResponseBounded(res, BODY_MAX);
	if (!res.ok) {
		throw new Error(`upstream ${res.status}: ${bodyText.slice(0, 200) || res.statusText}`);
	}

	let json: {
		choices?: Array<{ message?: { content?: string } }>;
	};
	try {
		json = JSON.parse(bodyText) as typeof json;
	} catch {
		throw new Error("upstream response is not JSON");
	}

	const content = json.choices?.[0]?.message?.content?.trim();
	if (!content) throw new Error("empty model response");
	return { content, raw: json };
}

export const TRANSLATE_POST_MARK = "[翻译]";
export const TRANSLATE_REF_MARK = "[引用翻译]";

export function parseCardTranslation(raw: string): {
	translatedText: string;
	quotedTranslatedText: string | null;
} {
	const trimmed = raw.trim();
	const postIdx = trimmed.indexOf(TRANSLATE_POST_MARK);
	const refIdx = trimmed.indexOf(TRANSLATE_REF_MARK);
	if (postIdx !== -1 && refIdx !== -1 && refIdx > postIdx) {
		const translatedText = trimmed.slice(postIdx + TRANSLATE_POST_MARK.length, refIdx).trim();
		const quotedTranslatedText = trimmed.slice(refIdx + TRANSLATE_REF_MARK.length).trim();
		return {
			translatedText: translatedText || trimmed,
			quotedTranslatedText: quotedTranslatedText || null,
		};
	}
	if (postIdx !== -1) {
		return {
			translatedText: trimmed.slice(postIdx + TRANSLATE_POST_MARK.length).trim() || trimmed,
			quotedTranslatedText: null,
		};
	}
	return { translatedText: trimmed, quotedTranslatedText: null };
}

/** Translate + optional summary (product translate path). */
export async function translateAndSummarize(opts: {
	text: string;
	quotedText?: string | null;
	apiKey: string;
	model?: string | null;
	baseUrl?: string | null;
	translationPrompt?: string | null;
	summaryPrompt?: string | null;
	signal?: AbortSignal;
}): Promise<{
	translatedText: string;
	quotedTranslatedText: string | null;
	summaryText: string | null;
}> {
	const quotedText = opts.quotedText?.trim() || null;
	const system = quotedText
		? `${opts.translationPrompt?.trim() || "Translate to Simplified Chinese. Keep proper nouns and code identifiers verbatim."}
The user message has a POST and a REFERENCED post. Reply with exactly:
${TRANSLATE_POST_MARK}
<POST translation>
${TRANSLATE_REF_MARK}
<REFERENCED translation>`
		: opts.translationPrompt?.trim() ||
			"Translate the user message to Simplified Chinese. Reply with translation only. Keep proper nouns and code identifiers verbatim.";

	const userContent = quotedText ? `POST:\n${opts.text}\n\nREFERENCED:\n${quotedText}` : opts.text;

	const { content } = await chatCompletion({
		apiKey: opts.apiKey,
		model: opts.model,
		baseUrl: opts.baseUrl,
		messages: [
			{ role: "system", content: system },
			{ role: "user", content: userContent },
		],
		temperature: 0.2,
		signal: opts.signal,
	});

	const parsed = quotedText
		? parseCardTranslation(content)
		: { translatedText: content, quotedTranslatedText: null };

	const sumPrompt = opts.summaryPrompt?.trim();
	if (!sumPrompt) {
		return { ...parsed, summaryText: null };
	}

	const { content: summaryText } = await chatCompletion({
		apiKey: opts.apiKey,
		model: opts.model,
		baseUrl: opts.baseUrl,
		messages: [
			{ role: "system", content: sumPrompt },
			{ role: "user", content: userContent },
		],
		temperature: 0.2,
		signal: opts.signal,
	});

	return { ...parsed, summaryText };
}
