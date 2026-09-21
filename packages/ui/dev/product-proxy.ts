import { execFileSync } from "node:child_process";
import type { Plugin, ProxyOptions } from "vite";

export const PRODUCT_ORIGIN = "https://xray.hexly.ai";
export const PRODUCT_PREFIX = "/__product/api/";
const LOCAL_HOSTS = new Set(["xray.dev.hexly.ai", "localhost:7007", "127.0.0.1:7007"]);

export const productProxy: ProxyOptions = {
	target: PRODUCT_ORIGIN,
	changeOrigin: true,
	secure: true,
	rewrite: (path) => path.replace(/^\/__product/, ""),
	configure(proxy) {
		proxy.on("proxyRes", (response) => {
			delete response.headers["set-cookie"];
			response.headers["cache-control"] = "no-store";
			if (response.headers.location || response.headers["content-type"]?.includes("text/html")) {
				response.statusCode = 401;
				response.statusMessage = "Product sign-in required. Run bun run login:product, then retry.";
				delete response.headers.location;
			}
		});
	},
};

export function productAccess(): Plugin {
	let token = "";
	let expiresAt = 0;
	return {
		name: "xray-product-access",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				if (!req.url?.startsWith(PRODUCT_PREFIX)) return next();
				res.setHeader("Cache-Control", "no-store");
				res.setHeader("Content-Type", "application/json");
				const host = req.headers.host ?? "";
				const origin = req.headers.origin;
				if (
					!LOCAL_HOSTS.has(host) ||
					(origin && origin !== `http://${host}` && origin !== `https://${host}`) ||
					req.headers["sec-fetch-site"] === "cross-site"
				) {
					res.statusCode = 403;
					res.end(JSON.stringify({ error: "Product access requires the local Xray origin." }));
					return;
				}
				try {
					if (Date.now() >= expiresAt) {
						token = execFileSync("cloudflared", ["access", "token", "--app", PRODUCT_ORIGIN], {
							encoding: "utf8",
							timeout: 5_000,
							stdio: ["ignore", "pipe", "pipe"],
						}).trim();
						if (!token) throw new Error("Missing Access token");
						expiresAt = Date.now() + 60_000;
					}
				} catch {
					res.statusCode = 401;
					res.end(
						JSON.stringify({
							error: "Product sign-in required. Run bun run login:product, then retry.",
						}),
					);
					return;
				}
				for (const name of Object.keys(req.headers)) {
					if (name.startsWith("cf-") || name === "authorization" || name === "x-test-actor") {
						delete req.headers[name];
					}
				}
				req.headers.cookie = `CF_Authorization=${token}`;
				req.headers.origin = PRODUCT_ORIGIN;
				req.headers["sec-fetch-site"] = "same-origin";
				res.once("finish", () => {
					if (res.statusCode === 401 || res.statusCode === 403) expiresAt = 0;
				});
				next();
			});
		},
	};
}
