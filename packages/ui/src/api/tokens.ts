import { apiDelete, apiGet, apiPost } from "./client";

export type PushToken = {
	id: number;
	label: string;
	tokenPrefix: string;
	scopes: string[];
	createdAtMs: number;
	lastUsedAtMs: number | null;
	revokedAtMs: number | null;
	token?: string;
};

export function fetchPushTokens() {
	return apiGet<PushToken[]>("/api/push-tokens");
}

export function createPushToken(label: string) {
	return apiPost<PushToken>("/api/push-tokens", { label });
}

export function revokePushToken(id: number) {
	return apiDelete<{ revoked: boolean }>(`/api/push-tokens/${id}`);
}
