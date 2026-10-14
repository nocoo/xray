import { type ManagedToken, parseTokenLabel, type Tag } from "@xray/shared";
import type * as tokensApi from "@/api/tokens";
import { createStore, errMsg } from "./store";

export type TokenKind = "all" | "watchlist" | "channel";

export function filterTokens(tokens: ManagedToken[], query: string, kind: TokenKind) {
	const search = query.trim().toLocaleLowerCase();
	return tokens.filter(
		(token) =>
			(kind === "all" ||
				(kind === "watchlist" ? token.channelId === null : token.channelId !== null)) &&
			[
				token.label,
				token.tokenPrefix,
				token.channelName ?? "",
				...token.tags.map((tag) => tag.name),
			]
				.join(" ")
				.toLocaleLowerCase()
				.includes(search),
	);
}

export function tokenLabel(label: string) {
	const parsed = parseTokenLabel({ label });
	if (!parsed.ok) throw new Error("Use a token name between 1 and 64 characters.");
	return parsed.label;
}

export function createTokensVm(api: typeof tokensApi) {
	const store = createStore({
		tokens: [] as ManagedToken[],
		loading: true,
		busy: false,
		error: null as string | null,
		secret: null as string | null,
	});
	let revision = 0;
	async function mutate<T>(operation: () => Promise<T>) {
		if (store.getState().busy) return;
		++revision;
		store.setState({ busy: true, loading: false, error: null });
		try {
			return await operation();
		} catch (error) {
			store.setState({ error: errMsg(error) });
		} finally {
			store.setState({ busy: false });
		}
	}
	return {
		...store,
		async load() {
			if (store.getState().busy) return;
			const request = ++revision;
			store.setState({ loading: true, error: null });
			try {
				const tokens = await api.fetchTokens();
				if (request === revision) store.setState({ tokens });
			} catch (error) {
				if (request === revision) store.setState({ error: errMsg(error) });
			} finally {
				if (request === revision) store.setState({ loading: false });
			}
		},
		clearSecret() {
			store.setState({ secret: null });
		},
		create(label: string, channel: { id: number; name: string } | null) {
			return mutate(async () => {
				const name = tokenLabel(label);
				const result = channel
					? await api.createChannelKey(channel.id, name)
					: await api.createWatchlistToken(name);
				const { token, ...metadata } = result;
				const created: ManagedToken = {
					id: metadata.id,
					label: metadata.label,
					tokenPrefix: metadata.tokenPrefix,
					createdAtMs: metadata.createdAtMs,
					lastUsedAtMs: metadata.lastUsedAtMs,
					channelId: channel?.id ?? null,
					channelName: channel?.name ?? null,
					scopes: channel ? ["articles:write"] : ["ingest:read", "ingest:push"],
					tags: [],
				};
				store.setState((s) => ({ tokens: [created, ...s.tokens], secret: token }));
				return true;
			});
		},
		rename(token: ManagedToken, label: string) {
			return mutate(async () => {
				const name = tokenLabel(label);
				if (token.channelId === null) await api.renameWatchlistToken(token.id, name);
				else await api.renameChannelKey(token.channelId, token.id, name);
				store.setState((s) => ({
					tokens: s.tokens.map((item) => (item.id === token.id ? { ...item, label: name } : item)),
				}));
				return true;
			});
		},
		revoke(token: ManagedToken) {
			return mutate(async () => {
				if (token.channelId === null) await api.revokeWatchlistToken(token.id);
				else await api.revokeChannelKey(token.channelId, token.id);
				store.setState((s) => ({ tokens: s.tokens.filter((item) => item.id !== token.id) }));
				return true;
			});
		},
		setTags(id: number, tags: Tag[]) {
			++revision;
			store.setState((s) => ({
				loading: false,
				tokens: s.tokens.map((item) => (item.id === id ? { ...item, tags } : item)),
			}));
		},
	};
}
