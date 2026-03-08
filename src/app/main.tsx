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
