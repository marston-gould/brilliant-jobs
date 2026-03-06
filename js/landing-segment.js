/**
 * Brilliant Jobs — Landing Page Segment Detection
 * CS-018: Extracted from inline <script> in index.html
 * MUST run synchronously (no defer/async) — sets data-segment before CSS renders
 */
(function() {
  'use strict';
  var visits = parseInt(localStorage.getItem('bj_visits') || '0', 10);
  localStorage.setItem('bj_visits', String(visits + 1));
  var hasAccount = localStorage.getItem('bj_has_account') === 'true';
  var sbKey = Object.keys(localStorage).find(function(k) {
    return k.startsWith('sb-') && k.endsWith('-auth-token');
  });
  var hasSession = sbKey && localStorage.getItem(sbKey);
  var segment = 'new';
  if (hasSession) {
    segment = 'active';
  } else if (hasAccount) {
    segment = 'lapsed';
  } else if (visits >= 1) {
    segment = 'returning';
  }
  document.documentElement.setAttribute('data-segment', segment);
  if (segment === 'returning' && visits >= 3) {
    document.documentElement.setAttribute('data-visit-depth', 'deep');
  }
  // CS-007: CX-04 — Conditionally render hero sections (remove non-active from DOM)
  var segmentClasses = ['segment-new', 'segment-returning', 'segment-lapsed', 'segment-active'];
  segmentClasses.forEach(function(cls) {
    if (cls !== 'segment-' + segment) {
      var els = document.querySelectorAll('section.' + cls);
      els.forEach(function(el) { el.remove(); });
    }
  });
  if (segment === 'active') {
    window.location.replace('/dashboard');
  }
})();
