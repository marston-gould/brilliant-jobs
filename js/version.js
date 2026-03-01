/**
 * Brilliant Jobs — Global Version & Site-Wide Utilities
 * =====================================================
 * SINGLE SOURCE OF TRUTH. Every page includes this file.
 * To bump the version, change ONLY the line below.
 *
 * DO NOT hardcode version strings anywhere else.
 * DO NOT add fallback version values in catch blocks.
 * If this file doesn't load, the version simply doesn't display.
 * That's a signal something is broken — not something to paper over.
 */
var BJ_VERSION = 'v6.01';

(function() {
  document.addEventListener('DOMContentLoaded', function() {
    // Universal version display: any element with class .bj-version
    document.querySelectorAll('.bj-version').forEach(function(el) {
      el.textContent = BJ_VERSION;
    });

    // Catch any id that ends with "-version" or is exactly "version"
    // This covers: #nav-version, #rm-version, #version, and any future additions
    document.querySelectorAll('[id$="-version"], [id="version"]').forEach(function(el) {
      el.textContent = BJ_VERSION;
    });

    // Copyright year: any .bj-year element or legacy #year
    var year = new Date().getFullYear();
    document.querySelectorAll('.bj-year').forEach(function(el) {
      el.textContent = year;
    });
    var legacyYear = document.getElementById('year');
    if (legacyYear) legacyYear.textContent = year;
  });

  // Console log for every page
  var page = document.title || location.pathname;
  console.log('[BJ] ' + page + ' ' + BJ_VERSION + ' loaded');
})();

