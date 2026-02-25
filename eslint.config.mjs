import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".next-e2e/**",
    ".next-e2e-ui/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Legacy directories
    "server/**",
    "tests/**",
    // Playwright E2E tests (not React code)
    "e2e/**",
    // Python file mis-named as .ts
    "scripts/fix-translations.ts",
  ]),
]);

export default eslintConfig;
