import { useEffect, useMemo } from "react";
import type { BreadcrumbItem } from "@/components/layout/breadcrumbs";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";

export function PlaceholderPage({ title, crumbs }: { title: string; crumbs?: BreadcrumbItem[] }) {
	const { setBreadcrumbs } = useBreadcrumbs();
	const crumbsKey = JSON.stringify(crumbs ?? null);
	const resolved = useMemo<BreadcrumbItem[]>(() => {
		const parsed = JSON.parse(crumbsKey) as BreadcrumbItem[] | null;
		return parsed ?? [{ label: title }];
	}, [crumbsKey, title]);

	useEffect(() => {
		setBreadcrumbs(resolved);
		return () => setBreadcrumbs([]);
	}, [resolved, setBreadcrumbs]);

	return (
		<div className="space-y-2">
			<h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
			<p className="text-sm text-muted-foreground">
				Placeholder shell — business UI lands in later stages.
			</p>
		</div>
	);
}
