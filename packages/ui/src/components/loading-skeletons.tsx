import { LayerCard } from "@nocoo/basalt";
import { Skeleton } from "@nocoo/basalt/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@nocoo/basalt/components/table";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function LoadingSkeleton({
	label,
	className,
	children,
}: {
	label: string;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div role="status" aria-label={label}>
			<span className="sr-only">{label}</span>
			<div
				aria-hidden="true"
				className={cn("dark:[&_.bg-basalt-muted]:bg-basalt-muted-foreground/15", className)}
			>
				{children}
			</div>
		</div>
	);
}

export function RowsSkeleton({ label, count = 5 }: { label: string; count?: number }) {
	return (
		<LoadingSkeleton label={label} className="divide-y divide-basalt-border/50">
			{[1, 2, 3, 4, 5].slice(0, count).map((i) => (
				<div key={i} className="space-y-3 px-4 py-4">
					<Skeleton className="h-3" width="45%" />
					<Skeleton className="h-4" width={`${80 - i * 2}%`} />
					<Skeleton className="h-3" width="60%" />
				</div>
			))}
		</LoadingSkeleton>
	);
}

export function OptionsSkeleton({ label }: { label: string }) {
	return (
		<LoadingSkeleton label={label} className="space-y-4 p-2">
			{[70, 50, 60, 40].map((width) => (
				<div key={width} className="flex items-center gap-3">
					<Skeleton className="h-4 shrink-0" style={{ width: "calc(var(--spacing) * 4)" }} />
					<Skeleton className="h-4" width={`${width}%`} />
				</div>
			))}
		</LoadingSkeleton>
	);
}

export function TableSkeleton({
	label,
	columns,
}: {
	label: string;
	columns: { label: string; className?: string }[];
}) {
	return (
		<LoadingSkeleton label={label}>
			<Table>
				<TableHeader>
					<TableRow>
						{columns.map((column) => (
							<TableHead key={column.label} className={column.className}>
								{column.label}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{[1, 2, 3, 4, 5].map((id) => (
						<TableRow key={id}>
							{columns.map((column, index) => (
								<TableCell key={column.label} className={column.className}>
									<div className="min-w-12 space-y-2 py-2">
										<Skeleton className="h-4" width="70%" />
										{index === 0 && <Skeleton className="h-3" width="40%" />}
									</div>
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</LoadingSkeleton>
	);
}

export function CardsSkeleton({
	label,
	feed = false,
	className = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
}: {
	label: string;
	feed?: boolean;
	className?: string;
}) {
	return (
		<LoadingSkeleton label={label} className={className}>
			{[1, 2, 3, 4, 5, 6].map((id) => (
				<LayerCard key={id} className={feed ? "space-y-5 bg-basalt-bright!" : "space-y-3"}>
					<div className="flex items-center gap-3">
						<Skeleton
							className="h-10 shrink-0 rounded-basalt-md"
							style={{ width: "calc(var(--spacing) * 10)" }}
						/>
						<div className="min-w-0 flex-1 space-y-2">
							<Skeleton className="h-4" />
							<Skeleton className="h-3" width="45%" />
						</div>
					</div>
					{feed && (
						<div className="space-y-3">
							<Skeleton className="h-3" />
							<Skeleton className="h-3" width="95%" />
							<Skeleton className="h-3" />
						</div>
					)}
					<Skeleton className="h-3" width="45%" />
				</LayerCard>
			))}
		</LoadingSkeleton>
	);
}

export function ArticleSkeleton() {
	return (
		<LoadingSkeleton label="Loading report" className="channel-prose space-y-8">
			<div className="space-y-4 pb-2">
				<Skeleton className="h-7" width="75%" />
				<Skeleton className="h-3" width="35%" />
			</div>
			{[80, 65, 75].map((width) => (
				<div key={width} className="space-y-4">
					<Skeleton className="h-4" />
					<Skeleton className="h-4" width="95%" />
					<Skeleton className="h-4" width={`${width}%`} />
				</div>
			))}
		</LoadingSkeleton>
	);
}

export function FormSkeleton({
	label,
	fields = 2,
	paragraphs = 0,
	className = "grid gap-4 sm:grid-cols-2",
}: {
	label: string;
	fields?: number;
	paragraphs?: number;
	className?: string;
}) {
	return (
		<LoadingSkeleton label={label} className="space-y-4">
			<Skeleton className="h-3" width="35%" />
			<div className={className}>
				{[1, 2, 3, 4].slice(0, fields).map((i) => (
					<div key={i} className="space-y-2">
						<Skeleton className="h-3" width="35%" />
						<Skeleton className="h-10 rounded-basalt-md" />
					</div>
				))}
			</div>
			{[1, 2].slice(0, paragraphs).map((i) => (
				<div key={i} className="space-y-2">
					<Skeleton className="h-3" width="20%" />
					<Skeleton className="h-24 rounded-basalt-md" />
				</div>
			))}
			<div className="flex justify-end border-t border-basalt-border pt-4">
				<Skeleton
					className="h-8 rounded-basalt-md"
					style={{ width: "calc(var(--spacing) * 24)" }}
				/>
			</div>
		</LoadingSkeleton>
	);
}
