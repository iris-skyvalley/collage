import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// The clipper is injected into other people's pages by the bookmarklet, so it
// ships as one classic script: no module CORS, no chunk to fetch, one request.
// Built into the same static output as the studio.
export default defineConfig({
  build: {
    outDir: 'dist-vercel',
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./web/clip/main.ts', import.meta.url)),
      name: 'OffcutClipper',
      formats: ['iife'],
      fileName: () => 'clip.js',
    },
    minify: true,
  },
});
