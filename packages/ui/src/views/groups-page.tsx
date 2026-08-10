import { Plus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createGroup, fetchGroups, type Group } from "@/api/groups";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { Button } from "@/components/ui/button";
import { cn, getAvatarColor } from "@/lib/utils";

export function GroupsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const [groups, setGroups] = useState<Group[]>([]);
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

	const onCreate = async () => {
		const name = window.prompt("Group name");
		if (!name?.trim()) return;
		try {
			await createGroup({ name: name.trim() });
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
					<li key={g.id} className="flex items-center gap-3 rounded-card bg-secondary p-4">
						<div
							className={cn(
								"flex h-10 w-10 items-center justify-center rounded-lg",
								getAvatarColor(g.name),
							)}
						>
							<Users className="h-5 w-5 text-white" strokeWidth={1.5} />
						</div>
						<div className="min-w-0">
							<p className="truncate text-sm font-medium">{g.name}</p>
							<p className="text-xs text-muted-foreground">
								{g.memberCount} member{g.memberCount !== 1 ? "s" : ""}
							</p>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
