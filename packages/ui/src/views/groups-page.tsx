import { Plus, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import {
	deleteGroup,
	deleteGroupMember,
	fetchGroupMembers,
	fetchGroups,
	type Group,
	type GroupMember,
	updateGroup,
} from "@/api/groups";
import { useCreateDialogs } from "@/components/dialogs/create-dialogs-context";
import { RenameDialog } from "@/components/dialogs/rename-dialog";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { Button } from "@/components/ui/button";
import { cn, getAvatarColor } from "@/lib/utils";

export function GroupsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const { openCreateGroup, openAddMember, listVersion, notifyListsChanged } = useCreateDialogs();
	const [searchParams, setSearchParams] = useSearchParams();
	const [groups, setGroups] = useState<Group[]>([]);
	const [selectedId, setSelectedId] = useState<number | null>(() => {
		const raw = searchParams.get("id");
		const n = raw ? Number(raw) : NaN;
		return Number.isFinite(n) ? n : null;
	});
	const [members, setMembers] = useState<GroupMember[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [renameTarget, setRenameTarget] = useState<Group | null>(null);

	useEffect(() => {
		setBreadcrumbs([{ label: "Groups" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	useEffect(() => {
		const raw = searchParams.get("id");
		const n = raw ? Number(raw) : NaN;
		setSelectedId(Number.isFinite(n) ? n : null);
		if (searchParams.get("new") === "1") {
			openCreateGroup();
			const next = new URLSearchParams(searchParams);
			next.delete("new");
			setSearchParams(next, { replace: true });
		}
	}, [searchParams, setSearchParams, openCreateGroup]);

	const selectGroup = (id: number | null) => {
		setSelectedId(id);
		if (id == null) setSearchParams({}, { replace: true });
		else setSearchParams({ id: String(id) }, { replace: true });
	};

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			setGroups(await fetchGroups());
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void listVersion;
		void load();
	}, [load, listVersion]);

	const loadMembers = useCallback(async (id: number) => {
		try {
			setMembers(await fetchGroupMembers(id));
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	useEffect(() => {
		if (selectedId != null) void loadMembers(selectedId);
		else setMembers([]);
	}, [selectedId, loadMembers]);

	const onDelete = async (g: Group) => {
		if (!window.confirm(`Delete group “${g.name}”?`)) return;
		try {
			await deleteGroup(g.id);
			if (selectedId === g.id) selectGroup(null);
			await load();
			notifyListsChanged();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	const onAddMember = () => {
		if (selectedId == null) return;
		const g = groups.find((x) => x.id === selectedId);
		openAddMember(
			{ kind: "group", id: selectedId, name: g?.name },
			{
				onAdded: () => {
					void loadMembers(selectedId);
					void load();
				},
			},
		);
	};

	const onRemoveMember = async (memberId: number) => {
		if (selectedId == null) return;
		try {
			await deleteGroupMember(selectedId, memberId);
			await loadMembers(selectedId);
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
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
			{loading && <p className="text-sm text-muted-foreground">Loading…</p>}
			{error && <p className="text-sm text-destructive">{error}</p>}
			{!loading && groups.length === 0 && !error && (
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
				{groups.map((g) => (
					<li key={g.id}>
						<button
							type="button"
							onClick={() => selectGroup(g.id)}
							className={cn(
								"flex w-full items-center gap-3 rounded-card bg-secondary p-4 text-left",
								selectedId === g.id && "ring-2 ring-primary",
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
					await updateGroup(renameTarget.id, { name });
					await load();
					notifyListsChanged();
				}}
			/>

			{selectedId != null && (
				<div className="space-y-3 rounded-card border border-border p-4">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-medium">Members</h2>
						<Button size="sm" type="button" onClick={onAddMember}>
							<Plus className="h-4 w-4" />
							Add
						</Button>
					</div>
					{members.length === 0 ? (
						<p className="text-sm text-muted-foreground">No members in this group.</p>
					) : (
						<ul className="space-y-2">
							{members.map((m) => (
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
										onClick={() => void onRemoveMember(m.id)}
										title="Remove"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								</li>
							))}
						</ul>
					)}
				</div>
			)}
		</div>
	);
}
