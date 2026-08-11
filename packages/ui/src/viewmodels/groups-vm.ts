import type { Group, GroupMember } from "@/api/groups";
import type { Watchlist } from "@/api/watchlists";
import { createStore, errMsg } from "./store";

export type GroupsApi = {
	fetchGroups: () => Promise<Group[]>;
	fetchWatchlists: () => Promise<Watchlist[]>;
	fetchGroupMembers: (id: number) => Promise<GroupMember[]>;
	deleteGroup: (id: number) => Promise<unknown>;
	updateGroup: (id: number, input: { name: string }) => Promise<unknown>;
	deleteGroupMember: (groupId: number, memberId: number) => Promise<unknown>;
	bulkImportGroupMembers: (
		groupId: number,
		text: string,
	) => Promise<{ added: number; skipped: number; total: number }>;
	copyGroupToWatchlist: (
		groupId: number,
		input: { watchlistId: number },
	) => Promise<{ added: number; skipped: number; total: number }>;
};

export type GroupsState = {
	groups: Group[];
	watchlists: Watchlist[];
	selectedId: number | null;
	members: GroupMember[];
	loading: boolean;
	error: string | null;
	importText: string;
	importBusy: boolean;
	importInfo: string | null;
	copyWlId: number | "";
	copyBusy: boolean;
};

export function createGroupsVm(api: GroupsApi, initialSelectedId: number | null = null) {
	const store = createStore<GroupsState>({
		groups: [],
		watchlists: [],
		selectedId: initialSelectedId,
		members: [],
		loading: false,
		error: null,
		importText: "",
		importBusy: false,
		importInfo: null,
		copyWlId: "",
		copyBusy: false,
	});

	const vm = {
		...store,
		selectGroup(id: number | null) {
			store.setState({ selectedId: id, members: id == null ? [] : store.getState().members });
		},
		setImportText(text: string) {
			store.setState({ importText: text });
		},
		setCopyWlId(id: number | "") {
			store.setState({ copyWlId: id });
		},
		async load() {
			store.setState({ loading: true, error: null });
			try {
				const [groups, watchlists] = await Promise.all([api.fetchGroups(), api.fetchWatchlists()]);
				store.setState({ groups, watchlists, loading: false });
			} catch (e) {
				store.setState({ error: errMsg(e), loading: false });
			}
		},
		async loadMembers(id: number) {
			try {
				const members = await api.fetchGroupMembers(id);
				store.setState({ members });
			} catch (e) {
				store.setState({ error: errMsg(e) });
			}
		},
		async deleteGroup(g: Group) {
			try {
				await api.deleteGroup(g.id);
				if (store.getState().selectedId === g.id) vm.selectGroup(null);
				await vm.load();
				return true;
			} catch (e) {
				store.setState({ error: errMsg(e) });
				return false;
			}
		},
		async rename(id: number, name: string) {
			await api.updateGroup(id, { name });
			await vm.load();
		},
		async removeMember(memberId: number) {
			const { selectedId } = store.getState();
			if (selectedId == null) return;
			try {
				await api.deleteGroupMember(selectedId, memberId);
				await vm.loadMembers(selectedId);
				await vm.load();
			} catch (e) {
				store.setState({ error: errMsg(e) });
			}
		},
		async importMembers() {
			const { selectedId, importText } = store.getState();
			if (selectedId == null || !importText.trim()) return;
			store.setState({ importBusy: true, importInfo: null, error: null });
			try {
				const r = await api.bulkImportGroupMembers(selectedId, importText);
				store.setState({
					importInfo: `Imported ${r.added}, skipped ${r.skipped} (of ${r.total})`,
					importText: "",
					importBusy: false,
				});
				await vm.loadMembers(selectedId);
				await vm.load();
			} catch (e) {
				store.setState({ error: errMsg(e), importBusy: false });
			}
		},
		async copyToWatchlist() {
			const { selectedId, copyWlId } = store.getState();
			if (selectedId == null || copyWlId === "") return;
			store.setState({ copyBusy: true, error: null });
			try {
				const r = await api.copyGroupToWatchlist(selectedId, {
					watchlistId: Number(copyWlId),
				});
				store.setState({
					importInfo: `Copied ${r.added} to watchlist, skipped ${r.skipped}`,
					copyBusy: false,
				});
			} catch (e) {
				store.setState({ error: errMsg(e), copyBusy: false });
			}
		},
	};

	return vm;
}

export type GroupsVm = ReturnType<typeof createGroupsVm>;
