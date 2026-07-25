import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/resources',
    emptyOutDir: true,
    lib: {
      entry: 'src/main/resources/panel-bootstrap.ts',
      formats: ['es'],
      fileName: () => 'panel-bootstrap.js'
    }
  }
});
