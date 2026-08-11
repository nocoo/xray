import type { DashboardAggregates } from "@/api/dashboard";
import { createStore, errMsg } from "./store";

export type DashboardApi = {
	fetchDashboard: () => Promise<DashboardAggregates>;
};

export type DashboardState = {
	data: DashboardAggregates | null;
	loading: boolean;
	error: string | null;
};

export function createDashboardVm(api: DashboardApi) {
	const store = createStore<DashboardState>({
		data: null,
		loading: false,
		error: null,
	});

	return {
		...store,
		async load() {
			store.setState({ loading: true, error: null });
			try {
				const data = await api.fetchDashboard();
				store.setState({ data, loading: false });
			} catch (e) {
				store.setState({ error: errMsg(e), loading: false });
			}
		},
		cards() {
			const data = store.getState().data;
			if (!data) return [];
			return [
				{ label: "Watchlists", value: data.watchlistCount },
				{ label: "Groups", value: data.groupCount },
				{ label: "Members", value: data.memberCount },
				{ label: "Items (24h)", value: data.items24h },
				{ label: "Pending AI", value: data.pendingAi },
			];
		},
	};
}

export type DashboardVm = ReturnType<typeof createDashboardVm>;
