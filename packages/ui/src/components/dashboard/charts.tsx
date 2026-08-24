import {
	Area,
	AreaChart,
	CartesianGrid,
	Cell,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { IngestDayPoint, ItemDayPoint } from "@/api/dashboard";
import { CHART_COLORS, chartAxis, withAlpha } from "@/lib/chart-palette";

const tooltipStyle = {
	background: "hsl(var(--popover))",
	border: "1px solid hsl(var(--border))",
	borderRadius: "8px",
	fontSize: "12px",
};

function tickDay(v: string) {
	return v.length >= 10 ? v.slice(5) : v;
}

export function IngestTrendChart({ data }: { data: IngestDayPoint[] }) {
	const hasSignal = data.some((d) => d.accepted + d.deduped + d.rejected > 0);
	if (!hasSignal) {
		return (
			<div className="flex min-h-[200px] flex-1 items-center justify-center text-sm text-muted-foreground">
				No ingest activity in the last 14 days
			</div>
		);
	}

	return (
		<div className="min-h-[200px] flex-1">
			<ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
				<AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
					<defs>
						<linearGradient id="ingestAccepted" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.22} />
							<stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
						</linearGradient>
						<linearGradient id="ingestDeduped" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor={CHART_COLORS[4]} stopOpacity={0.18} />
							<stop offset="100%" stopColor={CHART_COLORS[4]} stopOpacity={0} />
						</linearGradient>
						<linearGradient id="ingestRejected" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor={CHART_COLORS[9]} stopOpacity={0.16} />
							<stop offset="100%" stopColor={CHART_COLORS[9]} stopOpacity={0} />
						</linearGradient>
					</defs>
					<CartesianGrid
						strokeDasharray="3 3"
						vertical={false}
						stroke={withAlpha("chart-axis", 0.15)}
					/>
					<XAxis
						dataKey="date"
						axisLine={false}
						tickLine={false}
						tick={{ fill: chartAxis, fontSize: 11 }}
						tickFormatter={tickDay}
					/>
					<YAxis
						axisLine={false}
						tickLine={false}
						tick={{ fill: chartAxis, fontSize: 11 }}
						allowDecimals={false}
					/>
					<Tooltip
						contentStyle={tooltipStyle}
						labelFormatter={(label) => String(label)}
						formatter={(value, name) => {
							const labels: Record<string, string> = {
								accepted: "Accepted",
								deduped: "Deduped",
								rejected: "Rejected",
							};
							return [String(value ?? 0), labels[String(name)] ?? String(name)];
						}}
					/>
					<Area
						type="monotone"
						dataKey="accepted"
						stroke={CHART_COLORS[0] ?? ""}
						fill="url(#ingestAccepted)"
						strokeWidth={2}
						name="accepted"
					/>
					<Area
						type="monotone"
						dataKey="deduped"
						stroke={CHART_COLORS[4] ?? ""}
						fill="url(#ingestDeduped)"
						strokeWidth={1.5}
						name="deduped"
					/>
					<Area
						type="monotone"
						dataKey="rejected"
						stroke={CHART_COLORS[9] ?? ""}
						fill="url(#ingestRejected)"
						strokeWidth={1.5}
						name="rejected"
					/>
				</AreaChart>
			</ResponsiveContainer>
		</div>
	);
}

export function ItemsTrendChart({ data }: { data: ItemDayPoint[] }) {
	const hasSignal = data.some((d) => d.count > 0);
	if (!hasSignal) {
		return (
			<div className="flex min-h-[200px] flex-1 items-center justify-center text-sm text-muted-foreground">
				No items ingested in the last 14 days
			</div>
		);
	}

	return (
		<div className="min-h-[200px] flex-1">
			<ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
				<AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
					<defs>
						<linearGradient id="itemsCount" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor={CHART_COLORS[1]} stopOpacity={0.28} />
							<stop offset="100%" stopColor={CHART_COLORS[1]} stopOpacity={0} />
						</linearGradient>
					</defs>
					<CartesianGrid
						strokeDasharray="3 3"
						vertical={false}
						stroke={withAlpha("chart-axis", 0.15)}
					/>
					<XAxis
						dataKey="date"
						axisLine={false}
						tickLine={false}
						tick={{ fill: chartAxis, fontSize: 11 }}
						tickFormatter={tickDay}
					/>
					<YAxis
						axisLine={false}
						tickLine={false}
						tick={{ fill: chartAxis, fontSize: 11 }}
						allowDecimals={false}
					/>
					<Tooltip
						contentStyle={tooltipStyle}
						labelFormatter={(label) => String(label)}
						formatter={(value) => [String(value ?? 0), "Items"]}
					/>
					<Area
						type="monotone"
						dataKey="count"
						stroke={CHART_COLORS[1] ?? ""}
						fill="url(#itemsCount)"
						strokeWidth={2}
					/>
				</AreaChart>
			</ResponsiveContainer>
		</div>
	);
}

export function SourceDonut({ data }: { data: { sourceType: string; count: number }[] }) {
	const entries = [...data].sort((a, b) => b.count - a.count);
	if (entries.length === 0) {
		return (
			<div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
				No source mix yet
			</div>
		);
	}
	const pieData = entries.map((e) => ({ name: e.sourceType, value: e.count }));

	return (
		<div className="flex flex-col items-center gap-3">
			<div className="h-[180px] w-full">
				<ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
					<PieChart>
						<Pie
							data={pieData}
							cx="50%"
							cy="50%"
							innerRadius={50}
							outerRadius={75}
							paddingAngle={2}
							dataKey="value"
						>
							{pieData.map((entry, i) => (
								<Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length] ?? ""} />
							))}
						</Pie>
						<Tooltip contentStyle={tooltipStyle} />
					</PieChart>
				</ResponsiveContainer>
			</div>
			<div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
				{entries.map((entry, i) => (
					<div key={entry.sourceType} className="flex items-center gap-1.5 text-xs">
						<span
							className="inline-block h-2.5 w-2.5 rounded-full"
							style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
						/>
						<span className="text-muted-foreground">{entry.sourceType}</span>
						<span className="font-medium tabular-nums">{entry.count}</span>
					</div>
				))}
			</div>
		</div>
	);
}
