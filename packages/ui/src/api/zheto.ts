import { apiGet, apiPost, apiPut } from "./client";

export type ZhetoSettings = {
	configured: boolean;
	webhookUrlMasked: string;
	folder: string | null;
	updatedAtMs: number | null;
};

export type ZhetoSaveResult = {
	shortUrl: string | null;
	slug: string | null;
	originalUrl: string;
	isExisting: boolean;
};

export function fetchZhetoSettings() {
	return apiGet<ZhetoSettings>("/api/integrations/zheto");
}

export function saveZhetoSettings(input: { webhookUrl?: string; folder?: string | null }) {
	return apiPut<ZhetoSettings>("/api/integrations/zheto", input);
}

export function zhetoSave(input: { url: string; note?: string; folder?: string }) {
	return apiPost<ZhetoSaveResult>("/api/integrations/zheto/save", input);
}
