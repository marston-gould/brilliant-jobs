import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'dashboard.html',
    },
  },
  server: {
    port: 3000,
  },
});
