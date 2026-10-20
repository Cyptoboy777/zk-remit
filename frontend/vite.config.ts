import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';

// Adapted from midnightntwrk/example-bboard (Apache-2.0): Midnight's runtime ships WASM
// modules with top-level await; Vite 8 + esnext target handles TLA natively.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  cacheDir: './.vite',
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 8000,
    commonjsOptions: { transformMixedEsModules: true, extensions: ['.js', '.cjs'], ignoreDynamicRequires: true },
  },
  plugins: [
    react(),
    wasm(),
  ],
  optimizeDeps: {
    include: ['@midnight-ntwrk/compact-runtime'],
    exclude: ['@midnight-ntwrk/onchain-runtime-v3'],
  },
  resolve: {
    alias: { 'isomorphic-ws': new URL('./src/shims/isomorphic-ws.ts', import.meta.url).pathname },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.wasm'],
    mainFields: ['browser', 'module', 'main'],
  },
});
