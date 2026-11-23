import { LayerCard } from "@nocoo/basalt";
import { Skeleton } from "@nocoo/basalt/components/skeleton";

export function StatSkeleton() {
	return (
		<LayerCard className="bg-basalt-bright!">
			<div className="flex items-center justify-between">
				<Skeleton className="h-3" width="40%" />
				<Skeleton className="h-4" style={{ width: "calc(var(--spacing) * 4)" }} />
			</div>
			<Skeleton className="mt-2 h-7 md:h-8" width="45%" />
		</LayerCard>
	);
}

export function ChartSkeleton({ className }: { className?: string }) {
	return (
		<LayerCard className={className}>
			<LayerCard.Header>
				<Skeleton className="h-4" width="30%" />
			</LayerCard.Header>
			<LayerCard.Body>
				<Skeleton className="h-50 rounded-basalt-md" />
			</LayerCard.Body>
		</LayerCard>
	);
}
