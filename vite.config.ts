import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vinext()],
  // Allow per-process cacheDir so concurrent `vinext dev` instances (E2E
  // runner spawns auth-bypass + no-auth in parallel) don't race on the same
  // node_modules/.vite/deps_ssr rename. Set VITE_CACHE_DIR per spawn.
  cacheDir: process.env.VITE_CACHE_DIR,
  server: {
    allowedHosts: true,
  },
  ssr: {
    external: ["bun:sqlite", "better-sqlite3", "@vercel/oidc", "@ai-sdk/gateway"],
  },
});
