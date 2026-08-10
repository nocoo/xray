import type { SourceType } from "@xray/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "./client";

export type Watchlist = {
	id: number;
	name: string;
	description: string | null;
	icon: string;
	translateEnabled: boolean;
	createdAtMs: number;
	memberCount: number;
};

export type Tag = { id: number; name: string; color: string };

export type Member = {
	id: number;
	watchlistId: number;
	sourceType: SourceType;
	externalAuthorId: string | null;
	handle: string;
	displayName: string | null;
	note: string | null;
	addedAtMs: number;
	tags: Tag[];
};

export type TimelineItem = {
	id: number;
	watchlistId: number;
	sourceType: SourceType;
	externalId: string;
	memberId: number | null;
	authorUsername: string | null;
	title: string | null;
	text: string;
	createdAtMs: number;
	ingestedAtMs: number;
	payload: unknown;
	aiStatus: string;
	translatedText: string | null;
	summaryText: string | null;
	translationError: string | null;
};

export function fetchWatchlists() {
	return apiGet<Watchlist[]>("/api/watchlists");
}

export function createWatchlist(input: {
	name: string;
	description?: string | null;
	icon?: string;
	translateEnabled?: boolean;
}) {
	return apiPost<Watchlist>("/api/watchlists", input);
}

export function fetchWatchlist(id: number) {
	return apiGet<Watchlist>(`/api/watchlists/${id}`);
}

export function updateWatchlist(
	id: number,
	input: Partial<{
		name: string;
		description: string | null;
		icon: string;
		translateEnabled: boolean;
	}>,
) {
	return apiPatch<Watchlist>(`/api/watchlists/${id}`, input);
}

export function deleteWatchlist(id: number) {
	return apiDelete<{ deleted: boolean }>(`/api/watchlists/${id}`);
}

export function fetchMembers(watchlistId: number) {
	return apiGet<Member[]>(`/api/watchlists/${watchlistId}/members`);
}

export function addMember(
	watchlistId: number,
	input: {
		sourceType: SourceType;
		handle: string;
		displayName?: string | null;
		note?: string | null;
		tagIds?: number[];
	},
) {
	return apiPost<Member>(`/api/watchlists/${watchlistId}/members`, input);
}

export function deleteMember(watchlistId: number, memberId: number) {
	return apiDelete<{ deleted: boolean }>(`/api/watchlists/${watchlistId}/members/${memberId}`);
}

export function fetchItems(
	watchlistId: number,
	opts?: { source_type?: SourceType; limit?: number; cursor?: number },
) {
	const q = new URLSearchParams();
	if (opts?.source_type) q.set("source_type", opts.source_type);
	if (opts?.limit) q.set("limit", String(opts.limit));
	if (opts?.cursor) q.set("cursor", String(opts.cursor));
	const qs = q.toString();
	return apiGet<{ items: TimelineItem[]; nextCursor: number | null }>(
		`/api/watchlists/${watchlistId}/items${qs ? `?${qs}` : ""}`,
	);
}

export function fetchTags() {
	return apiGet<Tag[]>("/api/tags");
}

export function createTag(name: string, color: string) {
	return apiPost<Tag>("/api/tags", { name, color });
}
