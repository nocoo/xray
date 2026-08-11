import type { SettingsDto } from "@/api/settings";
import { createStore, errMsg } from "./store";

export type SettingsApi = {
	fetchSettings: () => Promise<SettingsDto>;
	patchSettings: (windowHours: number) => Promise<SettingsDto>;
};

export type SettingsState = {
	email: string;
	windowHours: number;
	loading: boolean;
	error: string | null;
	saved: boolean;
};

export function createSettingsVm(api: SettingsApi) {
	const store = createStore<SettingsState>({
		email: "",
		windowHours: 24,
		loading: false,
		error: null,
		saved: false,
	});

	return {
		...store,
		setWindowHours(n: number) {
			store.setState({ windowHours: n, saved: false });
		},
		async load() {
			store.setState({ loading: true, error: null });
			try {
				const s = await api.fetchSettings();
				store.setState({
					email: s.email,
					windowHours: s.ingest.windowHours,
					loading: false,
				});
			} catch (e) {
				store.setState({ error: errMsg(e), loading: false });
			}
		},
		async save() {
			const { windowHours } = store.getState();
			store.setState({ error: null, saved: false });
			try {
				const s = await api.patchSettings(windowHours);
				store.setState({ windowHours: s.ingest.windowHours, saved: true });
			} catch (e) {
				store.setState({ error: errMsg(e) });
			}
		},
	};
}

export type SettingsVm = ReturnType<typeof createSettingsVm>;
