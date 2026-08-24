import { Eye, FolderKanban, Languages, Layers, ListFilter, TrendingUp, Users } from "lucide-react";
import { useEffect, useMemo } from "react";
import type { DashboardAggregates } from "@/api/dashboard";
import * as dashboardApi from "@/api/dashboard";
import { IngestTrendChart, ItemsTrendChart, SourceDonut } from "@/components/dashboard/charts";
import { IngestTable } from "@/components/dashboard/ingest-table";
import { ChartSkeleton, StatCard, StatSkeleton } from "@/components/dashboard/stat-card";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { formatCount } from "@/lib/utils";
import { createDashboardVm } from "@/viewmodels/dashboard-vm";
import { useVm } from "@/viewmodels/use-vm";

export function DashboardPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const vm = useMemo(() => createDashboardVm(dashboardApi), []);
	const { data, error, loading } = useVm(vm);

	useEffect(() => {
		setBreadcrumbs([]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	useEffect(() => {
		void vm.load();
	}, [vm]);

	return (
		<div className="space-y-6 md:space-y-8">
			<div>
				<h1 className="font-display text-2xl font-semibold tracking-tight">Dashboard</h1>
				<p className="mt-1 text-sm text-muted-foreground">Watchlists, ingest, and AI backlog.</p>
			</div>
			{error && <p className="text-sm text-destructive">{error}</p>}
			{loading && !data ? <DashboardSkeleton /> : data ? <DashboardBody data={data} /> : null}
		</div>
	);
}

function DashboardSkeleton() {
	return (
		<div className="space-y-4 md:space-y-6">
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-5 md:gap-4">
				{["a", "b", "c", "d", "e"].map((id) => (
					<StatSkeleton key={id} />
				))}
			</div>
			<div className="grid grid-cols-1 gap-3 lg:grid-cols-3 md:gap-4">
				<ChartSkeleton className="lg:col-span-2" />
				<ChartSkeleton />
			</div>
			<ChartSkeleton />
		</div>
	);
}

function DashboardBody({ data }: { data: DashboardAggregates }) {
	const cards = [
		{ label: "Watchlists", key: "watchlistCount" as const, icon: Eye },
		{ label: "Groups", key: "groupCount" as const, icon: FolderKanban },
		{ label: "Members", key: "memberCount" as const, icon: Users },
		{ label: "Items (24h)", key: "items24h" as const, icon: Layers },
		{ label: "Pending AI", key: "pendingAi" as const, icon: Languages },
	];

	return (
		<div className="space-y-6 md:space-y-8">
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-5 md:gap-4">
				{cards.map((c, i) => (
					<StatCard
						key={c.label}
						label={c.label}
						value={formatCount(data[c.key])}
						icon={c.icon}
						index={i}
						sparkline={c.key === "items24h" ? data.itemsTrend.map((p) => p.count) : undefined}
					/>
				))}
			</div>

			<div className="grid grid-cols-1 gap-3 lg:grid-cols-3 md:gap-4">
				<section className="flex flex-col rounded-[var(--radius-widget)] bg-secondary lg:col-span-2">
					<header className="flex items-center gap-2 px-4 py-3 md:px-5 md:py-4">
						<TrendingUp className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
						<h2 className="text-sm font-medium">Ingest (14d)</h2>
					</header>
					<div className="flex flex-1 flex-col px-4 pb-4 md:px-5 md:pb-5">
						<IngestTrendChart data={data.ingestTrend} />
					</div>
				</section>
				<section className="rounded-[var(--radius-widget)] bg-secondary">
					<header className="flex items-center gap-2 px-4 py-3 md:px-5 md:py-4">
						<ListFilter className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
						<h2 className="text-sm font-medium">Source mix</h2>
					</header>
					<div className="px-4 pb-4 md:px-5 md:pb-5">
						<SourceDonut data={data.bySourceType} />
					</div>
				</section>
			</div>

			<section className="rounded-[var(--radius-widget)] bg-secondary">
				<header className="flex items-center gap-2 px-4 py-3 md:px-5 md:py-4">
					<Layers className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
					<h2 className="text-sm font-medium">Items ingested (14d)</h2>
				</header>
				<div className="px-4 pb-4 md:px-5 md:pb-5">
					<ItemsTrendChart data={data.itemsTrend} />
				</div>
			</section>

			<section className="overflow-hidden rounded-[var(--radius-widget)] bg-secondary">
				<header className="px-4 py-3 md:px-5 md:py-4">
					<h2 className="text-sm font-medium">Recent ingest</h2>
				</header>
				<IngestTable logs={data.recentIngestLogs} />
			</section>
		</div>
	);
}
