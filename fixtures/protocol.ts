export { AI_BASE_URL, AI_MODEL, MEDIA_URLS, ZHETO_WEBHOOK_URL } from "./primitives.js";

export const PROVIDER_SCENARIOS = [
	"success",
	"upstream-error",
	"malformed",
	"rate-limit",
	"private-dns",
	"redirect-private",
	"oversized",
	"existing",
] as const;
export type ProviderScenario = (typeof PROVIDER_SCENARIOS)[number];
export type FixtureProviderEnv = { XRAY_FIXTURE_SCENARIO?: string };

export const PREVIEW_DOCUMENTS: Readonly<Record<string, { title: string; description: string }>> = {
	"https://github.com/tw93/Kami": {
		title: "Kami · A quieter reading space",
		description: "A synthetic preview of a public reading project, used to review source cards.",
	},
	"https://github.com/nocoo/basalt": {
		title: "Basalt · Components and design tokens",
		description: "Consistent surfaces, keyboard interactions and a compact application shell.",
	},
	"https://developers.cloudflare.com/workers/": {
		title: "Cloudflare Workers · Runtime guide",
		description:
			"A fixture summary of the public runtime documentation. No remote page was copied.",
	},
	"https://platform.openai.com/docs": {
		title: "API reference · Model experiments",
		description: "Keep model inputs, observed output and bounded retries together.",
	},
	"https://developer.mozilla.org/en-US/docs/Web": {
		title: "MDN · Web platform reference",
		description: "Browser APIs, accessible controls and predictable navigation.",
	},
	"https://www.sqlite.org/lang.html": {
		title: "SQLite · SQL language",
		description: "Transactions and uniqueness constraints support repeatable ingestion.",
	},
	"https://owasp.org/www-project-top-ten/": {
		title: "OWASP · Application security",
		description: "Review ownership, input validation and external service boundaries.",
	},
	"https://www.w3.org/WAI/tutorials/": {
		title: "WAI · Accessible interaction",
		description: "Labels, focus order and status announcements make tasks easier to complete.",
	},
	"https://www.nngroup.com/articles/": {
		title: "Research notes · Observing real tasks",
		description: "Separate a participant's words from observations and interpretations.",
	},
	"https://docs.github.com/en/repositories/releasing-projects-on-github": {
		title: "GitHub · Release documentation",
		description: "Record the tested revision, resulting artifact and verification evidence.",
	},
};
