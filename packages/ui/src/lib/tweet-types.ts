/** Tweet display model (legacy shared/types parity for UI cards). */

export type TweetAuthor = {
	id: string;
	username: string;
	name: string;
	profile_image_url?: string;
	followers_count?: number;
	is_verified?: boolean;
};

export type TweetMetrics = {
	retweet_count: number;
	like_count: number;
	reply_count: number;
	quote_count: number;
	view_count: number;
	bookmark_count: number;
};

export type TweetMedia = {
	id: string;
	type: "PHOTO" | "VIDEO" | "GIF";
	url: string;
	thumbnail_url?: string;
};

export type TweetEntities = {
	hashtags: string[];
	mentioned_users: string[];
	urls: string[];
};

export type Tweet = {
	id: string;
	text: string;
	author: TweetAuthor;
	created_at: string;
	url: string;
	metrics: TweetMetrics;
	is_retweet: boolean;
	is_quote: boolean;
	is_reply: boolean;
	/** WL member handle who retweeted (no @). Present when is_retweet. */
	retweeted_by?: string;
	lang?: string;
	media?: TweetMedia[];
	entities?: TweetEntities;
	quoted_tweet?: Tweet;
	reply_to_id?: string;
};
