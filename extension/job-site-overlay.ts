// extension/job-site-overlay.ts — EXT-AS-3: Job Site Overlay
// Content script: Save-to-BJ-Pipeline button + Apply button interception.
// Injected by contentScript.ts on all supported ATS/job listing pages.
// Uses Shadow DOM for style isolation. Reads application mode from chrome.storage.
//
// 9 sites supported: LinkedIn, Indeed, Greenhouse, Lever, Glassdoor,
// Ashby, Workable, Recruitee, Handshake.
//
// Message protocol:
//   SAVE_TO_PIPELINE  → background.ts (save job metadata to pipeline)
//   APPLY_INTERCEPTED → background.ts (apply button clicked, mode-based routing)

(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────
  const OVERLAY_ID = 'bj-job-site-overlay';
  const SHADOW_HOST_ID = 'bj-overlay-shadow-host';
  const SAVE_BTN_ID = 'bj-save-pipeline-btn';
  const INTERCEPT_ATTR = 'data-bj-intercepted';

  // ── Prevent double-injection ──────────────────────────────────
  if (document.getElementById(SHADOW_HOST_ID)) return;

  // ── Job Site Registry (inline for MAIN world script) ──────────
  // Mirrors selectors/job-site-registry.ts — injected as IIFE, no imports.
  var JOB_SITE_REGISTRY = [
    {
      platform: 'linkedin',
      urlPattern: /linkedin\.com\/jobs\/(view|collections|search)/,
      hostPattern: /linkedin\.com$/,
      applyButtonSelectors: [
        'button.jobs-apply-button',
        '.jobs-s-apply button',
        'button[data-control-name="jobdetails_topcard_inapply"]',
        '.jobs-apply-button--top-card',
      ],
      saveButtonTarget: {
        position: 'adjacent',
        selector: '.jobs-save-button, button[data-control-name="save_job"]',
      },
      jobMetaSelectors: {
        title: ['.job-details-jobs-unified-top-card__job-title', 'h1.t-24', '.jobs-unified-top-card__job-title'],
        company: ['.job-details-jobs-unified-top-card__company-name a', '.jobs-unified-top-card__company-name a', '.job-details-jobs-unified-top-card__company-name'],
        location: ['.job-details-jobs-unified-top-card__bullet', '.jobs-unified-top-card__bullet'],
      },
    },
    {
      platform: 'indeed',
      urlPattern: /indeed\.com\/viewjob|indeed\.com\/jobs\?|indeed\.com\/rc\/clk/,
      hostPattern: /indeed\.com$/,
      applyButtonSelectors: [
        '#indeedApplyButton',
        'button[id*="apply"]',
        '.jobsearch-IndeedApplyButton-newDesign button',
        'button[data-testid="indeedApplyButton"]',
      ],
      saveButtonTarget: {
        position: 'after',
        selector: '#jobsearch-ViewJobButtons-container, .jobsearch-ViewJobButtons-container',
      },
      jobMetaSelectors: {
        title: ['.jobsearch-JobInfoHeader-title', 'h1[data-testid="jobsearch-JobInfoHeader-title"]', '.icl-u-xs-mb--xs h1'],
        company: ['[data-testid="inlineHeader-companyName"] a', '.jobsearch-InlineCompanyRating a', '[data-company-name="true"]'],
        location: ['[data-testid="job-location"]', '[data-testid="inlineHeader-companyLocation"]'],
      },
    },
    {
      platform: 'greenhouse',
      urlPattern: /greenhouse\.io\/(embed\/)?job/,
      hostPattern: /greenhouse\.io$/,
      applyButtonSelectors: ['#submit_app', 'button[type="submit"]', 'input[type="submit"]', '.btn-submit'],
      saveButtonTarget: { position: 'before', selector: '#application-form, #app_body form, .application-form' },
      jobMetaSelectors: {
        title: ['.app-title', 'h1.job-post-name', '[class*="opening-title"]'],
        company: ['.company-name', '[class*="company"]'],
      },
    },
    {
      platform: 'lever',
      urlPattern: /jobs\.lever\.co\/.+/,
      hostPattern: /lever\.co$/,
      applyButtonSelectors: ['.postings-btn-wrapper .postings-btn', '.postings-btn', 'a[data-qa="btn-apply"]', 'a.postings-btn[href*="apply"]'],
      saveButtonTarget: { position: 'adjacent', selector: '.postings-btn-wrapper' },
      jobMetaSelectors: {
        title: ['.posting-headline h2', 'h2[data-qa="posting-name"]'],
        company: ['.posting-headline .company-name', '.posting-categories .sort-by-team'],
        location: ['.posting-categories .sort-by-location', '.location'],
      },
    },
    {
      platform: 'glassdoor',
      urlPattern: /glassdoor\.(com|co\.\w+)\/job-listing/,
      hostPattern: /glassdoor\.(com|co\.\w+)$/,
      applyButtonSelectors: ['button[data-test="apply-button"]', 'button[data-test="applyButton"]', '.apply-button-wrapper button', '.applyButton'],
      saveButtonTarget: { position: 'after', selector: '[data-test="location"], [data-test="employer-location"]' },
      jobMetaSelectors: {
        title: ['[data-test="job-details-header"] h1', '[data-test="jobTitle"]', '.JobDetails_jobTitle__Rw_gn'],
        company: ['[data-test="employer-name"]', '.EmployerProfile_compactEmployerName__LE242'],
        location: ['[data-test="location"]', '[data-test="employer-location"]'],
      },
    },
    {
      platform: 'ashby',
      urlPattern: /jobs\.ashbyhq\.com\/.+/,
      hostPattern: /ashbyhq\.com$/,
      applyButtonSelectors: ['button.ashby-apply-btn', 'button[class*="apply"]', 'a[href*="/application"]'],
      saveButtonTarget: { position: 'before', selector: '.ashby-job-posting-brief-info, .ashby-job-posting-brief' },
      jobMetaSelectors: {
        title: ['h1.ashby-job-posting-heading', 'h1[class*="posting-heading"]'],
        company: ['.ashby-job-posting-company-name', '[class*="company-name"]'],
        location: ['.ashby-job-posting-location', '[class*="posting-location"]'],
      },
    },
    {
      platform: 'workable',
      urlPattern: /apply\.workable\.com\/.+/,
      hostPattern: /workable\.com$/,
      applyButtonSelectors: ['button[data-ui="submit-application"]', 'button[data-ui="submit"]', 'button[type="submit"]'],
      saveButtonTarget: { position: 'before', selector: '[data-ui="job-overview"], [data-ui="job-details"]' },
      jobMetaSelectors: {
        title: ['[data-ui="job-title"]', 'h1[data-ui="job-title"]'],
        company: ['[data-ui="company-name"]', '[class*="company-name"]'],
        location: ['[data-ui="job-location"]'],
      },
    },
    {
      platform: 'recruitee',
      urlPattern: /\.recruitee\.com\/o\//,
      hostPattern: /recruitee\.com$/,
      applyButtonSelectors: ['.apply-button', 'button.btn-apply', 'a.apply-button', 'button[class*="apply"]'],
      saveButtonTarget: { position: 'adjacent', selector: '.apply-button, button.btn-apply' },
      jobMetaSelectors: {
        title: ['.job-details__title', 'h1.offer-title'],
        company: ['.job-details__company', '.company-name'],
        location: ['.job-details__location', '.offer-location'],
      },
    },
    {
      platform: 'handshake',
      urlPattern: /joinhandshake\.com\/stu\/jobs/,
      hostPattern: /joinhandshake\.com$/,
      applyButtonSelectors: ['button[data-hook="apply-button"]', 'button[data-hook="apply"]', 'a[data-hook="apply-button"]'],
      saveButtonTarget: { position: 'after', selector: '[data-hook="job-actions"], [data-hook="job-detail-actions"]' },
      jobMetaSelectors: {
        title: ['[data-hook="job-title"]', 'h1[data-hook="job-title"]'],
        company: ['[data-hook="employer-name"]', '[data-hook="company-name"]'],
        location: ['[data-hook="job-location"]'],
      },
    },
  ];

  // ── Detect current site ───────────────────────────────────────
  var hostname = window.location.hostname;
  var pageUrl = window.location.href;
  var currentSite = null;
  for (var i = 0; i < JOB_SITE_REGISTRY.length; i++) {
    var entry = JOB_SITE_REGISTRY[i];
    if (entry.hostPattern.test(hostname) && entry.urlPattern.test(pageUrl)) {
      currentSite = entry;
      break;
    }
  }
  if (!currentSite) return; // Not a recognized job page — bail

  // ── Application mode state ────────────────────────────────────
  var _applicationMode = 'manual';
  var _scoreThreshold = 75;
  var _activeResumeId = null;
  var _dailyApplyLimit = 25;
  var _saved = false; // Track if current job is already saved

  // Load settings from chrome.storage
  function loadSettings() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    try {
      chrome.storage.sync.get(['applicationMode', 'scoreThreshold'], function (syncData) {
        if (syncData.applicationMode) _applicationMode = syncData.applicationMode;
        if (syncData.scoreThreshold) _scoreThreshold = syncData.scoreThreshold;
      });
      chrome.storage.local.get(['applySettings'], function (localData) {
        if (localData.applySettings) {
          var s = localData.applySettings;
          if (s.applicationMode) _applicationMode = s.applicationMode;
          if (s.scoreThreshold) _scoreThreshold = s.scoreThreshold;
          if (s.activeResumeId) _activeResumeId = s.activeResumeId;
          if (s.dailyApplyLimit) _dailyApplyLimit = s.dailyApplyLimit;
        }
      });
    } catch (e) {
      console.warn('[BJ Overlay] Settings load error:', e.message);
    }
  }
  loadSettings();

  // Listen for settings changes from popup/dashboard sync
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'sync') {
        if (changes.applicationMode) _applicationMode = changes.applicationMode.newValue;
        if (changes.scoreThreshold) _scoreThreshold = changes.scoreThreshold.newValue;
      }
      if (area === 'local' && changes.applySettings) {
        var s = changes.applySettings.newValue || {};
        if (s.applicationMode) _applicationMode = s.applicationMode;
        if (s.scoreThreshold) _scoreThreshold = s.scoreThreshold;
        if (s.activeResumeId) _activeResumeId = s.activeResumeId;
        if (s.dailyApplyLimit) _dailyApplyLimit = s.dailyApplyLimit;
      }
    });
  }

  // ── Helper: query with fallback ───────────────────────────────
  function qFallback(selectors) {
    for (var j = 0; j < selectors.length; j++) {
      try {
        var el = document.querySelector(selectors[j]);
        if (el) return el;
      } catch (_) { /* invalid selector */ }
    }
    return null;
  }

  // ── Parse job metadata from current page ──────────────────────
  function parseJobMeta() {
    var meta = {
      url: window.location.href,
      title: '',
      company: '',
      location: '',
      platform: currentSite.platform,
    };
    var ms = currentSite.jobMetaSelectors;
    if (ms.title) {
      var titleEl = qFallback(ms.title);
      if (titleEl) meta.title = titleEl.textContent.trim();
    }
    if (ms.company) {
      var compEl = qFallback(ms.company);
      if (compEl) meta.company = compEl.textContent.trim();
    }
    if (ms.location) {
      var locEl = qFallback(ms.location);
      if (locEl) meta.location = locEl.textContent.trim();
    }
    // Fallback: use document title
    if (!meta.title) {
      meta.title = document.title.split(' - ')[0].split(' | ')[0].trim();
    }
    return meta;
  }

  // ── Send message to background ────────────────────────────────
  function sendMsg(type, payload, callback) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      console.warn('[BJ Overlay] chrome.runtime not available');
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: type, payload: payload }, function (resp) {
        if (chrome.runtime.lastError) {
          console.warn('[BJ Overlay] Message error:', chrome.runtime.lastError.message);
        }
        if (callback) callback(resp);
      });
    } catch (e) {
      console.warn('[BJ Overlay] sendMessage error:', e.message);
    }
  }

  // ── Shadow DOM host for BJ overlay elements ───────────────────
  function getShadowRoot() {
    var host = document.getElementById(SHADOW_HOST_ID);
    if (host && host.shadowRoot) return host.shadowRoot;
    host = document.createElement('div');
    host.id = SHADOW_HOST_ID;
    host.style.cssText = 'all:initial;position:relative;z-index:2147483646;';
    document.body.appendChild(host);
    return host.attachShadow({ mode: 'open' });
  }

  // ── CSS for Save button ───────────────────────────────────────
  var SAVE_BTN_CSS = [
    '#' + SAVE_BTN_ID + ' {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 6px;',
    '  padding: 8px 16px;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '  font-size: 13px;',
    '  font-weight: 600;',
    '  color: #fff;',
    '  background: linear-gradient(135deg, #6366f1, #8b5cf6);',
    '  border: none;',
    '  border-radius: 6px;',
    '  cursor: pointer;',
    '  transition: all 0.15s ease;',
    '  white-space: nowrap;',
    '  line-height: 1;',
    '  box-shadow: 0 1px 3px rgba(0,0,0,0.12);',
    '}',
    '#' + SAVE_BTN_ID + ':hover {',
    '  background: linear-gradient(135deg, #4f46e5, #7c3aed);',
    '  box-shadow: 0 2px 6px rgba(99,102,241,0.4);',
    '  transform: translateY(-1px);',
    '}',
    '#' + SAVE_BTN_ID + '.bj-saved {',
    '  background: #22c55e;',
    '  cursor: default;',
    '  pointer-events: none;',
    '}',
    '#' + SAVE_BTN_ID + ' .bj-icon {',
    '  width: 14px;',
    '  height: 14px;',
    '  fill: none;',
    '  stroke: currentColor;',
    '  stroke-width: 2;',
    '  stroke-linecap: round;',
    '  stroke-linejoin: round;',
    '}',
    '.bj-toast {',
    '  position: fixed;',
    '  bottom: 24px;',
    '  right: 24px;',
    '  padding: 12px 20px;',
    '  background: #1e1b4b;',
    '  color: #e0e7ff;',
    '  border-radius: 8px;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '  font-size: 13px;',
    '  box-shadow: 0 4px 12px rgba(0,0,0,0.3);',
    '  z-index: 2147483647;',
    '  opacity: 0;',
    '  transform: translateY(10px);',
    '  transition: opacity 0.3s ease, transform 0.3s ease;',
    '}',
    '.bj-toast.bj-show {',
    '  opacity: 1;',
    '  transform: translateY(0);',
    '}',
    '.bj-mode-badge {',
    '  display: inline-block;',
    '  padding: 2px 6px;',
    '  font-size: 10px;',
    '  font-weight: 600;',
    '  border-radius: 3px;',
    '  background: #312e81;',
    '  color: #c7d2fe;',
    '  margin-left: 6px;',
    '  text-transform: uppercase;',
    '  letter-spacing: 0.5px;',
    '}',
  ].join('\n');

  // ── Lucide-style SVG icons (inline, no CDN dependency) ────────
  var ICON_SAVE = '<svg class="bj-icon" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
  var ICON_CHECK = '<svg class="bj-icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>';

  // ── Show toast notification ───────────────────────────────────
  function showToast(message, duration) {
    var shadow = getShadowRoot();
    var existing = shadow.querySelector('.bj-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'bj-toast';
    toast.textContent = message;
    shadow.appendChild(toast);

    requestAnimationFrame(function () {
      toast.classList.add('bj-show');
    });

    setTimeout(function () {
      toast.classList.remove('bj-show');
      setTimeout(function () { toast.remove(); }, 300);
    }, duration || 3000);
  }

  // ── Inject Save-to-Pipeline button ────────────────────────────
  function injectSaveButton() {
    // Check if already injected
    if (document.querySelector('[data-bj-save-injected]')) return;

    var target = qFallback([currentSite.saveButtonTarget.selector]);
    if (!target) {
      // Retry after DOM settles (SPAs)
      setTimeout(function () {
        target = qFallback([currentSite.saveButtonTarget.selector]);
        if (target) _doInjectSave(target);
      }, 2000);
      return;
    }
    _doInjectSave(target);
  }

  function _doInjectSave(target) {
    var btn = document.createElement('button');
    btn.id = SAVE_BTN_ID;
    btn.setAttribute('data-bj-save-injected', 'true');
    btn.innerHTML = ICON_SAVE + ' Save to BJ';
    btn.title = 'Save this job to your Brilliant Jobs pipeline';

    // Apply inline styles as fallback (Shadow DOM may not be ancestor)
    btn.style.cssText = [
      'display:inline-flex;align-items:center;gap:6px;',
      'padding:8px 16px;',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
      'font-size:13px;font-weight:600;',
      'color:#fff;',
      'background:linear-gradient(135deg,#6366f1,#8b5cf6);',
      'border:none;border-radius:6px;cursor:pointer;',
      'white-space:nowrap;line-height:1;',
      'box-shadow:0 1px 3px rgba(0,0,0,0.12);',
      'margin:4px 8px;vertical-align:middle;',
    ].join('');

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (_saved) return;

      var meta = parseJobMeta();
      sendMsg('SAVE_TO_PIPELINE', {
        url: meta.url,
        title: meta.title,
        company: meta.company,
        location: meta.location,
        platform: meta.platform,
      }, function (resp) {
        if (resp && resp.success) {
          _saved = true;
          btn.innerHTML = ICON_CHECK + ' Saved';
          btn.style.background = '#22c55e';
          btn.style.cursor = 'default';
          btn.style.pointerEvents = 'none';
          showToast('Saved to Brilliant Jobs pipeline');
        } else {
          showToast('Save failed — try again');
        }
      });
    });

    // Insert based on position strategy
    var pos = currentSite.saveButtonTarget.position;
    if (pos === 'before') {
      target.parentNode.insertBefore(btn, target);
    } else if (pos === 'after') {
      target.parentNode.insertBefore(btn, target.nextSibling);
    } else {
      // adjacent — insert next to target
      target.parentNode.insertBefore(btn, target.nextSibling);
    }
  }

  // ── Apply button interception ─────────────────────────────────
  function interceptApplyButtons() {
    var selectors = currentSite.applyButtonSelectors;
    for (var k = 0; k < selectors.length; k++) {
      try {
        var buttons = document.querySelectorAll(selectors[k]);
        for (var b = 0; b < buttons.length; b++) {
          _attachInterceptor(buttons[b]);
        }
      } catch (_) { /* invalid selector */ }
    }
  }

  function _attachInterceptor(button) {
    if (button.getAttribute(INTERCEPT_ATTR)) return; // Already intercepted
    button.setAttribute(INTERCEPT_ATTR, 'true');

    button.addEventListener('click', function (e) {
      // Manual mode: no interception — let native behavior proceed
      if (_applicationMode === 'manual') return;

      // All other modes: intercept the click
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      var meta = parseJobMeta();
      var payload = {
        url: meta.url,
        title: meta.title,
        company: meta.company,
        location: meta.location,
        platform: meta.platform,
        mode: _applicationMode,
        scoreThreshold: _scoreThreshold,
        resumeId: _activeResumeId,
        dailyApplyLimit: _dailyApplyLimit,
      };

      // Show mode-specific feedback
      var modeLabels = {
        'score-gated': 'Scoring resume...',
        'auto-apply': 'Auto-applying...',
        'auto-score-gate': 'Scoring + applying...',
        'auto-rewrite': 'Rewriting + applying...',
        'full-autopilot': 'Full autopilot...',
      };
      var label = modeLabels[_applicationMode] || 'Processing...';
      showToast(label);

      // Send interception message to background
      sendMsg('APPLY_INTERCEPTED', payload, function (resp) {
        if (resp && resp.status === 'received') {
          // Background acknowledged — further flow handled by EXT-AS-4/5/6
          console.log('[BJ Overlay] Apply intercepted:', _applicationMode);
        } else {
          // Fallback: let native apply proceed
          showToast('BJ processing unavailable — applying natively');
          button.removeAttribute(INTERCEPT_ATTR);
          button.click();
        }
      });
    }, true); // Capture phase — fires before site's own handlers
  }

  // ── MutationObserver for SPA navigation ───────────────────────
  // Sites like LinkedIn, Indeed, Glassdoor are SPAs — DOM changes on navigation.
  var _observerDebounce = null;
  var _observer = new MutationObserver(function () {
    clearTimeout(_observerDebounce);
    _observerDebounce = setTimeout(function () {
      // Re-check if we're still on a job page
      var newUrl = window.location.href;
      var stillOnJobPage = currentSite.urlPattern.test(newUrl);
      if (stillOnJobPage) {
        injectSaveButton();
        interceptApplyButtons();
      }
    }, 500);
  });

  // Observe body for DOM changes (SPA nav, lazy-loaded content)
  _observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // ── SPA URL change detection (pushState/replaceState) ─────────
  var _lastUrl = window.location.href;
  function checkUrlChange() {
    var newUrl = window.location.href;
    if (newUrl !== _lastUrl) {
      _lastUrl = newUrl;
      _saved = false; // Reset save state on navigation
      // Remove old save button
      var oldBtn = document.querySelector('[data-bj-save-injected]');
      if (oldBtn) oldBtn.remove();
      // Re-detect and re-inject after DOM settles
      setTimeout(function () {
        if (currentSite.urlPattern.test(newUrl)) {
          injectSaveButton();
          interceptApplyButtons();
        }
      }, 1000);
    }
  }

  // Intercept pushState/replaceState for SPA navigation detection
  var _origPushState = history.pushState;
  var _origReplaceState = history.replaceState;
  history.pushState = function () {
    _origPushState.apply(history, arguments);
    checkUrlChange();
  };
  history.replaceState = function () {
    _origReplaceState.apply(history, arguments);
    checkUrlChange();
  };
  window.addEventListener('popstate', checkUrlChange);

  // ── Initial injection ─────────────────────────────────────────
  // Wait for DOM to be ready, then inject
  function init() {
    injectSaveButton();
    interceptApplyButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM already ready — inject after short delay for SPA hydration
    setTimeout(init, 500);
  }

  // ── Exports for testing ───────────────────────────────────────
  window._bjJobSiteOverlay = {
    currentSite: currentSite,
    parseJobMeta: parseJobMeta,
    injectSaveButton: injectSaveButton,
    interceptApplyButtons: interceptApplyButtons,
    getMode: function () { return _applicationMode; },
    getThreshold: function () { return _scoreThreshold; },
    isSaved: function () { return _saved; },
  };

})();
