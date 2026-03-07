/* ──────────────────────────────────────────────────────────
   Brilliant Jobs — Theme Toggle (CS-P1-009: CSS-002)
   
   Modes: light | dark | auto (follows OS preference)
   Persists to localStorage. Applied before first paint via
   inline script in <head> to prevent flash of wrong theme.
   ────────────────────────────────────────────────────────── */

(function() {
  'use strict';

  var STORAGE_KEY = 'bj-theme';
  var VALID_THEMES = ['light', 'dark', 'auto'];
  var ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-toggle-icon"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  var ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-toggle-icon"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  var ICON_AUTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-toggle-icon"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20V2z"/></svg>';

  var LABELS = { light: 'Light', dark: 'Dark', auto: 'Auto' };
  var ICONS = { light: ICON_SUN, dark: ICON_MOON, auto: ICON_AUTO };

  function getStoredTheme() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      return VALID_THEMES.indexOf(stored) !== -1 ? stored : 'auto';
    } catch (e) {
      return 'auto';
    }
  }

  function setStoredTheme(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* storage blocked */ }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // Update toggle buttons if they exist
    var toggles = document.querySelectorAll('.theme-toggle');
    toggles.forEach(function(el) {
      el.innerHTML = ICONS[theme] + '<span class="theme-toggle-label">' + LABELS[theme] + '</span>';
      el.setAttribute('title', 'Theme: ' + LABELS[theme] + ' (click to cycle)');
    });
    // Track with PostHog if available
    if (window.posthog && typeof window.posthog.capture === 'function') {
      window.posthog.capture('theme_changed', { theme: theme });
    }
  }

  function cycleTheme() {
    var current = getStoredTheme();
    var order = ['light', 'dark', 'auto'];
    var next = order[(order.indexOf(current) + 1) % order.length];
    setStoredTheme(next);
    applyTheme(next);
  }

  // Apply on load
  var theme = getStoredTheme();
  applyTheme(theme);

  // Expose for nav toggle button
  window.BJ_Theme = {
    cycle: cycleTheme,
    get: getStoredTheme,
    set: function(t) { if (VALID_THEMES.indexOf(t) !== -1) { setStoredTheme(t); applyTheme(t); } }
  };

  // Listen for OS preference changes when in auto mode
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
      if (getStoredTheme() === 'auto') {
        applyTheme('auto');
      }
    });
  }
})();
