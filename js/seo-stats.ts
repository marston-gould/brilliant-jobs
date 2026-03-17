// @ts-nocheck
/**
 * Brilliant Jobs — SEO Stats Hydrator
 * ====================================
 * Replaces hardcoded counts on SEO/data pages with live data from Supabase.
 * Include this script on any page that displays job/company counts.
 *
 * Usage: Add class="seo-jobs" / "seo-companies" / "seo-salary-count" /
 *        "seo-salary-pct" / "seo-boards" to any element.
 *        On load, this script calls get_seo_stats() and populates them.
 *
 * Fallback: If the RPC fails, elements keep their existing static text.
 *
 * Cache: Results cached in sessionStorage for 30 minutes to avoid
 *        re-querying on page navigation within a session.
 */
(function() {
  var CACHE_KEY = 'bj_seo_stats';
  var CACHE_TTL = 30 * 60 * 1000; // 30 min
  var RPC_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co/rest/v1/rpc/get_seo_stats';
  var AK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';

  function fmt(n) {
    return Number(n).toLocaleString('en-US');
  }

  function fmtK(n) {
    // 317834 → "315K+"  (rounds DOWN to nearest 5K)
    var k = Math.floor(n / 5000) * 5;
    return k + 'K+';
  }

  function fmtKComma(n) {
    // 317834 → "315,000+"  (rounds DOWN to nearest 5K)
    var k = Math.floor(n / 5000) * 5000;
    return fmt(k) + '+';
  }

  function hydrate(stats) {
    // .seo-jobs-k → "315K+"
    document.querySelectorAll('.seo-jobs-k').forEach(function(el) {
      el.textContent = fmtK(stats.open_jobs);
    });
    // .seo-jobs-full → "315,000+"
    document.querySelectorAll('.seo-jobs-full').forEach(function(el) {
      el.textContent = fmtKComma(stats.open_jobs);
    });
    // .seo-jobs-exact → "317,834"
    document.querySelectorAll('.seo-jobs-exact').forEach(function(el) {
      el.textContent = fmt(stats.open_jobs);
    });
    // .seo-companies-k → "39,000+"
    document.querySelectorAll('.seo-companies-k').forEach(function(el) {
      el.textContent = fmt(Math.floor(stats.companies / 1000) * 1000) + '+';
    });
    // .seo-companies-exact → "39,123"
    document.querySelectorAll('.seo-companies-exact').forEach(function(el) {
      el.textContent = fmt(stats.companies);
    });
    // .seo-salary-count → "49,000+"
    document.querySelectorAll('.seo-salary-count').forEach(function(el) {
      el.textContent = fmt(Math.floor(stats.with_salary / 1000) * 1000) + '+';
    });
    // .seo-salary-pct → "16%"
    document.querySelectorAll('.seo-salary-pct').forEach(function(el) {
      el.textContent = stats.salary_pct + '%';
    });
    // .seo-boards → "38,071"
    document.querySelectorAll('.seo-boards').forEach(function(el) {
      el.textContent = fmt(stats.active_boards);
    });
  }

  function load() {
    // Try cache
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE_KEY));
      if (c && Date.now() - c.ts < CACHE_TTL) { hydrate(c.data); return; }
    } catch(e) { reportError('seo-stats:seo-stats', e); }

    // Fetch live
    fetch(RPC_URL, {
      method: 'POST',
      headers: { 'apikey': AK, 'Authorization': 'Bearer ' + AK, 'Content-Type': 'application/json' },
      body: '{}'
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.open_jobs) {
        hydrate(data);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data })); } catch(e) { reportError('seo-stats:seo-stats', e); }
      }
    })
    .catch(function() { /* keep static fallback */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
