import type { Tag } from "@xray/shared";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./client";

export const fetchTags = () => apiGet<Tag[]>("/api/tags");
export const createTag = (name: string) => apiPost<Tag>("/api/tags", { name });
export const renameTag = (id: number, name: string) => apiPatch<Tag>(`/api/tags/${id}`, { name });
export const deleteTag = (id: number) => apiDelete<{ deleted: true }>(`/api/tags/${id}`);
export const assignChannelTags = (id: number, tagIds: number[]) =>
	apiPut<Tag[]>(`/api/channels/${id}/tags`, { tagIds });
export const assignKeyTags = (id: number, keyId: number, tagIds: number[]) =>
	apiPut<Tag[]>(`/api/channels/${id}/keys/${keyId}/tags`, { tagIds });
