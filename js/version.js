/**
 * Brilliant Jobs — Global Version
 * SINGLE SOURCE OF TRUTH. Every page includes this file.
 * To bump the version, change ONLY this line.
 */
var BJ_VERSION = 'v4.84';

// Auto-populate any element with class "bj-version" or id "nav-version"
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    // Version display elements
    document.querySelectorAll('.bj-version').forEach(function(el) {
      el.textContent = BJ_VERSION;
    });
    var nav = document.getElementById('nav-version');
    if (nav) nav.textContent = BJ_VERSION;
  });
  // Console log for every page
  var page = document.title || location.pathname;
  console.log('[BJ] ' + page + ' ' + BJ_VERSION + ' loaded');
})();
