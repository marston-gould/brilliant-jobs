(function() {
  "use strict";
  var _loaded = {};
  var _loading = {};
  var _version = typeof BJ_VERSION !== "undefined" ? BJ_VERSION : "v0";
  function bjLoadChunk(chunkName) {
    if (_loaded[chunkName]) {
      return Promise.resolve();
    }
    if (_loading[chunkName]) {
      return _loading[chunkName];
    }
    var promise = new Promise(function(resolve, reject) {
      var script = document.createElement("script");
      script.src = "/dist/dashboard-" + chunkName + ".min.js?v=" + _version;
      script.async = true;
      script.onload = function() {
        _loaded[chunkName] = true;
        delete _loading[chunkName];
        resolve();
      };
      script.onerror = function() {
        delete _loading[chunkName];
        var err = new Error("Failed to load chunk: " + chunkName);
        if (typeof reportError === "function") reportError("lazy-loader", err);
        reject(err);
      };
      document.head.appendChild(script);
    });
    _loading[chunkName] = promise;
    return promise;
  }
  var CHUNK_DEPS = {
    "deferred": ["keywords"]
    // resumes.js calls buildInlineGrade, buildReadinessSide, tokenize from keywords.js
  };
  var TAB_CHUNKS = {
    "brilliant": ["keywords"],
    "jobs": ["keywords", "deferred"],
    "setup": ["keywords", "deferred"],
    // connectGoogleDrive, connectGoogleCalendar in integrations.js (deferred)
    "resumes": ["keywords", "deferred"],
    // keywords MUST load before deferred
    "pipeline": ["pipeline"],
    "tuning": ["keywords", "tuning"],
    // keywords before tuning (uses shared fns)
    "stats": ["keywords", "deferred"],
    // ensure keywords available
    "feedback": ["keywords", "deferred"],
    "ghost": ["keywords", "deferred"],
    "referrals": ["keywords", "deferred"],
    "applications": ["pipeline", "keywords", "deferred"],
    "settings": ["keywords", "deferred"],
    "billing": ["keywords", "deferred"],
    "subscription": ["keywords", "deferred"],
    "rewrite": ["keywords", "deferred"],
    "apply": ["keywords", "deferred"],
    "chat": ["keywords", "deferred"],
    "merch": ["keywords", "deferred"],
    "surveys": ["keywords", "deferred"]
  };
  function bjEnsureTab(tabName) {
    var chunks = TAB_CHUNKS[tabName] || [];
    if (chunks.length === 0) return Promise.resolve([]);
    var seen = {};
    var ordered = [];
    for (var i = 0; i < chunks.length; i++) {
      var c = chunks[i];
      if (c && !seen[c]) {
        seen[c] = true;
        ordered.push(c);
      }
    }
    var chain = Promise.resolve();
    var results = [];
    for (var j = 0; j < ordered.length; j++) {
      (function(chunk) {
        chain = chain.then(function() {
          return bjLoadChunk(chunk);
        });
        results.push(chain);
      })(ordered[j]);
    }
    return Promise.all(results);
  }
  function bjPreloadChunks(chunkNames) {
    var doPreload = function() {
      for (var i = 0; i < chunkNames.length; i++) {
        var chunk = chunkNames[i];
        if (chunk) bjLoadChunk(chunk);
      }
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(doPreload, { timeout: 3e3 });
    } else {
      setTimeout(doPreload, 2e3);
    }
  }
  _loaded["shell"] = true;
  _loaded["feed"] = true;
  window.bjLoadChunk = bjLoadChunk;
  window.bjEnsureTab = bjEnsureTab;
  window.bjPreloadChunks = bjPreloadChunks;
})();
(function() {
  ["bjEnsureTab", "bjLoadChunk", "bjPreloadChunks"].forEach(function(name) {
    var fn = window[name];
    if (typeof fn === "function") {
      window.BJ[name] = fn;
      window.BJ._registry[name] = { module: "lazy-loader", registered: Date.now() };
    }
  });
})();
