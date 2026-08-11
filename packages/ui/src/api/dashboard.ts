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
};

export type DashboardAggregates = {
	watchlistCount: number;
	groupCount: number;
	memberCount: number;
	items24h: number;
	pendingAi: number;
	bySourceType: { sourceType: string; count: number }[];
	recentIngestLogs: IngestLog[];
};

export function fetchDashboard() {
	return apiGet<DashboardAggregates>("/api/dashboard");
}
