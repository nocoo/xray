import { useEffect, useMemo } from "react";
import * as dashboardApi from "@/api/dashboard";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { createDashboardVm } from "@/viewmodels/dashboard-vm";
import { useVm } from "@/viewmodels/use-vm";

export function DashboardPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const vm = useMemo(() => createDashboardVm(dashboardApi), []);
	const { data, error, loading } = useVm(vm);
	const cards = vm.cards();
	const logs = data?.recentIngestLogs ?? [];

	useEffect(() => {
		setBreadcrumbs([]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	useEffect(() => {
		void vm.load();
	}, [vm]);

	return (
		<div className="space-y-4">
			<h1 className="font-display text-2xl font-semibold tracking-tight">Dashboard</h1>
			{loading && <p className="text-sm text-muted-foreground">Loading…</p>}
			{error && <p className="text-sm text-destructive">{error}</p>}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
				{cards.map((c) => (
					<div key={c.label} className="rounded-[var(--radius-widget)] bg-secondary p-4">
						<p className="text-xs tracking-wide text-muted-foreground uppercase">{c.label}</p>
						<p className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</p>
					</div>
				))}
			</div>
			{data && data.bySourceType.length > 0 && (
				<div className="text-sm text-muted-foreground">
					By source: {data.bySourceType.map((s) => `${s.sourceType}=${s.count}`).join(" · ")}
				</div>
			)}
			<div className="space-y-2">
				<h2 className="text-sm font-medium">Recent ingest</h2>
				{logs.length === 0 ? (
					<p className="text-sm text-muted-foreground">No ingest activity yet.</p>
				) : (
					<ul className="divide-y divide-border rounded-card border border-border text-sm">
						{logs.map((log) => (
							<li key={log.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
								<span className="text-muted-foreground">WL #{log.watchlistId}</span>
								<span className="tabular-nums">
									+{log.accepted} / dup {log.deduped} / rej {log.rejected}
								</span>
								<span className="text-xs text-muted-foreground">
									{new Date(log.createdAtMs).toLocaleString()}
								</span>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
