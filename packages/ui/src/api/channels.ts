import type { ArticleInput, ArticlePage, Channel, ChannelArticle, ChannelKey } from "@xray/shared";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./client";

export const fetchChannels = () => apiGet<Channel[]>("/api/channels");
export const createChannel = (name: string, description: string) =>
	apiPost<Channel>("/api/channels", { name, description });
export const updateChannel = (id: number, name: string, description: string) =>
	apiPatch<Channel>(`/api/channels/${id}`, { name, description });
export const deleteChannel = (id: number) => apiDelete<{ deleted: true }>(`/api/channels/${id}`);
export const reorderChannels = (ids: number[]) => apiPut<Channel[]>("/api/channels/order", { ids });
export function fetchArticles(id: number, date = "", before: number | null = null) {
	const query = new URLSearchParams();
	if (date) query.set("date", date);
	if (before !== null) query.set("before", String(before));
	return apiGet<ArticlePage>(`/api/channels/${id}/articles?${query}`);
}
export const fetchArticle = (id: number, articleId: number) =>
	apiGet<ChannelArticle>(`/api/channels/${id}/articles/${articleId}`);
export const updateArticle = (
	id: number,
	articleId: number,
	input: Omit<ArticleInput, "external_id">,
) => apiPatch<ChannelArticle>(`/api/channels/${id}/articles/${articleId}`, input);
export const deleteArticle = (id: number, articleId: number) =>
	apiDelete<{ deleted: true }>(`/api/channels/${id}/articles/${articleId}`);
export const fetchChannelKeys = (id: number) => apiGet<ChannelKey[]>(`/api/channels/${id}/keys`);
export const createChannelKey = (id: number, label: string) =>
	apiPost<ChannelKey & { token: string }>(`/api/channels/${id}/keys`, { label });
export const revokeChannelKey = (id: number, keyId: number) =>
	apiDelete<{ revoked: true }>(`/api/channels/${id}/keys/${keyId}`);
