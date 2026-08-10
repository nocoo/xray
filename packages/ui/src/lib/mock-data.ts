import { generateTagColor } from "@/lib/tag-color";
import type { Tweet } from "@/lib/tweet-types";

export type MockTag = {
	id: number;
	name: string;
	color: string;
};

export type MockWatchlist = {
	id: number;
	name: string;
	description: string | null;
	icon: string;
	memberCount: number;
	posts24h: number;
	translateEnabled: boolean;
};

export type MockMemberProfile = {
	displayName: string;
	profileImageUrl: string;
	followersCount: number;
	isVerified: boolean;
	description?: string;
};

export type MockWatchlistMember = {
	id: number;
	twitterUsername: string;
	note: string | null;
	profile: MockMemberProfile | null;
	tags: MockTag[];
};

export type MockPost = {
	id: number;
	tweet: Tweet;
	translatedText: string | null;
	commentText: string | null;
	quotedTranslatedText: string | null;
	translationError: string | null;
};

export type MockGroup = {
	id: number;
	name: string;
	icon: string;
	memberCount: number;
};

export type MockToken = {
	id: number;
	label: string;
	prefix: string;
	createdAt: string;
};

export type MockCustomItem = {
	id: string;
	title: string;
	body: string;
	source: string;
	createdAt: string;
};

const tag = (id: number, name: string): MockTag => ({
	id,
	name,
	color: generateTagColor(name),
});

export const MOCK_TAGS: MockTag[] = [
	tag(1, "AI"),
	tag(2, "Infra"),
	tag(3, "Policy"),
	tag(4, "Founder"),
];

function requireTag(name: string): MockTag {
	const found = MOCK_TAGS.find((t) => t.name === name);
	if (!found) throw new Error(`missing tag ${name}`);
	return found;
}
const tagAI = requireTag("AI");
const tagInfra = requireTag("Infra");
const tagPolicy = requireTag("Policy");
const tagFounder = requireTag("Founder");

export const MOCK_WATCHLISTS: MockWatchlist[] = [
	{
		id: 1,
		name: "AI Research",
		description: "Labs, researchers, and model releases",
		icon: "brain",
		memberCount: 6,
		posts24h: 34,
		translateEnabled: true,
	},
	{
		id: 2,
		name: "Infra",
		description: "Cloud, edge, and platform signals",
		icon: "server",
		memberCount: 4,
		posts24h: 11,
		translateEnabled: true,
	},
	{
		id: 3,
		name: "Markets",
		description: "Macro + crypto watchers",
		icon: "trending-up",
		memberCount: 3,
		posts24h: 7,
		translateEnabled: false,
	},
];

export const MOCK_MEMBERS: MockWatchlistMember[] = [
	{
		id: 1,
		twitterUsername: "karpathy",
		note: "Primary AI signal",
		profile: {
			displayName: "Andrej Karpathy",
			profileImageUrl: "https://unavatar.io/x/karpathy",
			followersCount: 1_200_000,
			isVerified: true,
			description: "Building something new. Previously Tesla AI, OpenAI.",
		},
		tags: [tagAI, tagFounder],
	},
	{
		id: 2,
		twitterUsername: "sama",
		note: null,
		profile: {
			displayName: "Sam Altman",
			profileImageUrl: "https://unavatar.io/x/sama",
			followersCount: 3_400_000,
			isVerified: true,
			description: "AI",
		},
		tags: [tagAI, tagFounder],
	},
	{
		id: 3,
		twitterUsername: "swyx",
		note: "DX / agents",
		profile: {
			displayName: "swyx",
			profileImageUrl: "https://unavatar.io/x/swyx",
			followersCount: 180_000,
			isVerified: false,
			description: "AI Engineer / writer",
		},
		tags: [tagAI, tagInfra],
	},
	{
		id: 4,
		twitterUsername: "cloudflare",
		note: null,
		profile: {
			displayName: "Cloudflare",
			profileImageUrl: "https://unavatar.io/x/cloudflare",
			followersCount: 420_000,
			isVerified: true,
			description: "Helping build a better Internet",
		},
		tags: [tagInfra],
	},
	{
		id: 5,
		twitterUsername: "levelsio",
		note: "Indie",
		profile: {
			displayName: "Pieter Levels",
			profileImageUrl: "https://unavatar.io/x/levelsio",
			followersCount: 650_000,
			isVerified: true,
		},
		tags: [tagFounder],
	},
	{
		id: 6,
		twitterUsername: "ylecun",
		note: null,
		profile: {
			displayName: "Yann LeCun",
			profileImageUrl: "https://unavatar.io/x/ylecun",
			followersCount: 900_000,
			isVerified: true,
			description: "Chief AI Scientist at Meta",
		},
		tags: [tagAI, tagPolicy],
	},
];

