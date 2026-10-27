import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Desk UI migration shell (Refs #291, ADR-0003, LLD section 11).
// CSR-only static build served by Nginx under `location /app/`:
// `base: '/app/'` keeps every asset URL inside the /app/ namespace.
export default defineConfig({
  plugins: [vue()],
  base: '/app/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
