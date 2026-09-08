import { Button, ConfirmDialog, LayerCard } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { Empty } from "@nocoo/basalt/components/empty";
import { InputArea } from "@nocoo/basalt/components/input-area";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@nocoo/basalt/components/select";
import { Plus, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { Group } from "@/api/groups";
import * as groupsApi from "@/api/groups";
import * as watchlistsApi from "@/api/watchlists";
import { useCreateDialogs } from "@/components/dialogs/create-dialogs-context";
import { RenameDialog } from "@/components/dialogs/rename-dialog";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
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
	const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);
	const [deleteBusy, setDeleteBusy] = useState(false);

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

	const onDelete = async () => {
		if (!deleteTarget) return;
		setDeleteBusy(true);
		try {
			const ok = await vm.deleteGroup(deleteTarget);
			if (ok) {
				if (s.selectedId === deleteTarget.id) selectGroup(null);
				notifyListsChanged();
				setDeleteTarget(null);
			}
		} finally {
			setDeleteBusy(false);
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
		<div className="space-y-8">
			<PageHeader
				title="Groups"
				description="Source-aware member pools you can copy into watchlists."
				actions={
					<Button size="sm" type="button" onClick={openCreateGroup}>
						<Plus className="h-4 w-4" />
						New Group
					</Button>
				}
			/>
			{s.loading && <p className="text-sm text-basalt-muted-foreground">Loading…</p>}
			{s.error && <Banner variant="error" size="sm" description={s.error} />}
			{!s.loading && s.groups.length === 0 && !s.error && (
				<LayerCard>
					<Empty
						title="No groups yet."
						description="Create a reusable member pool to copy into watchlists."
						action={
							<Button size="sm" type="button" onClick={openCreateGroup}>
								<Plus className="h-4 w-4" />
								New Group
							</Button>
						}
					/>
				</LayerCard>
			)}
			<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{s.groups.map((g) => (
					<li key={g.id}>
						<LayerCard
							outlined={s.selectedId === g.id}
							className={cn(s.selectedId === g.id && "ring-2 ring-basalt-primary")}
						>
							<Button
								type="button"
								variant="ghost"
								onClick={() => selectGroup(g.id)}
								className="h-auto w-full items-center justify-start gap-3 p-0 text-left"
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
									<p className="text-xs text-basalt-muted-foreground">{g.memberCount} members</p>
								</div>
							</Button>
						</LayerCard>
						<div className="mt-1 flex gap-1 px-1">
							<Button type="button" size="sm" variant="ghost" onClick={() => setRenameTarget(g)}>
								Rename
							</Button>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="text-basalt-destructive"
								onClick={() => setDeleteTarget(g)}
							>
								Delete
							</Button>
						</div>
					</li>
				))}
			</ul>

			<ConfirmDialog
				open={deleteTarget != null}
				onOpenChange={(open) => {
					if (!open && !deleteBusy) setDeleteTarget(null);
				}}
				title="Delete group"
				description={deleteTarget ? `Delete group “${deleteTarget.name}”?` : "Delete this group?"}
				confirmLabel="Delete"
				variant="destructive"
				loading={deleteBusy}
				onConfirm={() => void onDelete()}
			/>

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
				<LayerCard>
					<LayerCard.Header>
						<span>Members</span>
						<Button size="sm" type="button" onClick={onAddMember}>
							<Plus className="h-4 w-4" />
							Add
						</Button>
					</LayerCard.Header>
					<LayerCard.Body className="space-y-4">
						{s.members.length === 0 ? (
							<p className="text-sm text-basalt-muted-foreground">No members in this group.</p>
						) : (
							<ul className="space-y-2">
								{s.members.map((m) => (
									<li
										key={m.id}
										className="flex items-center justify-between rounded-md bg-basalt-control px-3 py-2 text-sm"
									>
										<span>
											<span className="text-basalt-muted-foreground">{m.sourceType}</span> · @
											{m.handle}
										</span>
										<Button
											type="button"
											size="icon"
											variant="ghost"
											className="h-7 w-7 text-basalt-muted-foreground hover:text-basalt-destructive"
											onClick={() => void vm.removeMember(m.id)}
											aria-label="Remove member"
										>
											<Trash2 className="h-3.5 w-3.5" />
										</Button>
									</li>
								))}
							</ul>
						)}

						<div className="space-y-2 border-t border-basalt-border pt-3">
							<p className="text-xs font-medium text-basalt-muted-foreground">
								Bulk import (@handles / export with screen_name)
							</p>
							<InputArea
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

						<div className="flex flex-wrap items-end gap-2 border-t border-basalt-border pt-3">
							<div className="min-w-[12rem] flex-1 space-y-1">
								<p className="text-xs font-medium text-basalt-muted-foreground">
									Copy into watchlist
								</p>
								<Select
									value={s.copyWlId === "" ? undefined : String(s.copyWlId)}
									onValueChange={(v) => vm.setCopyWlId(v ? Number(v) : "")}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select watchlist…" />
									</SelectTrigger>
									<SelectContent>
										{s.watchlists.map((w) => (
											<SelectItem key={w.id} value={String(w.id)}>
												{w.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
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
						{s.importInfo && <p className="text-xs text-basalt-muted-foreground">{s.importInfo}</p>}
					</LayerCard.Body>
				</LayerCard>
			)}
		</div>
	);
}
