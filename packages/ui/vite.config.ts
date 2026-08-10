import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = import.meta.dirname;

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
		allowedHosts: ["xray.dev.hexly.ai", "localhost"],
		proxy: {
			"/api": {
				target: "http://127.0.0.1:8787",
				changeOrigin: true,
			},
		},
	},
});
