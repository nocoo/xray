import type { FetchFn } from "./producer-push.js";
import { type MembersGraph, parseMembersGraph } from "./producer-utils.js";

export type FetchIngestGraphDeps = {
	fetch: FetchFn;
	ingestBase: string;
	pushToken: string;
};

export function ingestAgentHeaders(ingestBase: string, pushToken: string): Record<string, string> {
	const headers: Record<string, string> = {
		authorization: `Bearer ${pushToken}`,
		accept: "application/json",
		"content-type": "application/json",
	};
	if (ingestBase.includes("127.0.0.1") || ingestBase.includes("localhost")) {
		headers.host = "xray-ingest.hexly.ai";
	}
	return headers;
}

export async function fetchIngestGraph(deps: FetchIngestGraphDeps): Promise<MembersGraph> {
	if (!deps.pushToken.trim()) {
		throw new Error("XRAY_PUSH_TOKEN required to fetch ingest graph");
	}
	const url = `${deps.ingestBase.replace(/\/$/, "")}/api/v1/ingest/graph`;
	let status = 0;
	let text = "";
	try {
		const res = await deps.fetch(url, {
			method: "GET",
			headers: ingestAgentHeaders(deps.ingestBase, deps.pushToken),
			body: "",
		});
		status = res.status;
		text = await res.text();
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw new Error(`live graph failed: ${msg}`);
	}
	if (status === 401 || status === 403 || status === 429) {
		throw new Error(`live graph HTTP ${status}`);
	}
	if (status < 200 || status >= 300) {
		throw new Error(`live graph HTTP ${status}`);
	}
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		throw new Error("live graph invalid JSON");
	}
	return parseMembersGraph(json);
}

export function applyExplicitMembersFile(
	live: MembersGraph,
	filePath: string | undefined,
	io: { exists: (path: string) => boolean; read: (path: string) => string },
): MembersGraph {
	if (!filePath) return live;
	if (!io.exists(filePath)) {
		throw new Error(`--members-file not found: ${filePath}`);
	}
	return parseMembersGraph(JSON.parse(io.read(filePath)) as unknown);
}

export function ingestBaseForEnv(mode: string | undefined, explicit: string | undefined): string {
	if (explicit) return explicit;
	if (mode === "dev") return "http://127.0.0.1:8787";
	return "https://xray-ingest.hexly.ai";
}
