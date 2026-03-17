(function() {
  "use strict";
  function _waitReady(fn) {
    if (document.readyState === "complete") {
      setTimeout(fn, 100);
    } else {
      window.addEventListener("load", function() {
        setTimeout(fn, 100);
      });
    }
  }
  _waitReady(function() {
    if (!window.posthog || !window.performance || !performance.getEntriesByType) return;
    var nav = performance.getEntriesByType("navigation");
    if (!nav || !nav.length) return;
    var t = nav[0];
    posthog.capture("bj_page_performance", {
      bj_perf_ttfb_ms: Math.round(t.responseStart - t.requestStart),
      bj_perf_dom_interactive_ms: Math.round(t.domInteractive),
      bj_perf_dom_complete_ms: Math.round(t.domComplete),
      bj_perf_load_ms: Math.round(t.loadEventEnd),
      bj_perf_dns_ms: Math.round(t.domainLookupEnd - t.domainLookupStart),
      bj_perf_tls_ms: Math.round(t.connectEnd - t.secureConnectionStart),
      bj_perf_transfer_size: t.transferSize || 0,
      bj_perf_encoded_body_size: t.encodedBodySize || 0,
      bj_surface: _detectSurface()
    });
  });
  if (typeof PerformanceObserver !== "undefined") {
    try {
      var lcpObs = new PerformanceObserver(function(list) {
        var entries = list.getEntries();
        if (!entries.length || !window.posthog) return;
        var lcp = entries[entries.length - 1];
        posthog.capture("bj_web_vital", {
          bj_vital_name: "LCP",
          bj_vital_value_ms: Math.round(lcp.startTime),
          bj_vital_element: lcp.element ? lcp.element.tagName : "unknown",
          bj_surface: _detectSurface()
        });
        lcpObs.disconnect();
      });
      lcpObs.observe({ type: "largest-contentful-paint", buffered: true });
    } catch (_) {
    }
    try {
      var fidObs = new PerformanceObserver(function(list) {
        var entries = list.getEntries();
        if (!entries.length || !window.posthog) return;
        var fid = entries[0];
        posthog.capture("bj_web_vital", {
          bj_vital_name: "FID",
          bj_vital_value_ms: Math.round(fid.processingStart - fid.startTime),
          bj_vital_input_type: fid.name,
          bj_surface: _detectSurface()
        });
        fidObs.disconnect();
      });
      fidObs.observe({ type: "first-input", buffered: true });
    } catch (_) {
    }
  }
  var _tabMarks = {};
  window.bjPerfMark = function(tabName, phase) {
    if (phase === "start") {
      _tabMarks[tabName] = performance.now();
    } else if (phase === "end" && _tabMarks[tabName]) {
      var duration = Math.round(performance.now() - _tabMarks[tabName]);
      if (window.posthog) {
        posthog.capture("bj_tab_render", {
          bj_tab: tabName,
          bj_render_ms: duration,
          bj_surface: "dashboard"
        });
      }
      delete _tabMarks[tabName];
    }
  };
  function _detectSurface() {
    var path = window.location.pathname;
    if (path.includes("dashboard")) return "dashboard";
    if (path.includes("admin")) return "admin";
    if (path === "/" || path.includes("index")) return "landing";
    return "other";
  }
  if (window.BJ) {
    window.BJ.bjPerfMark = window.bjPerfMark;
    window.BJ._registry = window.BJ._registry || {};
    window.BJ._registry.bjPerfMark = { module: "posthog-perf", registered: Date.now() };
  }
})();
