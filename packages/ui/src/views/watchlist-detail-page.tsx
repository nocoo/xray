import { Eye, Plus, RefreshCw, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { MemberCard } from "@/components/cards/member-card";
import { WatchlistPostCard } from "@/components/cards/watchlist-post-card";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { SourceFilter, type SourceFilterValue } from "@/components/source-filter";
import { Button } from "@/components/ui/button";
import { useColumns } from "@/hooks/use-columns";
import {
	MOCK_MEMBERS,
	MOCK_POSTS,
	MOCK_TAGS,
	MOCK_WATCHLISTS,
	type MockPost,
} from "@/lib/mock-data";

function estimatePostHeight(post: MockPost): number {
	let h = 80;
	if (post.sourceType === "x.com") {
		h += Math.ceil((post.tweet.text?.length ?? 0) / 60) * 20;
		if (post.tweet.media && post.tweet.media.length > 0) h += 200;
		if (post.tweet.quoted_tweet) h += 120;
	} else {
		h += Math.ceil((post.body?.length ?? 0) / 60) * 20;
		if (post.title) h += 24;
	}
	return h;
}

export function WatchlistDetailPage() {
	const { id } = useParams();
	const wl = MOCK_WATCHLISTS.find((w) => String(w.id) === id) ?? MOCK_WATCHLISTS[0];
	const { setBreadcrumbs } = useBreadcrumbs();
	const [activeTab, setActiveTab] = useState<"members" | "posts">("posts");
	const [filterTagId, setFilterTagId] = useState<number | null>(null);
	const [sourceFilter, setSourceFilter] = useState<SourceFilterValue>("all");
	const [posts, setPosts] = useState<MockPost[]>(MOCK_POSTS);
	const columnCount = useColumns();

	useEffect(() => {
		setBreadcrumbs([{ label: "Watchlists", href: "/watchlist" }, { label: wl?.name ?? "Detail" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs, wl?.name]);

	const filteredMembers = useMemo(() => {
		let list = MOCK_MEMBERS;
		if (sourceFilter !== "all") {
			list = list.filter((m) => m.sourceType === sourceFilter);
		}
		if (filterTagId) {
			list = list.filter((m) => m.tags.some((t) => t.id === filterTagId));
		}
		return list;
	}, [filterTagId, sourceFilter]);

	const filteredPosts = useMemo(() => {
		if (sourceFilter === "all") return posts;
		return posts.filter((p) => p.sourceType === sourceFilter);
	}, [posts, sourceFilter]);

	const sourceCounts = useMemo(() => {
		const all = posts.length;
		const x = posts.filter((p) => p.sourceType === "x.com").length;
		const custom = posts.filter((p) => p.sourceType === "custom").length;
		return { all, "x.com": x, custom } as const;
	}, [posts]);

	const postColumns = useMemo(() => {
		const cols: MockPost[][] = Array.from({ length: columnCount }, () => []);
		const heights = new Array<number>(columnCount).fill(0);
		for (const post of filteredPosts) {
			const h = estimatePostHeight(post);
			let minIdx = 0;
			for (let c = 1; c < columnCount; c++) {
				if ((heights[c] ?? 0) < (heights[minIdx] ?? 0)) minIdx = c;
			}
			cols[minIdx]?.push(post);
			heights[minIdx] = (heights[minIdx] ?? 0) + h;
		}
		return cols;
	}, [filteredPosts, columnCount]);

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
						<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px]">
							mix · source_type
						</span>
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

			{/* source_type filter — primary v2 vs v1 discriminator */}
			<SourceFilter value={sourceFilter} onChange={setSourceFilter} counts={sourceCounts} />

			{activeTab === "members" && (
				<div>
					{MOCK_TAGS.length > 0 && (
						<div className="mb-4 flex flex-wrap items-center gap-2">
							<span className="mr-1 text-xs text-muted-foreground">Tag:</span>
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
							<p className="text-muted-foreground">No members match the current filters.</p>
						</div>
					)}
				</div>
			)}

			{activeTab === "posts" && (
				<div>
					{filteredPosts.length === 0 ? (
						<div className="flex flex-col items-center gap-2 rounded-card bg-secondary p-10 text-center">
							<Eye className="h-8 w-8 text-muted-foreground" />
							<p className="text-sm font-medium">No posts for this source filter.</p>
							<p className="text-xs text-muted-foreground">
								Mix timeline holds source_type=x.com and source_type=custom items.
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
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
