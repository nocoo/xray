import type { ArticlePage, Channel, ChannelArticle, ChannelKey } from "@xray/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "./client";

export const fetchChannels = () => apiGet<Channel[]>("/api/channels");
export const createChannel = (name: string) => apiPost<Channel>("/api/channels", { name });
export const renameChannel = (id: number, name: string) =>
	apiPatch<Channel>(`/api/channels/${id}`, { name });
export function fetchArticles(id: number, date = "", before: number | null = null) {
	const query = new URLSearchParams();
	if (date) query.set("date", date);
	if (before !== null) query.set("before", String(before));
	return apiGet<ArticlePage>(`/api/channels/${id}/articles?${query}`);
}
export const fetchArticle = (id: number, articleId: number) =>
	apiGet<ChannelArticle>(`/api/channels/${id}/articles/${articleId}`);
export const fetchChannelKeys = (id: number) => apiGet<ChannelKey[]>(`/api/channels/${id}/keys`);
export const createChannelKey = (id: number, label: string) =>
	apiPost<ChannelKey & { token: string }>(`/api/channels/${id}/keys`, { label });
export const revokeChannelKey = (id: number, keyId: number) =>
	apiDelete<{ revoked: true }>(`/api/channels/${id}/keys/${keyId}`);
