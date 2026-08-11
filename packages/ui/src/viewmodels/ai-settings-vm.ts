import type { AiConfig, AiTestResult } from "@/api/ai";
import { createStore, errMsg } from "./store";

export type AiSettingsApi = {
	fetchAiConfig: () => Promise<AiConfig | { configured?: boolean }>;
	saveAiConfig: (input: {
		provider: string;
		model?: string | null;
		baseUrl?: string | null;
		apiKey?: string;
		translationPrompt?: string | null;
		summaryPrompt?: string | null;
	}) => Promise<AiConfig>;
	testAiConfig: (draft?: {
		provider?: string;
		model?: string | null;
		baseUrl?: string | null;
		apiKey?: string;
	}) => Promise<AiTestResult>;
};

export type AiSettingsState = {
	cfg: AiConfig | null;
	provider: string;
	model: string;
	baseUrl: string;
	apiKey: string;
	translationPrompt: string;
	summaryPrompt: string;
	loading: boolean;
	saving: boolean;
	testing: boolean;
	error: string | null;
	saved: boolean;
	testOk: boolean | null;
	testMsg: string | null;
};

export function createAiSettingsVm(api: AiSettingsApi) {
	const store = createStore<AiSettingsState>({
		cfg: null,
		provider: "openai",
		model: "gpt-4o-mini",
		baseUrl: "",
		apiKey: "",
		translationPrompt: "",
		summaryPrompt: "",
		loading: false,
		saving: false,
		testing: false,
		error: null,
		saved: false,
		testOk: null,
		testMsg: null,
	});

	return {
		...store,
		patchForm(partial: Partial<AiSettingsState>) {
			store.setState({ ...partial, saved: false });
		},
		async load() {
			store.setState({ loading: true, error: null });
			try {
				const data = await api.fetchAiConfig();
				if (data && "provider" in data) {
					store.setState({
						cfg: data,
						provider: data.provider,
						model: data.model ?? "",
						baseUrl: data.baseUrl ?? "",
						translationPrompt: data.translationPrompt ?? "",
						summaryPrompt: data.summaryPrompt ?? "",
						loading: false,
					});
				} else {
					store.setState({ loading: false });
				}
			} catch (e) {
				store.setState({ error: errMsg(e), loading: false });
			}
		},
		async save() {
			const s = store.getState();
			store.setState({ error: null, saved: false, saving: true });
			try {
				const data = await api.saveAiConfig({
					provider: s.provider,
					model: s.model || null,
					baseUrl: s.baseUrl || null,
					apiKey: s.apiKey || undefined,
					translationPrompt: s.translationPrompt || null,
					summaryPrompt: s.summaryPrompt || null,
				});
				store.setState({ cfg: data, apiKey: "", saved: true, saving: false });
			} catch (e) {
				store.setState({ error: errMsg(e), saving: false });
			}
		},
		async test() {
			const s = store.getState();
			store.setState({ testing: true, testMsg: null, testOk: null, error: null, saved: false });
			try {
				const r = await api.testAiConfig({
					provider: s.provider,
					model: s.model || null,
					baseUrl: s.baseUrl || null,
					apiKey: s.apiKey || undefined,
				});
				if (r.ok) {
					store.setState({
						testOk: true,
						testMsg: `OK (${r.provider ?? s.provider} / ${r.model ?? s.model ?? "default"})`,
						testing: false,
					});
				} else {
					store.setState({
						testOk: false,
						testMsg: `Failed: ${r.error ?? r.status ?? "unknown error"}`,
						testing: false,
					});
				}
			} catch (e) {
				store.setState({ testOk: false, testMsg: errMsg(e), testing: false });
			}
		},
	};
}

export type AiSettingsVm = ReturnType<typeof createAiSettingsVm>;
