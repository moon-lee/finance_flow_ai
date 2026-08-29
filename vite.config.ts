import { defineConfig } from 'vite';

export default defineConfig({
  base: '',
  root: 'src/renderer',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: './index.html',
      external: ['node:os', 'node:fs', 'node:path', 'node:util', 'node:stream', 'node:events', 'node:zlib', 'extract-zip', 'yauzl', 'fd-slicer', 'get-stream'],
      onwarn(warning, warn) {
        if (String(warning.message).includes('externalized for browser compatibility')) return;
        warn(warning);
      }
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  }
});
