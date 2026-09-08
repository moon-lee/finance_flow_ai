import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Mirror the build-time alias in vite.extensions.config.ts so
    // extension unit tests resolve `finance-logger` the same way.
    alias: {
      'finance-logger': fileURLToPath(new URL('./src/extension-host/api/logger.ts', import.meta.url))
    }
  },
  test: {
    include: ['tests/unit/**/*.test.ts']
  }
});
