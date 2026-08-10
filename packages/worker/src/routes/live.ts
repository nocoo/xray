import { XRAY_VERSION } from "@xray/shared";
import type { Context } from "hono";

const bootedAt = Date.now();

export type LiveResponse = {
	status: "ok" | "error";
	version: string;
	component: "worker";
	timestamp: string;
	uptimeSec: number;
};

export function liveRoute(c: Context) {
	const body: LiveResponse = {
		status: "ok",
		version: XRAY_VERSION,
		component: "worker",
		timestamp: new Date().toISOString(),
		uptimeSec: Math.round((Date.now() - bootedAt) / 1000),
	};
	return c.json(body);
}
