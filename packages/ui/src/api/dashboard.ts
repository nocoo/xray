import { apiGet } from "./client";

export type DashboardAggregates = {
	watchlistCount: number;
	groupCount: number;
	memberCount: number;
	items24h: number;
	pendingAi: number;
	bySourceType: { sourceType: string; count: number }[];
};

export function fetchDashboard() {
	return apiGet<DashboardAggregates>("/api/dashboard");
}
