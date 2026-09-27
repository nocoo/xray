import type { DashboardAggregates } from "@xray/shared";
import { apiGet } from "./client";

export type { DashboardAggregates, DashboardLog as IngestLog } from "@xray/shared";

export function fetchDashboard() {
	return apiGet<DashboardAggregates>("/api/dashboard");
}
