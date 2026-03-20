(function() {
  "use strict";
  var SUPABASE_URL = "https://qojhagupdnbtomfoxnsf.supabase.co";
  var SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg";
  var PAGE_URL = window.location.pathname === "" ? "/" : window.location.pathname;
  var SEGMENT = document.documentElement.getAttribute("data-segment") || "new";
  var VISITS = parseInt(localStorage.getItem("bj_visits") || "0", 10);
  var COHORT_ID = localStorage.getItem("bj_cohort_id") || null;
  if (SEGMENT !== "returning" && SEGMENT !== "lapsed") return;
  async function fetchMerchContent() {
    try {
      var response = await fetch(
        SUPABASE_URL + "/rest/v1/rpc/get_merch_content",
        {
          method: "POST",
          headers: {
            "apikey": SUPABASE_ANON,
            "Authorization": "Bearer " + SUPABASE_ANON,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            p_page_url: PAGE_URL,
            p_audience: SEGMENT,
            p_cohort_id: COHORT_ID,
            p_visit_count: VISITS,
            p_month: (/* @__PURE__ */ new Date()).getMonth() + 1
          })
        }
      );
      if (!response.ok) return;
      var placements = await response.json();
      if (!placements || !placements.length) return;
      placements.forEach(function(placement) {
        injectContent(placement.element_id, placement.content_entries);
      });
      console.log("[BJ:Merch] Content injected for " + placements.length + " placement(s)");
    } catch (e) {
      if (typeof reportError === "function") reportError("merch_client", e);
      console.warn("[BJ:Merch] Fetch failed:", e.message);
    }
  }
  function injectContent(elementId, entries) {
    if (!entries || entries.length === 0) return;
    var storageKey = "bj_merch_seen_" + elementId;
    var seen = [];
    try {
      seen = safeReadLS(storageKey, []);
    } catch (e) {
      if (typeof reportError === "function") reportError("merch-client:merch-client", e);
    }
    var unseen = entries.filter(function(e) {
      return seen.indexOf(e.id) === -1;
    });
    if (unseen.length === 0) {
      seen = [];
      unseen = entries.slice();
      localStorage.removeItem(storageKey);
    }
    var pick = unseen[Math.floor(Math.random() * unseen.length)];
    seen.push(pick.id);
    localStorage.setItem(storageKey, JSON.stringify(seen));
    var content = pick.content;
    Object.keys(content).forEach(function(field) {
      var heroSection = document.querySelector(
        SEGMENT === "returning" ? ".segment-returning" : ".segment-lapsed"
      );
      var target = null;
      if (heroSection) {
        target = heroSection.querySelector('[data-merch-field="' + field + '"]');
      }
      if (!target) {
        target = document.getElementById(elementId + "-" + field);
      }
      if (target) {
        var html = content[field].replace(/\{JOBS\}/g, '<span class="merch-stat" data-merch-stat="jobs">\u2014</span>').replace(/\{COMPANIES\}/g, '<span class="merch-stat" data-merch-stat="companies">\u2014</span>');
        console.log("[BJ:Merch] Injecting field:", field, "into", target?.tagName);
        target.innerHTML = typeof DOMPurify !== "undefined" ? DOMPurify.sanitize(html) : html;
      }
    });
    if (window.posthog) {
      window.posthog.capture("merch_content_shown", {
        element_id: elementId,
        content_id: pick.id,
        page_url: PAGE_URL,
        segment: SEGMENT,
        visit_number: VISITS,
        cohort_id: COHORT_ID,
        category: pick.category || null
      });
    }
    window._merchContentId = pick.id;
    window._merchElementId = elementId;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fetchMerchContent);
  } else {
    fetchMerchContent();
  }
  function hydrateMerchStats() {
    var cached = null;
    try {
      cached = safeReadLS("bj_lp_stats", null);
    } catch (e) {
      if (typeof reportError === "function") reportError("merch-client:merch-client", e);
    }
    if (!cached || !cached.jobs) return;
    var jobSpans = document.querySelectorAll('[data-merch-stat="jobs"]');
    var compSpans = document.querySelectorAll('[data-merch-stat="companies"]');
    var jobText = (Math.floor(cached.jobs / 1e3) * 1e3).toLocaleString() + "+";
    var compText = cached.companies ? cached.companies.toLocaleString() + "+" : "";
    jobSpans.forEach(function(el) {
      el.textContent = jobText;
    });
    compSpans.forEach(function(el) {
      el.textContent = compText;
    });
  }
  setTimeout(hydrateMerchStats, 1500);
  window.addEventListener("storage", function(e) {
    if (e.key === "bj_lp_stats") hydrateMerchStats();
  });
})();
(function() {
  ["_merchContentId", "_merchElementId"].forEach(function(name) {
    if (typeof window[name] === "function") {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: "merch-client", registered: Date.now() };
    }
  });
})();
