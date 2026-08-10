import type { Bindings } from "../types.js";

export function isDevOrTest(env: Bindings): boolean {
	const e = (env.ENVIRONMENT ?? "").toLowerCase();
	return e === "development" || e === "test";
}

export function authDevBypassEnabled(env: Bindings): boolean {
	return env.AUTH_DEV_BYPASS === "true" || env.AUTH_DEV_BYPASS === "1";
}

/** Fail-closed production boot rule (XR-21). */
export function assertBootEnv(env: Bindings): void {
	if (authDevBypassEnabled(env) && !isDevOrTest(env)) {
		throw new Error(
			"AUTH_DEV_BYPASS is set but ENVIRONMENT is not development/test — refusing to boot",
		);
	}
}

export function parseAllowedEmails(raw: string | undefined): Set<string> {
	if (!raw?.trim()) return new Set();
	return new Set(
		raw
			.split(",")
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean),
	);
}

export const DEV_BYPASS_IDENTITY = {
	email: "dev@xray.local",
	name: "Dev User",
	image: null as string | null,
	accessIss: "https://dev.xray.local",
	accessSub: "dev-bypass-sub",
} as const;
