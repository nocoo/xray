import { defineConfig } from 'vitest/config';

export default defineConfig({
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
