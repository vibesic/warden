import { defineConfig } from 'vitest/config';

process.env.DATABASE_URL = 'file:./data/test.db';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    env: {
      DATABASE_URL: 'file:./data/test.db',
      NODE_ENV: 'test'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.config.ts', // Exclude config files
        'src/utils/prisma.ts', // Exclude prisma client instantiation
        'src/server.ts', // Exclude entry point
        'coverage/**',
        'src/types/**'
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90
      }
    },
  },
});
