// Single source of truth: read version from package.json at build time.
// Bundlers (Next.js / Vite) will inline the string during compilation.
import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;
