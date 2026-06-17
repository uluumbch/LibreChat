import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In Docker the client proxies to the `server` service; locally it defaults to localhost.
const proxyTarget = process.env.BFF_PROXY_TARGET ?? 'http://localhost:8090';
// File-watch polling is needed for reliable HMR on bind-mounted volumes (Docker on macOS/Windows).
const usePolling = process.env.VITE_USE_POLLING === 'true';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
      '@hermes/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5273,
    watch: usePolling ? { usePolling: true, interval: 200 } : undefined,
    proxy: {
      '/api': { target: proxyTarget, changeOrigin: true },
      '/health': { target: proxyTarget, changeOrigin: true },
    },
  },
});
