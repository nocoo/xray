import { useEffect } from "react";
import { useParams } from "react-router";
import { CustomItemCard } from "@/components/cards/custom-item-card";
import { TweetCard } from "@/components/cards/tweet-card";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { MOCK_CUSTOM_ITEMS, MOCK_TWEETS, MOCK_WATCHLISTS } from "@/lib/mock-data";

export function WatchlistDetailPage() {
	const { id } = useParams();
	const wl = MOCK_WATCHLISTS.find((w) => String(w.id) === id) ?? MOCK_WATCHLISTS[0];
	const { setBreadcrumbs } = useBreadcrumbs();

	useEffect(() => {
		setBreadcrumbs([{ label: "Watchlists", href: "/watchlist" }, { label: wl?.name ?? "Detail" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs, wl?.name]);

	return (
		<div className="space-y-4">
			<h1 className="font-display text-2xl font-semibold tracking-tight">{wl?.name}</h1>
			<p className="text-sm text-muted-foreground">Mock mixed timeline (tweet + custom cards).</p>
			<div className="grid gap-3">
				{MOCK_TWEETS.map((t) => (
					<TweetCard key={t.id} tweet={t} />
				))}
				{MOCK_CUSTOM_ITEMS.map((c) => (
					<CustomItemCard key={c.id} item={c} />
				))}
			</div>
		</div>
	);
}
