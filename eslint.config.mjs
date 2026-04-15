import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...tseslint.configs.strict,
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
  ]),
  // Relax non-null-assertion in test files (common pattern: result!.field)
  {
    files: ["src/__tests__/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-dynamic-delete": "off",
    },
  },
]);

export default eslintConfig;
