import type { Nodes } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

export type ArticleLink = { url: string; label: string };
export type LinkPreview = {
	url: string;
	title: string | null;
	description: string | null;
	imageUrl: string | null;
	siteName: string | null;
};

const parser = unified().use(remarkParse).use(remarkGfm);

function linkUrl(raw: string): string | null {
	try {
		const url = new URL(raw);
		if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
		url.hash = "";
		return url.href;
	} catch {
		return null;
	}
}

function labelText(node: Nodes): string {
	if (node.type === "text" || node.type === "inlineCode") return node.value;
	return "children" in node ? node.children.map(labelText).join("") : "";
}

export function extractArticleLinks(markdown: string): ArticleLink[] {
	const tree = parser.parse(markdown);
	const definitions = new Map<string, string>();
	const links = new Map<string, ArticleLink>();
	function visit(node: Nodes, collect: boolean) {
		if (node.type === "definition" && !definitions.has(node.identifier))
			definitions.set(node.identifier, node.url);
		if (collect && (node.type === "link" || node.type === "linkReference")) {
			const raw = node.type === "link" ? node.url : definitions.get(node.identifier);
			const url = raw ? linkUrl(raw) : null;
			if (url) {
				const text = labelText(node).replace(/\s+/g, " ").trim();
				const label = text && linkUrl(text) !== url ? text : url;
				const prior = links.get(url);
				if (!prior || prior.label === url) links.set(url, { url, label });
			}
		}
		if ("children" in node) for (const child of node.children) visit(child, collect);
	}
	visit(tree, false);
	visit(tree, true);
	return [...links.values()];
}
