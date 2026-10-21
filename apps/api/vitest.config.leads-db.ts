import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    include: ['test/leads.db-test.ts'],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
