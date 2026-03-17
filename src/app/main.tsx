// ============================================================
// Brilliant Jobs SPA — Entry Point (SA-013)
// ============================================================
// Mounts the React SPA with:
//   - React Router (client-side routing)
//   - DataProvider (Supabase-backed data access)
//   - AppShell (unified nav + content layout)
//
// During dual-mode: The legacy scripts (globals.ts, app.js,
// tab-guard.js, etc.) are loaded in the HTML BEFORE this
// script runs. window.BJ is available for provider access.
// ============================================================

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { DataProvider } from '@providers';
import { createAppRouter } from './routes';

const router = createAppRouter();

// SPA-CUT-REMEDIATION: Handle legacy hash fragments from extension + bookmarks
// /dashboard#settings → /app/settings, /dashboard#billing → /app/billing, etc.
(function redirectLegacyHash() {
  const hash = window.location.hash?.replace('#', '');
  const path = window.location.pathname;
  if (hash && (path === '/dashboard' || path === '/dashboard.html' || path === '/admin' || path === '/admin.html')) {
    const validRoutes = ['feed', 'pipeline', 'keywords', 'resumes', 'applications', 'stats', 'billing', 'settings', 'tuning', 'integrations', 'chat', 'referrals'];
    if (validRoutes.includes(hash)) {
      window.history.replaceState(null, '', `/app/${hash}`);
    }
  }
  // Also redirect bare /dashboard → /app/feed (default page)
  if ((path === '/dashboard' || path === '/dashboard.html') && !hash) {
    window.history.replaceState(null, '', '/app/feed');
  }
  if ((path === '/admin' || path === '/admin.html') && !hash) {
    window.history.replaceState(null, '', '/app/admin/overview');
  }
})();

function App() {
  return (
    <StrictMode>
      <DataProvider>
        <RouterProvider router={router} />
      </DataProvider>
    </StrictMode>
  );
}

// Mount when DOM is ready
const root = document.getElementById('spa-root');
if (root) {
  createRoot(root).render(<App />);
} else {
  console.error('[SPA] #spa-root not found — React app cannot mount.');
}
