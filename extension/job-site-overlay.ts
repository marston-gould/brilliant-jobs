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
  var _eeoPreferences = null; // AF-005: EEOC profile fields from chrome.storage.local
  var _saved = false; // Track if current job is already saved

  // Load settings from chrome.storage
  function loadSettings() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    try {
      chrome.storage.sync.get(['applicationMode', 'scoreThreshold'], function (syncData) {
        if (syncData.applicationMode) _applicationMode = syncData.applicationMode;
        if (syncData.scoreThreshold) _scoreThreshold = syncData.scoreThreshold;
      });
      chrome.storage.local.get(['applySettings', 'eeoPreferences'], function (localData) {
        if (localData.applySettings) {
          var s = localData.applySettings;
          if (s.applicationMode) _applicationMode = s.applicationMode;
          if (s.scoreThreshold) _scoreThreshold = s.scoreThreshold;
          if (s.activeResumeId) _activeResumeId = s.activeResumeId;
          if (s.dailyApplyLimit) _dailyApplyLimit = s.dailyApplyLimit;
        }
        // AF-005: load EEOC preferences for APPLY_INTERCEPTED payload
        if (localData.eeoPreferences) _eeoPreferences = localData.eeoPreferences;
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
      // AF-005: sync EEOC preferences when background updates them
      if (area === 'local' && changes.eeoPreferences) {
        _eeoPreferences = changes.eeoPreferences.newValue || null;
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
    // ── EXT-AS-4: Score Gate Popup CSS ──
    '.bj-score-gate-overlay {',
    '  position: fixed;',
    '  top: 0; left: 0; right: 0; bottom: 0;',
    '  background: rgba(0,0,0,0.5);',
    '  z-index: 2147483647;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '}',
    '.bj-score-gate {',
    '  background: #fff;',
    '  border-radius: 12px;',
    '  box-shadow: 0 20px 60px rgba(0,0,0,0.3);',
    '  width: 380px;',
    '  max-height: 90vh;',
    '  overflow-y: auto;',
    '  animation: bjFadeIn 0.2s ease;',
    '}',
    '@keyframes bjFadeIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }',
    '.bj-sg-header {',
    '  padding: 16px 20px 12px;',
    '  border-bottom: 1px solid #e5e7eb;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '}',
    '.bj-sg-header-left {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '}',
    '.bj-sg-logo {',
    '  width: 24px; height: 24px;',
    '  background: linear-gradient(135deg, #6366f1, #8b5cf6);',
    '  border-radius: 6px;',
    '  display: flex; align-items: center; justify-content: center;',
    '  color: #fff; font-weight: 700; font-size: 12px;',
    '}',
    '.bj-sg-title {',
    '  font-size: 14px; font-weight: 600; color: #111827;',
    '}',
    '.bj-sg-close {',
    '  background: none; border: none; cursor: pointer;',
    '  color: #9ca3af; font-size: 18px; line-height: 1;',
    '  padding: 4px; border-radius: 4px;',
    '}',
    '.bj-sg-close:hover { background: #f3f4f6; color: #374151; }',
    '.bj-sg-body { padding: 20px; text-align: center; }',
    '.bj-sg-job {',
    '  font-size: 12px; color: #6b7280; margin-bottom: 16px;',
    '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
    '}',
    '.bj-sg-ring-wrap { margin: 0 auto 16px; width: 88px; height: 88px; position: relative; }',
    '.bj-sg-score-num {',
    '  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);',
    '  font-size: 22px; font-weight: 700; line-height: 1;',
    '}',
    '.bj-sg-score-label {',
    '  position: absolute; top: 60%; left: 50%; transform: translate(-50%, 4px);',
    '  font-size: 9px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;',
    '}',
    '.bj-sg-verdict {',
    '  font-size: 15px; font-weight: 600; margin-bottom: 4px;',
    '}',
    '.bj-sg-detail { font-size: 12px; color: #6b7280; margin-bottom: 12px; }',
    '.bj-sg-badge {',
    '  display: inline-block; padding: 3px 8px; border-radius: 10px;',
    '  font-size: 11px; font-weight: 600; margin-bottom: 16px;',
    '}',
    '.bj-sg-badge.below { background: #fef2f2; color: #dc2626; }',
    '.bj-sg-badge.above { background: #f0fdf4; color: #16a34a; }',
    '.bj-sg-gaps { text-align: left; margin-bottom: 16px; }',
    '.bj-sg-gaps-title { font-size: 11px; font-weight: 600; color: #374151; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }',
    '.bj-sg-gap {',
    '  display: flex; align-items: flex-start; gap: 6px;',
    '  font-size: 12px; color: #4b5563; margin-bottom: 6px;',
    '}',
    '.bj-sg-gap-icon { flex-shrink: 0; margin-top: 1px; }',
    '.bj-sg-actions { display: flex; flex-direction: column; gap: 8px; }',
    '.bj-sg-btn {',
    '  width: 100%; padding: 10px 16px; border-radius: 8px;',
    '  font-size: 13px; font-weight: 600; cursor: pointer;',
    '  border: none; transition: all 0.15s ease;',
    '}',
    '.bj-sg-btn.primary {',
    '  background: linear-gradient(135deg, #1e1b4b, #312e81);',
    '  color: #fff;',
    '}',
    '.bj-sg-btn.primary:hover { box-shadow: 0 2px 8px rgba(30,27,75,0.4); }',
    '.bj-sg-btn.secondary {',
    '  background: #f3f4f6; color: #374151;',
    '}',
    '.bj-sg-btn.secondary:hover { background: #e5e7eb; }',
    '.bj-sg-btn.ghost {',
    '  background: transparent; color: #9ca3af;',
    '}',
    '.bj-sg-btn.ghost:hover { color: #6b7280; }',
    // Above-threshold green header
    '.bj-sg-header.above {',
    '  background: linear-gradient(135deg, #16a34a, #22c55e);',
    '  border-bottom: none; border-radius: 12px 12px 0 0;',
    '}',
    '.bj-sg-header.above .bj-sg-title { color: #fff; }',
    '.bj-sg-header.above .bj-sg-close { color: rgba(255,255,255,0.7); }',
    '.bj-sg-header.above .bj-sg-close:hover { color: #fff; background: rgba(255,255,255,0.15); }',
    '.bj-sg-auto-dismiss {',
    '  font-size: 11px; color: #6b7280; margin-top: 12px;',
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
        if (target) {
          _doInjectSave(target);
        } else {
          // EXT-AS-9: Track when save button target not found
          sendMsg('POSTHOG_CAPTURE', {
            event: 'selector_failed',
            properties: {
              site: currentSite ? currentSite.platform : 'unknown',
              selector_type: 'save_button_target',
              selector: currentSite.saveButtonTarget.selector,
              url: window.location.href,
            },
          });
        }
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
    var foundAny = false;
    for (var k = 0; k < selectors.length; k++) {
      try {
        var buttons = document.querySelectorAll(selectors[k]);
        if (buttons.length > 0) foundAny = true;
        for (var b = 0; b < buttons.length; b++) {
          _attachInterceptor(buttons[b]);
        }
      } catch (_) { /* invalid selector */ }
    }
    // EXT-AS-9: Track when no apply buttons found for this site
    if (!foundAny && _applicationMode !== 'manual') {
      sendMsg('POSTHOG_CAPTURE', {
        event: 'selector_failed',
        properties: {
          site: currentSite ? currentSite.platform : 'unknown',
          selector_type: 'apply_button',
          selectors_tried: selectors.length,
          url: window.location.href,
        },
      });
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
        // AF-005: pass EEOC preferences so background/worker can auto-fill
        eeoPreferences: _eeoPreferences || null,
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

  // ── EXT-AS-4: Score Ring SVG ──────────────────────────────────
  function buildScoreRingSVG(score, size) {
    size = size || 80;
    var r = (size - 8) / 2;
    var circumference = 2 * Math.PI * r;
    var pct = Math.max(0, Math.min(100, score)) / 100;
    var dashOffset = circumference * (1 - pct);
    var color = score >= 75 ? '#16a34a' : score >= 60 ? '#f59e0b' : '#dc2626';
    var bgColor = score >= 75 ? '#dcfce7' : score >= 60 ? '#fef3c7' : '#fef2f2';
    return [
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">',
      '  <circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + r + '" fill="none" stroke="' + bgColor + '" stroke-width="6"/>',
      '  <circle cx="' + (size/2) + '" cy="' + (size/2) + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="6"',
      '    stroke-linecap="round" stroke-dasharray="' + circumference + '" stroke-dashoffset="' + dashOffset + '"',
      '    transform="rotate(-90 ' + (size/2) + ' ' + (size/2) + ')"/>',
      '</svg>'
    ].join('');
  }

  // ── EXT-AS-4: Score Gate Popup ──────────────────────────────
  var _scoreGateActive = false;
  var _autoDismissTimer = null;

  function showScoreGatePopup(data) {
    hideScoreGatePopup(); // Remove any existing
    _scoreGateActive = true;

    // EXT-AS-9: Fire score_gate_shown event when popup renders
    sendMsg('POSTHOG_CAPTURE', {
      event: 'score_gate_shown',
      properties: {
        score: data.score || 0,
        threshold: data.threshold || 75,
        is_above: !!data.isAboveThreshold,
        platform: currentSite ? currentSite.platform : 'unknown',
        mode: data.mode || '',
      },
    });

    var shadow = getShadowRoot();
    var score = data.score || 0;
    var threshold = data.threshold || 75;
    var isAbove = data.isAboveThreshold;
    var gaps = data.gaps || [];
    var scoreColor = score >= 75 ? '#16a34a' : score >= 60 ? '#f59e0b' : '#dc2626';
    var diff = Math.abs(score - threshold);

    var overlay = document.createElement('div');
    overlay.className = 'bj-score-gate-overlay';
    overlay.id = 'bj-score-gate-overlay';

    var popup = document.createElement('div');
    popup.className = 'bj-score-gate';

    // Header
    var headerClass = isAbove ? 'bj-sg-header above' : 'bj-sg-header';
    var headerIcon = isAbove
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
      : '';
    var headerTitle = isAbove ? 'Score Passed — Submitting' : 'Resume Score Check';

    var html = [
      '<div class="' + headerClass + '">',
      '  <div class="bj-sg-header-left">',
      '    <div class="bj-sg-logo">' + (isAbove ? headerIcon : 'BJ') + '</div>',
      '    <span class="bj-sg-title">' + headerTitle + '</span>',
      '  </div>',
      '  <button class="bj-sg-close" id="bj-sg-close-btn">&times;</button>',
      '</div>',
      '<div class="bj-sg-body">',
    ];

    // Job info
    if (data.jobTitle || data.company) {
      var jobInfo = (data.jobTitle || 'Job') + (data.company ? ' at ' + data.company : '');
      html.push('  <div class="bj-sg-job">' + _escText(jobInfo) + '</div>');
    }

    // Score ring
    html.push('  <div class="bj-sg-ring-wrap">');
    html.push('    ' + buildScoreRingSVG(score, 88));
    html.push('    <div class="bj-sg-score-num" style="color:' + scoreColor + '">' + Math.round(score) + '</div>');
    html.push('    <div class="bj-sg-score-label">of 100</div>');
    html.push('  </div>');

    // Verdict
    if (isAbove) {
      html.push('  <div class="bj-sg-verdict" style="color:#16a34a">Above Threshold</div>');
      html.push('  <div class="bj-sg-detail">Your resume scores well for this role.</div>');
      html.push('  <div class="bj-sg-badge above">' + diff + ' points above threshold</div>');
      html.push('  <div class="bj-sg-auto-dismiss">Auto-submitting in 3 seconds...</div>');
    } else {
      html.push('  <div class="bj-sg-verdict" style="color:#dc2626">Below Your Threshold</div>');
      html.push('  <div class="bj-sg-detail">Score ' + Math.round(score) + ' is below your ' + threshold + ' threshold.</div>');
      html.push('  <div class="bj-sg-badge below">' + diff + ' points below threshold</div>');
    }

    // Gap analysis (below-threshold only, max 3)
    if (!isAbove && gaps.length > 0) {
      html.push('  <div class="bj-sg-gaps">');
      html.push('    <div class="bj-sg-gaps-title">Key Gaps</div>');
      var displayGaps = gaps.slice(0, 3);
      for (var g = 0; g < displayGaps.length; g++) {
        var gap = displayGaps[g];
        var gapText = typeof gap === 'string' ? gap : (gap.gap || gap.skill || gap.area || gap.description || JSON.stringify(gap));
        var gapIcon = '<span class="bj-sg-gap-icon" style="color:#dc2626">✗</span>';
        html.push('    <div class="bj-sg-gap">' + gapIcon + '<span>' + _escText(gapText) + '</span></div>');
      }
      html.push('  </div>');
    }

    // Action buttons
    html.push('  <div class="bj-sg-actions">');
    if (!isAbove) {
      html.push('    <button class="bj-sg-btn primary" id="bj-sg-rewrite-btn">Rewrite Resume for This Job</button>');
      html.push('    <button class="bj-sg-btn secondary" id="bj-sg-submit-btn">Submit Anyway (score: ' + Math.round(score) + ')</button>');
      html.push('    <button class="bj-sg-btn ghost" id="bj-sg-cancel-btn">Cancel — Don\'t Apply</button>');
    }
    html.push('  </div>');

    html.push('</div>');
    popup.innerHTML = html.join('\n');
    overlay.appendChild(popup);
    shadow.appendChild(overlay);

    // Wire close button
    var closeBtn = shadow.querySelector('#bj-sg-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        hideScoreGatePopup();
        _sendConfirm('cancel', data);
      });
    }

    // Wire action buttons (below-threshold)
    if (!isAbove) {
      var rewriteBtn = shadow.querySelector('#bj-sg-rewrite-btn');
      var submitBtn = shadow.querySelector('#bj-sg-submit-btn');
      var cancelBtn = shadow.querySelector('#bj-sg-cancel-btn');

      if (rewriteBtn) rewriteBtn.addEventListener('click', function () {
        hideScoreGatePopup();
        showRewriteProgressPopup(data);
        _sendConfirm('rewrite', data);
      });
      if (submitBtn) submitBtn.addEventListener('click', function () {
        hideScoreGatePopup();
        showToast('Submitting with current resume...');
        _sendConfirm('submit_anyway', data);
      });
      if (cancelBtn) cancelBtn.addEventListener('click', function () {
        hideScoreGatePopup();
        _sendConfirm('cancel', data);
      });
    }

    // Above-threshold: auto-dismiss after 3 seconds
    if (isAbove) {
      _autoDismissTimer = setTimeout(function () {
        hideScoreGatePopup();
        showToast('Score passed — proceeding with application');
        _sendConfirm('submit_anyway', data);
      }, 3000);
    }

    // Click outside to cancel
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        hideScoreGatePopup();
        _sendConfirm('cancel', data);
      }
    });
  }

  function hideScoreGatePopup() {
    _scoreGateActive = false;
    if (_autoDismissTimer) {
      clearTimeout(_autoDismissTimer);
      _autoDismissTimer = null;
    }
    var shadow = getShadowRoot();
    var existing = shadow.querySelector('#bj-score-gate-overlay');
    if (existing) existing.remove();
  }

  function _sendConfirm(action, data) {
    sendMsg('bj:toolbar:applyConfirm', {
      action: action,
      score: data.score,
      threshold: data.threshold,
      platform: currentSite.platform,
      mode: data.mode || _applicationMode,
      gaps: data.gaps || [],
      gap_analysis: data.gaps || [],
      jobTitle: data.jobTitle || '',
      company: data.company || '',
      title: data.jobTitle || '',
    });
  }

  function _escText(str) {
    var d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  // ── EXT-AS-4: Listen for score gate messages from background (via contentScript bridge) ──
  window.addEventListener('message', function (evt) {
    if (!evt.data || evt.data.source !== 'bj-extension') return;

    if (evt.data.type === 'bj:toolbar:scoreGate') {
      var p = evt.data.payload || {};
      showScoreGatePopup(p);
    }

    if (evt.data.type === 'bj:toolbar:applyStatus') {
      var s = evt.data.payload || {};
      if (s.status === 'error') {
        hideScoreGatePopup();
        hideRewriteProgressPopup();
        if (s.error === 'rewrite_failed') {
          showToast('Resume rewrite failed — you can apply natively');
        } else {
          showToast('Score check failed — you can apply natively');
        }
      }
      if (s.status === 'filling') {
        showToast('Submitting application...');
      }
    }

    // EXT-AS-5: Rewrite progress updates
    if (evt.data.type === 'bj:toolbar:rewriteProgress') {
      var rp = evt.data.payload || {};
      updateRewriteProgress(rp.step, rp.message);
    }

    // EXT-AS-5: Rewrite result — show review popup
    if (evt.data.type === 'bj:toolbar:rewriteResult') {
      var rr = evt.data.payload || {};
      hideRewriteProgressPopup();
      showRewriteReviewPopup(rr);
    }

    // EXT-AS-6: Auto mode status updates (scoring, rewriting, filling)
    if (evt.data.type === 'bj:toolbar:autoApplyStatus') {
      var aa = evt.data.payload || {};
      showAutoApplyToast(aa.step, aa.message || '', aa.mode || '');
    }

    // EXT-AS-6: Daily apply limit reached
    if (evt.data.type === 'bj:toolbar:limitReached') {
      var lr = evt.data.payload || {};
      showLimitReachedToast(lr.count || 0, lr.limit || 25);
    }

    // AF-002: Setup gate — show overlay telling user to complete setup on dashboard
    if (evt.data.type === 'bj:toolbar:setupRequired') {
      var sr = evt.data.payload || {};
      showSetupRequiredOverlay(sr.dashboardUrl || 'https://brilliantjobs.app/dashboard#settings');
    }
  });

  // ── EXT-AS-5: Rewrite Progress Popup ──────────────────────────
  var _rewriteProgressActive = false;

  function showRewriteProgressPopup(data) {
    hideRewriteProgressPopup();
    _rewriteProgressActive = true;

    var shadow = getShadowRoot();
    var overlay = document.createElement('div');
    overlay.className = 'bj-score-gate-overlay';
    overlay.id = 'bj-rewrite-progress-overlay';

    var popup = document.createElement('div');
    popup.className = 'bj-score-gate';
    popup.style.maxWidth = '360px';

    var jobInfo = (data.jobTitle || 'Job') + (data.company ? ' at ' + data.company : '');

    var html = [
      '<div class="bj-sg-header">',
      '  <div class="bj-sg-header-left">',
      '    <div class="bj-sg-logo">BJ</div>',
      '    <span class="bj-sg-title">AI Resume Rewrite</span>',
      '  </div>',
      '</div>',
      '<div class="bj-sg-body">',
      '  <div class="bj-sg-job">' + _escText(jobInfo) + '</div>',
      '  <div class="bj-rewrite-steps" id="bj-rewrite-steps">',
      '    <div class="bj-rw-step active" data-step="analyzing">',
      '      <div class="bj-rw-dot analyzing"></div>',
      '      <span>Analyzing gaps</span>',
      '    </div>',
      '    <div class="bj-rw-step" data-step="rewriting">',
      '      <div class="bj-rw-dot"></div>',
      '      <span>Rewriting resume</span>',
      '    </div>',
      '    <div class="bj-rw-step" data-step="reviewing">',
      '      <div class="bj-rw-dot"></div>',
      '      <span>Quality check</span>',
      '    </div>',
      '  </div>',
      '  <div class="bj-rw-spinner" id="bj-rw-spinner">',
      '    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2">',
      '      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">',
      '        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>',
      '      </path>',
      '    </svg>',
      '  </div>',
      '  <div class="bj-rw-status" id="bj-rw-status">Analyzing gaps...</div>',
      '</div>',
    ];

    popup.innerHTML = html.join('\n');
    overlay.appendChild(popup);

    // Add rewrite-specific CSS
    var style = document.createElement('style');
    style.textContent = [
      '.bj-rewrite-steps { display:flex; flex-direction:column; gap:12px; margin:16px 0; padding:0 8px; }',
      '.bj-rw-step { display:flex; align-items:center; gap:10px; font-size:13px; color:#9ca3af; transition:color 0.3s; }',
      '.bj-rw-step.active { color:#1f2937; font-weight:500; }',
      '.bj-rw-step.done { color:#16a34a; }',
      '.bj-rw-dot { width:10px; height:10px; border-radius:50%; background:#e5e7eb; transition:background 0.3s; flex-shrink:0; }',
      '.bj-rw-step.active .bj-rw-dot { background:#7c3aed; animation:bj-pulse 1.2s infinite; }',
      '.bj-rw-step.done .bj-rw-dot { background:#16a34a; }',
      '@keyframes bj-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }',
      '.bj-rw-spinner { text-align:center; margin:12px 0; }',
      '.bj-rw-status { text-align:center; font-size:12px; color:#6b7280; margin-bottom:8px; }',
      '.bj-rw-changes { margin:12px 0; max-height:220px; overflow-y:auto; }',
      '.bj-rw-change { border:1px solid #e5e7eb; border-radius:8px; padding:10px; margin-bottom:8px; font-size:12px; }',
      '.bj-rw-change-section { font-weight:600; color:#374151; margin-bottom:4px; font-size:11px; }',
      '.bj-rw-change-orig { color:#dc2626; text-decoration:line-through; margin-bottom:2px; line-height:1.4; }',
      '.bj-rw-change-new { color:#16a34a; line-height:1.4; }',
      '.bj-rw-change-reason { color:#6b7280; font-style:italic; margin-top:4px; font-size:11px; }',
      '.bj-rw-skills { display:flex; flex-wrap:wrap; gap:4px; margin:8px 0; }',
      '.bj-rw-skill { background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; border-radius:4px; padding:2px 8px; font-size:11px; }',
      '.bj-rw-score-compare { display:flex; align-items:center; justify-content:center; gap:16px; margin:12px 0; }',
      '.bj-rw-score-box { text-align:center; }',
      '.bj-rw-score-val { font-size:28px; font-weight:700; }',
      '.bj-rw-score-lbl { font-size:11px; color:#6b7280; }',
      '.bj-rw-arrow { font-size:20px; color:#7c3aed; }',
    ].join('\n');
    shadow.appendChild(style);
    shadow.appendChild(overlay);
  }

  function updateRewriteProgress(step, message) {
    var shadow = getShadowRoot();
    var steps = shadow.querySelectorAll('.bj-rw-step');
    var statusEl = shadow.querySelector('#bj-rw-status');
    var stepOrder = ['analyzing', 'rewriting', 'reviewing'];
    var targetIdx = stepOrder.indexOf(step);

    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      var sStep = s.getAttribute('data-step');
      var sIdx = stepOrder.indexOf(sStep);
      if (sIdx < targetIdx) {
        s.className = 'bj-rw-step done';
      } else if (sIdx === targetIdx) {
        s.className = 'bj-rw-step active';
      } else {
        s.className = 'bj-rw-step';
      }
    }
    if (statusEl) statusEl.textContent = message || '';
  }

  function hideRewriteProgressPopup() {
    _rewriteProgressActive = false;
    var shadow = getShadowRoot();
    var existing = shadow.querySelector('#bj-rewrite-progress-overlay');
    if (existing) existing.remove();
    // Also remove the style element
    var styles = shadow.querySelectorAll('style');
    // Keep only the original style — don't remove it
  }

  // ── EXT-AS-5: Rewrite Review Popup ──────────────────────────
  var _rewriteReviewActive = false;

  function showRewriteReviewPopup(data) {
    hideRewriteProgressPopup();
    _rewriteReviewActive = true;

    var shadow = getShadowRoot();
    var overlay = document.createElement('div');
    overlay.className = 'bj-score-gate-overlay';
    overlay.id = 'bj-rewrite-review-overlay';

    var popup = document.createElement('div');
    popup.className = 'bj-score-gate';
    popup.style.maxWidth = '420px';

    var origScore = Math.round(data.original_score || 0);
    var newScore = Math.round(data.estimated_new_score || 0);
    var improvement = Math.round(data.estimated_score_improvement || 0);
    var origColor = origScore >= 75 ? '#16a34a' : origScore >= 60 ? '#f59e0b' : '#dc2626';
    var newColor = newScore >= 75 ? '#16a34a' : newScore >= 60 ? '#f59e0b' : '#dc2626';
    var changes = data.changes || [];
    var skills = data.skills_added || [];
    var keywords = data.keywords_integrated || [];

    var jobInfo = (data.jobTitle || 'Job') + (data.company ? ' at ' + data.company : '');

    var html = [
      '<div class="bj-sg-header above">',
      '  <div class="bj-sg-header-left">',
      '    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
      '    <span class="bj-sg-title">Resume Rewritten</span>',
      '  </div>',
      '  <button class="bj-sg-close" id="bj-rr-close-btn">&times;</button>',
      '</div>',
      '<div class="bj-sg-body">',
      '  <div class="bj-sg-job">' + _escText(jobInfo) + '</div>',
    ];

    // Score comparison
    html.push('  <div class="bj-rw-score-compare">');
    html.push('    <div class="bj-rw-score-box">');
    html.push('      <div class="bj-rw-score-val" style="color:' + origColor + '">' + origScore + '</div>');
    html.push('      <div class="bj-rw-score-lbl">Original</div>');
    html.push('    </div>');
    html.push('    <div class="bj-rw-arrow">→</div>');
    html.push('    <div class="bj-rw-score-box">');
    html.push('      <div class="bj-rw-score-val" style="color:' + newColor + '">' + newScore + '</div>');
    html.push('      <div class="bj-rw-score-lbl">Estimated</div>');
    html.push('    </div>');
    html.push('  </div>');

    if (improvement > 0) {
      html.push('  <div class="bj-sg-badge above">+' + improvement + ' point improvement</div>');
    }

    // Skills added
    if (skills.length > 0) {
      html.push('  <div style="font-size:12px;font-weight:600;color:#374151;margin-top:12px;">Skills Highlighted</div>');
      html.push('  <div class="bj-rw-skills">');
      for (var s = 0; s < Math.min(skills.length, 8); s++) {
        html.push('    <span class="bj-rw-skill">+ ' + _escText(skills[s]) + '</span>');
      }
      html.push('  </div>');
    }

    // Changes diff (max 5)
    if (changes.length > 0) {
      html.push('  <div style="font-size:12px;font-weight:600;color:#374151;margin-top:8px;">Changes (' + changes.length + ')</div>');
      html.push('  <div class="bj-rw-changes">');
      var maxChanges = Math.min(changes.length, 5);
      for (var c = 0; c < maxChanges; c++) {
        var ch = changes[c];
        html.push('    <div class="bj-rw-change">');
        if (ch.section) html.push('      <div class="bj-rw-change-section">' + _escText(ch.section) + '</div>');
        if (ch.original) html.push('      <div class="bj-rw-change-orig">' + _escText(ch.original.slice(0, 120)) + '</div>');
        if (ch.revised) html.push('      <div class="bj-rw-change-new">' + _escText(ch.revised.slice(0, 120)) + '</div>');
        if (ch.reason) html.push('      <div class="bj-rw-change-reason">' + _escText(ch.reason) + '</div>');
        html.push('    </div>');
      }
      if (changes.length > 5) {
        html.push('    <div style="text-align:center;font-size:11px;color:#6b7280;margin-top:4px;">+ ' + (changes.length - 5) + ' more changes</div>');
      }
      html.push('  </div>');
    }

    // Action buttons
    html.push('  <div class="bj-sg-actions">');
    html.push('    <button class="bj-sg-btn primary" id="bj-rr-submit-btn">Submit Rewritten Resume</button>');
    html.push('    <button class="bj-sg-btn secondary" id="bj-rr-original-btn">Submit Original Instead</button>');
    html.push('    <button class="bj-sg-btn ghost" id="bj-rr-cancel-btn">Cancel — Don\'t Apply</button>');
    html.push('  </div>');
    html.push('</div>');

    popup.innerHTML = html.join('\n');
    overlay.appendChild(popup);
    shadow.appendChild(overlay);

    // Store rewritten text for submit action
    var _rewrittenText = data.rewritten_text || '';

    // Wire buttons
    var closeBtn = shadow.querySelector('#bj-rr-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', function () {
      hideRewriteReviewPopup();
      _sendRewriteDecision('cancel', data);
    });

    var submitBtn = shadow.querySelector('#bj-rr-submit-btn');
    if (submitBtn) submitBtn.addEventListener('click', function () {
      hideRewriteReviewPopup();
      showToast('Submitting rewritten resume...');
      _sendRewriteDecision('submit_rewritten', data);
    });

    var originalBtn = shadow.querySelector('#bj-rr-original-btn');
    if (originalBtn) originalBtn.addEventListener('click', function () {
      hideRewriteReviewPopup();
      showToast('Submitting original resume...');
      _sendRewriteDecision('submit_original', data);
    });

    var cancelBtn = shadow.querySelector('#bj-rr-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      hideRewriteReviewPopup();
      _sendRewriteDecision('cancel', data);
    });

    // Click outside to cancel
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        hideRewriteReviewPopup();
        _sendRewriteDecision('cancel', data);
      }
    });
  }

  function hideRewriteReviewPopup() {
    _rewriteReviewActive = false;
    var shadow = getShadowRoot();
    var existing = shadow.querySelector('#bj-rewrite-review-overlay');
    if (existing) existing.remove();
  }

  function _sendRewriteDecision(decision, data) {
    sendMsg('bj:toolbar:rewriteDecision', {
      decision: decision,
      rewritten_text: data.rewritten_text || '',
      original_score: data.original_score,
      estimated_new_score: data.estimated_new_score,
      platform: currentSite.platform,
      mode: data.mode || _applicationMode,
      jobTitle: data.jobTitle || '',
      company: data.company || '',
    });
  }

  // ── EXT-AS-6: Auto Mode Toast ────────────────────────────────
  var _autoApplyToastTimer: ReturnType<typeof setTimeout> | null = null;

  function showAutoApplyToast(step: string, message: string, mode: string) {
    // Clear any previous auto toast timer
    if (_autoApplyToastTimer) {
      clearTimeout(_autoApplyToastTimer);
      _autoApplyToastTimer = null;
    }

    var modeLabel: Record<string, string> = {
      'auto-apply': 'Auto Apply',
      'auto-rewrite': 'Auto Rewrite',
      'full-autopilot': 'Full Autopilot',
    };

    var stepIcons: Record<string, string> = {
      'scoring': '🔍',
      'rewriting': '✍️',
      'filling': '📤',
    };

    var prefix = modeLabel[mode] || 'Auto';
    var icon = stepIcons[step] || '⚡';
    var toastText = icon + ' ' + prefix + ': ' + (message || step);

    showToast(toastText);

    // Auto-dismiss filling toast after 5 seconds
    if (step === 'filling') {
      _autoApplyToastTimer = setTimeout(function () {
        // Toast auto-dismisses (showToast handles its own timer)
        _autoApplyToastTimer = null;
      }, 5000);
    }
  }

  function showLimitReachedToast(count: number, limit: number) {
    showToast('⚠️ Daily apply limit reached (' + count + '/' + limit + '). Resets tomorrow.');
  }

  // AF-002: Setup gate overlay — tells user to complete setup on dashboard
  function showSetupRequiredOverlay(dashboardUrl: string) {
    // Remove any existing setup overlay
    var existing = _shadowRoot ? _shadowRoot.querySelector('.bj-setup-overlay') : null;
    if (existing) existing.remove();

    if (!_shadowRoot) return;

    var overlay = document.createElement('div');
    overlay.className = 'bj-setup-overlay';
    overlay.innerHTML = '<div class="bj-setup-card">' +
      '<div style="font-size:24px;margin-bottom:8px;">⚙️</div>' +
      '<div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:6px;">Complete Setup First</div>' +
      '<div style="font-size:12px;color:rgba(255,255,255,0.7);line-height:1.5;margin-bottom:14px;">' +
        'Set up your application profile on the Brilliant Jobs dashboard before applying to jobs.' +
      '</div>' +
      '<a href="' + _escText(dashboardUrl) + '" target="_blank" rel="noopener" ' +
        'style="display:inline-block;padding:8px 20px;background:#fff;color:#7c3aed;font-size:13px;font-weight:600;border-radius:6px;text-decoration:none;cursor:pointer;">' +
        'Open Dashboard Settings →' +
      '</a>' +
      '<button class="bj-setup-close" style="position:absolute;top:8px;right:10px;background:none;border:none;color:rgba(255,255,255,0.5);font-size:18px;cursor:pointer;line-height:1;">&times;</button>' +
    '</div>';

    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
    var card = overlay.querySelector('.bj-setup-card') as HTMLElement;
    if (card) card.style.cssText = 'background:linear-gradient(135deg,#7c3aed,#6d28d9);border-radius:14px;padding:24px;max-width:360px;width:90%;text-align:center;position:relative;box-shadow:0 8px 32px rgba(0,0,0,0.3);';

    overlay.addEventListener('click', function(e: Event) { if (e.target === overlay) overlay.remove(); });
    var closeBtn = overlay.querySelector('.bj-setup-close');
    if (closeBtn) closeBtn.addEventListener('click', function() { overlay.remove(); });

    _shadowRoot.appendChild(overlay);
    setTimeout(function() { if (overlay.parentNode) overlay.remove(); }, 15000);
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
    showScoreGatePopup: showScoreGatePopup,
    hideScoreGatePopup: hideScoreGatePopup,
    buildScoreRingSVG: buildScoreRingSVG,
    isScoreGateActive: function () { return _scoreGateActive; },
    showRewriteProgressPopup: showRewriteProgressPopup,
    hideRewriteProgressPopup: hideRewriteProgressPopup,
    updateRewriteProgress: updateRewriteProgress,
    showRewriteReviewPopup: showRewriteReviewPopup,
    hideRewriteReviewPopup: hideRewriteReviewPopup,
    isRewriteProgressActive: function () { return _rewriteProgressActive; },
    isRewriteReviewActive: function () { return _rewriteReviewActive; },
    showAutoApplyToast: showAutoApplyToast,
    showLimitReachedToast: showLimitReachedToast,
    showSetupRequiredOverlay: showSetupRequiredOverlay,
  };

})();
