import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

/**
 * Live mode talks to the SmartThings REST API through a same-origin proxy so the
 * browser never needs CORS access to api.smartthings.com. The same path is
 * proxied by nginx in the production Docker image (see nginx.conf).
 */
const smartThingsProxy = {
  '/st-api': {
    target: 'https://api.smartthings.com',
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/st-api/, '/v1'),
  },
};

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Allow Bonjour names like my-mac.local when the dev server is shared on the LAN (IPs are always allowed).
    allowedHosts: ['.local'],
    proxy: smartThingsProxy,
    watch: process.env.VITE_USE_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
  },
  preview: {
    port: 4173,
    proxy: smartThingsProxy,
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'charts';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
    },
  },
});
