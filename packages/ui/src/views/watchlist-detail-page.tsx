import { Eye, Plus, RefreshCw, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { CustomItemCard } from "@/components/cards/custom-item-card";
import { MemberCard } from "@/components/cards/member-card";
import { WatchlistPostCard } from "@/components/cards/watchlist-post-card";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { Button } from "@/components/ui/button";
import { useColumns } from "@/hooks/use-columns";
import {
	MOCK_CUSTOM_ITEMS,
	MOCK_MEMBERS,
	MOCK_POSTS,
	MOCK_TAGS,
	MOCK_WATCHLISTS,
	type MockPost,
} from "@/lib/mock-data";

export function WatchlistDetailPage() {
	const { id } = useParams();
	const wl = MOCK_WATCHLISTS.find((w) => String(w.id) === id) ?? MOCK_WATCHLISTS[0];
	const { setBreadcrumbs } = useBreadcrumbs();
	const [activeTab, setActiveTab] = useState<"members" | "posts">("posts");
	const [filterTagId, setFilterTagId] = useState<number | null>(null);
	const [posts, setPosts] = useState<MockPost[]>(MOCK_POSTS);
	const columnCount = useColumns();

	useEffect(() => {
		setBreadcrumbs([{ label: "Watchlists", href: "/watchlist" }, { label: wl?.name ?? "Detail" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs, wl?.name]);

	const filteredMembers = useMemo(
		() =>
			filterTagId
				? MOCK_MEMBERS.filter((m) => m.tags.some((t) => t.id === filterTagId))
				: MOCK_MEMBERS,
		[filterTagId],
	);

	const postColumns = useMemo(() => {
		const cols: MockPost[][] = Array.from({ length: columnCount }, () => []);
		const heights = new Array<number>(columnCount).fill(0);
		for (const post of posts) {
			let h = 80;
			h += Math.ceil((post.tweet.text?.length ?? 0) / 60) * 20;
			if (post.tweet.media && post.tweet.media.length > 0) h += 200;
			if (post.tweet.quoted_tweet) h += 120;
			let minIdx = 0;
			for (let c = 1; c < columnCount; c++) {
				if ((heights[c] ?? 0) < (heights[minIdx] ?? 0)) minIdx = c;
			}
			cols[minIdx]?.push(post);
			heights[minIdx] = (heights[minIdx] ?? 0) + h;
		}
		return cols;
	}, [posts, columnCount]);

	const handleRemovePost = (postId: number) => {
		setPosts((prev) => prev.filter((p) => p.id !== postId));
	};

	return (
		<div className="space-y-4">
			{/* Toolbar: tabs + actions (legacy layout) */}
			<div className="flex items-center gap-1">
				<div className="flex items-center">
					<button
						type="button"
						onClick={() => setActiveTab("members")}
						className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
							activeTab === "members"
								? "bg-secondary text-foreground"
								: "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
						}`}
					>
						Members
						<span className="ml-1.5 text-xs text-muted-foreground">({MOCK_MEMBERS.length})</span>
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("posts")}
						className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
							activeTab === "posts"
								? "bg-secondary text-foreground"
								: "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
						}`}
					>
						Posts
						<span className="ml-1.5 text-xs text-muted-foreground">({posts.length})</span>
					</button>
				</div>

				<div className="flex flex-1 justify-center">
					<span className="text-xs text-muted-foreground">
						{wl?.name}
						{wl?.translateEnabled ? " · Translate on" : " · Translate off"}
						<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px]">mock</span>
					</span>
				</div>

				<div className="flex items-center gap-1.5">
					{activeTab === "members" && (
						<Button size="sm" type="button" disabled title="S4">
							<Plus className="h-4 w-4" />
							Add
						</Button>
					)}
					<Button variant="outline" size="sm" type="button" disabled title="S5 fetch">
						<RefreshCw className="h-4 w-4" />
						Fetch
					</Button>
					<Button variant="ghost" size="icon-sm" type="button" disabled title="S4 settings">
						<Settings className="h-4 w-4" />
					</Button>
				</div>
			</div>

			{activeTab === "members" && (
				<div>
					{MOCK_TAGS.length > 0 && (
						<div className="mb-4 flex flex-wrap items-center gap-2">
							<span className="mr-1 text-xs text-muted-foreground">Filter:</span>
							<button
								type="button"
								onClick={() => setFilterTagId(null)}
								className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
									filterTagId === null
										? "bg-foreground text-background"
										: "bg-secondary text-muted-foreground hover:bg-secondary/80"
								}`}
							>
								All
							</button>
							{MOCK_TAGS.map((tag) => (
								<button
									key={tag.id}
									type="button"
									onClick={() => setFilterTagId(filterTagId === tag.id ? null : tag.id)}
									className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white transition-opacity"
									style={{
										backgroundColor: tag.color,
										opacity: filterTagId === null || filterTagId === tag.id ? 1 : 0.4,
									}}
								>
									{tag.name}
								</button>
							))}
						</div>
					)}

					{filteredMembers.length > 0 ? (
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
							{filteredMembers.map((member) => (
								<MemberCard key={member.id} member={member} />
							))}
						</div>
					) : (
						<div className="rounded-card bg-secondary p-8 text-center">
							<p className="text-muted-foreground">No users match the selected tag filter.</p>
						</div>
					)}
				</div>
			)}

			{activeTab === "posts" && (
				<div>
					{posts.length === 0 ? (
						<div className="flex flex-col items-center gap-2 rounded-card bg-secondary p-10 text-center">
							<Eye className="h-8 w-8 text-muted-foreground" />
							<p className="text-sm font-medium">No fetched posts yet.</p>
							<p className="text-xs text-muted-foreground">
								Click Fetch when ingest lands in S5 (mock data removed).
							</p>
						</div>
					) : (
						<div className="flex items-start gap-3">
							{postColumns.map((col, colIdx) => (
								<div
									key={col[0] ? `col-${col[0].id}` : `col-empty-${String(colIdx)}`}
									className="flex min-w-0 flex-1 flex-col gap-3"
								>
									{col.map((post) => (
										<WatchlistPostCard key={post.id} post={post} onRemove={handleRemovePost} />
									))}
									{colIdx === 0 &&
										MOCK_CUSTOM_ITEMS.map((c) => <CustomItemCard key={c.id} item={c} />)}
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
