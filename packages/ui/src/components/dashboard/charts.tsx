import {
	CHART_COLORS,
	CHART_PLOT_MARGIN,
	ChartFrame,
	ChartLegend,
	ChartTooltipContent,
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
import {
	Bar,
	CartesianGrid,
	ComposedChart,
	Line,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { DashboardVm } from "@/viewmodels/dashboard-vm";

const totalSeries = { key: "total", label: "Total", color: "hsl(var(--basalt-foreground))" };

function channelColor(index: number) {
	const color = getChartColor(index);
	const tint = Math.min(42, Math.floor(index / CHART_COLORS.length) * 14);
	return tint ? `color-mix(in srgb, ${color}, ${totalSeries.color} ${tint}%)` : color;
}

export function ContentTrendChart({ activity }: { activity: ReturnType<DashboardVm["activity"]> }) {
	const valueFormatter = (value: number) =>
		Number.isInteger(value) ? value.toLocaleString("en-US") : "";
	const series = [
		{ key: "watchlists", label: "Watchlists", color: "hsl(var(--basalt-muted-foreground))" },
		...activity.channelSeries.map(([id, label], index) => ({
			key: `channelCounts.${id}`,
			label,
			color: channelColor(index),
		})),
	];

	return (
		<ChartFrame
			ariaLabel="Daily content by watchlists and channels"
			size="w-full"
			legend={
				<div className="flex min-w-0 flex-wrap gap-x-4 [overflow-wrap:anywhere]">
					<ChartLegend items={[totalSeries]} shape="line" />
					<ChartLegend items={series} shape="bar" />
				</div>
			}
			summary={
				activity.total === 0
					? "No content added in the last 14 days."
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
										<TableCell>
											{point.channels}
											{point.channels > 0 && (
												<ul aria-label="Channel breakdown" className="text-basalt-muted-foreground">
													{activity.channelSeries.map(([id, name]) =>
														point.channelCounts[id] ? (
															<li key={id}>
																{name}: {point.channelCounts[id]}
															</li>
														) : null,
													)}
												</ul>
											)}
										</TableCell>
										<TableCell>{point.total}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</details>
			}
		>
			<div className="h-64 w-full sm:h-72">
				<ResponsiveContainer {...RESPONSIVE_CONTAINER_PROPS}>
					<ComposedChart accessibilityLayer data={activity.points} margin={CHART_PLOT_MARGIN}>
						<CartesianGrid {...GRID_PROPS} />
						<XAxis
							dataKey="x"
							tickFormatter={(date) => String(date).slice(5)}
							{...cartesianAxisProps()}
						/>
						<YAxis
							domain={[0, Math.max(4, ...activity.points.map((point) => point.total))]}
							allowDecimals={false}
							tickFormatter={valueFormatter}
							width={32}
							{...cartesianAxisProps()}
						/>
						<Tooltip
							{...chartTooltipProps({
								customTooltip: ({ active, label, payload }) => (
									<ChartTooltipContent
										active={active}
										label={label}
										payload={payload?.filter(
											(item) => item.dataKey === "total" || Number(item.value) > 0,
										)}
										formatter={valueFormatter}
									/>
								),
							})}
						/>
						{series.map(({ key, label, color }) => (
							<Bar
								key={key}
								dataKey={key}
								name={label}
								stackId="content"
								fill={color}
								stroke="hsl(var(--basalt-card))"
								strokeWidth={0.75}
								isAnimationActive={false}
							/>
						))}
						<Line
							dataKey={totalSeries.key}
							name={totalSeries.label}
							type="monotone"
							stroke={totalSeries.color}
							strokeWidth={2}
							dot={{ r: 2 }}
							isAnimationActive={false}
						/>
					</ComposedChart>
				</ResponsiveContainer>
			</div>
		</ChartFrame>
	);
}
