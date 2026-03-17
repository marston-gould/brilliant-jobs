// @ts-nocheck
/* ───────────────────────────────────────────────────────────
   landing-ab.js — A/B Test Integration for Landing Page
   CS-P1-016 (0.176): First A/B test — CTA copy variant
   
   Uses PostHog feature flags to vary CTA button text.
   Flag: ab_landing_cta_copy
   Variants: control (Start Free), variant_a (Find Your Next Job),
             variant_b (Start Searching)
   ─────────────────────────────────────────────────────────── */

(function() {
  'use strict';

  var FLAG_KEY = 'ab_landing_cta_copy';
  var CTA_SELECTORS = [
    '#hero-signup-btn',
    '#pv-signup-btn',
    '#walkthrough-signup-btn',
    '#bottom-signup-btn',
    '#hero-signup-ret'
  ];

  var VARIANT_COPY = {
    control: 'Start Free',
    variant_a: 'Find Your Next Job',
    variant_b: 'Start Searching'
  };

  function applyCTAVariant() {
    if (!window.posthog || typeof window.posthog.getFeatureFlag !== 'function') return;

    var variant = window.posthog.getFeatureFlag(FLAG_KEY);
    if (!variant || !VARIANT_COPY[variant]) return;

    var copy = VARIANT_COPY[variant];
    CTA_SELECTORS.forEach(function(sel) {
      var el = document.querySelector(sel);
      if (el && el.textContent.trim() !== copy) {
        el.textContent = copy;
        el.setAttribute('data-ab-variant', variant);
      }
    });

    // Track exposure
    if (window.posthog.capture) {
      window.posthog.capture('$feature_flag_called', {
        $feature_flag: FLAG_KEY,
        $feature_flag_response: variant
      });
    }
  }

  // PostHog flags load async — use onFeatureFlags callback
  if (window.posthog && window.posthog.onFeatureFlags) {
    window.posthog.onFeatureFlags(applyCTAVariant);
  }

  // Fallback: retry after a short delay
  setTimeout(applyCTAVariant, 2000);
  setTimeout(applyCTAVariant, 5000);
})();
