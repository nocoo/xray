import type { LinkPreview } from "@xray/shared";
import { decodeHTML, decodeHTMLAttribute } from "entities";
import { readResponseBounded } from "./ai-endpoint.js";
import { hasPublicDns, publicPreviewUrl } from "./link-preview-url.js";

export const PREVIEW_MAX_BYTES = 512 * 1024;
export const PREVIEW_TIMEOUT_MS = 5000;

export function unavailablePreview(url: string): LinkPreview {
	return { url, title: null, description: null, imageUrl: null, siteName: null };
}

export async function parsePreviewHtml(
	html: string,
	pageUrl: string,
	originalUrl: string,
): Promise<LinkPreview> {
	const meta = new Map<string, string>();
	let title = "";
	const rewriter = new HTMLRewriter()
		.on("meta", {
			element(element) {
				const key = (
					element.getAttribute("property") ||
					element.getAttribute("name") ||
					""
				).toLowerCase();
				const content = element.getAttribute("content")?.trim();
				if (content && !meta.has(key)) meta.set(key, decodeHTMLAttribute(content).slice(0, 4096));
			},
		})
		.on("title", {
			text(chunk) {
				title = (title + chunk.text).slice(0, 4096);
			},
		});
	await rewriter.transform(new Response(html)).arrayBuffer();
	const clean = (text: string | undefined) =>
		text?.replace(/\s+/g, " ").trim().slice(0, 1000) || null;
	const image = meta.get("og:image") || meta.get("twitter:image");
	return {
		url: originalUrl,
		title: clean(meta.get("og:title") || meta.get("twitter:title") || decodeHTML(title)),
		description: clean(
			meta.get("og:description") || meta.get("twitter:description") || meta.get("description"),
		),
		imageUrl: image ? (publicPreviewUrl(image, pageUrl)?.href ?? null) : null,
		siteName: clean(meta.get("og:site_name")),
	};
}

export async function fetchLinkPreview(originalUrl: string): Promise<LinkPreview> {
	const unavailable = unavailablePreview(originalUrl);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);
	try {
		let current = publicPreviewUrl(originalUrl);
		for (let hop = 0; hop <= 3; hop++) {
			if (!current || !(await hasPublicDns(current, controller.signal))) return unavailable;
			const response = await fetch(current, {
				redirect: "manual",
				signal: controller.signal,
				headers: { Accept: "text/html", "User-Agent": "XRay-LinkPreview/1.0" },
			});
			if ([301, 302, 303, 307, 308].includes(response.status)) {
				const location = response.headers.get("location");
				await response.body?.cancel();
				current = location ? publicPreviewUrl(location, current.href) : null;
				continue;
			}
			if (
				!response.ok ||
				response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "text/html" ||
				Number(response.headers.get("content-length")) > PREVIEW_MAX_BYTES
			) {
				await response.body?.cancel();
				return unavailable;
			}
			const html = await readResponseBounded(response, PREVIEW_MAX_BYTES);
			return await parsePreviewHtml(html, current.href, originalUrl);
		}
		return unavailable;
	} catch {
		return unavailable;
	} finally {
		clearTimeout(timer);
	}
}

export async function previewCacheKey(tenantId: string, url: string): Promise<Request> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(JSON.stringify([tenantId, url])),
	);
	const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
	return new Request(`https://xray.hexly.ai/__link-preview/v1/${key}`);
}
