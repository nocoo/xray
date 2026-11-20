import { Button, LayerCard } from "@nocoo/basalt";
import { Popover, PopoverContent, PopoverTrigger } from "@nocoo/basalt/components/popover";
import {
	ArrowLeftRight,
	Check,
	Ellipsis,
	ExternalLink,
	Eye,
	Heart,
	Languages,
	LinkIcon,
	Trash2,
} from "@nocoo/basalt/icons";
import type { TweetMetrics } from "@/lib/tweet-types";
import { cn, formatCount } from "@/lib/utils";
import type { ZhetoSaveState } from "@/lib/zheto-save";

const summaryMetrics = [
	{ key: "like_count", label: "Likes", Icon: Heart },
	{ key: "view_count", label: "Views", Icon: Eye },
] as const;

const metricLabels = {
	like_count: "Likes",
	view_count: "Views",
	reply_count: "Replies",
	retweet_count: "Reposts",
	quote_count: "Quotes",
	bookmark_count: "Bookmarks",
} satisfies Record<keyof TweetMetrics, string>;

const saveLabels = {
	idle: "Save to zhe.to",
	saving: "Saving to zhe.to…",
	saved: "Saved to zhe.to",
	error: "Save failed — retry",
} satisfies Record<ZhetoSaveState, string>;

const toolClass =
	"h-8 min-w-8 px-2 text-basalt-muted-foreground max-sm:min-h-basalt-touch max-sm:min-w-basalt-touch pointer-coarse:min-h-basalt-touch pointer-coarse:min-w-basalt-touch";

export function WatchlistCardFooter({
	url,
	metrics,
	translation,
	save,
	onRemove,
}: {
	url?: string | null;
	metrics?: TweetMetrics;
	translation?: { showing?: "original" | "translated"; loading: boolean; onClick: () => void };
	save?: { state: ZhetoSaveState; onClick: () => void };
	onRemove?: () => void;
}) {
	const hasMore = metrics || save || onRemove;
	if (!url && !translation && !hasMore) return null;

	const showing = translation?.showing;
	const translateLabel =
		showing === "translated"
			? "Show original"
			: showing === "original"
				? "Show translation"
				: "Translate";
	const TranslationIcon = showing ? ArrowLeftRight : Languages;

	return (
		<LayerCard.Footer className="flex-nowrap items-center gap-2 px-2 py-1">
			{metrics && (
				<dl
					aria-label="Key post statistics"
					className="flex items-center gap-2.5 whitespace-nowrap text-xs text-basalt-muted-foreground tabular-nums"
				>
					{summaryMetrics.map(({ key, label, Icon }) => (
						<div key={key} className="flex items-center gap-1">
							<dt className="sr-only">{label}</dt>
							<Icon className="size-basalt-icon shrink-0" aria-hidden="true" />
							<dd>{formatCount(metrics[key])}</dd>
						</div>
					))}
				</dl>
			)}
			<div className="ml-auto flex shrink-0 items-center gap-0.5">
				{url && (
					<Button asChild variant="ghost" size="icon-sm" className={toolClass}>
						<a
							href={url}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Open source (opens in a new tab)"
							title="Open source"
						>
							<ExternalLink aria-hidden="true" />
						</a>
					</Button>
				)}
				{translation && (
					<Button
						variant="ghost"
						size="icon-sm"
						className={cn(
							toolClass,
							showing === "translated" && "bg-basalt-accent text-basalt-accent-foreground",
						)}
						aria-label={translateLabel}
						title={translateLabel}
						loading={translation.loading}
						icon={<TranslationIcon aria-hidden="true" />}
						onClick={translation.onClick}
					/>
				)}
				{hasMore && (
					<Popover>
						<PopoverTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								className={toolClass}
								aria-label="More post details"
								title="More post details"
							>
								<Ellipsis aria-hidden="true" />
							</Button>
						</PopoverTrigger>
						<PopoverContent
							align="end"
							arrow={false}
							aria-label="Post details"
							className="w-56 p-2"
						>
							{metrics && (
								<dl aria-label="Post statistics" className="grid gap-1 px-2 py-1.5 text-xs">
									{(Object.keys(metricLabels) as Array<keyof TweetMetrics>).map((key) => (
										<div key={key} className="flex items-center justify-between gap-2">
											<dt className="text-basalt-muted-foreground">{metricLabels[key]}</dt>
											<dd className="tabular-nums">{metrics[key].toLocaleString()}</dd>
										</div>
									))}
								</dl>
							)}
							{(save || onRemove) && (
								<div
									className={cn("grid gap-1", metrics && "mt-1 border-t border-basalt-border pt-1")}
								>
									{save && (
										<Button
											variant="ghost"
											size="sm"
											className={cn(
												"justify-start max-sm:min-h-basalt-touch pointer-coarse:min-h-basalt-touch",
												save.state === "error" && "text-basalt-destructive",
											)}
											icon={
												save.state === "saved" ? (
													<Check aria-hidden="true" />
												) : (
													<LinkIcon aria-hidden="true" />
												)
											}
											loading={save.state === "saving"}
											disabled={save.state === "saved"}
											onClick={save.onClick}
										>
											{saveLabels[save.state]}
										</Button>
									)}
									{onRemove && (
										<Button
											variant="ghost"
											size="sm"
											className="justify-start text-basalt-destructive hover:text-basalt-destructive max-sm:min-h-basalt-touch pointer-coarse:min-h-basalt-touch"
											icon={<Trash2 aria-hidden="true" />}
											onClick={onRemove}
										>
											Remove post
										</Button>
									)}
								</div>
							)}
						</PopoverContent>
					</Popover>
				)}
			</div>
		</LayerCard.Footer>
	);
}
