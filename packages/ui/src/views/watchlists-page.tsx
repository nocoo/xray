import { useEffect } from "react";
import { Link } from "react-router";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { MOCK_WATCHLISTS } from "@/lib/mock-data";

export function WatchlistsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	useEffect(() => {
		setBreadcrumbs([{ label: "Watchlists" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-3">
				<h1 className="font-display text-2xl font-semibold tracking-tight">Watchlists</h1>
				<span className="text-xs text-muted-foreground">mock</span>
			</div>
			<ul className="grid gap-3 sm:grid-cols-2">
				{MOCK_WATCHLISTS.map((w) => (
					<li key={w.id}>
						<Link
							to={`/watchlist/${w.id}`}
							className="block rounded-[var(--radius-card)] border border-border bg-secondary p-4 transition-colors hover:bg-accent"
						>
							<p className="font-medium">{w.name}</p>
							<p className="mt-1 text-xs text-muted-foreground">
								{w.memberCount} members · {w.posts24h} posts / 24h
							</p>
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}
