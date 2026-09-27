import type { SourceType } from "@xray/shared";

export type ContentTag = {
	id: number;
	name: string;
	color: string;
};

export type MemberProfile = {
	displayName: string;
	profileImageUrl: string;
	followersCount: number;
	isVerified: boolean;
	description?: string;
};

/** Source-aware member (docs/03 watchlist_members). */
export type WatchlistMemberCard = {
	id: number;
	sourceType: SourceType;
	/** Normalized handle (x.com username or custom handle). */
	handle: string;
	note: string | null;
	profile: MemberProfile | null;
	tags: ContentTag[];
};
