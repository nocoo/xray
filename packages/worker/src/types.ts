/** Minimal CF Rate Limit binding shape. */
export type RateLimit = {
	limit: (opts: { key: string }) => Promise<{ success: boolean }>;
};

export type TranslateFn = (input: {
	text: string;
	apiKey: string;
	provider: string;
	model: string | null;
	baseUrl: string | null;
	translationPrompt: string | null;
	summaryPrompt: string | null;
	signal: AbortSignal;
}) => Promise<{ translatedText: string; summaryText?: string | null }>;

export type ZhetoUpstream = (
	webhookUrl: string,
	body: { url: string; note?: string; folder?: string },
) => Promise<{ status: number; json: Record<string, unknown> }>;

export type Bindings = {
	DB: D1Database;
	ENVIRONMENT?: string;
	AUTH_DEV_BYPASS?: string;
	ALLOWED_EMAILS?: string;
	CF_ACCESS_TEAM_DOMAIN?: string;
	CF_ACCESS_AUD?: string;
	/** Optional CF Rate Limiting binding stub (S3.10) */
	XRAY_INGEST_RL?: RateLimit;
	ASSETS?: Fetcher;
	/** 32-byte raw or base64 KEK for AI / integration secrets */
	XRAY_SECRETS_KEK?: string;
	XRAY_SECRETS_KEK_PREV?: string;
	XRAY_SECRETS_KEY_VERSION?: string;
	/** Comma-separated hosts allowed for zheto webhook in non-prod tests */
	ZHETO_WEBHOOK_ALLOW_HOSTS?: string;
	/** Test injectables */
	TRANSLATE_FN?: TranslateFn;
	ZHETO_UPSTREAM?: ZhetoUpstream;
};

export type AuthUser = {
	id: string;
	email: string;
	name: string | null;
	image: string | null;
	accessIss: string | null;
	accessSub: string | null;
};

export type Variables = {
	authUser?: AuthUser;
	accessAuthenticated?: boolean;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
