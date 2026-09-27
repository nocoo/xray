import { MOTION_BASE64, SVG_MEDIA } from "./media.js";
import { AI_BASE_URL, FIXTURE_ANCHOR_MS, MEDIA_URLS, ZHETO_WEBHOOK_URL } from "./primitives.js";

import { type FixtureProviderEnv, PREVIEW_DOCUMENTS, PROVIDER_SCENARIOS } from "./protocol.js";

const DNS_HOSTS = new Set([
	...Object.keys(PREVIEW_DOCUMENTS).map((url) => new URL(url).hostname),
	...Object.values(MEDIA_URLS).map((url) => new URL(url).hostname),
	"example.com",
]);

function mediaResponse(request: Request, url: string): Response {
	const video = url === MEDIA_URLS.motion;
	const bytes = video
		? Uint8Array.from(atob(MOTION_BASE64), (char) => char.charCodeAt(0))
		: new TextEncoder().encode(url === MEDIA_URLS.landscape ? SVG_MEDIA.landscape : SVG_MEDIA.desk);
	const headers = new Headers({
		"Content-Type": video ? "video/mp4" : "image/svg+xml",
		"Content-Length": String(bytes.byteLength),
		"Accept-Ranges": "bytes",
		"Cache-Control": "no-store",
	});
	if (request.method === "HEAD") return new Response(null, { headers });
	const range = request.headers.get("range");
	if (!range) return new Response(bytes, { headers });
	const match = /^bytes=(\d*)-(\d*)$/.exec(range);
	const start = match?.[1] ? Number(match[1]) : Math.max(0, bytes.byteLength - Number(match?.[2]));
	const end = match?.[1] && match[2] ? Number(match[2]) : bytes.byteLength - 1;
	if (
		!match ||
		(!match[1] && !match[2]) ||
		!Number.isSafeInteger(start) ||
		!Number.isSafeInteger(end) ||
		start >= bytes.byteLength ||
		end < start
	) {
		headers.set("Content-Range", `bytes */${bytes.byteLength}`);
		headers.delete("Content-Length");
		return new Response(null, { status: 416, headers });
	}
	const last = Math.min(end, bytes.byteLength - 1);
	headers.set("Content-Range", `bytes ${start}-${last}/${bytes.byteLength}`);
	headers.set("Content-Length", String(last - start + 1));
	return new Response(bytes.slice(start, last + 1), { status: 206, headers });
}

