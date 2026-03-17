(function() {
  "use strict";
  var CONSENT_COOKIE = "bj_consent";
  var CONSENT_DAYS = 365;
  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : "";
  }
  function setCookie(name, value, days) {
    var d = /* @__PURE__ */ new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1e3);
    document.cookie = name + "=" + encodeURIComponent(value) + ";expires=" + d.toUTCString() + ";path=/;SameSite=Lax;Secure";
  }
  var _utmParams = {};
  try {
    var sp = new URLSearchParams(window.location.search);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function(k) {
      var v = sp.get(k);
      if (v) _utmParams[k] = v;
    });
    var ref = sp.get("ref") || sp.get("referral");
    if (ref) _utmParams.bj_referral_code = ref;
    if (Object.keys(_utmParams).length) {
      sessionStorage.setItem("bj_utm", JSON.stringify(_utmParams));
    }
  } catch (_) {
  }
  var _analyticsLoaded = false;
  function _registerUtmParams() {
    if (!window.posthog) return;
    try {
      var stored = sessionStorage.getItem("bj_utm");
      var params = stored ? JSON.parse(stored) : _utmParams;
      if (params && Object.keys(params).length) {
        posthog.register_for_session(params);
        posthog.setPersonProperties({
          initial_utm_source: params.utm_source || null,
          initial_utm_medium: params.utm_medium || null,
          initial_utm_campaign: params.utm_campaign || null
        }, {
          // $set_once — only set first touch attribution
          first_utm_source: params.utm_source || null,
          first_utm_medium: params.utm_medium || null,
          first_utm_campaign: params.utm_campaign || null
        });
      }
    } catch (_) {
    }
  }
  function loadPostHog() {
    if (window.posthog && window.posthog.__loaded) return;
    !(function(t, e) {
      var o, n, p, r;
      e.__SV || (window.posthog = e, e._i = [], e.init = function(i, s, a) {
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
      capture_pageleave: true
    });
    if (posthog.startExceptionAutocapture) posthog.startExceptionAutocapture();
  }
  function loadGTM() {
    (function(w, d, s, l, i) {
      w[l] = w[l] || [];
      w[l].push({ "gtm.start": (/* @__PURE__ */ new Date()).getTime(), event: "gtm.js" });
      var f = d.getElementsByTagName(s)[0], j = d.createElement(s), dl = l != "dataLayer" ? "&l=" + l : "";
      j.async = true;
      j.src = "https://www.googletagmanager.com/gtm.js?id=" + i + dl;
      f.parentNode.insertBefore(j, f);
    })(window, document, "script", "dataLayer", "GTM-PLHNJQLC");
  }
  function loadAnalytics() {
    if (_analyticsLoaded) return;
    _analyticsLoaded = true;
    loadPostHog();
    loadGTM();
    _registerUtmParams();
  }
  window.bjError = function bjError(label, error, extra) {
    try {
      if (window.posthog) {
        posthog.captureException(error instanceof Error ? error : new Error(String(error)), {
          tags: { surface: "landing", label },
          extra: Object.assign({ page: window.location.pathname, ts: (/* @__PURE__ */ new Date()).toISOString() }, extra || {})
        });
      }
    } catch (_) {
    }
  };
  function showBanner() {
    var banner = document.createElement("div");
    banner.id = "cookie-consent-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Cookie consent");
    banner.innerHTML = '<div class="cc-inner"><p class="cc-text">We use cookies and analytics (PostHog, Google Tag Manager) to improve your experience and understand how our site is used. You can accept or decline non-essential cookies. See our <a href="/privacy" class="cc-link">Privacy Policy</a>.</p><div class="cc-actions"><button id="cc-decline" class="cc-btn cc-btn-secondary">Decline</button><button id="cc-accept" class="cc-btn cc-btn-primary">Accept</button></div></div>';
    document.body.appendChild(banner);
    document.getElementById("cc-accept").addEventListener("click", function() {
      setCookie(CONSENT_COOKIE, "granted", CONSENT_DAYS);
      banner.remove();
      loadAnalytics();
    });
    document.getElementById("cc-decline").addEventListener("click", function() {
      setCookie(CONSENT_COOKIE, "denied", CONSENT_DAYS);
      banner.remove();
    });
  }
  var consent = getCookie(CONSENT_COOKIE);
  if (consent === "granted") {
    loadAnalytics();
  } else if (consent === "denied") {
  } else {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showBanner);
    } else {
      showBanner();
    }
  }
  window.bjConsent = {
    getStatus: function() {
      return getCookie(CONSENT_COOKIE) || "pending";
    },
    grant: function() {
      setCookie(CONSENT_COOKIE, "granted", CONSENT_DAYS);
      loadAnalytics();
    },
    revoke: function() {
      setCookie(CONSENT_COOKIE, "denied", CONSENT_DAYS);
      if (window.posthog) posthog.opt_out_capturing();
    }
  };
})();
(function() {
  if (typeof window.BJ === "undefined") return;
  ["bjConsent", "bjError"].forEach(function(name) {
    if (typeof window[name] === "function") {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: "cookie-consent", registered: Date.now() };
    }
  });
})();
