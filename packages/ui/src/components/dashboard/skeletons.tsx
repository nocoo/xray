import { LayerCard } from "@nocoo/basalt";
import { SkeletonLine } from "@nocoo/basalt/components/skeleton-line";

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
