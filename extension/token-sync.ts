// token-sync.ts — ES1-4: Token Divergence Sync
// Content script injected on brilliantjobs.app pages.
// Observes dashboard auth token changes and syncs to extension storage.
// Also receives extension token updates and pushes them to the dashboard.

(function() {
  'use strict';

  const SUPABASE_AUTH_KEY = 'sb-qojhagupdnbtomfoxnsf-auth-token';

  // ── Dashboard → Extension sync ──────────────────────────────
  // When dashboard refreshes its Supabase token, push to extension
  function syncDashboardTokenToExtension() {
    try {
      const raw = localStorage.getItem(SUPABASE_AUTH_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!parsed?.access_token || !parsed?.refresh_token) return;

      chrome.runtime.sendMessage({
        type: 'dashboardTokenSync',
        payload: {
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
          expires_at: parsed.expires_at ? new Date(parsed.expires_at * 1000).getTime() : (Date.now() + 3600000),
          user_id: parsed.user?.id || null,
          email: parsed.user?.email || null
        }
      }).catch(e => {
        // REM-002: Report token sync failures to PostHog
        try { chrome.runtime.sendMessage({ type: 'reportError', payload: { context: 'dashboard_token_sync', error: e?.message || String(e) } }).catch(() => {}); } catch {}
      });
    } catch (e) {
      try { chrome.runtime.sendMessage({ type: 'reportError', payload: { context: 'dashboard_token_parse', error: e?.message || String(e) } }).catch(() => {}); } catch {}
    }
  }

  // Listen for localStorage changes (e.g. when dashboard refreshes token)
  window.addEventListener('storage', (e) => {
    if (e.key === SUPABASE_AUTH_KEY && e.newValue) {
      syncDashboardTokenToExtension();
    }
  });

  // Also sync on page load (in case dashboard logged in before extension was opened)
  syncDashboardTokenToExtension();

  // ── Extension → Dashboard sync ──────────────────────────────
  // Listen for messages from the extension background script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'extensionTokenSync' && msg.payload) {
      try {
        const existing = localStorage.getItem(SUPABASE_AUTH_KEY);
        const parsed = existing ? JSON.parse(existing) : {};

        // Only update if extension token is newer
        const extExpiry = msg.payload.expires_at || 0;
        const dashExpiry = parsed.expires_at ? new Date(parsed.expires_at * 1000).getTime() : 0;

        if (extExpiry > dashExpiry) {
          const updated = {
            ...parsed,
            access_token: msg.payload.access_token,
            refresh_token: msg.payload.refresh_token,
            expires_at: Math.floor(msg.payload.expires_at / 1000),
            user: {
              ...(parsed.user || {}),
              id: msg.payload.user_id || parsed.user?.id,
              email: msg.payload.email || parsed.user?.email
            }
          };
          localStorage.setItem(SUPABASE_AUTH_KEY, JSON.stringify(updated));
        }
      } catch (e) {
        try { chrome.runtime.sendMessage({ type: 'reportError', payload: { context: 'extension_token_sync_write', error: e?.message || String(e) } }).catch(() => {}); } catch {}
      }
    }
  });
})();
