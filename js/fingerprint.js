/**
 * Brilliant Jobs — Browser Fingerprint Module
 * Lightweight client-side fingerprint for referral fraud detection.
 * Generates a deterministic hash from browser properties.
 * v5.10: Phase 4 — Referral Program
 */

(function() {
  'use strict';

  // Simple hash (FNV-1a 32-bit)
  function fnv1a(str) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  function getComponents() {
    var c = [];
    var nav = window.navigator || {};
    var screen = window.screen || {};

    // User agent
    c.push(nav.userAgent || '');

    // Language
    c.push(nav.language || nav.userLanguage || '');
    c.push((nav.languages || []).join(','));

    // Screen
    c.push(screen.width + 'x' + screen.height);
    c.push(String(screen.colorDepth || ''));
    c.push(String(screen.pixelDepth || ''));

    // Timezone
    try { c.push(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch(e) { c.push(''); }
    c.push(String(new Date().getTimezoneOffset()));

    // Platform
    c.push(nav.platform || '');
    c.push(String(nav.hardwareConcurrency || ''));
    c.push(String(nav.maxTouchPoints || 0));
    c.push(String(nav.deviceMemory || ''));

    // WebGL renderer (good fingerprint signal)
    try {
      var canvas = document.createElement('canvas');
      var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        var ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          c.push(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '');
          c.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
        }
      }
    } catch(e) { c.push('no-webgl'); }

    // Canvas fingerprint
    try {
      var cv = document.createElement('canvas');
      cv.width = 200; cv.height = 50;
      var ctx = cv.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 100, 25);
      ctx.fillStyle = '#069';
      ctx.fillText('BJ-fp-2025', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('BJ-fp-2025', 4, 17);
      c.push(cv.toDataURL().substring(0, 100));
    } catch(e) { c.push('no-canvas'); }

    // Installed plugins count
    c.push(String((nav.plugins || []).length));

    // Do-not-track
    c.push(String(nav.doNotTrack || ''));

    // Cookie enabled
    c.push(String(nav.cookieEnabled));

    return c;
  }

  function generateFingerprint() {
    var components = getComponents();
    var raw = components.join('||');
    // Generate two hashes for more uniqueness
    var h1 = fnv1a(raw);
    var h2 = fnv1a(raw + '::salt::bj2025');
    return 'fp-' + h1 + h2;
  }

  // Expose globally
  window.bjFingerprint = {
    generate: generateFingerprint,
    components: getComponents
  };

  // Auto-store in sessionStorage for signup flow
  try {
    var fp = generateFingerprint();
    sessionStorage.setItem('bj_fingerprint', fp);
  } catch(e) { /* privacy mode */ }
})();
