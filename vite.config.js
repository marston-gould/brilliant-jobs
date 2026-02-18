import { defineConfig } from 'vite';

export default defineConfig({
  // Dev server serves files as-is (no bundling needed for dev)
  server: {
    port: 3000,
    open: '/dashboard.html',
  },
  // We don't use `vite build` — see `npm run build` in package.json
});
