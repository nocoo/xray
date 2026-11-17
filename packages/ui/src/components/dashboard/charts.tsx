import {
	BAR_RADIUS,
	CHART_PLOT_MARGIN,
	ChartFrame,
	ChartLegend,
	cartesianAxisProps,
	chartTooltipProps,
	GRID_PROPS,
	getChartColor,
	RESPONSIVE_CONTAINER_PROPS,
} from "@nocoo/basalt/components/chart";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@nocoo/basalt/components/table";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardVm } from "@/viewmodels/dashboard-vm";

const series = [
	{ key: "watchlists", label: "Watchlists", color: getChartColor(0) },
	{ key: "channels", label: "Channels", color: getChartColor(1) },
];

export function ContentTrendChart({ activity }: { activity: ReturnType<DashboardVm["activity"]> }) {
	const valueFormatter = (value: number) =>
		Number.isInteger(value) ? value.toLocaleString("en-US") : "";

	return (
		<ChartFrame
			ariaLabel="Daily content by watchlists and channels"
			size="h-64 w-full sm:h-72"
			legend={<ChartLegend items={series} shape="bar" />}
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
		>
			<ResponsiveContainer {...RESPONSIVE_CONTAINER_PROPS}>
				<BarChart accessibilityLayer data={activity.points} margin={CHART_PLOT_MARGIN}>
					<CartesianGrid {...GRID_PROPS} />
					<XAxis
						dataKey="x"
						tickFormatter={(date) => String(date).slice(5)}
						{...cartesianAxisProps()}
					/>
					<YAxis
						domain={[
							0,
							Math.max(4, ...activity.points.map((point) => point.watchlists + point.channels)),
						]}
						allowDecimals={false}
						tickFormatter={valueFormatter}
						width={32}
						{...cartesianAxisProps()}
					/>
					<Tooltip {...chartTooltipProps({ formatter: valueFormatter })} />
					<Bar
						dataKey="watchlists"
						name="Watchlists"
						stackId="content"
						fill={series[0].color}
						isAnimationActive={false}
					/>
					<Bar
						dataKey="channels"
						name="Channels"
						stackId="content"
						fill={series[1].color}
						radius={BAR_RADIUS.vertical}
						isAnimationActive={false}
					/>
				</BarChart>
			</ResponsiveContainer>
		</ChartFrame>
	);
}
