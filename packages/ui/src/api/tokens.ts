import type { ChannelKey, ManagedToken, QueryTokenInput } from "@xray/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "./client";

export { createChannelKey, fetchChannels, renameChannelKey, revokeChannelKey } from "./channels";
export { fetchWatchlists } from "./watchlists";
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
export const createQueryToken = (input: QueryTokenInput) =>
	apiPost<ManagedToken & { token: string }>("/api/query-tokens", input);
export const updateQueryToken = (id: number, input: QueryTokenInput) =>
	apiPatch<{ updated: true }>(`/api/query-tokens/${id}`, input);
export const revokeQueryToken = (id: number) =>
	apiDelete<{ revoked: true }>(`/api/query-tokens/${id}`);
