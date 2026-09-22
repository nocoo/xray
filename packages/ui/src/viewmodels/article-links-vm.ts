import {
	type ArticleLink,
	type ChannelArticle,
	extractArticleLinks,
	type LinkPreview,
} from "@xray/shared";
import type { fetchArticleLinkPreview } from "@/api/article-links";
import { createStore } from "./store";

export type ArticleLinkState = ArticleLink & {
	status: "idle" | "queued" | "loading" | "ready" | "failed";
	preview: LinkPreview | null;
};

export function createArticleLinksVm(fetchPreview: typeof fetchArticleLinkPreview) {
	type Article = Pick<ChannelArticle, "id" | "channelId" | "markdown">;
	const store = createStore({
		article: null as Article | null,
		revision: 0,
		links: [] as ArticleLinkState[],
	});
	const cache = new Map<string, LinkPreview>();
	let article: Article | null = null;
	let revision = 0;
	let queue: string[] = [];
	const active = new Set<AbortController>();
	function cancel() {
		++revision;
		queue = [];
		for (const controller of active) controller.abort();
		active.clear();
	}
	function update(url: string, state: Partial<ArticleLinkState>) {
		store.setState((current) => ({
			links: current.links.map((link) => (link.url === url ? { ...link, ...state } : link)),
		}));
	}
	function drain() {
		if (!article) return;
		const { id, channelId } = article;
		while (active.size < 3 && queue.length) {
			const url = queue.shift() as string;
			const request = revision;
			const controller = new AbortController();
			active.add(controller);
			update(url, { status: "loading" });
			void (async () => {
				try {
					const preview = await fetchPreview(channelId, id, url, controller.signal);
					if (request !== revision) return;
					cache.set(`${channelId}/${id}/${url}`, preview);
					update(url, { status: "ready", preview });
				} catch {
					if (request === revision) update(url, { status: "failed" });
				} finally {
					active.delete(controller);
					if (request === revision) drain();
				}
			})();
		}
	}
	return {
		...store,
		cancel,
		setArticle(next: Article, links?: readonly ArticleLink[]) {
			cancel();
			article = next;
			store.setState({
				article: next,
				revision,
				links: (links ?? extractArticleLinks(next.markdown)).map((link) => {
					const preview = cache.get(`${next.channelId}/${next.id}/${link.url}`) ?? null;
					return { ...link, preview, status: preview ? "ready" : "idle" };
				}),
			});
		},
		request(url: string) {
			if (!store.getState().links.some((link) => link.url === url && link.status === "idle"))
				return;
			update(url, { status: "queued" });
			queue.push(url);
			drain();
		},
	};
}
export type ArticleLinksVm = ReturnType<typeof createArticleLinksVm>;
