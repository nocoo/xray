import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vinext()],
  server: {
    allowedHosts: true,
  },
  ssr: {
    external: ["bun:sqlite", "better-sqlite3"],
  },
});
