import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

/**
 * Copies the pdf.js worker into the extension bundle so the options page can
 * parse resumes without reaching out to a CDN (extension CSP forbids that).
 */
function copyPdfWorker() {
  return {
    name: 'jobmager-copy-pdf-worker',
    closeBundle() {
      const candidates = [
        'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
        'node_modules/pdfjs-dist/build/pdf.worker.mjs',
      ];
      const src = candidates.find((p) => existsSync(resolve(__dirname, p)));
      if (!src) return;
      mkdirSync(resolve(__dirname, 'dist'), { recursive: true });
      copyFileSync(resolve(__dirname, src), resolve(__dirname, 'dist/pdf.worker.min.mjs'));
    },
  };
}

export default defineConfig({
  plugins: [react(), copyPdfWorker()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        options: resolve(__dirname, 'src/options/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
