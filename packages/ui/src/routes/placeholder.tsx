import { AppShell } from "@/components/layout";

export function PlaceholderPage({
	title,
	crumbs,
}: {
	title: string;
	crumbs?: { label: string; href?: string }[];
}) {
	return (
		<AppShell breadcrumbs={crumbs ?? [{ label: title }]}>
			<div className="space-y-2">
				<h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
				<p className="text-sm text-muted-foreground">
					Placeholder shell — business UI lands in later stages.
				</p>
			</div>
		</AppShell>
	);
}
