import { LayerCard } from "@nocoo/basalt";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { SectionRule } from "@nocoo/basalt/components/section-rule";
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
		<div className="space-y-8">
			<PageHeader title="Dashboard" description="Watchlists, ingest, and AI backlog." />
			{error && <p className="text-sm text-basalt-destructive">{error}</p>}
			{loading && !data ? <DashboardSkeleton /> : data ? <DashboardBody data={data} /> : null}
		</div>
	);
}

function DashboardSkeleton() {
	return (
		<div className="space-y-6">
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
		<div className="space-y-8">
			<SectionRule title="Overview">
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
			</SectionRule>

			<SectionRule title="Activity" hint="Ingest volume and source mix for the last 14 days.">
				<div className="grid grid-cols-1 gap-3 lg:grid-cols-3 md:gap-4">
					<LayerCard className="lg:col-span-2">
						<LayerCard.Header>
							<span className="flex items-center gap-2">
								<TrendingUp className="h-4 w-4 text-basalt-muted-foreground" strokeWidth={1.5} />
								Ingest (14d)
							</span>
						</LayerCard.Header>
						<LayerCard.Body>
							<IngestTrendChart data={data.ingestTrend} />
						</LayerCard.Body>
					</LayerCard>
					<LayerCard>
						<LayerCard.Header>
							<span className="flex items-center gap-2">
								<ListFilter className="h-4 w-4 text-basalt-muted-foreground" strokeWidth={1.5} />
								Source mix
							</span>
						</LayerCard.Header>
						<LayerCard.Body>
							<SourceDonut data={data.bySourceType} />
						</LayerCard.Body>
					</LayerCard>
				</div>
			</SectionRule>

			<SectionRule title="Items">
				<LayerCard>
					<LayerCard.Header>
						<span className="flex items-center gap-2">
							<Layers className="h-4 w-4 text-basalt-muted-foreground" strokeWidth={1.5} />
							Items ingested (14d)
						</span>
					</LayerCard.Header>
					<LayerCard.Body>
						<ItemsTrendChart data={data.itemsTrend} />
					</LayerCard.Body>
				</LayerCard>
			</SectionRule>

			<SectionRule title="Recent ingest">
				<LayerCard>
					<LayerCard.Well>
						<IngestTable logs={data.recentIngestLogs} />
					</LayerCard.Well>
				</LayerCard>
			</SectionRule>
		</div>
	);
}
