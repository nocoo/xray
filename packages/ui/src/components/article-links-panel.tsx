import { Badge, Button, LayerCard } from "@nocoo/basalt";
import type { ArticleLink, ChannelArticle } from "@xray/shared";
import { ArrowUpRight, Link2, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fetchArticleLinkPreview } from "@/api/article-links";
import {
	type ArticleLinkState,
	type ArticleLinksVm,
	createArticleLinksVm,
} from "@/viewmodels/article-links-vm";
import { useVm } from "@/viewmodels/use-vm";

function previewImage(url: string | null | undefined) {
	if (!url) return null;
	try {
		return new URL(url).protocol === "https:" ? url : null;
	} catch {
		return null;
	}
}

function LinkCard({ link, vm }: { link: ArticleLinkState; vm: ArticleLinksVm }) {
	const element = useRef<HTMLLIElement>(null);
	const [failedImage, setFailedImage] = useState<string | null>(null);
	const image = previewImage(link.preview?.imageUrl);
	const hostname = new URL(link.url).hostname;
	const title = link.preview?.title || link.label || link.url;
	useEffect(() => {
		if (typeof IntersectionObserver === "undefined") {
			vm.request(link.url);
			return;
		}
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				observer.disconnect();
				vm.request(link.url);
			}
		});
		if (element.current) observer.observe(element.current);
		return () => observer.disconnect();
	}, [link.url, vm]);
	return (
		<li ref={element} className="min-w-0">
			<LayerCard.Secondary className="block rounded-basalt-lg bg-basalt-card p-0 text-basalt-foreground ring-1 ring-basalt-border/40">
				<a
					href={link.url}
					target="_blank"
					rel="noopener noreferrer"
					className="group block min-w-0 rounded-basalt-lg outline-none transition-colors hover:bg-basalt-secondary/80 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-basalt-ring"
					aria-label={`${title} (opens in a new tab)`}
				>
					<div className="space-y-2 p-4">
						<div className="flex min-w-0 items-center gap-2 text-xs text-basalt-muted-foreground">
							<Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
							<span className="min-w-0 truncate">
								{link.preview?.siteName ? `${link.preview.siteName} · ${hostname}` : hostname}
							</span>
							<ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0" aria-hidden="true" />
						</div>
						<p className="line-clamp-3 text-sm font-medium leading-snug [overflow-wrap:anywhere] group-hover:underline">
							{title}
						</p>
						{link.preview?.description && (
							<p className="line-clamp-3 text-xs leading-relaxed text-basalt-muted-foreground [overflow-wrap:anywhere]">
								{link.preview.description}
							</p>
						)}
						{image && image !== failedImage && (
							<img
								src={image}
								alt=""
								loading="lazy"
								decoding="async"
								referrerPolicy="no-referrer"
								className="mt-3 aspect-video w-full rounded-basalt-md bg-basalt-secondary object-cover"
								onError={() => setFailedImage(image)}
							/>
						)}
					</div>
				</a>
			</LayerCard.Secondary>
		</li>
	);
}

export function ArticleLinksPanel({
	article,
	links: extractedLinks,
	id,
	open,
	onClose,
}: {
	article: ChannelArticle;
	links?: ArticleLink[];
	id: string;
	open: boolean;
	onClose: () => void;
}) {
	const vm = useMemo(() => createArticleLinksVm(fetchArticleLinkPreview), []);
	const state = useVm(vm);
	const titleId = useId();
	const links =
		state.article?.id === article.id &&
		state.article.channelId === article.channelId &&
		state.article.markdown === article.markdown
			? state.links
			: [];
	useEffect(() => {
		vm.setArticle(
			{ id: article.id, channelId: article.channelId, markdown: article.markdown },
			extractedLinks,
		);
		return vm.cancel;
	}, [vm, article.id, article.channelId, article.markdown, extractedLinks]);
	return (
		<div
			id={id}
			className="channel-links-region"
			data-open={open}
			aria-hidden={!open}
			inert={!open}
		>
			<div className="channel-links-clip">
				<LayerCard
					outlined
					padding="none"
					className="channel-related-links channel-side-panel ring-inset"
					role="complementary"
					aria-label="Related article links"
				>
					<section aria-labelledby={titleId} className="channel-links-stack min-w-0">
						<div className="channel-panel-heading">
							<h2 id={titleId} className="inline-flex items-center gap-2 text-sm font-semibold">
								<Link2 className="h-4 w-4 text-basalt-muted-foreground" aria-hidden="true" />
								Related links
							</h2>
							<div className="flex items-center gap-2">
								<Badge
									variant="secondary"
									className="h-6 min-w-7 justify-center border-basalt-border/40 px-2 py-0 tabular-nums text-basalt-muted-foreground"
								>
									{links.length}
									<span className="sr-only"> related links</span>
								</Badge>
								<Button
									variant="ghost"
									size="icon"
									className="h-6 w-6"
									aria-label="Close related links"
									onClick={onClose}
								>
									<X className="h-3.5 w-3.5" aria-hidden="true" />
								</Button>
							</div>
						</div>
						{links.length ? (
							<ul aria-label="Related links" className="channel-links-list space-y-3 p-3">
								{links.map((link) => (
									<LinkCard key={`${state.revision}/${link.url}`} link={link} vm={vm} />
								))}
							</ul>
						) : (
							<p className="p-3 text-sm text-basalt-muted-foreground">
								No related links in this report.
							</p>
						)}
					</section>
				</LayerCard>
			</div>
		</div>
	);
}
