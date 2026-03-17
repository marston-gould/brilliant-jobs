// @ts-nocheck
// CS-P1-002 SE-005: PostHog init extracted from inline <script> for CSP compliance
// Dashboard-specific config (includes capture_pageleave + session recording masks)
!function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init ns hs wi ls ds rs os capture calculateEventProperties fs register register_once register_for_session unregister unregister_for_session bs getFeatureFlag getFeatureFlagPayload getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty gs cs createPersonProfile setInternalOrTestUser ts ys opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing vs debug M ps getPageViewId captureTraceFeedback captureTraceMetric Xr".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init('phc_RqMlQQfq0G0DOikTlgyRO43USYm1h4Jd1aBneeIR6ww', {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '.sensitive-data',
    },
    enable_recording_console_log: false,
});
// CS-003: Start exception autocapture for error tracking (DO-001)
if (posthog.startExceptionAutocapture) posthog.startExceptionAutocapture();

// AUDIT-D2-001: Define capturePostHog — called in 7 places across 5 modules but was never defined.
// All calls (cover_letter_generated, linkedin_pdf_uploaded, bulk_apply_*, resume_rewrite_*,
// auto_apply_consumer_triggered) were silently no-oping. This wrapper is safe to call before
// PostHog is fully initialised — PostHog stubs capture() during async load.
window.capturePostHog = function(event, props) {
  if (typeof posthog !== 'undefined' && typeof posthog.capture === 'function') {
    posthog.capture(event, props || {});
  } else if (typeof reportError === 'function') {
    reportError('capturePostHog:posthog-unavailable', new Error('PostHog not ready when capturing: ' + event));
  }
};
