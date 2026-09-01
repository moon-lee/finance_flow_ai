import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '',
  root: 'src/renderer',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true
  },
  test: {
    include: ['../../tests/unit/**/*.test.ts']
  }
});
