(function() {
  var CACHE_KEY = "bj_seo_stats";
  var CACHE_TTL = 30 * 60 * 1e3;
  var RPC_URL = "https://qojhagupdnbtomfoxnsf.supabase.co/rest/v1/rpc/get_seo_stats";
  var AK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg";
  function fmt(n) {
    return Number(n).toLocaleString("en-US");
  }
  function fmtK(n) {
    var k = Math.floor(n / 5e3) * 5;
    return k + "K+";
  }
  function fmtKComma(n) {
    var k = Math.floor(n / 5e3) * 5e3;
    return fmt(k) + "+";
  }
  function hydrate(stats) {
    document.querySelectorAll(".seo-jobs-k").forEach(function(el) {
      el.textContent = fmtK(stats.open_jobs);
    });
    document.querySelectorAll(".seo-jobs-full").forEach(function(el) {
      el.textContent = fmtKComma(stats.open_jobs);
    });
    document.querySelectorAll(".seo-jobs-exact").forEach(function(el) {
      el.textContent = fmt(stats.open_jobs);
    });
    document.querySelectorAll(".seo-companies-k").forEach(function(el) {
      el.textContent = fmt(Math.floor(stats.companies / 1e3) * 1e3) + "+";
    });
    document.querySelectorAll(".seo-companies-exact").forEach(function(el) {
      el.textContent = fmt(stats.companies);
    });
    document.querySelectorAll(".seo-salary-count").forEach(function(el) {
      el.textContent = fmt(Math.floor(stats.with_salary / 1e3) * 1e3) + "+";
    });
    document.querySelectorAll(".seo-salary-pct").forEach(function(el) {
      el.textContent = stats.salary_pct + "%";
    });
    document.querySelectorAll(".seo-boards").forEach(function(el) {
      el.textContent = fmt(stats.active_boards);
    });
  }
  function load() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE_KEY));
      if (c && Date.now() - c.ts < CACHE_TTL) {
        hydrate(c.data);
        return;
      }
    } catch (e) {
      reportError("seo-stats:seo-stats", e);
    }
    fetch(RPC_URL, {
      method: "POST",
      headers: { "apikey": AK, "Authorization": "Bearer " + AK, "Content-Type": "application/json" },
      body: "{}"
    }).then(function(r) {
      return r.json();
    }).then(function(data) {
      if (data && data.open_jobs) {
        hydrate(data);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
        } catch (e) {
          reportError("seo-stats:seo-stats", e);
        }
      }
    }).catch(function() {
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
