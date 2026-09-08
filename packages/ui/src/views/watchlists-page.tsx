import { Button, LayerCard } from "@nocoo/basalt";
import { Empty } from "@nocoo/basalt/components/empty";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { Brain, Eye, Plus, Server, TrendingUp } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import * as watchlistsApi from "@/api/watchlists";
import { useCreateDialogs } from "@/components/dialogs/create-dialogs-context";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { cn, getAvatarColor } from "@/lib/utils";
import { useVm } from "@/viewmodels/use-vm";
import { createWatchlistsVm } from "@/viewmodels/watchlists-vm";

const ICONS: Record<string, typeof Eye> = {
	brain: Brain,
	server: Server,
	"trending-up": TrendingUp,
	eye: Eye,
};

export function WatchlistsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const { openCreateWatchlist, listVersion } = useCreateDialogs();
	const [searchParams, setSearchParams] = useSearchParams();
	const vm = useMemo(() => createWatchlistsVm(watchlistsApi), []);
	const { watchlists, loading, error } = useVm(vm);

	useEffect(() => {
		setBreadcrumbs([{ label: "Watchlists" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	useEffect(() => {
		void listVersion;
		void vm.load();
	}, [vm, listVersion]);

	useEffect(() => {
		if (searchParams.get("new") === "1") {
			openCreateWatchlist();
			setSearchParams({}, { replace: true });
		}
	}, [searchParams, setSearchParams, openCreateWatchlist]);

	return (
		<div className="space-y-8">
			<PageHeader
				title="Watchlists"
				description="Create and manage collections of Twitter/X and custom sources."
				actions={
					<Button size="sm" type="button" onClick={openCreateWatchlist}>
						<Plus className="h-4 w-4" />
						New Watchlist
					</Button>
				}
			/>

			{loading && <p className="text-sm text-basalt-muted-foreground">Loading…</p>}
			{error && <p className="text-sm text-basalt-destructive">{error}</p>}

			{!loading && watchlists.length === 0 && !error && (
				<LayerCard>
					<Empty
						title="No watchlists yet."
						description="Create one to start the mix timeline."
						action={
							<Button size="sm" type="button" onClick={openCreateWatchlist}>
								<Plus className="h-4 w-4" />
								New Watchlist
							</Button>
						}
					/>
				</LayerCard>
			)}

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{watchlists.map((wl) => {
					const WlIcon = ICONS[wl.icon] ?? Eye;
					const color = getAvatarColor(wl.name);
					return (
						<Link key={wl.id} to={`/watchlist/${wl.id}`} className="group">
							<LayerCard className="animate-fade-up transition-colors hover:bg-basalt-accent/50">
								<div className="flex items-center gap-3">
									<div
										className={cn("flex h-10 w-10 items-center justify-center rounded-lg", color)}
									>
										<WlIcon className="h-5 w-5 text-white" strokeWidth={1.5} />
									</div>
									<div className="min-w-0 flex-1">
										<h3 className="truncate text-sm font-medium">{wl.name}</h3>
										{wl.description && (
											<p className="truncate text-xs text-basalt-muted-foreground">
												{wl.description}
											</p>
										)}
									</div>
								</div>
								<div className="mt-3 flex items-center gap-3 text-xs text-basalt-muted-foreground">
									<span>
										{wl.memberCount} member{wl.memberCount !== 1 ? "s" : ""}
									</span>
									{wl.translateEnabled ? (
										<span className="text-emerald-600 dark:text-emerald-400">Translate on</span>
									) : (
										<span>Translate off</span>
									)}
								</div>
							</LayerCard>
						</Link>
					);
				})}
			</div>
		</div>
	);
}
