import { defineConfig } from 'vitest/config';
import path from 'path';

process.env.DATABASE_URL = 'file:./data/test.db';

export default defineConfig({
  resolve: {
    alias: {
      '@src': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.ts'],
    env: {
      DATABASE_URL: 'file:./data/test.db',
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.config.ts',
        'src/utils/prisma.ts',
        'src/server.ts',
        'coverage/**',
        'src/types/**',
        'tests/helpers/**',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90,
      },
    },
  },
});
