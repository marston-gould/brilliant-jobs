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
  function captureReferral() {
    var code = getParam("ref") || getParam("referral_code") || "";
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
    var anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg";
    var supabaseUrl = "https://qojhagupdnbtomfoxnsf.supabase.co";
    fetch(supabaseUrl + "/rest/v1/rpc/track_referral_click", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": anonKey,
        "Authorization": "Bearer " + anonKey
      },
      body: JSON.stringify({ p_code: code, p_source: source })
    }).catch(function() {
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