function metrics(partial?: Partial<Tweet["metrics"]>): Tweet["metrics"] {
	return {
		retweet_count: 42,
		like_count: 128,
		reply_count: 18,
		quote_count: 6,
		view_count: 52_000,
		bookmark_count: 30,
		...partial,
	};
}

function author(
	username: string,
	name: string,
	opts?: { verified?: boolean; followers?: number },
): Tweet["author"] {
	return {
		id: username,
		username,
		name,
		profile_image_url: `https://unavatar.io/x/${username}`,
		is_verified: opts?.verified ?? true,
		followers_count: opts?.followers,
	};
}

export const MOCK_POSTS: MockPost[] = [
	{
		id: 101,
		translatedText: "今天发布了一个更小的 tokenizer。延迟下降 12%。团队在边缘场景的吞吐也更稳了。",
		commentText: "关注点：延迟与边缘吞吐的权衡，适合对照自家推理链路。",
		quotedTranslatedText: null,
		translationError: null,
		tweet: {
			id: "1001",
			text: "Shipping a smaller tokenizer today. Latency down 12%. Throughput on the edge path is more stable too.",
			author: author("karpathy", "Andrej Karpathy", { followers: 1_200_000 }),
			created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
			url: "https://x.com/karpathy/status/1001",
			metrics: metrics({ like_count: 1840, view_count: 220_000 }),
			is_retweet: false,
			is_quote: false,
			is_reply: false,
			entities: {
				hashtags: ["AI", "LLM"],
				mentioned_users: [],
				urls: [],
			},
			media: [
				{
					id: "m1",
					type: "PHOTO",
					url: "https://picsum.photos/seed/xray1/800/500",
				},
			],
		},
	},
	{
		id: 102,
		translatedText: null,
		commentText: null,
		quotedTranslatedText: null,
		translationError: null,
		tweet: {
			id: "1002",
			text: "Notes on CF Workers + D1 tenancy patterns for multi-user apps.\n\nRow-level security belongs in the data access layer — not in every handler.",
			author: author("swyx", "swyx", { verified: false, followers: 180_000 }),
			created_at: new Date(Date.now() - 5 * 3600_000).toISOString(),
			url: "https://x.com/swyx/status/1002",
			metrics: metrics({ like_count: 256, reply_count: 34 }),
			is_retweet: false,
			is_quote: false,
			is_reply: false,
			entities: {
				hashtags: ["Cloudflare", "D1"],
				mentioned_users: ["cloudflare"],
				urls: ["https://developers.cloudflare.com"],
			},
		},
	},
	{
		id: 103,
		translatedText: "引用这条关于 Durable Objects 的讨论——本地一致性模型值得再读一遍。",
		commentText: "Quote + 原文切换可验证翻译落点（action bar 中英文切换）。",
		quotedTranslatedText: "Durable Objects 给了你单线程一致性。把它当 actor，而不是当全局锁。",
		translationError: null,
		tweet: {
			id: "1003",
			text: "Quoting this DO thread — the local consistency model is worth a re-read.",
			author: author("cloudflare", "Cloudflare"),
			created_at: new Date(Date.now() - 26 * 3600_000).toISOString(),
			url: "https://x.com/cloudflare/status/1003",
			metrics: metrics({ like_count: 512, quote_count: 40 }),
			is_retweet: false,
			is_quote: true,
			is_reply: false,
			quoted_tweet: {
				id: "900",
				text: "Durable Objects give you single-threaded consistency. Treat them like actors, not global locks.",
				author: author("jgrahamc", "John Graham-Cumming", { verified: true }),
				created_at: new Date(Date.now() - 30 * 3600_000).toISOString(),
				url: "https://x.com/jgrahamc/status/900",
				metrics: metrics({ like_count: 900, view_count: 80_000 }),
				is_retweet: false,
				is_quote: false,
				is_reply: false,
			},
		},
	},
	{
		id: 104,
		translatedText: null,
		commentText: null,
		quotedTranslatedText: null,
		translationError: "Mock translation error for UI banner layout.",
		tweet: {
			id: "1004",
			text: "Reply chain example — layout should still show Reply badge and metrics row fade.",
			author: author("levelsio", "Pieter Levels"),
			created_at: new Date(Date.now() - 50 * 60_000).toISOString(),
			url: "https://x.com/levelsio/status/1004",
			metrics: metrics({ like_count: 88, reply_count: 12 }),
			is_retweet: false,
			is_quote: false,
			is_reply: true,
			media: [
				{
					id: "m2",
					type: "PHOTO",
					url: "https://picsum.photos/seed/xray2/600/600",
				},
				{
					id: "m3",
					type: "PHOTO",
					url: "https://picsum.photos/seed/xray3/600/600",
				},
			],
		},
	},
	{
		id: 105,
		translatedText: "开源世界模型路线图草稿。欢迎拍砖。",
		commentText: null,
		quotedTranslatedText: null,
		translationError: null,
		tweet: {
			id: "1005",
			text: "Draft roadmap for open world models. Feedback welcome.",
			author: author("ylecun", "Yann LeCun"),
			created_at: new Date(Date.now() - 8 * 3600_000).toISOString(),
			url: "https://x.com/ylecun/status/1005",
			metrics: metrics({ like_count: 3200, retweet_count: 480 }),
			is_retweet: false,
			is_quote: false,
			is_reply: false,
		},
	},
];

