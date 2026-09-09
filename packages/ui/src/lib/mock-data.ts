import type { SourceType } from "@xray/shared";
import type { Tweet } from "@/lib/tweet-types";

export type MockTag = {
	id: number;
	name: string;
	color: string;
};

export type MockMemberProfile = {
	displayName: string;
	profileImageUrl: string;
	followersCount: number;
	isVerified: boolean;
	description?: string;
};

/** Source-aware member (docs/03 watchlist_members). */
export type MockWatchlistMember = {
	id: number;
	sourceType: SourceType;
	/** Normalized handle (x.com username or custom handle). */
	handle: string;
	note: string | null;
	profile: MockMemberProfile | null;
	tags: MockTag[];
};

type MockItemBase = {
	id: number;
	externalId: string;
	sourceType: SourceType;
	createdAt: string;
	translatedText: string | null;
	commentText: string | null;
	quotedTranslatedText: string | null;
	translationError: string | null;
};

export type MockXPost = MockItemBase & {
	sourceType: "x.com";
	tweet: Tweet;
};

export type MockCustomPost = MockItemBase & {
	sourceType: "custom";
	/** Optional producer label (hermes / cli / script) — not source_type. */
	producer?: string;
	title: string | null;
	body: string;
	url: string | null;
	authorName: string | null;
};

/** Mixed timeline item — discriminated on source_type. */
export type MockPost = MockXPost | MockCustomPost;
