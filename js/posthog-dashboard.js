!(function(t, e) {
  var o, n, p, r;
  e.__SV || window.posthog && window.posthog.__loaded || (window.posthog = e, e._i = [], e.init = function(i, s, a) {
    function g(t2, e2) {
      var o2 = e2.split(".");
      2 == o2.length && (t2 = t2[o2[0]], e2 = o2[1]), t2[e2] = function() {
        t2.push([e2].concat(Array.prototype.slice.call(arguments, 0)));
      };
    }
    (p = t.createElement("script")).type = "text/javascript", p.crossOrigin = "anonymous", p.async = true, p.src = s.api_host.replace(".i.posthog.com", "-assets.i.posthog.com") + "/static/array.js", (r = t.getElementsByTagName("script")[0]).parentNode.insertBefore(p, r);
    var u = e;
    for (void 0 !== a ? u = e[a] = [] : a = "posthog", u.people = u.people || [], u.toString = function(t2) {
      var e2 = "posthog";
      return "posthog" !== a && (e2 += "." + a), t2 || (e2 += " (stub)"), e2;
    }, u.people.toString = function() {
      return u.toString(1) + ".people (stub)";
    }, o = "init ns hs wi ls ds rs os capture calculateEventProperties fs register register_once register_for_session unregister unregister_for_session bs getFeatureFlag getFeatureFlagPayload getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty gs cs createPersonProfile setInternalOrTestUser ts ys opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing vs debug M ps getPageViewId captureTraceFeedback captureTraceMetric Xr".split(" "), n = 0; n < o.length; n++) g(u, o[n]);
    e._i.push([i, s, a]);
  }, e.__SV = 1);
})(document, window.posthog || []);
posthog.init("phc_RqMlQQfq0G0DOikTlgyRO43USYm1h4Jd1aBneeIR6ww", {
  api_host: "https://us.i.posthog.com",
  person_profiles: "identified_only",
  autocapture: true,
  capture_pageview: true,
  capture_pageleave: true,
  session_recording: {
    maskAllInputs: true,
    maskTextSelector: ".sensitive-data"
  },
  enable_recording_console_log: false
});
if (posthog.startExceptionAutocapture) posthog.startExceptionAutocapture();
window.capturePostHog = function(event, props) {
  if (typeof posthog !== "undefined" && typeof posthog.capture === "function") {
    posthog.capture(event, props || {});
  } else if (typeof reportError === "function") {
    reportError("capturePostHog:posthog-unavailable", new Error("PostHog not ready when capturing: " + event));
  }
};
