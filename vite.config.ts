import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

/**
 * The browser only ever talks to /api on its own origin. The ThingsDeck server
 * (server/) handles accounts and forwards /api/st/* to SmartThings with the
 * user's stored token. nginx does the same forwarding in production.
 */
const apiProxy = {
  '/api': { target: process.env.VITE_API_TARGET ?? 'http://localhost:3000', changeOrigin: false },
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
    proxy: apiProxy,
    watch: process.env.VITE_USE_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
  },
  preview: {
    port: 4173,
    proxy: apiProxy,
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
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
    },
  },
});
