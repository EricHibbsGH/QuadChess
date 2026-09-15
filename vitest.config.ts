import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // UI tests opt into jsdom with a `@vitest-environment jsdom` docblock.
    include: ['tests/unit/**/*.test.ts', 'tests/property/**/*.test.ts'],
    environment: 'node',
    globals: false,
    reporters: ['default'],
    testTimeout: 20_000,
  },
});
