import type { ChannelKey, ManagedToken } from "@xray/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "./client";

export { createChannelKey, renameChannelKey, revokeChannelKey } from "./channels";
export const fetchTokens = () => apiGet<ManagedToken[]>("/api/tokens");
export const createWatchlistToken = (label: string) =>
	apiPost<Omit<ChannelKey, "channelId" | "tags"> & { scopes: string[]; token: string }>(
		"/api/push-tokens",
		{ label },
	);
export const renameWatchlistToken = (id: number, label: string) =>
	apiPatch<{ updated: true }>(`/api/push-tokens/${id}`, { label });
export const revokeWatchlistToken = (id: number) =>
	apiDelete<{ revoked: true }>(`/api/push-tokens/${id}`);