async function fixtureFetch(request: Request, env: FixtureProviderEnv = {}): Promise<Response> {
	const url = new URL(request.url);
	const scenario = env.XRAY_FIXTURE_SCENARIO ?? "success";
	if (!PROVIDER_SCENARIOS.some((known) => known === scenario)) {
		return Response.json({ error: "Unknown fixture scenario" }, { status: 500 });
	}
	if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) {
		return Response.json({ error: "Fixture egress denied" }, { status: 502 });
	}
	const ai = url.href === `${AI_BASE_URL}/chat/completions` && request.method === "POST";
	const profile =
		url.origin === "https://lizheng.blog" &&
		url.pathname === "/api/authors/profile" &&
		/^\?hash=[a-f0-9]{64}$/.test(url.search) &&
		request.method === "GET";
	const zheto = url.href === ZHETO_WEBHOOK_URL && request.method === "POST";
	const dns =
		url.origin === "https://cloudflare-dns.com" &&
		url.pathname === "/dns-query" &&
		DNS_HOSTS.has(url.searchParams.get("name") ?? "") &&
		["A", "AAAA"].includes(url.searchParams.get("type") ?? "") &&
		[...url.searchParams.keys()].length === 2 &&
		request.method === "GET";
	const media = Object.values(MEDIA_URLS).some((known) => known === url.href);
	const document = PREVIEW_DOCUMENTS[url.href];
	const missing =
		url.origin === "https://example.com" &&
		!url.search &&
		/^\/xray-demo-(preview-unavailable-v1|missing-\d+-\d+)$/.test(url.pathname);
	if (
		!ai &&
		!profile &&
		!zheto &&
		!dns &&
		!(media && ["GET", "HEAD"].includes(request.method)) &&
		!((document || missing) && request.method === "GET")
	) {
		return Response.json({ error: "Fixture egress denied" }, { status: 502 });
	}
	if (scenario === "upstream-error") {
		return Response.json({ error: "Fixture upstream unavailable" }, { status: 503 });
	}
	if (scenario === "rate-limit") {
		return Response.json(
			{ error: "Fixture rate limit" },
			{ status: 429, headers: { "Retry-After": "1" } },
		);
	}
	if (scenario === "malformed") {
		return new Response("{malformed fixture", { headers: { "Content-Type": "application/json" } });
	}
	if (ai || zheto) {
		let body: Record<string, unknown>;
		try {
			const raw: unknown = await request.json();
			if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid body");
			body = raw as Record<string, unknown>;
		} catch {
			return Response.json({ error: "Invalid provider JSON" }, { status: 400 });
		}
		if (zheto) {
			if (typeof body.url !== "string" || !URL.canParse(body.url)) {
				return Response.json({ error: "URL required" }, { status: 400 });
			}
			return Response.json(
				{ data: { shortUrl: "https://zhe.to/fixture", slug: "fixture", originalUrl: body.url } },
				{ status: scenario === "existing" ? 200 : 201 },
			);
		}
		if (
			!request.headers.get("authorization")?.startsWith("Bearer ") ||
			typeof body.model !== "string" ||
			!Array.isArray(body.messages) ||
			!body.messages.length ||
			!body.messages.every(
				(message) =>
					message &&
					typeof message === "object" &&
					["system", "user", "assistant"].includes(message.role) &&
					typeof message.content === "string",
			)
		) {
			return Response.json({ error: "Invalid completion request" }, { status: 400 });
		}
		const system = body.messages
			.filter((message) => message.role === "system")
			.map((message) => message.content)
			.join("\n");
		const content =
			scenario === "oversized"
				? "x".repeat(40_000)
				: system === "Reply with the single word: ok"
					? "ok"
					: /summari[sz]e|summary|摘要/i.test(system)
						? "先保留原始资料，再验证观察结果。"
						: system.includes("[引用翻译]")
							? "[翻译]\n将来源保留在观察记录旁，围绕一个明确问题展开实验。\n[引用翻译]\n复核结果时，始终保留最初的问题。"
							: "将来源保留在观察记录旁，围绕一个明确问题展开实验。";
		return Response.json({
			id: "fixture-completion",
			object: "chat.completion",
			created: FIXTURE_ANCHOR_MS / 1000,
			model: body.model,
			choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
			usage: { prompt_tokens: 24, completion_tokens: 16, total_tokens: 40 },
		});
	}
	if (profile) return Response.json({ name: "Demo Owner", avatar: MEDIA_URLS.avatar });
	if (dns) {
		const ipv6 = url.searchParams.get("type") === "AAAA";
		return Response.json({
			Status: 0,
			Answer: [
				{
					name: url.searchParams.get("name"),
					type: ipv6 ? 28 : 1,
					TTL: 60,
					data:
						scenario === "private-dns"
							? ipv6
								? "::1"
								: "127.0.0.1"
							: ipv6
								? "2606:4700:4700::1111"
								: "1.1.1.1",
				},
			],
		});
	}
	if (media) return mediaResponse(request, url.href);
	if (scenario === "redirect-private") {
		return new Response(null, { status: 302, headers: { Location: "https://127.0.0.1/private" } });
	}
	if (missing) return new Response("Fixture page missing", { status: 404 });
	if (!document) return Response.json({ error: "Fixture egress denied" }, { status: 502 });
	const escapeHtml = (value: string) =>
		value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
	const html =
		scenario === "oversized"
			? "x".repeat(512 * 1024 + 1)
			: `<!doctype html><html><head><title>${escapeHtml(document.title)}</title><meta property="og:title" content="${escapeHtml(document.title)}"><meta property="og:description" content="${escapeHtml(document.description)}"><meta property="og:site_name" content="X-Ray fixture library"><meta property="og:image" content="${escapeHtml(MEDIA_URLS.desk)}"></head><body><p>Synthetic preview; public URL retained for link validation.</p></body></html>`;
	return new Response(html, {
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Content-Length": String(new TextEncoder().encode(html).byteLength),
		},
	});
}

export default { fetch: fixtureFetch } satisfies ExportedHandler<FixtureProviderEnv>;
