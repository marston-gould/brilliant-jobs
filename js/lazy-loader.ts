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

  var TAB_CHUNKS: Record<TabName, ChunkName[]> = {
    'brilliant':    ['keywords'],
    'jobs':         ['keywords', 'deferred'],
    'resumes':      ['deferred', 'keywords'],
    'pipeline':     ['pipeline'],
    'tuning':       ['tuning', 'keywords'],
    'stats':        ['deferred'],
    'feedback':     ['deferred'],
    'ghost':        ['deferred'],
    'referrals':    ['deferred'],
    'applications': ['deferred'],
    'settings':     ['deferred'],
    'billing':      ['deferred'],
    'rewrite':      ['deferred'],
    'apply':        ['deferred'],
    'chat':         ['deferred'],
    'merch':        ['deferred'],
    'surveys':      ['deferred'],
  };

  function bjEnsureTab(tabName: TabName): Promise<void[]> {
    var chunks = TAB_CHUNKS[tabName] || [];
    if (chunks.length === 0) return Promise.resolve([]);

    var promises: Promise<void>[] = [];
    for (var i = 0; i < chunks.length; i++) {
      var chunk = chunks[i];
      if (chunk) promises.push(bjLoadChunk(chunk));
    }
    return Promise.all(promises);
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
