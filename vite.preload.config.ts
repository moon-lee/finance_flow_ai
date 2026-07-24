import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/preload',
    emptyOutDir: true,
    lib: {
      entry: {
        preload: 'src/preload/preload.ts',
        'panel-preload': 'src/preload/panel-preload.ts'
      },
      formats: ['cjs'],
      fileName: '[name]'
    },
    rollupOptions: {
      external: ['electron']
    }
  }
});
