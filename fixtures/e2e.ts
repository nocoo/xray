import type { Page } from "@playwright/test";
import {
	AI_BASE_URL,
	AI_MODEL,
	canonicalArticle,
	canonicalPost,
	FIXTURE_ANCHOR_ISO,
	fixtureIdentity,
	MEDIA_URLS,
	ZHETO_WEBHOOK_URL,
} from "./primitives.js";

export const EXTERNAL_MEDIA_FIXTURES = [
	{ url: MEDIA_URLS.desk, path: "fixtures/media/desk.svg", contentType: "image/svg+xml" },
	{ url: MEDIA_URLS.landscape, path: "fixtures/media/landscape.svg", contentType: "image/svg+xml" },
	{ url: MEDIA_URLS.motion, path: "fixtures/media/motion.mp4", contentType: "video/mp4" },
] as const;

export async function installExternalMedia(page: Page) {
	for (const media of EXTERNAL_MEDIA_FIXTURES) {
		await page.route(
			(url) => url.href === media.url,
			(route) => route.fulfill({ path: media.path, contentType: media.contentType }),
		);
	}
}

export function e2eCatalog(runId: string) {
	const owner = fixtureIdentity(runId);
	return {
		owner,
		other: fixtureIdentity(runId, "other"),
		watchlist: {
			name: "Field notes",
			description: "An isolated source collection",
			icon: "book-open",
		},
		group: { name: "Reading room", description: "Sources to copy and deduplicate", icon: "users" },
		members: [
			{ source_type: "x.com", handle: "demo_builder", display_name: "Demo Builder" },
			{ source_type: "custom", handle: "engineering-notes", display_name: "Engineering Notes" },
		],
		channel: { name: "Research journal", description: "Reports, references and reading progress" },
		tags: [{ name: "Research" }, { name: "待验证" }],
		items: [canonicalPost(`${runId}-post`), canonicalArticle(`${runId}-custom`)],
		report: {
			external_id: `${runId}-report`,
			title: "One clear question",
			report_date: FIXTURE_ANCHOR_ISO.slice(0, 10),
			summary: "A reproducible reading and research workflow.",
			author: "Demo Research Desk",
			markdown: `## Research notes\n\nRead the source, record the result.\n\n- [Workers](https://developers.cloudflare.com/workers/)\n- [Unavailable source](https://example.com/xray-demo-preview-unavailable-v1)\n\n![Research desk](${MEDIA_URLS.desk})`,
		},
		ai: {
			provider: "openai",
			model: AI_MODEL,
			baseUrl: AI_BASE_URL,
			apiKey: "fixture-local-key",
			translationPrompt: "Translate to Simplified Chinese.",
			summaryPrompt: "Summarize in one sentence.",
		},
		zheto: { webhookUrl: ZHETO_WEBHOOK_URL, folder: "Fixture reading" },
	};
}
