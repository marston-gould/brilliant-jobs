/**
 * Brilliant Jobs — Merchandising Client v4.51
 * Fetches and injects rotating content from Supabase.
 * Runs after segment detection (data-segment attribute must be set).
 * Uses fetch() directly — no Supabase SDK dependency.
 * Silent fail: if fetch errors, static fallback content remains visible.
 */
(function() {
  'use strict';

  var SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';
  var PAGE_URL = window.location.pathname === '' ? '/' : window.location.pathname;
  var SEGMENT = document.documentElement.getAttribute('data-segment') || 'new';
  var VISITS = parseInt(localStorage.getItem('bj_visits') || '0', 10);
  var COHORT_ID = localStorage.getItem('bj_cohort_id') || null;

  // Only run for segments that have merchandising content
  if (SEGMENT !== 'returning' && SEGMENT !== 'lapsed') return;

  async function fetchMerchContent() {
    try {
      var response = await fetch(
        SUPABASE_URL + '/rest/v1/rpc/get_merch_content',
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON,
            'Authorization': 'Bearer ' + SUPABASE_ANON,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            p_page_url: PAGE_URL,
            p_audience: SEGMENT,
            p_cohort_id: COHORT_ID,
            p_visit_count: VISITS,
            p_month: new Date().getMonth() + 1
          })
        }
      );

      if (!response.ok) return;
      var placements = await response.json();
      if (!placements || !placements.length) return;

      placements.forEach(function(placement) {
        injectContent(placement.element_id, placement.content_entries);
      });

      console.log('[BJ:Merch] Content injected for ' + placements.length + ' placement(s)');
    } catch (e) {
      // Silent fail — static fallback content remains visible
      reportError('merch_client', e);
      console.warn('[BJ:Merch] Fetch failed:', e.message);
    }
  }

  function injectContent(elementId, entries) {
    if (!entries || entries.length === 0) return;

    // Track seen entries per element to avoid repeats
    var storageKey = 'bj_merch_seen_' + elementId;
    var seen = [];
    try { seen = safeReadLS(storageKey, []); } catch(e) { reportError('merch-client:merch-client', e); }

    // Filter out already-seen entries
    var unseen = entries.filter(function(e) { return seen.indexOf(e.id) === -1; });

    // Reset if all seen
    if (unseen.length === 0) {
      seen = [];
      unseen = entries.slice();
      localStorage.removeItem(storageKey);
    }

    // Random pick from unseen
    var pick = unseen[Math.floor(Math.random() * unseen.length)];
    seen.push(pick.id);
    localStorage.setItem(storageKey, JSON.stringify(seen));

    // Inject into DOM
    var content = pick.content;
    Object.keys(content).forEach(function(field) {
      // Strategy 1: look for [data-merch-field="field"] inside the hero section
      var heroSection = document.querySelector(
        SEGMENT === 'returning' ? '.segment-returning' : '.segment-lapsed'
      );
      var target = null;
      if (heroSection) {
        target = heroSection.querySelector('[data-merch-field="' + field + '"]');
      }
      // Strategy 2: fallback to id-based lookup
      if (!target) {
        target = document.getElementById(elementId + '-' + field);
      }

      if (target) {
        var html = content[field]
          .replace(/\{JOBS\}/g, '<span class="merch-stat" data-merch-stat="jobs">—</span>')
          .replace(/\{COMPANIES\}/g, '<span class="merch-stat" data-merch-stat="companies">—</span>');
        target.innerHTML = (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(html) : '';
      }
    });

    // PostHog tracking
    if (window.posthog) {
      window.posthog.capture('merch_content_shown', {
        element_id: elementId,
        content_id: pick.id,
        page_url: PAGE_URL,
        segment: SEGMENT,
        visit_number: VISITS,
        cohort_id: COHORT_ID,
        category: pick.category || null
      });
    }

    // Store the pick ID for CTA click attribution
    window._merchContentId = pick.id;
    window._merchElementId = elementId;
  }

  // Run immediately (segment detection already ran in <head>)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchMerchContent);
  } else {
    fetchMerchContent();
  }

  // ── Stats hydration for merch placeholders ──
  // After live stats load, hydrate any {JOBS}/{COMPANIES} placeholder spans
  // This piggybacks on the existing stats system via a MutationObserver
  function hydrateMerchStats() {
    var cached = null;
    try { cached = safeReadLS('bj_lp_stats', null); } catch(e) { reportError('merch-client:merch-client', e); }
    if (!cached || !cached.jobs) return;

    var jobSpans = document.querySelectorAll('[data-merch-stat="jobs"]');
    var compSpans = document.querySelectorAll('[data-merch-stat="companies"]');
    var jobText = (Math.floor(cached.jobs / 1000) * 1000).toLocaleString() + '+';
    var compText = cached.companies ? cached.companies.toLocaleString() + '+' : '';

    jobSpans.forEach(function(el) { el.textContent = jobText; });
    compSpans.forEach(function(el) { el.textContent = compText; });
  }

  // Run hydration after a short delay (stats fetch usually completes quickly)
  setTimeout(hydrateMerchStats, 1500);
  // Also run on storage event (if stats are fetched by main script)
  window.addEventListener('storage', function(e) {
    if (e.key === 'bj_lp_stats') hydrateMerchStats();
  });
})();

// CS-P1-004 FE-005: Register merch-client exports with BJ namespace
(function() {
  ['_merchContentId','_merchElementId'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'merch-client', registered: Date.now() };
    }
  });
})();
