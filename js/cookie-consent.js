/**
 * Brilliant Jobs — Cookie Consent Manager
 * CS-018: GDPR/CCPA consent gate for PostHog + GTM
 *
 * Flow:
 *   1. Check for existing consent cookie (bj_consent)
 *   2. If 'granted' → load analytics immediately
 *   3. If 'denied' → do nothing (no analytics)
 *   4. If absent → show banner, wait for user choice
 *
 * PostHog + GTM are NOT loaded until consent is granted.
 * The bjError() reporter still works because it's defined inline
 * and gated behind a `window.posthog` check.
 */
(function() {
  'use strict';

  var CONSENT_COOKIE = 'bj_consent';
  var CONSENT_DAYS = 365;

  // ── Cookie helpers ──
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : '';
  }

  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = name + '=' + encodeURIComponent(value)
      + ';expires=' + d.toUTCString()
      + ';path=/;SameSite=Lax;Secure';
  }

  // ── CS-P1-007 LS1-3: Capture UTM params immediately (before consent decision) ──
  var _utmParams = {};
  try {
    var sp = new URLSearchParams(window.location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function(k) {
      var v = sp.get(k);
      if (v) _utmParams[k] = v;
    });
    // Also capture referral code if present
    var ref = sp.get('ref') || sp.get('referral');
    if (ref) _utmParams.bj_referral_code = ref;
    // Persist UTM to sessionStorage so they survive consent banner interaction
    if (Object.keys(_utmParams).length) {
      sessionStorage.setItem('bj_utm', JSON.stringify(_utmParams));
    }
  } catch (_) {}

  // ── Analytics loaders ──
  var _analyticsLoaded = false;

  function _registerUtmParams() {
    // LS1-3 + TS1-1 + TS1-2: Register persisted UTM params as PostHog super properties
    if (!window.posthog) return;
    try {
      var stored = sessionStorage.getItem('bj_utm');
      var params = stored ? JSON.parse(stored) : _utmParams;
      if (params && Object.keys(params).length) {
        posthog.register_for_session(params);
        // Set person properties so UTM flows into user profile
        posthog.setPersonProperties({
          initial_utm_source: params.utm_source || null,
          initial_utm_medium: params.utm_medium || null,
          initial_utm_campaign: params.utm_campaign || null,
        }, {
          // $set_once — only set first touch attribution
          first_utm_source: params.utm_source || null,
          first_utm_medium: params.utm_medium || null,
          first_utm_campaign: params.utm_campaign || null,
        });
      }
    } catch (_) {}
  }

  function loadPostHog() {
    if (window.posthog && window.posthog.__loaded) return;
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init ns hs wi ls ds rs os capture calculateEventProperties fs register register_once register_for_session unregister unregister_for_session bs getFeatureFlag getFeatureFlagPayload getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty gs cs createPersonProfile setInternalOrTestUser ts ys opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing vs debug M ps getPageViewId captureTraceFeedback captureTraceMetric Xr".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    posthog.init('phc_RqMlQQfq0G0DOikTlgyRO43USYm1h4Jd1aBneeIR6ww', {
      api_host: 'https://us.i.posthog.com',
      person_profiles: 'identified_only',
      autocapture: true,
      capture_pageview: true,
      capture_pageleave: true,
    });
    if (posthog.startExceptionAutocapture) posthog.startExceptionAutocapture();
  }

  function loadGTM() {
    (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer','GTM-PLHNJQLC');
  }

  function loadAnalytics() {
    if (_analyticsLoaded) return;
    _analyticsLoaded = true;
    loadPostHog();
    loadGTM();
    // CS-P1-007 LS1-3: Register UTM params after PostHog init
    _registerUtmParams();
  }

  // ── bjError reporter (works with or without PostHog) ──
  window.bjError = function bjError(label, error, extra) {
    try {
      if (window.posthog) {
        posthog.captureException(error instanceof Error ? error : new Error(String(error)), {
          tags: { surface: 'landing', label: label },
          extra: Object.assign({ page: window.location.pathname, ts: new Date().toISOString() }, extra || {})
        });
      }
    } catch (_) { /* reporter must never throw */ }
  };

  // ── Banner ──
  function showBanner() {
    var banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML =
      '<div class="cc-inner">' +
        '<p class="cc-text">We use cookies and analytics (PostHog, Google Tag Manager) to improve your experience and understand how our site is used. ' +
        'You can accept or decline non-essential cookies. See our <a href="/privacy" class="cc-link">Privacy Policy</a>.</p>' +
        '<div class="cc-actions">' +
          '<button id="cc-decline" class="cc-btn cc-btn-secondary">Decline</button>' +
          '<button id="cc-accept" class="cc-btn cc-btn-primary">Accept</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(banner);

    document.getElementById('cc-accept').addEventListener('click', function() {
      setCookie(CONSENT_COOKIE, 'granted', CONSENT_DAYS);
      banner.remove();
      loadAnalytics();
    });

    document.getElementById('cc-decline').addEventListener('click', function() {
      setCookie(CONSENT_COOKIE, 'denied', CONSENT_DAYS);
      banner.remove();
    });
  }

  // ── Init ──
  var consent = getCookie(CONSENT_COOKIE);
  if (consent === 'granted') {
    loadAnalytics();
  } else if (consent === 'denied') {
    // Respect opt-out — no analytics
  } else {
    // No consent recorded — show banner after DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showBanner);
    } else {
      showBanner();
    }
  }

  // ── Public API for settings/preference pages ──
  window.bjConsent = {
    getStatus: function() { return getCookie(CONSENT_COOKIE) || 'pending'; },
    grant: function() {
      setCookie(CONSENT_COOKIE, 'granted', CONSENT_DAYS);
      loadAnalytics();
    },
    revoke: function() {
      setCookie(CONSENT_COOKIE, 'denied', CONSENT_DAYS);
      if (window.posthog) posthog.opt_out_capturing();
    }
  };
})();

// CS-P1-004 FE-005: Register cookie-consent exports with BJ namespace
(function() {
  ['bjConsent','bjError'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'cookie-consent', registered: Date.now() };
    }
  });
})();
