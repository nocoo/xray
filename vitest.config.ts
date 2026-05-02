import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Match bun:test's default timezone (UTC) so date-formatting tests are deterministic.
process.env.TZ ??= 'UTC';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // next has no `exports` map, so ESM resolution of bare "next/server"
      // (used by next-auth) fails under vitest. Map it to the .js file.
      'next/server': path.resolve(__dirname, './node_modules/next/server.js'),
    },
  },
  test: {
    pool: 'forks',
    // Tests under tests/ share an on-disk SQLite file (data/test-x-ray.db)
    // via scripts/lib/db.ts, so files cannot run in parallel.
    fileParallelism: false,
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    server: {
      deps: {
        // next-auth imports bare "next/server" which lacks an exports map;
        // inlining lets our alias rewrite it to next/server.js.
        inline: ['next-auth', '@auth/core'],
      },
    },
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
