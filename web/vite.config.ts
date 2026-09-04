import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 2048,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/r': 'http://localhost:8787',
    },
  },
});
