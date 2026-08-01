import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Resolves the "@/*" alias from tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['app/api/**/*.ts', 'lib/**/*.ts', 'middleware.ts'],
      exclude: ['lib/dbcode.ts', 'lib/theme-provider.tsx'],
    },
  },
})
