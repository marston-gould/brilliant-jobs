(function() {
  "use strict";
  var segment = "new";
  var visits = 0;
  try {
    visits = parseInt(localStorage.getItem("bj_visits") || "0", 10);
    localStorage.setItem("bj_visits", String(visits + 1));
    var hasAccount = localStorage.getItem("bj_has_account") === "true";
    var sbKey = Object.keys(localStorage).find(function(k) {
      return k.startsWith("sb-") && k.endsWith("-auth-token");
    });
    var hasSession = sbKey && localStorage.getItem(sbKey);
    if (hasSession) {
      segment = "active";
    } else if (hasAccount) {
      segment = "lapsed";
    } else if (visits >= 1) {
      segment = "returning";
    }
  } catch (e) {
  }
  document.documentElement.setAttribute("data-segment", segment);
  if (segment === "returning" && visits >= 3) {
    document.documentElement.setAttribute("data-visit-depth", "deep");
  }
  var segmentClasses = ["segment-new", "segment-returning", "segment-lapsed", "segment-active"];
  segmentClasses.forEach(function(cls) {
    if (cls !== "segment-" + segment) {
      var els = document.querySelectorAll("section." + cls);
      els.forEach(function(el) {
        el.remove();
      });
    }
  });
  // Active segment redirect removed — landing-app.js handles post-login navigation
})();
