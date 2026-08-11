import type { PushToken } from "@/api/tokens";
import { createStore, errMsg } from "./store";

export type TokensApi = {
	fetchPushTokens: () => Promise<PushToken[]>;
	revokePushToken: (id: number) => Promise<unknown>;
};

export type TokensState = {
	tokens: PushToken[];
	loading: boolean;
	error: string | null;
	onceSecret: string | null;
};

export function createTokensVm(api: TokensApi) {
	const store = createStore<TokensState>({
		tokens: [],
		loading: false,
		error: null,
		onceSecret: null,
	});

	return {
		...store,
		async load() {
			store.setState({ loading: true, error: null });
			try {
				const tokens = await api.fetchPushTokens();
				store.setState({ tokens, loading: false });
			} catch (e) {
				store.setState({ error: errMsg(e), loading: false });
			}
		},
		setOnceSecret(secret: string | null) {
			store.setState({ onceSecret: secret });
		},
		async revoke(id: number) {
			try {
				await api.revokePushToken(id);
				await this.load();
			} catch (e) {
				store.setState({ error: errMsg(e) });
			}
		},
	};
}

export type TokensVm = ReturnType<typeof createTokensVm>;
