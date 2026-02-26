/**
 * Brilliant Jobs — Global Version & Site-Wide Utilities
 * SINGLE SOURCE OF TRUTH. Every page includes this file.
 * To bump the version, change ONLY this line.
 */
var BJ_VERSION = 'v4.99';

(function() {
  document.addEventListener('DOMContentLoaded', function() {
    // Version display: any .bj-version or #nav-version
    document.querySelectorAll('.bj-version').forEach(function(el) {
      el.textContent = BJ_VERSION;
    });
    var nav = document.getElementById('nav-version');
    if (nav) nav.textContent = BJ_VERSION;

    // Copyright year: any .bj-year element
    var year = new Date().getFullYear();
    document.querySelectorAll('.bj-year').forEach(function(el) {
      el.textContent = year;
    });
    // Also handle legacy id="year" elements
    var legacyYear = document.getElementById('year');
    if (legacyYear) legacyYear.textContent = year;
  });

  // Console log for every page
  var page = document.title || location.pathname;
  console.log('[BJ] ' + page + ' ' + BJ_VERSION + ' loaded');
})();
