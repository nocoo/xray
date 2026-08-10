import type { MockCustomItem } from "@/lib/mock-data";
import { formatTimeAgo } from "@/lib/utils";

/** Custom / push item shell — distinct dashed card next to tweet cards. */
export function CustomItemCard({ item }: { item: MockCustomItem }) {
	return (
		<article
			data-testid="custom-item-card"
			className="rounded-card border border-dashed border-border bg-secondary p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
		>
			<div className="mb-2 flex items-center gap-2">
				<span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
					{item.source}
				</span>
				<span className="text-xs text-muted-foreground">
					{formatTimeAgo(item.createdAt, "compact")}
				</span>
			</div>
			<h3 className="text-sm font-semibold">{item.title}</h3>
			<p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
				{item.body}
			</p>
		</article>
	);
}
