import { defineConfig } from 'vite';
import { HOST_BUNDLE_DIR } from './src/shared/extension-constants';

export default defineConfig({
  build: {
    outDir: HOST_BUNDLE_DIR,
    emptyOutDir: true,
    lib: {
      entry: 'src/extension-host/host.ts',
      formats: ['es'],
      fileName: () => 'host.js'
    },
    rollupOptions: {
      external: [
        'electron',
        'node:path',
        'node:url',
        'node:fs',
        'node:module',
        'better-sqlite3'
      ]
    }
  }
});
