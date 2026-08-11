import type { Watchlist } from "@/api/watchlists";
import { createStore, errMsg } from "./store";

export type WatchlistsApi = {
	fetchWatchlists: () => Promise<Watchlist[]>;
};

export type WatchlistsState = {
	watchlists: Watchlist[];
	loading: boolean;
	error: string | null;
};

export function createWatchlistsVm(api: WatchlistsApi) {
	const store = createStore<WatchlistsState>({
		watchlists: [],
		loading: false,
		error: null,
	});

	return {
		...store,
		async load() {
			store.setState({ loading: true, error: null });
			try {
				const watchlists = await api.fetchWatchlists();
				store.setState({ watchlists, loading: false });
			} catch (e) {
				store.setState({ error: errMsg(e), loading: false });
			}
		},
	};
}

export type WatchlistsVm = ReturnType<typeof createWatchlistsVm>;
