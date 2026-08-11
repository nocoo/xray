import { useCallback, useEffect, useState } from "react";
import { type DashboardAggregates, fetchDashboard } from "@/api/dashboard";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";

export function DashboardPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const [data, setData] = useState<DashboardAggregates | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setBreadcrumbs([]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			setData(await fetchDashboard());
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const cards = data
		? [
				{ label: "Watchlists", value: data.watchlistCount },
				{ label: "Groups", value: data.groupCount },
				{ label: "Members", value: data.memberCount },
				{ label: "Items (24h)", value: data.items24h },
				{ label: "Pending AI", value: data.pendingAi },
			]
		: [];

	return (
		<div className="space-y-4">
			<h1 className="font-display text-2xl font-semibold tracking-tight">Dashboard</h1>
			{loading && <p className="text-sm text-muted-foreground">Loading…</p>}
			{error && <p className="text-sm text-destructive">{error}</p>}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
				{cards.map((c) => (
					<div key={c.label} className="rounded-[var(--radius-widget)] bg-secondary p-4">
						<p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
						<p className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</p>
					</div>
				))}
			</div>
			{data && data.bySourceType.length > 0 && (
				<div className="text-sm text-muted-foreground">
					By source: {data.bySourceType.map((s) => `${s.sourceType}=${s.count}`).join(" · ")}
				</div>
			)}
		</div>
	);
}
