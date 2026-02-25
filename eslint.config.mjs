import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...tseslint.configs.recommended,
  globalIgnores([
    ".next/**",
    ".next-e2e/**",
    ".next-e2e-ui/**",
    "out/**",
    "build/**",
    "dist/**",
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
