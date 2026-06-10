import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Expose the app version (from package.json) to the renderer as a compile-time constant
// so the About dialog can show it without bundling the whole manifest.
const { version: APP_VERSION } = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string };

// Node-only libs are pulled in at runtime via the `src/lib/node.ts` bridge
// (a dynamic `require(...)` that Vite's static analysis can't see), so they are
// never bundled into the renderer — they load from node_modules under NW.js.
// `optimizeDeps.exclude` is a dev-server guard in case one is ever statically
// imported, so esbuild doesn't try to pre-bundle a node-only module for the browser.
const NODE_ONLY = ['simple-git', 'gray-matter', 'papaparse'];

// `base: './'` emits relative asset paths so NW.js can load the built dist/index.html
// directly from the filesystem (file://) in production.
export default defineConfig({
  plugins: [tailwindcss(), react()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: NODE_ONLY,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
