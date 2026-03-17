// @ts-nocheck
// js/canny.js — P13-13 Canny feedback widget integration
// Loads the Canny SDK lazily and renders the feedback widget
// inside the dashboard Feedback page.

(function() {
  'use strict';

  var BOARDS = {
    features: 'a849d0e3-f050-ad7d-8a27-2a97c7557d75',
    bugs: 'cd18438e-d296-1b9e-bcee-950805c371b8'
  };

  var _cannyLoaded = false;
  var _cannyRendered = false;
  var _activeBoard = 'features';

  // ─── Load Canny SDK ───
  function loadCannySdk(cb) {
    if (_cannyLoaded) { cb(); return; }
    if (typeof window.Canny === 'function' && window.Canny.q === undefined) {
      _cannyLoaded = true; cb(); return;
    }
    !function(w, d, i, s) {
      function l() {
        if (!d.getElementById(i)) {
          var f = d.getElementsByTagName(s)[0],
              e = d.createElement(s);
          e.type = 'text/javascript';
          e.async = true;
          e.src = 'https://sdk.canny.io/sdk.js';
          e.onload = function() { _cannyLoaded = true; cb(); };
          f.parentNode.insertBefore(e, f);
        }
      }
      if ('function' != typeof w.Canny) {
        var c = function() { c.q.push(arguments); };
        c.q = [];
        w.Canny = c;
        if ('complete' === d.readyState) l();
        else w.addEventListener('load', l, false);
      }
      // If DOM is already loaded, fire immediately
      if (d.readyState === 'complete' || d.readyState === 'interactive') l();
    }(window, document, 'canny-jssdk', 'script');
  }

  // ─── Render Widget ───
  function renderCannyBoard(boardKey) {
    var token = BOARDS[boardKey];
    if (!token) return;
    _activeBoard = boardKey;

    var container = document.getElementById('canny-embed');
    if (!container) return;

    // Clear previous render
    container.innerHTML = '';
    container.removeAttribute('data-canny-rendered');

    // Determine theme
    var isDark = document.documentElement.classList.contains('dark') ||
                 document.body.classList.contains('dark') ||
                 (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

    // Get user info for Canny Identify (if logged in)
    var cannyUser = null;
    try {
      var stored = localStorage.getItem('sb-qojhagupdnbtomfoxnsf-auth-token');
      if (stored) {
        var session = JSON.parse(stored);
        if (session && session.user) {
          cannyUser = {
            email: session.user.email,
            id: session.user.id,
            name: session.user.user_metadata && session.user.user_metadata.full_name
                  ? session.user.user_metadata.full_name
                  : session.user.email.split('@')[0]
          };
        }
      }
    } catch (e) { /* anon fallback */ }

    // Identify user with Canny (for seamless auth)
    if (cannyUser) {
      Canny('identify', {
        appID: '699c653962d6fa63d58ce27f',
        user: {
          email: cannyUser.email,
          id: cannyUser.id,
          name: cannyUser.name
        }
      });
    }

    Canny('render', {
      boardToken: token,
      basePath: null,
      ssoToken: null,
      theme: isDark ? 'dark' : 'light'
    });
  }

  // ─── Switch Board ───
  window.switchCannyBoard = function(boardKey) {
    // Update tab buttons
    var featBtn = document.getElementById('canny-tab-features');
    var bugBtn = document.getElementById('canny-tab-bugs');
    if (featBtn) featBtn.classList.toggle('active', boardKey === 'features');
    if (bugBtn) bugBtn.classList.toggle('active', boardKey === 'bugs');

    loadCannySdk(function() {
      renderCannyBoard(boardKey);
    });
  };

  // ─── Init (called when Feedback page is shown) ───
  window.initCannyFeedback = function() {
    if (_cannyRendered) return;
    _cannyRendered = true;
    loadCannySdk(function() {
      renderCannyBoard(_activeBoard);
    });
  };

})();

// CS-P1-004 FE-005: Register canny exports with BJ namespace
(function() {
  ['Canny','initCannyFeedback','switchCannyBoard'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'canny', registered: Date.now() };
    }
  });
})();
