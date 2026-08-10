import type { SourceType } from "@xray/shared";
import { Plus, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	addGroupMember,
	createGroup,
	deleteGroup,
	deleteGroupMember,
	fetchGroupMembers,
	fetchGroups,
	type Group,
	type GroupMember,
	updateGroup,
} from "@/api/groups";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { Button } from "@/components/ui/button";
import { cn, getAvatarColor } from "@/lib/utils";

export function GroupsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const [groups, setGroups] = useState<Group[]>([]);
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [members, setMembers] = useState<GroupMember[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setBreadcrumbs([{ label: "Groups" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

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
		void load();
	}, [load]);

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

	const onCreate = async () => {
		const name = window.prompt("Group name");
		if (!name?.trim()) return;
		try {
			const g = await createGroup({ name: name.trim() });
			await load();
			setSelectedId(g.id);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	const onRename = async (g: Group) => {
		const name = window.prompt("Rename group", g.name);
		if (!name?.trim()) return;
		try {
			await updateGroup(g.id, { name: name.trim() });
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	const onDelete = async (g: Group) => {
		if (!window.confirm(`Delete group “${g.name}”?`)) return;
		try {
			await deleteGroup(g.id);
			if (selectedId === g.id) setSelectedId(null);
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	const onAddMember = async () => {
		if (selectedId == null) return;
		const handle = window.prompt("Handle");
		if (!handle?.trim()) return;
		const stRaw = window.prompt("source_type: x.com or custom", "x.com") || "x.com";
		const sourceType = (stRaw === "custom" ? "custom" : "x.com") as SourceType;
		try {
			await addGroupMember(selectedId, { sourceType, handle });
			await loadMembers(selectedId);
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
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
				<Button size="sm" type="button" onClick={() => void onCreate()}>
					<Plus className="h-4 w-4" />
					New Group
				</Button>
			</div>
			{loading && <p className="text-sm text-muted-foreground">Loading…</p>}
			{error && <p className="text-sm text-destructive">{error}</p>}
			{!loading && groups.length === 0 && (
				<div className="rounded-card bg-secondary p-10 text-center text-sm text-muted-foreground">
					No groups yet.
				</div>
			)}
			<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{groups.map((g) => (
					<li key={g.id}>
						<button
							type="button"
							onClick={() => setSelectedId(g.id)}
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
								onClick={() => void onRename(g)}
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

			{selectedId != null && (
				<div className="space-y-3 rounded-card border border-border p-4">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-medium">Members</h2>
						<Button size="sm" type="button" onClick={() => void onAddMember()}>
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
