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
				{
					key: "content",
					label: "Total content",
					value: data.contentCount,
					subtitle: "Watchlist items + channel reports",
				},
				{
					key: "recent",
					label: "Added (24h)",
					value: data.content24h,
					subtitle: "Across watchlists and channels",
				},
				{
					key: "watchlists",
					label: "Watchlists",
					value: data.watchlistCount,
					subtitle: `Groups ${data.groupCount} · Members ${data.memberCount}`,
				},
				{
					key: "channels",
					label: "Channels",
					value: data.channelCount,
					subtitle: "Markdown report streams",
				},
			] as const;
		},
		activity() {
			const points = store.getState().data?.contentTrend ?? [];
			const watchlists = points.reduce((sum, point) => sum + point.watchlists, 0);
			const channels = points.reduce((sum, point) => sum + point.channels, 0);
			return {
				points: points.map(({ date, ...counts }) => ({ x: date, ...counts })),
				watchlists,
				channels,
				total: watchlists + channels,
			};
		},
	};
}

export type DashboardVm = ReturnType<typeof createDashboardVm>;
