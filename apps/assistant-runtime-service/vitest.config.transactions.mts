import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/transactions/**/*.e2e-spec.ts'],
    fileParallelism: false,
  },
});
