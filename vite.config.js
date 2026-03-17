import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// ============================================================
// SA-013: Vite + React Router SPA scaffold
// ============================================================
// Two modes:
//   1. Legacy dev: `npx vite` serves dashboard.html + admin.html as-is
//   2. SPA dev: React app at /app/ (dual-mode shell)
//
// The legacy esbuild pipeline (build.js / build-admin.js) is preserved
// for production builds of non-migrated pages. Vite handles the React
// SPA bundle separately.
// ============================================================

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@app': resolve(__dirname, 'src/app'),
      '@components': resolve(__dirname, 'src/app/components'),
      '@providers': resolve(__dirname, 'src/app/providers'),
      '@shell': resolve(__dirname, 'src/app/shell'),
      '@lib': resolve(__dirname, 'src/app/lib'),
    },
  },

  server: {
    port: 3000,
    open: '/dashboard.html',
  },

  build: {
    outDir: 'dist/spa',
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'src/app/index.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-router')) return 'router';
          if (id.includes('node_modules/react-dom')) return 'react-dom';
          if (id.includes('node_modules/react')) return 'react-vendor';
          if (id.includes('src/app/pages/admin')) return 'admin-pages';
          if (id.includes('src/app/providers')) return 'providers';
          if (id.includes('src/app/components')) return 'design-system';
        },
      },
    },
    sourcemap: true,
    target: 'es2020',
  },
});
