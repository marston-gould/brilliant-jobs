/**
 * Brilliant Jobs — Referral Landing Capture
 * Runs on ALL public pages (index, pricing, blog, SEO pages).
 * Captures ?ref=BJ-XXXXXX or ?referral_code=BJ-XXXXXX from URL.
 * Stores in cookie (30-day TTL) + sessionStorage for signup attribution.
 * v5.10: Phase 4 — Referral Program
 */

(function() {
  'use strict';

  var COOKIE_NAME = 'bj_ref';
  var COOKIE_DAYS = 30;
  var SESSION_KEY = 'bj_referral_code';
  var SOURCE_KEY = 'bj_referral_source';

  // Parse URL params
  function getParam(name) {
    var url = new URL(window.location.href);
    return url.searchParams.get(name) || '';
  }

  // Cookie helpers
  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : '';
  }

  // Detect referral source from URL or referrer
  function detectSource() {
    var utm = getParam('utm_source') || getParam('utm_medium') || '';
    if (utm) return utm;

    var ref = document.referrer || '';
    if (ref.includes('linkedin.com')) return 'linkedin';
    if (ref.includes('twitter.com') || ref.includes('x.com')) return 'twitter';
    if (ref.includes('facebook.com')) return 'facebook';
    if (ref.includes('mail.google.com') || ref.includes('outlook')) return 'email';
    if (ref.includes('t.co')) return 'twitter';

    return 'direct';
  }

  // Main capture logic
  function captureReferral() {
    // Check URL for referral code
    var code = getParam('ref') || getParam('referral_code') || '';

    // Validate format: BJ-XXXXXX (6 alphanumeric)
    if (code && /^BJ-[A-Z0-9]{6}$/i.test(code)) {
      code = code.toUpperCase();
      var source = detectSource();

      // Store in cookie (persists across sessions for 30 days)
      setCookie(COOKIE_NAME, code, COOKIE_DAYS);

      // Store in sessionStorage (for immediate signup flow)
      try {
        sessionStorage.setItem(SESSION_KEY, code);
        sessionStorage.setItem(SOURCE_KEY, source);
      } catch(e) { /* private browsing */ }

      // Track the click via Supabase if available
      trackReferralClick(code, source);

      // Clean URL (remove ref param without reload)
      try {
        var url = new URL(window.location.href);
        url.searchParams.delete('ref');
        url.searchParams.delete('referral_code');
        window.history.replaceState({}, '', url.toString());
      } catch(e) { /* old browser */ }

      console.log('[BJ] Referral captured:', code, 'source:', source);
      return;
    }

    // No URL param — check if we have a stored cookie
    var stored = getCookie(COOKIE_NAME);
    if (stored) {
      try {
        sessionStorage.setItem(SESSION_KEY, stored);
        if (!sessionStorage.getItem(SOURCE_KEY)) {
          sessionStorage.setItem(SOURCE_KEY, 'cookie_return');
        }
      } catch(e) { reportError("referral-capture", e); }
    }
  }

  // Track click in referral_invites table
  function trackReferralClick(code, source) {
    // Only if Supabase anon client available (public pages use anon key)
    var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';
    var supabaseUrl = 'https://qojhagupdnbtomfoxnsf.supabase.co';

    // Fire and forget — update clicked_at on matching invite
    fetch(supabaseUrl + '/rest/v1/rpc/track_referral_click', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': 'Bearer ' + anonKey
      },
      body: JSON.stringify({ p_code: code, p_source: source })
    }).catch(function() { /* silent */ });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', captureReferral);
  } else {
    captureReferral();
  }

  // Expose for signup flow to read
  window.bjReferral = {
    getCode: function() {
      try { return sessionStorage.getItem(SESSION_KEY) || getCookie(COOKIE_NAME) || ''; } catch(e) { return getCookie(COOKIE_NAME) || ''; }
    },
    getSource: function() {
      try { return sessionStorage.getItem(SOURCE_KEY) || 'unknown'; } catch(e) { return 'unknown'; }
    }
  };
})();
