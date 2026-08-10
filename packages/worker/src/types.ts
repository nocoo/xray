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
