import { Brain, Eye, Plus, Server, TrendingUp } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { Button } from "@/components/ui/button";
import { MOCK_WATCHLISTS } from "@/lib/mock-data";
import { cn, getAvatarColor } from "@/lib/utils";

const ICONS: Record<string, typeof Eye> = {
	brain: Brain,
	server: Server,
	"trending-up": TrendingUp,
	eye: Eye,
};

export function WatchlistsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	useEffect(() => {
		setBreadcrumbs([{ label: "Watchlists" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between gap-3">
				<div>
					<h1 className="font-display text-2xl font-semibold tracking-tight">Watchlists</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Create and manage collections of Twitter/X users to track.
					</p>
				</div>
				<Button size="sm" type="button" disabled title="Create lands in S4">
					<Plus className="h-4 w-4" />
					New Watchlist
				</Button>
			</div>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{MOCK_WATCHLISTS.map((wl) => {
					const WlIcon = ICONS[wl.icon] ?? Eye;
					const color = getAvatarColor(wl.name);
					return (
						<Link
							key={wl.id}
							to={`/watchlist/${wl.id}`}
							className="group relative flex flex-col gap-3 rounded-card bg-secondary p-5 transition-colors hover:bg-accent/50"
						>
							<div className="flex items-center gap-3">
								<div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", color)}>
									<WlIcon className="h-5 w-5 text-white" strokeWidth={1.5} />
								</div>
								<div className="min-w-0 flex-1">
									<h3 className="truncate text-sm font-medium">{wl.name}</h3>
									{wl.description && (
										<p className="truncate text-xs text-muted-foreground">{wl.description}</p>
									)}
								</div>
							</div>
							<div className="flex items-center gap-3 text-xs text-muted-foreground">
								<span>
									{wl.memberCount} member{wl.memberCount !== 1 ? "s" : ""}
								</span>
								<span>·</span>
								<span>{wl.posts24h} posts / 24h</span>
								{wl.translateEnabled ? (
									<span className="text-emerald-600 dark:text-emerald-400">Translate on</span>
								) : (
									<span>Translate off</span>
								)}
							</div>
						</Link>
					);
				})}
			</div>
		</div>
	);
}
