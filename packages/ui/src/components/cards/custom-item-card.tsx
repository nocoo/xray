import type { MockCustomItem } from "@/lib/mock-data";

export function CustomItemCard({ item }: { item: MockCustomItem }) {
	return (
		<article
			data-testid="custom-item-card"
			className="rounded-[var(--radius-card)] border border-dashed border-border bg-card p-4"
		>
			<div className="mb-1 flex items-center gap-2">
				<span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
					{item.source}
				</span>
				<span className="text-xs text-muted-foreground">
					{new Date(item.createdAt).toLocaleString()}
				</span>
			</div>
			<h3 className="text-sm font-semibold">{item.title}</h3>
			<p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
		</article>
	);
}
