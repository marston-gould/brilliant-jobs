// ============================================================
// CS-016 FIX-10: Lazy Loader — Dynamic script chunk loading
// CS-P1-015: TypeScript strict mode
// ============================================================

(function(): void {
  'use strict';

  var _loaded: Record<string, boolean> = {};
  var _loading: Record<string, Promise<void>> = {};
  var _version: string = typeof BJ_VERSION !== 'undefined' ? BJ_VERSION : 'v0';

  function bjLoadChunk(chunkName: ChunkName): Promise<void> {
    if (_loaded[chunkName]) {
      return Promise.resolve();
    }
    if (_loading[chunkName]) {
      return _loading[chunkName];
    }

    var promise = new Promise<void>(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = '/dist/dashboard-' + chunkName + '.min.js?v=' + _version;
      script.async = true;
      script.onload = function(): void {
        _loaded[chunkName] = true;
        delete _loading[chunkName];
        resolve();
      };
      script.onerror = function(): void {
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

  // Chunk dependency map: if chunk A depends on chunk B,
  // B must finish loading before A starts executing.
  // This prevents cross-chunk ReferenceErrors (e.g. deferred
  // calling buildReadinessSide from keywords before it loads).
  var CHUNK_DEPS: Record<string, string[]> = {
    'deferred': ['keywords'],  // resumes.js calls buildInlineGrade, buildReadinessSide, tokenize from keywords.js
  };

  var TAB_CHUNKS: Record<TabName, ChunkName[]> = {
    'brilliant':    ['keywords'],
    'jobs':         ['keywords', 'deferred'],
    'setup':        ['keywords', 'deferred'],  // connectGoogleDrive, connectGoogleCalendar in integrations.js (deferred)
    'resumes':      ['keywords', 'deferred'],  // keywords MUST load before deferred
    'pipeline':     ['pipeline'],
    'tuning':       ['keywords', 'tuning'],    // keywords before tuning (uses shared fns)
    'stats':        ['keywords', 'deferred'],  // ensure keywords available
    'feedback':     ['keywords', 'deferred'],
    'ghost':        ['keywords', 'deferred'],
    'referrals':    ['keywords', 'deferred'],
    'applications': ['keywords', 'deferred'],
    'settings':     ['keywords', 'deferred'],
    'billing':      ['keywords', 'deferred'],
    'rewrite':      ['keywords', 'deferred'],
    'apply':        ['keywords', 'deferred'],
    'chat':         ['keywords', 'deferred'],
    'merch':        ['keywords', 'deferred'],
    'surveys':      ['keywords', 'deferred'],
  };

  // Sequential chunk loader: respects dependency ordering.
  // Chunks listed in TAB_CHUNKS are loaded in order — each chunk
  // waits for the previous one to finish before starting.
  // This guarantees cross-chunk functions are available when called.
  function bjEnsureTab(tabName: TabName): Promise<void[]> {
    var chunks = TAB_CHUNKS[tabName] || [];
    if (chunks.length === 0) return Promise.resolve([]);

    // Deduplicate while preserving order
    var seen: Record<string, boolean> = {};
    var ordered: ChunkName[] = [];
    for (var i = 0; i < chunks.length; i++) {
      var c = chunks[i];
      if (c && !seen[c]) { seen[c] = true; ordered.push(c); }
    }

    // Load sequentially: each chunk waits for its predecessor
    var chain: Promise<void> = Promise.resolve();
    var results: Promise<void>[] = [];
    for (var j = 0; j < ordered.length; j++) {
      (function(chunk: ChunkName) {
        chain = chain.then(function() {
          return bjLoadChunk(chunk);
        });
        results.push(chain);
      })(ordered[j]);
    }
    return Promise.all(results);
  }

  function bjPreloadChunks(chunkNames: ChunkName[]): void {
    var doPreload = function(): void {
      for (var i = 0; i < chunkNames.length; i++) {
        var chunk = chunkNames[i];
        if (chunk) bjLoadChunk(chunk);
      }
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(doPreload, { timeout: 3000 });
    } else {
      setTimeout(doPreload, 2000);
    }
  }

  _loaded['shell'] = true;
  _loaded['feed'] = true;

  window.bjLoadChunk = bjLoadChunk;
  window.bjEnsureTab = bjEnsureTab as unknown as (tabName: TabName) => Promise<void>;
  window.bjPreloadChunks = bjPreloadChunks;
})();

// CS-P1-004 FE-005: Register lazy-loader exports with BJ namespace
(function(): void {
  (['bjEnsureTab', 'bjLoadChunk', 'bjPreloadChunks'] as const).forEach(function(name) {
    var fn = (window as Record<string, unknown>)[name];
    if (typeof fn === 'function') {
      (window.BJ as Record<string, unknown>)[name] = fn;
      window.BJ._registry[name] = { module: 'lazy-loader', registered: Date.now() };
    }
  });
})();
