export type ContentDayPoint = { date: string; watchlists: number; channels: number };

export type DashboardLog = {
	id: number;
	watchlistId: number | null;
	attempted: number;
	accepted: number;
	deduped: number;
	rejected: number;
	errorsJson: string | null;
	createdAtMs: number;
	watchlistName: string | null;
};

export type DashboardAggregates = {
	watchlistCount: number;
	channelCount: number;
	groupCount: number;
	memberCount: number;
	contentCount: number;
	content24h: number;
	pendingAi: number;
	contentTrend: ContentDayPoint[];
	recentIngestLogs: DashboardLog[];
};
