import { apiGet, apiPost, apiPut } from "./client";

export type AiConfig = {
	provider: string;
	model: string | null;
	baseUrl: string | null;
	apiKeyMasked: string;
	hasApiKey: boolean;
	apiKeyKeyVersion: number;
	translationPrompt: string | null;
	summaryPrompt: string | null;
	updatedAtMs: number;
};

export function fetchAiConfig() {
	return apiGet<AiConfig | { configured?: boolean }>("/api/ai-config");
}

export function saveAiConfig(input: {
	provider: string;
	model?: string | null;
	baseUrl?: string | null;
	apiKey?: string;
	translationPrompt?: string | null;
	summaryPrompt?: string | null;
}) {
	return apiPut<AiConfig>("/api/ai-config", input);
}

export type TranslateResult = {
	results: Array<{
		id: number;
		ai_status: string;
		error?: string;
		translatedText?: string | null;
		summaryText?: string | null;
	}>;
	timed_out: boolean;
};

export function translateWatchlist(
	watchlistId: number,
	body?: { limit?: number; item_ids?: number[] },
) {
	return apiPost<TranslateResult>(`/api/watchlists/${watchlistId}/translate`, body ?? {});
}

export type AiTestResult = {
	ok: boolean;
	status?: number;
	error?: string;
	provider?: string | null;
	model?: string | null;
};

/** Test saved config, or pass draft fields (provider/model/baseUrl/apiKey) to ping without save. */
export function testAiConfig(draft?: {
	provider?: string;
	model?: string | null;
	baseUrl?: string | null;
	apiKey?: string;
}) {
	return apiPost<AiTestResult>("/api/ai-config/test", draft ?? {});
}
