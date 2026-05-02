import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    pool: 'threads',
    globals: true,
    include: [
      'src/__tests__/**/*.test.ts',
      'tests/**/*.test.ts',
      'scripts/tests/**/*.test.ts',
    ],
    exclude: ['node_modules', 'dist', '.next', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      experimentalAstAwareRemapping: true,
      include: [
        'src/app/api/**/*.ts',
        'src/lib/**/*.ts',
        'src/db/**/*.ts',
        'src/services/**/*.ts',
        'agent/**/*.ts',
        'scripts/lib/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        '**/*.tsx',
        '**/__tests__/**',
        'src/components/**',
        'src/hooks/**',
        'src/auth.ts',
        'src/lib/auth-adapter.ts',
        '**/e2e/**',
        'tests/setup.ts',
      ],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
});
