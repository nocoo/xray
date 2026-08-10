import { useEffect } from "react";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { MOCK_DASHBOARD } from "@/lib/mock-data";

export function DashboardPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	useEffect(() => {
		setBreadcrumbs([]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	const cards = [
		{ label: "Watchlists", value: MOCK_DASHBOARD.watchlistCount },
		{ label: "Groups", value: MOCK_DASHBOARD.groupCount },
		{ label: "Posts (24h)", value: MOCK_DASHBOARD.posts24h },
		{ label: "Pending AI", value: MOCK_DASHBOARD.pendingAi },
	];

	return (
		<div className="space-y-4">
			<h1 className="font-display text-2xl font-semibold tracking-tight">Dashboard</h1>
			<p className="text-sm text-muted-foreground">Mock summary — wired in S4/S5.</p>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{cards.map((c) => (
					<div
						key={c.label}
						className="rounded-[var(--radius-widget)] border border-border bg-secondary p-4"
					>
						<p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
						<p className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</p>
					</div>
				))}
			</div>
		</div>
	);
}
