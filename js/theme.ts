// @ts-nocheck
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
  var ICON_SUN = '<i data-lucide="sun" class="theme-toggle-icon icon-stroke"></i>';
  var ICON_MOON = '<i data-lucide="moon" class="theme-toggle-icon icon-stroke"></i>';
  var ICON_AUTO = '<i data-lucide="sun-moon" class="theme-toggle-icon icon-stroke"></i>';

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
    if (typeof window.refreshIcons === 'function') window.refreshIcons();
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
