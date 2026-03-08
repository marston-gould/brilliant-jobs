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
  var TAB_CHUNKS = {
    "brilliant": ["keywords"],
    "jobs": ["keywords", "deferred"],
    "resumes": ["deferred", "keywords"],
    "pipeline": ["pipeline"],
    "tuning": ["tuning"],
    "stats": ["deferred"],
    "feedback": ["deferred"],
    "ghost": ["deferred"],
    "referrals": ["deferred"],
    "applications": ["deferred"],
    "settings": ["deferred"],
    "billing": ["deferred"],
    "rewrite": ["deferred"],
    "apply": ["deferred"],
    "chat": ["deferred"],
    "merch": ["deferred"],
    "surveys": ["deferred"]
  };
  function bjEnsureTab(tabName) {
    var chunks = TAB_CHUNKS[tabName] || [];
    if (chunks.length === 0) return Promise.resolve([]);
    var promises = [];
    for (var i = 0; i < chunks.length; i++) {
      var chunk = chunks[i];
      if (chunk) promises.push(bjLoadChunk(chunk));
    }
    return Promise.all(promises);
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
