import type { SourceType } from "@xray/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "./client";

export type Group = {
	id: number;
	name: string;
	description: string | null;
	icon: string;
	createdAtMs: number;
	memberCount: number;
};

export type GroupMember = {
	id: number;
	groupId: number;
	sourceType: SourceType;
	externalAuthorId: string | null;
	handle: string;
	displayName: string | null;
	addedAtMs: number;
};

export function fetchGroups() {
	return apiGet<Group[]>("/api/groups");
}

export function createGroup(input: { name: string; description?: string | null; icon?: string }) {
	return apiPost<Group>("/api/groups", input);
}

export function updateGroup(
	id: number,
	input: Partial<{ name: string; description: string | null; icon: string }>,
) {
	return apiPatch<Group>(`/api/groups/${id}`, input);
}

export function deleteGroup(id: number) {
	return apiDelete<{ deleted: boolean }>(`/api/groups/${id}`);
}

export function fetchGroupMembers(groupId: number) {
	return apiGet<GroupMember[]>(`/api/groups/${groupId}/members`);
}

export function addGroupMember(
	groupId: number,
	input: { sourceType: SourceType; handle: string; displayName?: string | null },
) {
	return apiPost<GroupMember>(`/api/groups/${groupId}/members`, input);
}
