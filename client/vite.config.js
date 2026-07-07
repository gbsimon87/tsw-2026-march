import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envDir: '../env/client',
  build: {
    rollupOptions: {
      output: {
        // Split heavy, independently-cacheable libraries into their own chunks
        // so they are not bundled into the entry or per-route chunks (OPT-001).
        // recharts only loads on the (lazy) game detail route; posthog and
        // stripe-js only where analytics/checkout run.
        manualChunks: {
          recharts: ['recharts'],
          posthog: ['posthog-js'],
          stripe: ['@stripe/stripe-js'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/utils/testSetup.js',
  },
});
