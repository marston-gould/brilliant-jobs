// vitest.config.js — CS-010: Dashboard smoke test configuration
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{js,ts}'],
    globals: true,
    setupFiles: ['tests/setup.js'],
    testTimeout: 10000,
  },
});
