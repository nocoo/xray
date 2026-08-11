import { Plus, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { Group } from "@/api/groups";
import * as groupsApi from "@/api/groups";
import * as watchlistsApi from "@/api/watchlists";
import { useCreateDialogs } from "@/components/dialogs/create-dialogs-context";
import { RenameDialog } from "@/components/dialogs/rename-dialog";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, getAvatarColor } from "@/lib/utils";
import { createGroupsVm } from "@/viewmodels/groups-vm";
import { useVm } from "@/viewmodels/use-vm";

export function GroupsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const { openCreateGroup, openAddMember, listVersion, notifyListsChanged } = useCreateDialogs();
	const [searchParams, setSearchParams] = useSearchParams();
	const vm = useMemo(
		() =>
			createGroupsVm({
				fetchGroups: groupsApi.fetchGroups,
				fetchWatchlists: watchlistsApi.fetchWatchlists,
				fetchGroupMembers: groupsApi.fetchGroupMembers,
				deleteGroup: groupsApi.deleteGroup,
				updateGroup: groupsApi.updateGroup,
				deleteGroupMember: groupsApi.deleteGroupMember,
				bulkImportGroupMembers: groupsApi.bulkImportGroupMembers,
				copyGroupToWatchlist: groupsApi.copyGroupToWatchlist,
			}),
		[],
	);
	const s = useVm(vm);
	const [renameTarget, setRenameTarget] = useState<Group | null>(null);

	useEffect(() => {
		setBreadcrumbs([{ label: "Groups" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	useEffect(() => {
		const raw = searchParams.get("id");
		const n = raw ? Number(raw) : NaN;
		const id = Number.isFinite(n) ? n : null;
		if (id !== s.selectedId) vm.selectGroup(id);
		if (searchParams.get("new") === "1") {
			openCreateGroup();
			const next = new URLSearchParams(searchParams);
			next.delete("new");
			setSearchParams(next, { replace: true });
		}
	}, [searchParams, setSearchParams, openCreateGroup, vm, s.selectedId]);

	const selectGroup = (id: number | null) => {
		vm.selectGroup(id);
		if (id == null) setSearchParams({}, { replace: true });
		else setSearchParams({ id: String(id) }, { replace: true });
	};

	useEffect(() => {
		void listVersion;
		void vm.load();
	}, [vm, listVersion]);

	useEffect(() => {
		if (s.selectedId != null) void vm.loadMembers(s.selectedId);
	}, [s.selectedId, vm]);

	const onDelete = async (g: Group) => {
		if (!window.confirm(`Delete group “${g.name}”?`)) return;
		const ok = await vm.deleteGroup(g);
		if (ok) {
			if (s.selectedId === g.id) selectGroup(null);
			notifyListsChanged();
		}
	};

	const onImport = async () => {
		await vm.importMembers();
		notifyListsChanged();
	};

	const onCopyToWl = async () => {
		await vm.copyToWatchlist();
		notifyListsChanged();
	};

	const onAddMember = () => {
		if (s.selectedId == null) return;
		const g = s.groups.find((x) => x.id === s.selectedId);
		openAddMember(
			{ kind: "group", id: s.selectedId, name: g?.name },
			{
				onAdded: () => {
					const id = s.selectedId;
					if (id != null) void vm.loadMembers(id);
					void vm.load();
				},
			},
		);
	};

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between gap-3">
				<div>
					<h1 className="font-display text-2xl font-semibold tracking-tight">Groups</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Source-aware member pools you can copy into watchlists.
					</p>
				</div>
				<Button size="sm" type="button" onClick={openCreateGroup}>
					<Plus className="h-4 w-4" />
					New Group
				</Button>
			</div>
			{s.loading && <p className="text-sm text-muted-foreground">Loading…</p>}
			{s.error && <p className="text-sm text-destructive">{s.error}</p>}
			{!s.loading && s.groups.length === 0 && !s.error && (
				<div className="rounded-card bg-secondary p-10 text-center">
					<p className="text-sm font-medium">No groups yet.</p>
					<p className="mt-1 text-xs text-muted-foreground">
						Create a reusable member pool to copy into watchlists.
					</p>
					<Button size="sm" type="button" className="mt-4" onClick={openCreateGroup}>
						<Plus className="h-4 w-4" />
						New Group
					</Button>
				</div>
			)}
			<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{s.groups.map((g) => (
					<li key={g.id}>
						<button
							type="button"
							onClick={() => selectGroup(g.id)}
							className={cn(
								"flex w-full items-center gap-3 rounded-card bg-secondary p-4 text-left",
								s.selectedId === g.id && "ring-2 ring-primary",
							)}
						>
							<div
								className={cn(
									"flex h-10 w-10 items-center justify-center rounded-lg",
									getAvatarColor(g.name),
								)}
							>
								<Users className="h-5 w-5 text-white" strokeWidth={1.5} />
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium">{g.name}</p>
								<p className="text-xs text-muted-foreground">{g.memberCount} members</p>
							</div>
						</button>
						<div className="mt-1 flex gap-1 px-1">
							<button
								type="button"
								className="text-xs text-muted-foreground hover:text-foreground"
								onClick={() => setRenameTarget(g)}
							>
								Rename
							</button>
							<button
								type="button"
								className="text-xs text-muted-foreground hover:text-destructive"
								onClick={() => void onDelete(g)}
							>
								Delete
							</button>
						</div>
					</li>
				))}
			</ul>

			<RenameDialog
				open={renameTarget != null}
				onOpenChange={(o) => {
					if (!o) setRenameTarget(null);
				}}
				title="Rename group"
				description="Update the display name for this member pool."
				initialName={renameTarget?.name ?? ""}
				onSubmit={async (name) => {
					if (!renameTarget) return;
					await vm.rename(renameTarget.id, name);
					notifyListsChanged();
				}}
			/>

			{s.selectedId != null && (
				<div className="space-y-4 rounded-card border border-border p-4">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-medium">Members</h2>
						<Button size="sm" type="button" onClick={onAddMember}>
							<Plus className="h-4 w-4" />
							Add
						</Button>
					</div>
					{s.members.length === 0 ? (
						<p className="text-sm text-muted-foreground">No members in this group.</p>
					) : (
						<ul className="space-y-2">
							{s.members.map((m) => (
								<li
									key={m.id}
									className="flex items-center justify-between rounded-md bg-secondary px-3 py-2 text-sm"
								>
									<span>
										<span className="text-muted-foreground">{m.sourceType}</span> · @{m.handle}
									</span>
									<button
										type="button"
										className="text-muted-foreground hover:text-destructive"
										onClick={() => void vm.removeMember(m.id)}
										title="Remove"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								</li>
							))}
						</ul>
					)}

					<div className="space-y-2 border-t border-border pt-3">
						<p className="text-xs font-medium text-muted-foreground">
							Bulk import (@handles / export with screen_name)
						</p>
						<Textarea
							value={s.importText}
							onChange={(e) => vm.setImportText(e.target.value)}
							placeholder={"Paste Twitter export following.js, or one @handle per line"}
							rows={4}
							className="font-mono text-xs"
						/>
						<Button
							size="sm"
							type="button"
							disabled={s.importBusy || !s.importText.trim()}
							onClick={() => void onImport()}
						>
							{s.importBusy ? "Importing…" : "Import members"}
						</Button>
					</div>

					<div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
						<div className="min-w-[12rem] flex-1 space-y-1">
							<p className="text-xs font-medium text-muted-foreground">Copy into watchlist</p>
							<select
								className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
								value={s.copyWlId === "" ? "" : String(s.copyWlId)}
								onChange={(e) => vm.setCopyWlId(e.target.value ? Number(e.target.value) : "")}
							>
								<option value="">Select watchlist…</option>
								{s.watchlists.map((w) => (
									<option key={w.id} value={w.id}>
										{w.name}
									</option>
								))}
							</select>
						</div>
						<Button
							size="sm"
							type="button"
							disabled={s.copyBusy || s.copyWlId === "" || s.members.length === 0}
							onClick={() => void onCopyToWl()}
						>
							{s.copyBusy ? "Copying…" : "Copy members"}
						</Button>
					</div>
					{s.importInfo && <p className="text-xs text-muted-foreground">{s.importInfo}</p>}
				</div>
			)}
		</div>
	);
}
