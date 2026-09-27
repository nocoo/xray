import type { Bindings } from "../types.js";

export function isDevOrTest(env: Bindings): boolean {
	const e = (env.ENVIRONMENT ?? "").toLowerCase();
	return e === "development" || e === "test";
}

export function assertBootEnv(env: Bindings): void {
	const localResources = [env.XRAY_LOCAL_JWKS, env.XRAY_PRESENTATION_TIME, env.XRAY_EXTERNAL];
	if (!isDevOrTest(env) && localResources.some((value) => value !== undefined)) {
		throw new Error("Local resources forbidden outside development/test — refusing to boot");
	}
	if (
		env.XRAY_LOCAL_JWKS !== undefined &&
		(env.CF_ACCESS_TEAM_DOMAIN !== "identity.xray.test" || env.CF_ACCESS_AUD !== "xray-local")
	) {
		throw new Error("Local JWKS requires the local Access issuer and audience");
	}
	if (
		env.XRAY_PRESENTATION_TIME !== undefined &&
		(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(env.XRAY_PRESENTATION_TIME) ||
			!Number.isFinite(Date.parse(env.XRAY_PRESENTATION_TIME)))
	) {
		throw new Error("XRAY_PRESENTATION_TIME must be an ISO UTC timestamp");
	}
}

export function presentationTime(env: Pick<Bindings, "XRAY_PRESENTATION_TIME">): number {
	return env.XRAY_PRESENTATION_TIME === undefined
		? Date.now()
		: Date.parse(env.XRAY_PRESENTATION_TIME);
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
