/**
 * CS-015: FIX-09 (FE-002) Error Boundaries + FIX-15 (FE-003) Skeleton Loaders
 * 
 * bjTabGuard — wraps tab initialization with error catching + fallback UI
 * bjSkeleton — shows/hides skeleton loading states per tab
 * 
 * Usage:
 *   bjTabGuard('stats', () => initStatsPage());
 *   bjSkeleton.show('jobs');
 *   bjSkeleton.hide('jobs');
 */

(function() {
  'use strict';

  // ─── Error Boundary ───────────────────────────────────────

  /**
   * Wrap a tab initialization function with error boundary.
   * On error: shows fallback UI with error message + retry button.
   * On success: hides skeleton, shows content.
   */
  window.bjTabGuard = function bjTabGuard(tabName, initFn) {
    try {
      var result = initFn();
      // Handle async init functions (Promises)
      if (result && typeof result.then === 'function') {
        result.then(function() {
          bjSkeleton.hide(tabName);
        }).catch(function(err) {
          _showTabError(tabName, err);
        });
      } else {
        bjSkeleton.hide(tabName);
      }
    } catch (err) {
      _showTabError(tabName, err);
    }
  };

  function _showTabError(tabName, err) {
    var page = document.getElementById('page-' + tabName);
    if (!page) return;

    // Report to PostHog
    if (window.bjError) {
      window.bjError('tab-crash:' + tabName, err);
    } else if (window.posthog) {
      posthog.capture('tab_crash', { tab: tabName, error: String(err) });
    }

    // Hide skeleton if present
    var skel = page.querySelector('.bj-tab-skeleton');
    if (skel) skel.style.display = 'none';

    // Check if fallback already exists
    var existing = page.querySelector('.bj-tab-error');
    if (existing) {
      existing.style.display = 'flex';
      return;
    }

    // Create fallback UI
    var fallback = document.createElement('div');
    fallback.className = 'bj-tab-error';
    fallback.setAttribute('role', 'alert');
    fallback.innerHTML =
      '<div class="bj-tab-error-icon"><i data-lucide="triangle-alert" class="icon-lg icon-stroke-lg" style="color:var(--warm)"></i></div>' +
      '<h3 class="bj-tab-error-title">Something went wrong</h3>' +
      '<p class="bj-tab-error-msg">This section encountered an error while loading. ' +
        'Your other tabs are still working fine.</p>' +
      '<p class="bj-tab-error-detail" style="font-size:11px;color:var(--text-dim);margin:4px 0 12px;">' +
        (err && err.message ? err.message : String(err)) + '</p>' +
      '<button class="btn btn-primary btn-sm bj-tab-retry" type="button">Try again</button>';

    // Retry button: reload the page as a clean reset for the tab
    fallback.querySelector('.bj-tab-retry').addEventListener('click', function() {
      fallback.style.display = 'none';
      // Re-trigger the tab click to re-init
      var navItem = document.querySelector('.nav-item[data-page="' + tabName + '"]');
      if (navItem) navItem.click();
    });

    page.insertBefore(fallback, page.firstChild);
  }


  // ─── Skeleton Loaders ─────────────────────────────────────

  var _skeletonConfig = {
    'brilliant': { rows: 3, type: 'card' },
    'setup':     { rows: 4, type: 'form' },
    'jobs':      { rows: 8, type: 'table' },
    'tuning':    { rows: 5, type: 'form' },
    'resumes':   { rows: 4, type: 'card' },
    'applications': { rows: 5, type: 'table' },
    'notifications': { rows: 6, type: 'list' },
    // FB-GHOST-BADGE-001: 'ghost' tab removed — Ghost Monitor page deleted
    'stats':     { rows: 3, type: 'chart' },
    'settings':  { rows: 5, type: 'form' },
    'subscription': { rows: 3, type: 'card' },
    'feedback':  { rows: 4, type: 'card' },
    'referrals': { rows: 4, type: 'card' },
  };

  function _buildSkeleton(type, rows) {
    var html = '<div class="bj-tab-skeleton" aria-label="Loading content" role="status">';
    for (var i = 0; i < rows; i++) {
      switch (type) {
        case 'table':
          html += '<div class="bj-skel-row">' +
            '<div class="skel-line" style="width:5%;height:14px;"></div>' +
            '<div class="skel-line" style="width:30%;"></div>' +
            '<div class="skel-line" style="width:20%;"></div>' +
            '<div class="skel-line" style="width:15%;"></div>' +
            '<div class="skel-line" style="width:12%;"></div>' +
          '</div>';
          break;
        case 'card':
          html += '<div class="bj-skel-card">' +
            '<div class="skel-line" style="width:60%;height:16px;margin-bottom:10px;"></div>' +
            '<div class="skel-line" style="width:90%;"></div>' +
            '<div class="skel-line" style="width:75%;"></div>' +
          '</div>';
          break;
        case 'form':
          html += '<div class="bj-skel-form-row">' +
            '<div class="skel-line" style="width:120px;height:14px;"></div>' +
            '<div class="skel-line" style="width:100%;height:36px;border-radius:6px;"></div>' +
          '</div>';
          break;
        case 'chart':
          html += '<div class="bj-skel-chart">' +
            '<div class="skel-line" style="width:40%;height:18px;margin-bottom:12px;"></div>' +
            '<div class="skel-line" style="width:100%;height:120px;border-radius:8px;"></div>' +
          '</div>';
          break;
        case 'list':
          html += '<div class="bj-skel-list-item">' +
            '<div class="skel-line" style="width:24px;height:24px;border-radius:50%;flex-shrink:0;"></div>' +
            '<div style="flex:1;">' +
              '<div class="skel-line" style="width:65%;margin-bottom:6px;"></div>' +
              '<div class="skel-line" style="width:45%;height:10px;"></div>' +
            '</div>' +
          '</div>';
          break;
      }
    }
    html += '</div>';
    return html;
  }

  window.bjSkeleton = {
    /**
     * Show skeleton loader for a tab. Injects skeleton HTML if not already present.
     */
    show: function(tabName) {
      var page = document.getElementById('page-' + tabName);
      if (!page) return;

      var config = _skeletonConfig[tabName] || { rows: 4, type: 'card' };
      var existing = page.querySelector('.bj-tab-skeleton');

      if (existing) {
        existing.style.display = '';
      } else {
        // Insert skeleton at top of page
        var wrapper = document.createElement('div');
        wrapper.innerHTML = _buildSkeleton(config.type, config.rows);
        var skel = wrapper.firstChild;
        page.insertBefore(skel, page.firstChild);
      }

      // Hide real content temporarily
      var children = page.children;
      for (var i = 0; i < children.length; i++) {
        if (!children[i].classList.contains('bj-tab-skeleton') &&
            !children[i].classList.contains('bj-tab-error')) {
          children[i].dataset.bjHidden = children[i].style.display;
          children[i].style.display = 'none';
        }
      }
    },

    /**
     * Hide skeleton loader and restore real content.
     */
    hide: function(tabName) {
      var page = document.getElementById('page-' + tabName);
      if (!page) return;

      var skel = page.querySelector('.bj-tab-skeleton');
      if (skel) skel.style.display = 'none';

      // Restore real content
      var children = page.children;
      for (var i = 0; i < children.length; i++) {
        if (children[i].dataset.bjHidden !== undefined) {
          children[i].style.display = children[i].dataset.bjHidden;
          delete children[i].dataset.bjHidden;
        }
      }
    }
  };

})();

// CS-P1-004 FE-005: Register tab-guard exports with BJ namespace
(function() {
  ['bjSkeleton','bjTabGuard'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'tab-guard', registered: Date.now() };
    }
  });
})();
