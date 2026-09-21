import { memo, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeMarkdownUrl } from "@/lib/channel-reader";

function ArticleImage({ src, alt }: { src?: string; alt?: string }) {
	const [failed, setFailed] = useState(false);
	return !src || failed ? (
		<span className="text-basalt-muted-foreground">{alt || "Image unavailable"}</span>
	) : (
		<img
			src={src}
			alt={alt || ""}
			loading="lazy"
			referrerPolicy="no-referrer"
			onError={() => setFailed(true)}
		/>
	);
}
const components: Components = {
	img: ({ src, alt }) => <ArticleImage key={src} src={src} alt={alt} />,
	a: ({ href, children }) => (
		<a href={href} target="_blank" rel="noopener noreferrer">
			{children}
		</a>
	),
	table: ({ children }) => (
		<div className="channel-table">
			<table>{children}</table>
		</div>
	),
};
const plugins = [remarkGfm];
export const ChannelMarkdown = memo(function ChannelMarkdown({ markdown }: { markdown: string }) {
	return (
		<Markdown
			remarkPlugins={plugins}
			skipHtml
			urlTransform={(url, key) => safeMarkdownUrl(url, key === "src")}
			components={components}
		>
			{markdown}
		</Markdown>
	);
});
