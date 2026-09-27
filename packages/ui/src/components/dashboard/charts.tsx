import { StackedBarChart } from "@nocoo/basalt/charts/stacked-bar";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@nocoo/basalt/components/table";
import type { DashboardVm } from "@/viewmodels/dashboard-vm";

export function ContentTrendChart({ activity }: { activity: ReturnType<DashboardVm["activity"]> }) {
	return (
		<StackedBarChart
			data={activity.points}
			series={[
				{ key: "watchlists", label: "Watchlists" },
				{ key: "channels", label: "Channels" },
			]}
			ariaLabel="Daily content by watchlists and channels"
			className="h-64 w-full sm:h-72"
			showAxes
			showLegend
			yDomain={[
				0,
				Math.max(4, ...activity.points.map((point) => point.watchlists + point.channels)),
			]}
			xValueFormatter={(date) => String(date).slice(5)}
			valueFormatter={(value) => (Number.isInteger(value) ? value.toLocaleString("en-US") : "")}
			summary={
				activity.total === 0
					? "No content added in the last 14 days. Watchlist items and channel reports will appear here."
					: `${activity.total.toLocaleString("en-US")} added · Watchlists ${activity.watchlists.toLocaleString("en-US")} · Channels ${activity.channels.toLocaleString("en-US")}`
			}
			dataAlternative={
				<details className="mt-2">
					<summary className="w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-basalt-ring">
						View daily counts
					</summary>
					<div className="overflow-x-auto">
						<Table className="mt-2 tabular-nums">
							<TableHeader>
								<TableRow>
									<TableHead>Date (UTC)</TableHead>
									<TableHead>Watchlists</TableHead>
									<TableHead>Channels</TableHead>
									<TableHead>Total</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{activity.points.map((point) => (
									<TableRow key={point.x}>
										<TableCell className="whitespace-nowrap">{point.x}</TableCell>
										<TableCell>{point.watchlists}</TableCell>
										<TableCell>{point.channels}</TableCell>
										<TableCell>{point.watchlists + point.channels}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</details>
			}
		/>
	);
}
