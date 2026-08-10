import type { MockTweet } from "@/lib/mock-data";

export function TweetCard({ tweet }: { tweet: MockTweet }) {
	return (
		<article
			data-testid="tweet-card"
			className="rounded-[var(--radius-card)] border border-border bg-secondary p-4 shadow-xs"
		>
			<header className="mb-2 flex items-center gap-2">
				<div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
					{tweet.author.slice(0, 1)}
				</div>
				<div className="min-w-0">
					<p className="truncate text-sm font-medium">{tweet.author}</p>
					<p className="truncate text-xs text-muted-foreground">@{tweet.handle}</p>
				</div>
				<span className="ml-auto text-xs text-muted-foreground">
					{new Date(tweet.createdAt).toLocaleString()}
				</span>
			</header>
			<p className="whitespace-pre-wrap text-sm leading-relaxed">{tweet.text}</p>
			<footer className="mt-3 text-xs text-muted-foreground">{tweet.likes} likes</footer>
		</article>
	);
}
