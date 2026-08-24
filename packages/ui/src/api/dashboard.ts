import { apiGet } from "./client";

export type IngestLog = {
	id: number;
	watchlistId: number;
	attempted: number;
	accepted: number;
	deduped: number;
	rejected: number;
	errorsJson: string | null;
	createdAtMs: number;
	watchlistName?: string | null;
};

export type ItemDayPoint = { date: string; count: number };
export type IngestDayPoint = {
	date: string;
	accepted: number;
	deduped: number;
	rejected: number;
};

export type DashboardAggregates = {
	watchlistCount: number;
	groupCount: number;
	memberCount: number;
	items24h: number;
	pendingAi: number;
	bySourceType: { sourceType: string; count: number }[];
	itemsTrend: ItemDayPoint[];
	ingestTrend: IngestDayPoint[];
	recentIngestLogs: IngestLog[];
};

export function fetchDashboard() {
	return apiGet<DashboardAggregates>("/api/dashboard");
}
