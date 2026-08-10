import { useEffect } from "react";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { MOCK_GROUPS } from "@/lib/mock-data";

export function GroupsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	useEffect(() => {
		setBreadcrumbs([{ label: "Groups" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	return (
		<div className="space-y-4">
			<h1 className="font-display text-2xl font-semibold tracking-tight">Groups</h1>
			<ul className="grid gap-3 sm:grid-cols-2">
				{MOCK_GROUPS.map((g) => (
					<li
						key={g.id}
						className="rounded-[var(--radius-card)] border border-border bg-secondary p-4"
					>
						<p className="font-medium">{g.name}</p>
						<p className="mt-1 text-xs text-muted-foreground">{g.memberCount} members</p>
					</li>
				))}
			</ul>
		</div>
	);
}
