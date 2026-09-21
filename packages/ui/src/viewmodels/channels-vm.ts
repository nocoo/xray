import type { Channel, ChannelArticle, ChannelArticleSummary, ChannelKey } from "@xray/shared";
import type * as channelsApi from "@/api/channels";
import { createStore, errMsg } from "./store";

export function createChannelsVm(api: typeof channelsApi) {
	const store = createStore({
		channels: [] as Channel[],
		catalogLoading: true,
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
		keysLoading: false,
		token: null as string | null,
		managerId: 0,
		pageCount: 0,
	});
	let listRequest = 0;
	let catalogRequest = 0;
	let articleRequest = 0;
	let articleChannelId = 0;
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
			store.setState({ catalogLoading: true, error: null });
			try {
				const channels = await api.fetchChannels();
				if (request === catalogRequest) store.setState({ channels });
			} catch (e) {
				if (request === catalogRequest) store.setState({ error: errMsg(e) });
			} finally {
				if (request === catalogRequest) store.setState({ catalogLoading: false });
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
			articleChannelId = channelId;
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
		create(name: string, description: string) {
			return mutate(async () => {
				const channel = await api.createChannel(name.trim(), description.trim());
				++catalogRequest;
				store.setState((s) => ({
					channels: [...s.channels.filter((c) => c.id !== channel.id), channel],
					catalogLoading: false,
					error: null,
				}));
				return channel;
			});
		},
		update(id: number, name: string, description: string) {
			return mutate(async () => {
				const channel = await api.updateChannel(id, name.trim(), description.trim());
				++catalogRequest;
				store.setState((s) => ({
					channels: s.channels.map((c) => (c.id === id ? channel : c)),
					catalogLoading: false,
					error: null,
				}));
				return channel;
			});
		},
		remove(id: number) {
			return mutate(async () => {
				await api.deleteChannel(id);
				++catalogRequest;
				if (store.getState().channelId === id) {
					++listRequest;
					store.setState({
						channelId: 0,
						date: "",
						items: [],
						nextCursor: null,
						pageCount: 0,
						loading: false,
					});
				}
				if (articleChannelId === id) {
					++articleRequest;
					articleChannelId = 0;
					store.setState({ article: null, articleLoading: false });
				} else if (store.getState().article?.channelId === id) {
					store.setState({ article: null });
				}
				if (store.getState().managerId === id) void vm.manage(0);
				store.setState((s) => ({
					channels: s.channels.filter((c) => c.id !== id),
					catalogLoading: false,
					error: null,
				}));
				return true;
			});
		},
		move(id: number, direction: -1 | 1) {
			const channels = store.getState().channels;
			const index = channels.findIndex((c) => c.id === id);
			const neighbor = channels[index + direction];
			if (index < 0 || !neighbor) return;
			const ids = channels.map((c) => c.id);
			ids[index] = neighbor.id;
			ids[index + direction] = id;
			return mutate(async () => {
				const ordered = await api.reorderChannels(ids);
				++catalogRequest;
				store.setState({ channels: ordered, catalogLoading: false, error: null });
			});
		},
		async manage(id: number) {
			const request = ++managerRequest;
			store.setState({
				managerId: id,
				keys: [],
				token: null,
				error: null,
				keysLoading: Boolean(id),
			});
			if (!id) return;
			try {
				const keys = await api.fetchChannelKeys(id);
				if (request === managerRequest) store.setState({ keys });
			} catch (e) {
				if (request === managerRequest) store.setState({ error: errMsg(e) });
			} finally {
				if (request === managerRequest) store.setState({ keysLoading: false });
			}
		},
		createKey(label: string) {
			const { managerId, keysLoading } = store.getState();
			if (!managerId || keysLoading) return;
			const request = managerRequest;
			return mutate(async () => {
				let result: ChannelKey & { token: string };
				try {
					result = await api.createChannelKey(managerId, label.trim());
				} catch (error) {
					if (request === managerRequest) throw error;
					return;
				}
				const { token, ...key } = result;
				if (request === managerRequest) store.setState((s) => ({ keys: [...s.keys, key], token }));
				await vm.loadChannels();
				return true;
			});
		},
		revoke(keyId: number) {
			const { managerId, keysLoading } = store.getState();
			if (!managerId || keysLoading) return;
			const request = managerRequest;
			return mutate(async () => {
				try {
					await api.revokeChannelKey(managerId, keyId);
				} catch (error) {
					if (request === managerRequest) throw error;
					return;
				}
				if (request === managerRequest)
					store.setState((s) => ({ keys: s.keys.filter((k) => k.id !== keyId), token: null }));
				await vm.loadChannels();
				return true;
			});
		},
	};
	return vm;
}
export type ChannelsVm = ReturnType<typeof createChannelsVm>;
