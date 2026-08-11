import type { ZhetoSettings } from "@/api/zheto";
import { createStore, errMsg } from "./store";

export type ZhetoSettingsApi = {
	fetchZhetoSettings: () => Promise<ZhetoSettings>;
	saveZhetoSettings: (input: {
		webhookUrl?: string;
		folder?: string | null;
	}) => Promise<ZhetoSettings>;
};

export type ZhetoSettingsState = {
	settings: ZhetoSettings | null;
	webhookUrl: string;
	folder: string;
	loading: boolean;
	error: string | null;
	saved: boolean;
};

export function createZhetoSettingsVm(api: ZhetoSettingsApi) {
	const store = createStore<ZhetoSettingsState>({
		settings: null,
		webhookUrl: "",
		folder: "",
		loading: false,
		error: null,
		saved: false,
	});

	return {
		...store,
		setWebhookUrl(v: string) {
			store.setState({ webhookUrl: v, saved: false });
		},
		setFolder(v: string) {
			store.setState({ folder: v, saved: false });
		},
		async load() {
			store.setState({ loading: true, error: null });
			try {
				const settings = await api.fetchZhetoSettings();
				store.setState({
					settings,
					folder: settings.folder ?? "",
					loading: false,
				});
			} catch (e) {
				store.setState({ error: errMsg(e), loading: false });
			}
		},
		async save() {
			const s = store.getState();
			store.setState({ error: null, saved: false });
			try {
				const settings = await api.saveZhetoSettings({
					webhookUrl: s.webhookUrl || undefined,
					folder: s.folder || null,
				});
				store.setState({ settings, webhookUrl: "", saved: true });
			} catch (e) {
				store.setState({ error: errMsg(e) });
			}
		},
	};
}

export type ZhetoSettingsVm = ReturnType<typeof createZhetoSettingsVm>;
