import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * The content script must be a single self-contained IIFE: MV3 injects it as a
 * classic script, so no ESM imports or shared chunks are allowed.
 */
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'JobmagerContent',
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: { extend: true, inlineDynamicImports: true },
    },
  },
});
