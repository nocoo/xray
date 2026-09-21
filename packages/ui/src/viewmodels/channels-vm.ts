import type { Channel, ChannelArticle, ChannelArticleSummary, ChannelKey } from "@xray/shared";
import type * as channelsApi from "@/api/channels";
import { createStore, errMsg } from "./store";

export function createChannelsVm(api: typeof channelsApi) {
	const store = createStore({
		channels: [] as Channel[],
		items: [] as ChannelArticleSummary[],
		article: null as ChannelArticle | null,
		nextCursor: null as number | null,
		channelId: 0,
		date: "",
		loading: false,
		articleLoading: false,
		error: null as string | null,
		busy: false,
		keys: [] as ChannelKey[],
		token: null as string | null,
		managerId: 0,
		pageCount: 0,
	});
	let listRequest = 0;
	let catalogRequest = 0;
	let articleRequest = 0;
	let managerRequest = 0;
	async function mutate<T>(operation: () => Promise<T>): Promise<T | undefined> {
		if (store.getState().busy) return;
		store.setState({ busy: true, error: null });
		try {
			return await operation();
		} catch (e) {
			store.setState({ error: errMsg(e) });
		} finally {
			store.setState({ busy: false });
		}
	}
	const vm = {
		...store,
		async loadChannels() {
			const request = ++catalogRequest;
			try {
				const channels = await api.fetchChannels();
				if (request === catalogRequest) store.setState({ channels });
			} catch (e) {
				if (request === catalogRequest) store.setState({ error: errMsg(e) });
			}
		},
		async loadArticles(channelId: number, date: string, more = false, pages = 1) {
			const previous = store.getState();
			if (more && (previous.loading || previous.nextCursor === null)) return;
			const request = ++listRequest;
			const same = channelId === previous.channelId && date === previous.date;
			store.setState({
				channelId,
				date,
				loading: true,
				error: null,
				...(same ? {} : { items: [], nextCursor: null, pageCount: 0 }),
			});
			if (!channelId) {
				store.setState({ items: [], nextCursor: null, pageCount: 0, loading: false });
				return;
			}
			try {
				let page = await api.fetchArticles(channelId, date, more ? previous.nextCursor : null);
				if (request !== listRequest) return;
				let pageCount = more ? previous.pageCount + 1 : 1;
				while (!more && page.nextCursor !== null && pageCount < Math.min(50, pages)) {
					const next = await api.fetchArticles(channelId, date, page.nextCursor);
					if (request !== listRequest) return;
					page = { items: [...page.items, ...next.items], nextCursor: next.nextCursor };
					pageCount++;
				}
				store.setState({
					items: more
						? [
								...previous.items,
								...page.items.filter((item) => !previous.items.some((old) => old.id === item.id)),
							]
						: page.items,
					nextCursor: page.nextCursor,
					pageCount,
					loading: false,
				});
			} catch (e) {
				if (request === listRequest) store.setState({ loading: false, error: errMsg(e) });
			}
		},
		async selectArticle(channelId: number, articleId: number) {
			const request = ++articleRequest;
			if (!articleId) {
				store.setState({ article: null, articleLoading: false });
				return;
			}
			store.setState({ articleLoading: true, error: null });
			try {
				const article = await api.fetchArticle(channelId, articleId);
				if (request === articleRequest) store.setState({ article, articleLoading: false });
			} catch (e) {
				if (request === articleRequest) store.setState({ articleLoading: false, error: errMsg(e) });
			}
		},
		create(name: string) {
			return mutate(async () => {
				++catalogRequest;
				const channel = await api.createChannel(name.trim());
				++catalogRequest;
				store.setState((s) => ({ channels: [...s.channels, channel] }));
				return channel;
			});
		},
		rename(id: number, name: string) {
			return mutate(async () => {
				++catalogRequest;
				const channel = await api.renameChannel(id, name.trim());
				++catalogRequest;
				store.setState((s) => ({ channels: s.channels.map((c) => (c.id === id ? channel : c)) }));
				return channel;
			});
		},
		async manage(id: number) {
			const request = ++managerRequest;
			store.setState({ managerId: id, keys: [], token: null, error: null });
			if (!id) return;
			try {
				const keys = await api.fetchChannelKeys(id);
				if (request === managerRequest) store.setState({ keys });
			} catch (e) {
				if (request === managerRequest) store.setState({ error: errMsg(e) });
			}
		},
		createKey(label: string) {
			const { managerId } = store.getState();
			const request = managerRequest;
			return mutate(async () => {
				const { token, ...key } = await api.createChannelKey(managerId, label.trim());
				if (request === managerRequest) store.setState((s) => ({ keys: [...s.keys, key], token }));
			});
		},
		revoke(keyId: number) {
			const { managerId } = store.getState();
			const request = managerRequest;
			return mutate(async () => {
				await api.revokeChannelKey(managerId, keyId);
				if (request === managerRequest)
					store.setState((s) => ({ keys: s.keys.filter((k) => k.id !== keyId), token: null }));
			});
		},
	};
	return vm;
}
export type ChannelsVm = ReturnType<typeof createChannelsVm>;
