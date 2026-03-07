// ============================================================
// CS-016 FIX-10: Lazy Loader — Dynamic script chunk loading
// ============================================================
// Manages on-demand loading of code-split chunks for dashboard tabs.
// Chunks are loaded once and cached; subsequent requests resolve immediately.
// ============================================================

(function() {
  'use strict';

  var _loaded = {};   // chunk name → true (loaded)
  var _loading = {};  // chunk name → Promise (in-flight)
  var _version = typeof BJ_VERSION !== 'undefined' ? BJ_VERSION : 'v0';

  /**
   * Load a script chunk by name.
   * Returns a Promise that resolves when the script has executed.
   * If already loaded, resolves immediately.
   */
  function bjLoadChunk(chunkName) {
    // Already loaded
    if (_loaded[chunkName]) {
      return Promise.resolve();
    }
    // Already loading (dedup)
    if (_loading[chunkName]) {
      return _loading[chunkName];
    }

    var promise = new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = '/dist/dashboard-' + chunkName + '.min.js?v=' + _version;
      script.async = true;
      script.onload = function() {
        _loaded[chunkName] = true;
        delete _loading[chunkName];
        resolve();
      };
      script.onerror = function() {
        delete _loading[chunkName];
        var err = new Error('Failed to load chunk: ' + chunkName);
        if (typeof reportError === 'function') reportError('lazy-loader', err);
        reject(err);
      };
      document.head.appendChild(script);
    });

    _loading[chunkName] = promise;
    return promise;
  }

  /**
   * Tab-to-chunk mapping.
   * Each tab lists the chunks it needs (loaded in order).
   */
  var TAB_CHUNKS = {
    'brilliant':  ['keywords'],  // feed chunk loaded eagerly; keywords lazy
    'resumes':    ['deferred', 'keywords'],
    'pipeline':   ['pipeline'],
    'tuning':     ['tuning'],
    'stats':      ['deferred'],
    'feedback':   ['deferred'],
    'ghost':      ['deferred'],
    'referrals':  ['deferred'],
    'applications': ['deferred'],
    'settings':   ['deferred'],
    'billing':    ['deferred'],
    'rewrite':    ['deferred'],
    'apply':      ['deferred'],
    'chat':       ['deferred'],
    'merch':      ['deferred'],
    'surveys':    ['deferred'],
  };

  /**
   * Ensure all chunks needed for a tab are loaded.
   * Returns a Promise that resolves when all chunks are ready.
   */
  function bjEnsureTab(tabName) {
    var chunks = TAB_CHUNKS[tabName] || [];
    if (chunks.length === 0) return Promise.resolve();

    var promises = [];
    for (var i = 0; i < chunks.length; i++) {
      promises.push(bjLoadChunk(chunks[i]));
    }
    return Promise.all(promises);
  }

  /**
   * Preload chunks without blocking — fire-and-forget after idle.
   */
  function bjPreloadChunks(chunkNames) {
    var doPreload = function() {
      for (var i = 0; i < chunkNames.length; i++) {
        bjLoadChunk(chunkNames[i]);
      }
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(doPreload, { timeout: 3000 });
    } else {
      setTimeout(doPreload, 2000);
    }
  }

  // Mark chunks that are loaded inline (shell + feed are in page)
  _loaded['shell'] = true;
  _loaded['feed'] = true;

  // Expose globally
  window.bjLoadChunk = bjLoadChunk;
  window.bjEnsureTab = bjEnsureTab;
  window.bjPreloadChunks = bjPreloadChunks;
})();

// CS-P1-004 FE-005: Register lazy-loader exports with BJ namespace
(function() {
  ['bjEnsureTab','bjLoadChunk','bjPreloadChunks'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'lazy-loader', registered: Date.now() };
    }
  });
})();
