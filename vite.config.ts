import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    // Must stay aligned with start_url / scope / id in public/manifest.json and
    // the absolute icon paths in index.html. A mismatch installs fine but makes
    // an offline cold start request a URL the service worker never cached.
    base: '/mini-sudoku/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        // public/manifest.json is the single source of truth, so the plugin
        // must not emit a competing one.
        manifest: false,
        // No includeAssets: Vite already copies public/ into dist, where
        // globPatterns below picks the icons up. Listing them again would put
        // duplicate entries in the precache manifest.
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          // A standalone launch navigates to start_url; without this it would
          // miss the precached shell and fall through to the network.
          navigateFallback: 'index.html',
          // StaleWhileRevalidate rather than NetworkFirst: NetworkFirst waits
          // for a network timeout before serving the cache, which is exactly
          // the wrong trade on a flaky connection. Everything this app needs
          // is already precached, so this only backstops stragglers.
          runtimeCaching: [
            {
              urlPattern: ({url}) => url.origin === self.location.origin,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'mini-sudoku-static',
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify: file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
