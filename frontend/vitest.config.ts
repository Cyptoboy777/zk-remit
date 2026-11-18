import { defineConfig } from 'vitest/config';

// Plain-logic tests only (no wasm/react plugins needed): deployment loading, backend selection, errors.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
