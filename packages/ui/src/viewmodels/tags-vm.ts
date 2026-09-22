import type { Tag } from "@xray/shared";
import type * as tagsApi from "@/api/tags";
import { createStore, errMsg } from "./store";

export function createTagsVm(api: typeof tagsApi) {
	const store = createStore({
		tags: [] as Tag[],
		loading: true,
		busy: false,
		error: null as string | null,
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
	function nameValue(name: string) {
		const value = name.trim();
		if (!value || value.length > 64) throw new Error("Use a tag name between 1 and 64 characters.");
		return value;
	}
	async function create(name: string) {
		const tag = await api.createTag(nameValue(name));
		store.setState((s) => ({ tags: [...s.tags, tag] }));
		return tag;
	}
	async function assign(channelId: number, keyId: number | undefined, tagIds: number[]) {
		const ids = [...new Set(tagIds)];
		if (ids.length > 20) throw new Error("Choose up to 20 tags.");
		return keyId === undefined
			? api.assignChannelTags(channelId, ids)
			: api.assignKeyTags(channelId, keyId, ids);
	}
	return {
		...store,
		async load() {
			const request = ++revision;
			store.setState({ loading: true, error: null });
			try {
				const tags = await api.fetchTags();
				if (request === revision) store.setState({ tags });
			} catch (error) {
				if (request === revision) store.setState({ error: errMsg(error) });
			} finally {
				if (request === revision) store.setState({ loading: false });
			}
		},
		create: (name: string) => mutate(() => create(name)),
		rename: (id: number, name: string) =>
			mutate(async () => {
				const tag = await api.renameTag(id, nameValue(name));
				store.setState((s) => ({ tags: s.tags.map((item) => (item.id === id ? tag : item)) }));
				return tag;
			}),
		remove: (id: number) =>
			mutate(async () => {
				await api.deleteTag(id);
				store.setState((s) => ({ tags: s.tags.filter((tag) => tag.id !== id) }));
				return true;
			}),
		assign: (channelId: number, keyId: number | undefined, ids: number[]) =>
			mutate(() => assign(channelId, keyId, ids)),
		createAndAssign: (channelId: number, keyId: number | undefined, ids: number[], name: string) =>
			mutate(async () => {
				if (new Set(ids).size >= 20) throw new Error("Choose up to 20 tags.");
				const tag = await create(name);
				return assign(channelId, keyId, [...ids, tag.id]);
			}),
	};
}
export type TagsVm = ReturnType<typeof createTagsVm>;
