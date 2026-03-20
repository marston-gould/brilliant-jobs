(function() {
  "use strict";
  var COOKIE_NAME = "bj_ref";
  var COOKIE_DAYS = 30;
  var SESSION_KEY = "bj_referral_code";
  var SOURCE_KEY = "bj_referral_source";
  function getParam(name) {
    var url = new URL(window.location.href);
    return url.searchParams.get(name) || "";
  }
  function setCookie(name, value, days) {
    var d = /* @__PURE__ */ new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1e3);
    document.cookie = name + "=" + encodeURIComponent(value) + ";expires=" + d.toUTCString() + ";path=/;SameSite=Lax;Secure";
  }
  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : "";
  }
  function detectSource() {
    var utm = getParam("utm_source") || getParam("utm_medium") || "";
    if (utm) return utm;
    var ref = document.referrer || "";
    if (ref.includes("linkedin.com")) return "linkedin";
    if (ref.includes("twitter.com") || ref.includes("x.com")) return "twitter";
    if (ref.includes("facebook.com")) return "facebook";
    if (ref.includes("mail.google.com") || ref.includes("outlook")) return "email";
    if (ref.includes("t.co")) return "twitter";
    return "direct";
  }
  // SUB-06: reserved paths that are NOT usernames
  var RESERVED_PATHS = new Set(['billing','benefits','compare','dashboard','feed',
    'help','jobs','login','market','notifications','pipeline','pricing','privacy',
    'referral','referrals','settings','signup','stats','subscription','terms',
    'tuning','admin','app','api','data-lab','hiring-trends','salary-data',
    'ghost-report','college-major-outcomes','jobs-by-location','blog']);

  function captureReferral() {
    var code = getParam("ref") || getParam("referral_code") || "";
    // SUB-06: handle ?u=username from /api/referral-lookup redirect
    var usernameParam = getParam("u") || "";
    if (usernameParam && !code) {
      // Treat username param as a referral attribution signal
      // The server already resolved username → code; store as bj_ref_username for analytics
      try {
        sessionStorage.setItem("bj_ref_username", usernameParam);
        sessionStorage.setItem(SOURCE_KEY, detectSource());
      } catch (e2) { console.warn("[BJ:Referral] Non-fatal error:", e2.message); }
      if (window.posthog) {
        try { window.posthog.capture("referral_username_visit", { username: usernameParam }); } catch (e2) {}
      }
    }
    if (code && /^BJ-[A-Z0-9]{6}$/i.test(code)) {
      code = code.toUpperCase();
      var source = detectSource();
      setCookie(COOKIE_NAME, code, COOKIE_DAYS);
      try {
        sessionStorage.setItem(SESSION_KEY, code);
        sessionStorage.setItem(SOURCE_KEY, source);
      } catch (e2) {
      }
      trackReferralClick(code, source);
      try {
        var url = new URL(window.location.href);
        url.searchParams.delete("ref");
        url.searchParams.delete("referral_code");
        window.history.replaceState({}, "", url.toString());
      } catch (e2) {
      }
      reportError("referral_capture", e);
      console.log("[BJ] Referral captured:", code, "source:", source);
      return;
    }
    var stored = getCookie(COOKIE_NAME);
    if (stored) {
      try {
        sessionStorage.setItem(SESSION_KEY, stored);
        if (!sessionStorage.getItem(SOURCE_KEY)) {
          sessionStorage.setItem(SOURCE_KEY, "cookie_return");
        }
      } catch (e2) {
        reportError("referral-capture", e2);
      }
    }
  }
  function trackReferralClick(code, source) {
    var supabaseUrl = (typeof SUPABASE_URL !== "undefined" ? SUPABASE_URL : "");
    var anonKey = (typeof SUPABASE_KEY !== "undefined" ? SUPABASE_KEY : "");
    if (!supabaseUrl || !anonKey) { console.warn("[BJ:Referral] SUPABASE_URL or SUPABASE_KEY not found on window"); return; }
    fetch(supabaseUrl + "/rest/v1/rpc/track_referral_click", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": anonKey,
        "Authorization": "Bearer " + anonKey
      },
      body: JSON.stringify({ p_code: code, p_source: source })
    }).catch(function(err) { console.warn("[BJ:Referral] Fetch failed:", err.message);
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", captureReferral);
  } else {
    captureReferral();
  }
  window.bjReferral = {
    getCode: function() {
      try {
        return sessionStorage.getItem(SESSION_KEY) || getCookie(COOKIE_NAME) || "";
      } catch (e2) {
        return getCookie(COOKIE_NAME) || "";
      }
    },
    getSource: function() {
      try {
        return sessionStorage.getItem(SOURCE_KEY) || "unknown";
      } catch (e2) {
        return "unknown";
      }
    }
  };
})();
