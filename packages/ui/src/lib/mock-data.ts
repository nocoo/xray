export type MockWatchlist = {
	id: number;
	name: string;
	icon: string;
	memberCount: number;
	posts24h: number;
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

export type MockTweet = {
	id: string;
	author: string;
	handle: string;
	text: string;
	createdAt: string;
	likes: number;
};

export type MockCustomItem = {
	id: string;
	title: string;
	body: string;
	source: string;
	createdAt: string;
};

export const MOCK_WATCHLISTS: MockWatchlist[] = [
	{ id: 1, name: "AI Research", icon: "brain", memberCount: 12, posts24h: 34 },
	{ id: 2, name: "Infra", icon: "server", memberCount: 8, posts24h: 11 },
	{ id: 3, name: "Markets", icon: "trending-up", memberCount: 5, posts24h: 7 },
];

export const MOCK_GROUPS: MockGroup[] = [
	{ id: 1, name: "Core follows", icon: "users", memberCount: 40 },
	{ id: 2, name: "Competitors", icon: "eye", memberCount: 18 },
];

export const MOCK_TOKENS: MockToken[] = [
	{ id: 1, label: "laptop-cli", prefix: "a1b2c3d4", createdAt: "2026-08-01" },
	{ id: 2, label: "hermes-agent", prefix: "e5f6g7h8", createdAt: "2026-08-05" },
];

export const MOCK_TWEETS: MockTweet[] = [
	{
		id: "1001",
		author: "Ada",
		handle: "ada",
		text: "Shipping a smaller tokenizer today. Latency down 12%.",
		createdAt: "2026-08-10T08:00:00.000Z",
		likes: 128,
	},
	{
		id: "1002",
		author: "Lin",
		handle: "lin",
		text: "Notes on CF Workers + D1 tenancy patterns for multi-user apps.",
		createdAt: "2026-08-10T09:30:00.000Z",
		likes: 56,
	},
];

export const MOCK_CUSTOM_ITEMS: MockCustomItem[] = [
	{
		id: "c1",
		title: "Hermes digest",
		body: "Weekly agent summary injected via push API.",
		source: "hermes",
		createdAt: "2026-08-10T07:00:00.000Z",
	},
];

export const MOCK_DASHBOARD = {
	watchlistCount: MOCK_WATCHLISTS.length,
	groupCount: MOCK_GROUPS.length,
	posts24h: MOCK_WATCHLISTS.reduce((n, w) => n + w.posts24h, 0),
	pendingAi: 4,
};
