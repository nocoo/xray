import { LayerCard } from "@nocoo/basalt";
import { StatCard, StatGrid } from "@nocoo/basalt/charts/stat-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { SectionRule } from "@nocoo/basalt/components/section-rule";
import { Eye, Layers, Radio, TrendingUp } from "lucide-react";
import { useEffect, useMemo } from "react";
import type { DashboardAggregates } from "@/api/dashboard";
import * as dashboardApi from "@/api/dashboard";
import { ContentTrendChart } from "@/components/dashboard/charts";
import { IngestTable } from "@/components/dashboard/ingest-table";
import { ChartSkeleton, StatSkeleton } from "@/components/dashboard/skeletons";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { LoadingSkeleton, RowsSkeleton } from "@/components/loading-skeletons";
import { createDashboardVm, type DashboardVm } from "@/viewmodels/dashboard-vm";
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
		<div className="space-y-4">
			<PageHeader title="Dashboard" description="Content across your watchlists and channels." />
			{error && (
				<p role="alert" className="text-sm text-basalt-destructive">
					{error}
				</p>
			)}
			{loading && !data ? (
				<DashboardSkeleton />
			) : data ? (
				<DashboardBody data={data} vm={vm} />
			) : null}
		</div>
	);
}

function DashboardSkeleton() {
	return (
		<LoadingSkeleton label="Loading dashboard" className="space-y-4">
			<StatGrid columns={4} className="grid-cols-2">
				{["content", "recent", "watchlists", "channels"].map((id) => (
					<StatSkeleton key={id} />
				))}
			</StatGrid>
			<ChartSkeleton />
			<LayerCard>
				<RowsSkeleton label="Loading recent ingest" count={3} />
			</LayerCard>
		</LoadingSkeleton>
	);
}

const icons = { content: Layers, recent: TrendingUp, watchlists: Eye, channels: Radio };

function DashboardBody({ data, vm }: { data: DashboardAggregates; vm: DashboardVm }) {
	return (
		<div className="space-y-4">
			<StatGrid columns={4} className="grid-cols-2">
				{vm.cards().map((card) => (
					<StatCard
						key={card.key}
						label={card.label}
						value={card.value}
						subtitle={card.subtitle}
						icon={icons[card.key]}
						iconColor="hidden text-basalt-muted-foreground sm:block"
						className="bg-basalt-bright"
					/>
				))}
			</StatGrid>
			<LayerCard>
				<LayerCard.Header>
					<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
						<span>Content added (14d)</span>
						<span className="text-xs font-normal text-basalt-muted-foreground">
							One item or report = one record · UTC
						</span>
					</div>
				</LayerCard.Header>
				<LayerCard.Body>
					<ContentTrendChart activity={vm.activity()} />
				</LayerCard.Body>
			</LayerCard>
			<SectionRule
				title="Watchlist ingest diagnostics"
				hint="Watchlist retries and rejections are separate from content counts."
				actions={
					<span className="text-xs text-basalt-muted-foreground">
						Pending AI{" "}
						<span className="font-medium text-basalt-foreground tabular-nums">
							{data.pendingAi.toLocaleString("en-US")}
						</span>
					</span>
				}
			>
				<LayerCard>
					<LayerCard.Well>
						<IngestTable logs={data.recentIngestLogs} />
					</LayerCard.Well>
				</LayerCard>
			</SectionRule>
		</div>
	);
}