/** Backward-compat thin tweet list used by dashboard snippets. */
export const MOCK_TWEETS = MOCK_POSTS.map((p) => ({
	id: p.tweet.id,
	author: p.tweet.author.name,
	handle: p.tweet.author.username,
	text: p.tweet.text,
	createdAt: p.tweet.created_at,
	likes: p.tweet.metrics.like_count,
}));

export type MockTweet = (typeof MOCK_TWEETS)[number];

export const MOCK_CUSTOM_ITEMS: MockCustomItem[] = [
	{
		id: "c1",
		title: "Hermes digest",
		body: "Weekly agent summary injected via push API — custom item card shell.",
		source: "hermes",
		createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
	},
];

export const MOCK_GROUPS: MockGroup[] = [
	{ id: 1, name: "Core follows", icon: "users", memberCount: 40 },
	{ id: 2, name: "Competitors", icon: "eye", memberCount: 18 },
];

export const MOCK_TOKENS: MockToken[] = [
	{ id: 1, label: "laptop-cli", prefix: "a1b2c3d4", createdAt: "2026-08-01" },
	{ id: 2, label: "hermes-agent", prefix: "e5f6g7h8", createdAt: "2026-08-05" },
];

export const MOCK_DASHBOARD = {
	watchlistCount: MOCK_WATCHLISTS.length,
	groupCount: MOCK_GROUPS.length,
	posts24h: MOCK_WATCHLISTS.reduce((n, w) => n + w.posts24h, 0),
	pendingAi: 4,
};
