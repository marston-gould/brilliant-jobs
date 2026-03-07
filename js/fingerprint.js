(function() {
  "use strict";
  function fnv1a(str) {
    var hash = 2166136261;
    for (var i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = hash * 16777619 >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }
  function getComponents() {
    var c = [];
    var nav = window.navigator || {};
    var screen = window.screen || {};
    c.push(nav.userAgent || "");
    c.push(nav.language || "");
    c.push((nav.languages || []).join(","));
    c.push(screen.width + "x" + screen.height);
    c.push(String(screen.colorDepth || ""));
    c.push(String(screen.pixelDepth || ""));
    try {
      c.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch (_e) {
      c.push("");
    }
    c.push(String((/* @__PURE__ */ new Date()).getTimezoneOffset()));
    c.push(nav.platform || "");
    c.push(String(nav.hardwareConcurrency || ""));
    c.push(String(nav.maxTouchPoints || 0));
    c.push(String(nav.deviceMemory || ""));
    try {
      var canvas = document.createElement("canvas");
      var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (gl && gl instanceof WebGLRenderingContext) {
        var ext = gl.getExtension("WEBGL_debug_renderer_info");
        if (ext) {
          c.push(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || "");
          c.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "");
        }
      }
    } catch (_e) {
      c.push("no-webgl");
    }
    try {
      var cv = document.createElement("canvas");
      cv.width = 200;
      cv.height = 50;
      var ctx = cv.getContext("2d");
      if (ctx) {
        ctx.textBaseline = "top";
        ctx.font = "14px Arial";
        ctx.fillStyle = "#f60";
        ctx.fillRect(0, 0, 100, 25);
        ctx.fillStyle = "#069";
        ctx.fillText("BJ-fp-2025", 2, 15);
        ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
        ctx.fillText("BJ-fp-2025", 4, 17);
        c.push(cv.toDataURL().substring(0, 100));
      }
    } catch (_e) {
      c.push("no-canvas");
    }
    c.push(String((nav.plugins || []).length));
    c.push(String(nav.doNotTrack || ""));
    c.push(String(nav.cookieEnabled));
    return c;
  }
  function generateFingerprint() {
    var components = getComponents();
    var raw = components.join("||");
    var h1 = fnv1a(raw);
    var h2 = fnv1a(raw + "::salt::bj2025");
    return "fp-" + h1 + h2;
  }
  window.bjFingerprint = {
    generate: generateFingerprint,
    components: getComponents
  };
  try {
    var fp = generateFingerprint();
    sessionStorage.setItem("bj_fingerprint", fp);
  } catch (_e) {
  }
})();
