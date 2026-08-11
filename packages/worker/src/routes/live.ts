import { XRAY_VERSION } from "@xray/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

const bootedAt = Date.now();

export type LiveCheck = {
	name: string;
	ok: boolean;
	detail?: string;
	latencyMs?: number;
};

export type LiveResponse = {
	status: "ok" | "degraded" | "error";
	version: string;
	component: "worker";
	timestamp: string;
	uptimeSec: number;
	checks: LiveCheck[];
};

async function checkD1(db: D1Database | undefined): Promise<LiveCheck> {
	if (!db) {
		return { name: "d1", ok: false, detail: "DB binding missing" };
	}
	const t0 = Date.now();
	try {
		const row = await db.prepare("SELECT 1 AS ok").first<{ ok: number }>();
		const latencyMs = Date.now() - t0;
		if (row?.ok !== 1) {
			return { name: "d1", ok: false, detail: "unexpected query result", latencyMs };
		}
		return { name: "d1", ok: true, latencyMs };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return { name: "d1", ok: false, detail: msg, latencyMs: Date.now() - t0 };
	}
}

function checkEnv(env: AppEnv["Bindings"]): LiveCheck {
	const missing: string[] = [];
	if (!env.DB) missing.push("DB");
	if ((env.ENVIRONMENT ?? "").toLowerCase() === "production") {
		if (!env.CF_ACCESS_TEAM_DOMAIN) missing.push("CF_ACCESS_TEAM_DOMAIN");
		if (!env.CF_ACCESS_AUD) missing.push("CF_ACCESS_AUD");
	}
	if (missing.length) {
		return { name: "env", ok: false, detail: `missing: ${missing.join(",")}` };
	}
	return { name: "env", ok: true };
}

export async function liveRoute(c: Context<AppEnv>) {
	const envCheck = checkEnv(c.env);
	const d1Check = await checkD1(c.env.DB);
	const checks = [envCheck, d1Check];
	const allOk = checks.every((x) => x.ok);
	const anyOk = checks.some((x) => x.ok);
	const status: LiveResponse["status"] = allOk ? "ok" : anyOk ? "degraded" : "error";
	const body: LiveResponse = {
		status,
		version: XRAY_VERSION,
		component: "worker",
		timestamp: new Date().toISOString(),
		uptimeSec: Math.round((Date.now() - bootedAt) / 1000),
		checks,
	};
	return c.json(body, allOk ? 200 : 503);
}
