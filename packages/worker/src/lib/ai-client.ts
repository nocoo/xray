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

/** Translate + optional summary (product translate path). */
export async function translateAndSummarize(opts: {
	text: string;
	apiKey: string;
	model?: string | null;
	baseUrl?: string | null;
	translationPrompt?: string | null;
	summaryPrompt?: string | null;
	signal?: AbortSignal;
}): Promise<{ translatedText: string; summaryText: string | null }> {
	const system =
		opts.translationPrompt?.trim() ||
		"Translate the user message to Simplified Chinese. Reply with translation only. Keep proper nouns and code identifiers verbatim.";

	const { content: translatedText } = await chatCompletion({
		apiKey: opts.apiKey,
		model: opts.model,
		baseUrl: opts.baseUrl,
		messages: [
			{ role: "system", content: system },
			{ role: "user", content: opts.text },
		],
		temperature: 0.2,
		signal: opts.signal,
	});

	const sumPrompt = opts.summaryPrompt?.trim();
	if (!sumPrompt) {
		return { translatedText, summaryText: null };
	}

	const { content: summaryText } = await chatCompletion({
		apiKey: opts.apiKey,
		model: opts.model,
		baseUrl: opts.baseUrl,
		messages: [
			{ role: "system", content: sumPrompt },
			{ role: "user", content: opts.text },
		],
		temperature: 0.2,
		signal: opts.signal,
	});

	return { translatedText, summaryText };
}
