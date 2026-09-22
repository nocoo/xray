import { LayerCard } from "@nocoo/basalt";
import { SkeletonLine } from "@nocoo/basalt/components/skeleton-line";
import { useId } from "react";

export function Sparkline({ data }: { data: number[] }) {
	const gradientId = useId();
	if (data.length < 2) return null;
	const w = 80;
	const h = 24;
	const max = Math.max(...data) || 1;
	const step = w / (data.length - 1);
	const points = data.map((v, i) => `${i * step},${h - (v / max) * h}`).join(" ");
	return (
		<svg
			width={w}
			height={h}
			viewBox={`0 0 ${w} ${h}`}
			className="shrink-0"
			aria-hidden
			focusable="false"
		>
			<defs>
				<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="hsl(var(--basalt-primary))" stopOpacity={0.3} />
					<stop offset="100%" stopColor="hsl(var(--basalt-primary))" stopOpacity={0} />
				</linearGradient>
			</defs>
			<polygon points={`0,${h} ${points} ${w},${h}`} fill={`url(#${gradientId})`} />
			<polyline
				points={points}
				fill="none"
				stroke="hsl(var(--basalt-primary))"
				strokeWidth={1.5}
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
		</svg>
	);
}

export function StatCard({
	label,
	value,
	icon: Icon,
	sparkline,
	index = 0,
}: {
	label: string;
	value: string | number;
	icon: React.ElementType;
	sparkline?: number[];
	index?: number;
}) {
	return (
		<LayerCard
			className="animate-fade-up bg-basalt-bright"
			style={{ animationDelay: `calc(var(--motion-stagger, 60ms) * ${index})` }}
			data-testid="stat-card"
			data-stat-label={label}
		>
			<div className="flex items-center justify-between">
				<span className="text-xs tracking-wide text-basalt-muted-foreground">{label}</span>
				<Icon className="h-4 w-4 text-basalt-muted-foreground" strokeWidth={1.5} />
			</div>
			<div className="mt-2 flex items-center gap-3">
				<p className="font-display text-xl font-semibold tracking-tight tabular-nums md:text-2xl">
					{value}
				</p>
				{sparkline && sparkline.length >= 2 ? <Sparkline data={sparkline} /> : null}
			</div>
		</LayerCard>
	);
}

export function StatSkeleton() {
	return (
		<LayerCard className="bg-basalt-bright">
			<div className="flex items-center justify-between">
				<SkeletonLine className="h-3" minWidth={30} maxWidth={50} />
				<SkeletonLine className="h-4" style={{ width: "calc(var(--spacing) * 4)" }} />
			</div>
			<SkeletonLine className="mt-2 h-7 md:h-8" minWidth={35} maxWidth={55} />
		</LayerCard>
	);
}

export function ChartSkeleton({ className }: { className?: string }) {
	return (
		<LayerCard className={className}>
			<LayerCard.Header>
				<SkeletonLine className="h-4" minWidth={20} maxWidth={40} />
			</LayerCard.Header>
			<LayerCard.Body>
				<SkeletonLine className="h-50 rounded-basalt-md" minWidth={100} maxWidth={100} />
			</LayerCard.Body>
		</LayerCard>
	);
}
