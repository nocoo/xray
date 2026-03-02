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
  // Key rules from typescript-eslint strict preset (no type-checking required)
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-dynamic-delete": "error",
      "@typescript-eslint/no-extraneous-class": "error",
      "@typescript-eslint/unified-signatures": "error",
      "@typescript-eslint/no-invalid-void-type": "error",
    },
  },
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
