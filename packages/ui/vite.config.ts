import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = import.meta.dirname;
const DEV_HOST = "xray.dev.hexly.ai";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": resolve(rootDir, "./src"),
		},
	},
	build: {
		outDir: "../worker/static",
		emptyOutDir: true,
	},
	server: {
		host: "0.0.0.0",
		port: 7007,
		strictPort: true,
		// Caddy terminates TLS for https://xray.dev.hexly.ai → :7007
		allowedHosts: [DEV_HOST, "localhost", "127.0.0.1"],
		// HMR through Caddy HTTPS (browser connects wss://xray.dev.hexly.ai)
		hmr: {
			protocol: "wss",
			host: DEV_HOST,
			clientPort: 443,
		},
		proxy: {
			"/api": {
				target: "http://127.0.0.1:8787",
				// Keep browser Host (xray.dev.hexly.ai) so worker host/origin checks match Caddy.
				changeOrigin: false,
			},
		},
	},
});
