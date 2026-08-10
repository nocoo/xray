import { Brain, Eye, Plus, Server, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { createWatchlist, fetchWatchlists, type Watchlist } from "@/api/watchlists";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { Button } from "@/components/ui/button";
import { cn, getAvatarColor } from "@/lib/utils";

const ICONS: Record<string, typeof Eye> = {
	brain: Brain,
	server: Server,
	"trending-up": TrendingUp,
	eye: Eye,
};

export function WatchlistsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);

	useEffect(() => {
		setBreadcrumbs([{ label: "Watchlists" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			setWatchlists(await fetchWatchlists());
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const onCreate = async () => {
		const name = window.prompt("Watchlist name");
		if (!name?.trim()) return;
		setCreating(true);
		try {
			await createWatchlist({ name: name.trim() });
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setCreating(false);
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between gap-3">
				<div>
					<h1 className="font-display text-2xl font-semibold tracking-tight">Watchlists</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Create and manage collections of Twitter/X and custom sources.
					</p>
				</div>
				<Button size="sm" type="button" onClick={() => void onCreate()} disabled={creating}>
					<Plus className="h-4 w-4" />
					New Watchlist
				</Button>
			</div>

			{loading && <p className="text-sm text-muted-foreground">Loading…</p>}
			{error && <p className="text-sm text-destructive">{error}</p>}

			{!loading && watchlists.length === 0 && !error && (
				<div className="rounded-card bg-secondary p-10 text-center">
					<p className="text-sm font-medium">No watchlists yet.</p>
					<p className="mt-1 text-xs text-muted-foreground">
						Create one to start the mix timeline.
					</p>
				</div>
			)}

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{watchlists.map((wl) => {
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
