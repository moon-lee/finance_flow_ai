import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/main',
    emptyOutDir: true,
    lib: {
      entry: 'src/main/main.ts',
      formats: ['es'],
      fileName: () => 'main.js'
    },
    rollupOptions: {
      external: ['electron', 'better-sqlite3', 'extract-zip', 'yauzl', 'fd-slicer', 'get-stream', /^node:.*/, 'fs', 'path', 'os', 'util', 'stream', 'events', 'zlib', 'buffer', 'url', 'child_process']
    }
  }
});
