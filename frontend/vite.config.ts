import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';

/** Inlines the extracted CSS into index.html and drops the crossorigin attr on the
 *  stylesheet link. GitHub Pages serves the CSS correctly, but some browsers /
 *  extensions fail to *apply* a CORS-mode stylesheet while still running the
 *  module script — the page then renders as unstyled HTML. Inlining makes the
 *  design travel with the document. */
function inlineCss(): Plugin {
  return {
    name: 'inline-css',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        let next = html;
        for (const output of Object.values(ctx.bundle)) {
          if (output.type !== 'asset' || typeof output.fileName !== 'string') continue;
          if (!output.fileName.endsWith('.css')) continue;
          const source = typeof output.source === 'string'
            ? output.source
            : new TextDecoder().decode(output.source);
          const safe = source.replace(/<\/style/gi, '<\\/style');
          next = next.replace(
            /<link[^>]*rel="stylesheet"[^>]*>/,
            `<style>${safe}</style>`,
          );
        }
        return next;
      },
    },
  };
}


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
    inlineCss(),
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
