/**
 * L2 route coverage gate (bat pattern).
 * Declared routes in packages/worker/src/index.ts must appear in test/e2e HTTP tests.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WORKER_INDEX = join(ROOT, "packages/worker/src/index.ts");
const E2E_DIR = join(ROOT, "packages/worker/test/e2e");

type RouteMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";
type Route = { method: RouteMethod; path: string };

function discoverDeclaredRoutes(): Route[] {
	const src = readFileSync(WORKER_INDEX, "utf-8");
	const routes: Route[] = [];
	const re = /\bapp\.(get|post|put|delete|patch|head)\(\s*["']([^"']+)["']/g;
	for (const m of src.matchAll(re)) {
		const method = m[1];
		const path = m[2];
		if (method && path?.startsWith("/api/")) {
			routes.push({ method: method.toUpperCase() as RouteMethod, path });
		}
	}
	return routes;
}

const HELPER_TO_METHOD: Record<string, RouteMethod> = {
	get: "GET",
	post: "POST",
	put: "PUT",
	delete: "DELETE",
	patch: "PATCH",
	head: "HEAD",
};

function normaliseRequestPath(path: string): string {
	return path.replace(/\$\{[^}]+\}/g, "x");
}

function listE2eSources(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, name.name);
		if (name.isDirectory()) {
			if (name.name === "fixtures") continue;
			out.push(...listE2eSources(p));
		} else if (name.name.endsWith(".ts") && !name.name.endsWith(".d.ts")) {
			out.push(p);
		}
	}
	return out;
}

function discoverE2ERequests(): Route[] {
	const files = listE2eSources(E2E_DIR);
	const requests: Route[] = [];

	for (const file of files) {
		const src = readFileSync(file, "utf-8");

		const fetchRe =
			/fetch\(\s*[`"'][^`"']*?(\/api\/[^`"'?]+)[^`"']*?[`"']\s*(?:,\s*\{([^}]*)\})?/gs;
		for (const m of src.matchAll(fetchRe)) {
			const rawPath = m[1];
			const opts = m[2] ?? "";
			if (!rawPath) continue;
			const methodMatch = opts.match(/method:\s*["'`](\w+)["'`]/);
			const method = (methodMatch ? methodMatch[1].toUpperCase() : "GET") as RouteMethod;
			requests.push({ method, path: normaliseRequestPath(rawPath) });
		}

		// jsonFetch("/api/...") or jsonFetch<T>("/api/...", { method: "POST" })
		const jsonFetchRe = /jsonFetch(?:\s*<[^>]*>)?\(\s*[`"']([^`"']+)[`"']\s*(?:,\s*\{([^}]*)\})?/gs;
		for (const m of src.matchAll(jsonFetchRe)) {
			const rawPath = m[1];
			const opts = m[2] ?? "";
			if (!rawPath?.startsWith("/api/")) continue;
			const methodMatch = opts.match(/method:\s*["'`](\w+)["'`]/);
			const method = (methodMatch ? methodMatch[1].toUpperCase() : "GET") as RouteMethod;
			const pathOnly = rawPath.split("?")[0] ?? rawPath;
			requests.push({ method, path: normaliseRequestPath(pathOnly) });
		}

		const helperRe = /\b(get|post|put|delete|patch|head)\(\s*[`"']([^`"']+)[`"']/g;
		for (const m of src.matchAll(helperRe)) {
			const helper = m[1];
			const rawPath = m[2];
			if (!(helper && rawPath?.startsWith("/api/"))) continue;
			const method = HELPER_TO_METHOD[helper];
			if (!method) continue;
			requests.push({ method, path: normaliseRequestPath(rawPath) });
		}

		// Template: `${BASE}/api/...`
		const baseTpl = /\$\{BASE\}(\/api\/[^`"'?\s]+)/g;
		for (const m of src.matchAll(baseTpl)) {
			const rawPath = m[1];
			if (!rawPath) continue;
			requests.push({
				method: "GET",
				path: normaliseRequestPath(rawPath.split("?")[0] ?? rawPath),
			});
		}
	}
	return requests;
}

function routeToRegex(path: string): RegExp {
	const escaped = path
		.split("/")
		.map((seg) => {
			if (seg.startsWith(":")) return "[^/]+";
			return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		})
		.join("/");
	return new RegExp(`^${escaped}$`);
}

function isMatch(route: Route, request: Route): boolean {
	const methodOk =
		route.method === request.method || (route.method === "GET" && request.method === "HEAD");
	if (!methodOk) return false;
	return routeToRegex(route.path).test(request.path);
}

function main(): void {
	console.info("=== L2 Route Coverage Gate ===\n");
	const declared = discoverDeclaredRoutes();
	const requests = discoverE2ERequests();
	console.info(`Declared routes: ${declared.length}`);
	console.info(`E2E requests:    ${requests.length}\n`);

	const uncovered: Route[] = [];
	for (const route of declared) {
		if (!requests.some((req) => isMatch(route, req))) uncovered.push(route);
	}

	if (uncovered.length === 0) {
		console.info(`✔ All ${declared.length} routes have at least one E2E request.\n`);
		return;
	}
	console.error(`❌ ${uncovered.length} route(s) have NO E2E coverage:\n`);
	for (const r of uncovered) {
		console.error(`  ${r.method.padEnd(6)} ${r.path}`);
	}
	process.exit(1);
}

main();
