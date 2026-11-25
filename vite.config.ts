import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  build: {
    target: 'es2022',
    sourcemap: true,
    // Keep all font subsets as same-origin files rather than data: URIs so the
    // strict `font-src 'self'` Content-Security-Policy never blocks them.
    assetsInlineLimit: 0,
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
