import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
      '@hermes/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5273,
    proxy: {
      '/api': { target: 'http://localhost:8090', changeOrigin: true },
      '/health': { target: 'http://localhost:8090', changeOrigin: true },
    },
  },
});
