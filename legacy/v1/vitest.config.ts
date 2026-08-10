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
      // Match bun:test's behavior: only count files actually loaded by tests.
      // Vitest's `include` triggers a scan that pulls untested files (e.g. UI-only
      // API routes, agent CLI scripts) into the report at 0% — leaving it unset
      // keeps coverage scoped to what the test suite actually exercises.
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        '**/*.tsx',
        '**/__tests__/**',
        'src/components/**',
        'src/hooks/**',
        'src/auth.ts',
        'src/lib/auth-adapter.ts',
        // Declarative drizzle table schema — no runtime branches to cover.
        'src/db/schema.ts',
        // Driver bootstrap — Bun-vs-Node import branches and the legacy
        // single-watchlist data migration only exercise on real prod DBs.
        'src/db/index.ts',
        // ScopedDB — large repository wrapper whose error/empty branches are
        // exercised end-to-end via API tests rather than unit-tested directly.
        'src/db/scoped.ts',
        // Tweet normalizer — defensive branches for malformed payload shapes
        // we've never observed from the live API.
        'src/lib/twitter/normalizer.ts',
        // Watchlist [id] route handlers — auth/error branches are covered by
        // the playwright e2e suite, not the vitest unit tests.
        'src/app/api/watchlists/[id]/**',
        // CLI runner scripts (`bun run agent/...`) — main()/import.meta.main
        // entry points aren't reachable from the vitest suite.
        'agent/**',
        // SSE long-poll endpoint — streamed branches aren't unit-testable.
        'src/app/api/live/**',
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
