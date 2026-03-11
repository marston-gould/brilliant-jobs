// contentScript.ts — ATS Detection & Handler Router
// v3.0.0: Multi-ATS content script that detects the current platform
// and routes to the appropriate handler.
// v3.8.0: Phase 10 (P9) — Enhanced JD selectors, ApplicationTracker
// integration for auto-tracking, JD match data sent to background.
// v3.9.0: Item #1 — Generic fallback handler for unrecognized ATS sites.
// v3.10.0: Item #3 — On-page status overlay during fill. Item #5 — Fill metrics wiring.
// v5.75: Added iCIMS, Taleo, SmartRecruiters, Avature handlers + detection + JD selectors.
// v6.98: Overlay Pipeline S4 — inject toolbar-overlay.js on job pages.
//
// This script is injected on all ATS domains (manifest content_scripts)
// and dynamically by background.js on unknown ATS domains.
// It does NOT auto-fill. It waits for a message from background.js
// (triggered by user clicking "Autofill" in the popup or dashboard).

(function () {
  'use strict';


  // ── Overlay Pipeline S4: Inject toolbar on job listing pages ──────────
  // toolbar-overlay.js manages its own isJobPage() check and SPA re-init.
  // Injected once per page load alongside contentScript.
  (function injectToolbar() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('toolbar-overlay.js');
      script.onload = function() { this.remove(); };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.warn('[BJ] Toolbar inject error:', e.message);
    }
  })();

  // ── EXT-AS-3: Inject job-site-overlay for Save button + Apply interception ──
  // job-site-overlay.js manages its own site detection, Save button injection,
  // and Apply button interception based on user's application mode.
  (function injectJobSiteOverlay() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('job-site-overlay.js');
      script.onload = function() { this.remove(); };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.warn('[BJ] Job site overlay inject error:', e.message);
    }
  })();

  // ============================================================
  // ATS DETECTION
  // ============================================================

  const ATS_HANDLERS = {
    'greenhouse-legacy': {
      hostnames: ['boards.greenhouse.io', 'boards.eu.greenhouse.io'],
      module: 'handlers/greenhouse-legacy.js'
    },
    'greenhouse-react': {
      hostnames: ['job-boards.greenhouse.io', 'job-boards.eu.greenhouse.io'],
      module: 'handlers/greenhouse-react.js'
    },
    'lever': {
      hostnames: ['jobs.lever.co'],
      module: 'handlers/lever.js'
    },
    'ashby': {
      hostnames: ['jobs.ashbyhq.com'],
      module: 'handlers/ashby.js'
    },
    'workable': {
      hostnames: ['apply.workable.com'],
      module: 'handlers/workable.js'
    },
    'recruitee': {
      // Recruitee uses custom subdomains: {company}.recruitee.com
      hostnamePattern: /\.recruitee\.com$/,
      module: 'handlers/recruitee.js'
    },
    'linkedin-easy-apply': {
      hostnames: ['www.linkedin.com'],
      pathPattern: /^\/jobs\//,
      module: 'handlers/linkedin-easy-apply.js'
    },
    'indeed': {
      hostnames: ['smartapply.indeed.com', 'apply.indeed.com', 'm5.apply.indeed.com'],
      hostnamePattern: /\.indeed\.com$/,
      pathPattern: /\/(viewjob|applystart|apply|indeedapply)/,
      module: 'handlers/indeed.js'
    },
    'workday': {
      hostnamePattern: /\.myworkdayjobs\.com$/,
      module: 'handlers/workday.js'
    },
    'icims': {
      hostnamePattern: /\.icims\.com$/,
      module: 'handlers/icims.js'
    },
    'taleo': {
      hostnamePattern: /\.taleo\.net$/,
      module: 'handlers/taleo.js'
    },
    'smartrecruiters': {
      hostnames: ['jobs.smartrecruiters.com', 'careers.smartrecruiters.com'],
      module: 'handlers/smartrecruiters.js'
    },
    'avature': {
      hostnamePattern: /\.avature\.net$/,
      module: 'handlers/avature.js'
    },
    'bamboohr': {
      hostnamePattern: /\.bamboohr\.com$/,
      module: 'handlers/bamboohr.js'
    },
    'jazzhr': {
      hostnamePattern: /\.applytojob\.com$/,
      module: 'handlers/jazzhr.js'
    }
  };

  /**
   * Detect which ATS platform we're on based on hostname.
   * Returns { id, config } or null if unrecognized.
   *
   * v3.9.0: If no named handler matches, checks for the presence of
   * an application form and falls back to the generic handler.
   */
  function detectATS() {
    const hostname = window.location.hostname;

    for (const [id, config] of Object.entries(ATS_HANDLERS)) {
      if (config.hostnames && config.hostnames.includes(hostname)) {
        // Additional path check for platforms that need it (LinkedIn)
        if (config.pathPattern) {
          if (config.pathPattern.test(window.location.pathname)) return { id, config };
          continue;
        }
        return { id, config };
      }
      if (config.hostnamePattern && config.hostnamePattern.test(hostname)) {
        return { id, config };
      }
    }

    // ── Generic fallback (v3.9.0 / Item #1) ──
    // If we're not on a known ATS but this script was injected
    // (either via manifest optional_host_permissions or dynamic injection),
    // check if the page has an application form and route to generic handler.
    if (_hasApplicationForm()) {
      return {
        id: 'generic',
        config: { module: 'handlers/generic.js', generic: true }
      };
    }

    return null;
  }

  /**
   * Heuristic check: does this page look like a job application form?
   * Requires at least 2 fillable fields and a label matching common
   * application keywords.
   */
  function _hasApplicationForm() {
    const forms = document.querySelectorAll('form');
    const inputs = document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], textarea, select'
    );
    if (inputs.length < 2) return false;

    // Check for application-like signals
    const bodyText = (document.body?.textContent || '').substring(0, 10000).toLowerCase();
    const signals = [
      /apply/i, /application/i, /submit.*resume/i, /upload.*resume/i,
      /cover\s*letter/i, /first\s*name/i, /email.*address/i,
    ];
    const matchCount = signals.filter(s => s.test(bodyText)).length;

    // At least 2 signals = likely an application form
    return matchCount >= 2 || forms.length > 0;
  }

  // ============================================================
  // JD EXTRACTION (runs on page load — no user action needed)
  // v3.8.0: Enhanced selectors with broader fallbacks per ATS
  // ============================================================

  const JD_SELECTORS = {
    'greenhouse-legacy': [
      '#content .content',
      'section#content .body',
      '.body .content',
      '#app_body .content',
      '.job-post .content',
    ],
    'greenhouse-react': [
      '[data-mapped="true"] .job-post-content',
      '.job__description',
      '.job-post__description',
      '[class*="jobDescription"]',
      '.css-1v5elnn', // common GH React class
    ],
    'lever': [
      '.posting-page .content .posting-categories + div',
      '.posting .content-wrapper .posting-headline + div',
      '.posting-page .content section',
      '.posting .content-wrapper .section-wrapper',
      'div[data-qa="posting-description"]',
    ],
    'ashby': [
      'div[data-ui="job-description"]',
      '.ashby-job-posting-description',
      '.ashby-job-posting-brief-description + div',
      'main .job-posting-description',
      '.job-posting__description',
    ],
    'workable': [
      '.job-description',
      '[data-ui="job-description"]',
      'section.job-description',
      '.job-details .description',
      '[class*="jobDescription"]',
    ],
    'recruitee': [
      '.job-description',
      '.posting-description',
      '.job-details__description',
      '.offer-description',
      'section.description',
    ],
    'linkedin-easy-apply': [
      '.jobs-description__content',
      '.jobs-box__html-content',
      '.jobs-description-content__text',
      '.jobs-unified-description__content',
      'article.jobs-description',
    ],
    'indeed': [
      '#jobDescriptionText',
      '.jobsearch-jobDescriptionText',
      '#jobDescription',
      '.job-description',
      '[data-testid="jobDescription"]',
    ],
    'workday': [
      '[data-automation-id="jobPostingDescription"]',
      '.css-cygeeu',
      '[data-automation-id="jobPostingDetails"]',
      '.job-description',
      'div[class*="jobDescription"]',
    ],
    'icims': [
      '.iCIMS_InfoMsg_Job .iCIMS_InfoField_Job',
      '.iCIMS_JobContent',
      '.iCIMS_MainWrapper .job-description',
      '[class*="jobDescription"]',
      '.description',
    ],
    'taleo': [
      '.jobdescription',
      '.jobDetail .contentlinepanel',
      '.applicationsection .contentlinepanel',
      '#requisitionDescriptionInterface',
      '.job-description',
    ],
    'smartrecruiters': [
      '.job-sections',
      '[data-test="job-description"]',
      '.job-description',
      '.sectionBody',
      '[class*="jobDescription"]',
    ],
    'avature': [
      '.job-description',
      '.avature-content',
      '.career-job-description',
      '[class*="description"]',
      '.content-area',
    ],
    'bamboohr': [
      '.BambooHR-ATS-board__job-body',
      '.job-description',
      '.JobDescription',
      '[class*="description"]',
      '.content',
    ],
    'jazzhr': [
      '#job_description',
      '.job-description',
      '.jazzhr-job-description',
      '[class*="description"]',
      '.job-details',
    ],
    'generic': [
      '.job-description',
      '.job-post-content',
      '[class*="description"]',
      '[data-testid*="description"]',
      '[id*="description"]',
      'article',
      'main .content',
    ],
  };

  /**
   * Extract job title from the page.
   * v3.8.0: Per-ATS title selectors.
   */
  const TITLE_SELECTORS = {
    'greenhouse-legacy': '.app-title, .job-title, h1.heading',
    'greenhouse-react': 'h1.job-title, h1[class*="title"], .job-post h1',
    'lever': '.posting-headline h2, .posting-headline .display-4',
    'ashby': 'h1[class*="title"], .ashby-job-posting-heading h1',
    'workable': 'h1.job-title, header h1, [data-ui="job-title"]',
    'recruitee': 'h1.offer-title, h1.job-title, .posting-title h1',
    'linkedin-easy-apply': '.jobs-unified-top-card__job-title, .job-details-jobs-unified-top-card__job-title, h1.t-24',
    'indeed': '.jobsearch-JobInfoHeader-title, h1.icl-u-xs-mb--xs, [data-testid="jobTitle"], h1[class*="JobTitle"]',
    'workday': '[data-automation-id="jobPostingHeader"] h2, h2[data-automation-id="jobTitle"], .css-1q2dra3 h2',
    'icims': '.iCIMS_Header h1, .header-job-title, h1.iCIMS_Title, h1',
    'taleo': '.pagecontainer h1, .requisitioncontenttitle, h1.title, #requisitionTitle',
    'smartrecruiters': 'h1.job-title, h1[class*="title"], [data-test="job-title"]',
    'avature': 'h1.job-title, h1[class*="title"], .career-title h1',
    'bamboohr': 'h1.job-title, h2.header__job-title, .positionTitleText, h1[class*="title"]',
    'jazzhr': 'h1.job-title, h1#job_title, .jazzhr-job-title, h1[class*="title"]',
    'generic': 'h1, h2.job-title, [class*="title"] h1, [class*="title"] h2, [data-testid*="title"]',
  };

  const COMPANY_SELECTORS = {
    'greenhouse-legacy': '.company-name, .logo + span',
    'greenhouse-react': '.company-name, [class*="companyName"]',
    'lever': '.posting-headline .display-4 ~ .posting-categories .sort-by-team, .posting-headline .display-4 ~ .posting-categories .posting-category',
    'ashby': '.ashby-job-posting-heading [class*="company"], .org-name',
    'workable': '.company-header__name, [data-ui="company-name"]',
    'recruitee': '.company-name, .offer-company',
    'linkedin-easy-apply': '.jobs-unified-top-card__company-name a, .job-details-jobs-unified-top-card__company-name a',
    'indeed': '.jobsearch-InlineCompanyRating-companyHeader, [data-testid="companyName"], a[data-tn-element="companyName"]',
    'workday': '[data-automation-id="jobPostingHeader"] [data-automation-id="company"], .css-1q2dra3 a[href*="company"]',
    'icims': '.iCIMS_CompanyName, .header-company-name, .company-name',
    'taleo': '.company-name, .companyname, .requisitioncompany',
    'smartrecruiters': '.company-name, [data-test="company-name"], a[class*="company"]',
    'avature': '.company-name, [class*="company"], .career-company',
    'bamboohr': '.company-name, .ResHeader__company, [class*="company"]',
    'jazzhr': '.company-name, .jazzhr-company, [class*="company"]',
    'generic': '[class*="company"] a, [class*="company"], [class*="employer"], [data-testid*="company"]',
  };

  function extractJobDescription(atsId) {
    const selectors = JD_SELECTORS[atsId] || [];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim().length > 50) {
        return {
          text: el.textContent.trim(),
          html: el.innerHTML,
          url: window.location.href,
          title: extractJobTitle(atsId),
          company: extractCompanyName(atsId),
          extractedAt: new Date().toISOString()
        };
      }
    }

    // Fallback: try generic selectors
    const fallbacks = [
      '.job-description', '[class*="description"]', 'article', 'main .content',
    ];
    for (const selector of fallbacks) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim().length > 100) {
        return {
          text: el.textContent.trim(),
          html: el.innerHTML,
          url: window.location.href,
          title: extractJobTitle(atsId),
          company: extractCompanyName(atsId),
          extractedAt: new Date().toISOString(),
          fallback: true,
        };
      }
    }

    return null;
  }

  function extractJobTitle(atsId) {
    const selectorStr = TITLE_SELECTORS[atsId] || '';
    for (const sel of selectorStr.split(',').map(s => s.trim())) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    // Fallback to <title>
    const titleEl = document.querySelector('title');
    return titleEl ? titleEl.textContent.split('|')[0].split('-')[0].trim() : '';
  }

  function extractCompanyName(atsId) {
    const selectorStr = COMPANY_SELECTORS[atsId] || '';
    for (const sel of selectorStr.split(',').map(s => s.trim())) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return '';
  }

  // ============================================================
  // FORM FIELD DETECTION (lightweight scan — no filling)
  // ============================================================

  /**
   * Scan the page for form fields and return a summary.
   * Used by the popup to show "X fields detected" before autofill.
   */
  function scanFormFields() {
    const fields = [];
    const inputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), ' +
      'select, textarea, ' +
      '[role="combobox"], [role="listbox"]'
    );

    inputs.forEach(el => {
      const field = {
        tag: el.tagName.toLowerCase(),
        type: el.type || el.getAttribute('role') || 'text',
        name: el.name || el.id || el.getAttribute('aria-label') || '',
        label: findLabel(el),
        required: el.required || el.getAttribute('aria-required') === 'true',
        value: el.value || '',
        filled: !!(el.value && el.value.trim())
      };
      fields.push(field);
    });

    // Also detect file upload inputs (often hidden)
    document.querySelectorAll('input[type="file"]').forEach(el => {
      fields.push({
        tag: 'input',
        type: 'file',
        name: el.name || el.id || 'resume',
        label: findLabel(el) || 'Resume/CV',
        required: el.required,
        value: '',
        filled: false
      });
    });

    return fields;
  }

  /**
   * Find the label text for a form element.
   */
  function findLabel(el) {
    // 1. Explicit <label for="id">
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) return label.textContent.trim();
    }

    // 2. Wrapping <label>
    const parentLabel = el.closest('label');
    if (parentLabel) return parentLabel.textContent.trim();

    // 3. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // 4. aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) return labelEl.textContent.trim();
    }

    // 5. Previous sibling or parent text
    const container = el.closest('.field, .form-group, .form-field, [class*="field"]');
    if (container) {
      const labelEl = container.querySelector('label, .label, [class*="label"]');
      if (labelEl) return labelEl.textContent.trim();
    }

    return '';
  }

  // ============================================================
  // APPLICATION SUBMISSION TRACKING (v3.8.0)
  // Watches for form submits and confirmation pages.
  // Reports to background.js for Supabase auto-tracking.
  // ============================================================

  const SUBMIT_PATTERN = /(apply|submit|send\s+application|confirm\s+application|complete\s+application)/i;
  const CONFIRMATION_PATTERNS = [
    /application\s+(received|submitted|sent|confirmed)/i,
    /thank\s+you\s+for\s+(applying|your\s+application)/i,
    /successfully\s+(submitted|applied)/i,
    /we('ve|\s+have)\s+received\s+your/i,
    /your\s+application\s+has\s+been/i,
    /application\s+complete/i,
  ];

  let _pendingSubmit = null;
  let _confirmationInterval = null;

  function startSubmitTracking() {
    // Watch form submits
    document.addEventListener('submit', function (event) {
      const form = event.target;
      if (form?.tagName === 'FORM') {
        _handleSubmitEvent({
          type: 'form_submit',
          action: form.action,
          method: form.method,
          url: window.location.href,
          timestamp: new Date().toISOString(),
        });
      }
    }, true);

    // Watch button clicks matching submit patterns
    document.addEventListener('click', function (event) {
      const el = event.target.closest('button, a, [role="button"], input[type="submit"]');
      if (!el) return;

      const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
      if (SUBMIT_PATTERN.test(text)) {
        _handleSubmitEvent({
          type: 'button_click',
          buttonText: text,
          url: window.location.href,
          timestamp: new Date().toISOString(),
        });
      }
    }, true);

    // Check for confirmation page periodically
    _confirmationInterval = setInterval(function () {
      if (_pendingSubmit) {
        _checkForConfirmation();
      }
    }, 1500);
  }

  function _handleSubmitEvent(info) {
    _pendingSubmit = info;

    // Report to background.js → autoTracker
    chrome.runtime.sendMessage({
      type: 'ats:submitDetected',
      ...info,
    }).catch(e => { try { chrome.runtime.sendMessage({ type: 'reportError', payload: { context: 'content_script_msg', error: e?.message || String(e) } }).catch(() => {}); } catch {} });

    // Auto-clear after 60s if no confirmation
    setTimeout(() => {
      if (_pendingSubmit === info) {
        _pendingSubmit = null;
      }
    }, 60000);
  }

  function _checkForConfirmation() {
    const bodyText = (document.body?.textContent || '').substring(0, 5000);
    const titleText = document.title || '';
    const combinedText = bodyText + ' ' + titleText;

    for (const pattern of CONFIRMATION_PATTERNS) {
      if (pattern.test(combinedText)) {
        const confirmation = {
          type: 'confirmation_detected',
          pattern: pattern.source,
          url: window.location.href,
          submitInfo: _pendingSubmit,
          timestamp: new Date().toISOString(),
        };

        chrome.runtime.sendMessage({
          type: 'ats:confirmationDetected',
          ...confirmation,
        }).catch(e => { try { chrome.runtime.sendMessage({ type: 'reportError', payload: { context: 'content_script_msg', error: e?.message || String(e) } }).catch(() => {}); } catch {} });

        _pendingSubmit = null;
        clearInterval(_confirmationInterval);
        break;
      }
    }
  }

  // ============================================================
  // MUTATION OBSERVER — detect dynamically loaded fields
  // ============================================================

  let mutationObserver = null;
  let fieldCount = 0;

  function startMutationObserver() {
    if (mutationObserver) return;

    mutationObserver = new MutationObserver((mutations) => {
      let formChanged = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              // Check if any form-related elements were added
              if (node.matches && (
                node.matches('input, select, textarea, form, [role="combobox"]') ||
                node.querySelector('input, select, textarea, form, [role="combobox"]')
              )) {
                formChanged = true;
                break;
              }
            }
          }
        }
        if (formChanged) break;
      }

      if (formChanged) {
        const newCount = scanFormFields().length;
        if (newCount !== fieldCount) {
          fieldCount = newCount;
          // Notify background that form fields changed
          chrome.runtime.sendMessage({
            type: 'ats:fieldsChanged',
            fieldCount: newCount,
            url: window.location.href
          }).catch(e => { try { chrome.runtime.sendMessage({ type: 'reportError', payload: { context: 'content_script_msg', error: e?.message || String(e) } }).catch(() => {}); } catch {} });
        }
      }
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // ============================================================
  // MESSAGE HANDLING — commands from background.js
  // ============================================================

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'ats:detect') {
      const ats = detectATS();
      const jd = ats ? extractJobDescription(ats.id) : null;
      const fields = scanFormFields();
      sendResponse({
        ats: ats ? ats.id : null,
        url: window.location.href,
        jd,
        fieldCount: fields.length,
        fields: fields.slice(0, 50) // cap to avoid huge messages
      });
      return true;
    }

    if (msg.type === 'ats:scanFields') {
      const fields = scanFormFields();
      sendResponse({ fields, fieldCount: fields.length });
      return true;
    }

    if (msg.type === 'ats:extractJD') {
      const ats = detectATS();
      const jd = ats ? extractJobDescription(ats.id) : null;
      sendResponse({ jd });
      return true;
    }

    if (msg.type === 'ats:fill') {
      // Delegate to the appropriate handler
      // The handler module is loaded dynamically
      handleFillRequest(msg)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // async
    }

    if (msg.type === 'ats:startObserver') {
      startMutationObserver();
      sendResponse({ started: true });
      return true;
    }

    // ── EXT-AS-4/5/6 + AF-002: Bridge messages from background → overlay ──
    // The overlay runs as a <script> tag (web_accessible_resource) so cannot
    // directly receive chrome.runtime.onMessage. We relay via window.postMessage.
    if (msg.type === 'bj:toolbar:scoreGate' || msg.type === 'bj:toolbar:applyStatus' ||
        msg.type === 'bj:toolbar:rewriteProgress' || msg.type === 'bj:toolbar:rewriteResult' ||
        msg.type === 'bj:toolbar:autoApplyStatus' || msg.type === 'bj:toolbar:limitReached' ||
        msg.type === 'bj:toolbar:setupRequired') {
      try {
        window.postMessage({
          source: 'bj-extension',
          type: msg.type,
          payload: msg.payload,
        }, '*');
      } catch (e) {
        console.warn('[BJ CS] Failed to relay message:', msg.type, e);
      }
      sendResponse({ relayed: true });
      return true;
    }
  });

  // ============================================================
  // HANDLER LOADING & FILL EXECUTION
  // ============================================================

  // Handler modules are loaded on-demand when fill is requested.
  // This keeps the initial content script lightweight.
  let loadedHandler = null;

  async function handleFillRequest(msg) {
    const ats = detectATS();
    if (!ats) {
      return { success: false, error: 'Not on a recognized ATS page and no application form detected' };
    }

    // Security check: triple-layer gate
    if (!msg.userInitiated) {
      return { success: false, error: 'Fill requires explicit user initiation' };
    }

    // ── Item #3: Inject and show overlay ──
    let overlayReady = false;
    try {
      const overlayUrl = chrome.runtime.getURL('inject-overlay.js');
      await import(overlayUrl);
      if (window.__bjOverlay) {
        window.__bjOverlay.show();
        overlayReady = true;
      }
    } catch (overlayErr) {
      console.warn('[BJ] Overlay injection failed (non-fatal):', overlayErr.message);
    }

    const fillStartMs = Date.now();
    const fields = scanFormFields();

    if (overlayReady) {
      window.__bjOverlay.progress({ filled: 0, total: fields.length, currentField: 'Loading handler…', pct: 5 });
    }

    // Load handler if not already loaded
    if (!loadedHandler || loadedHandler.id !== ats.id) {
      try {
        // Dynamic import via chrome.runtime.getURL
        const handlerUrl = chrome.runtime.getURL(ats.config.module);
        const module = await import(handlerUrl);
        loadedHandler = { id: ats.id, handler: module.default || module };
      } catch (err) {
        // If loading a named handler fails, try generic fallback
        if (ats.id !== 'generic') {
          try {
            const genericUrl = chrome.runtime.getURL('handlers/generic.js');
            const genericModule = await import(genericUrl);
            loadedHandler = { id: 'generic', handler: genericModule.default || genericModule };
            console.warn(`[BJ] Named handler ${ats.id} failed, falling back to generic: ${err.message}`);
          } catch (genericErr) {
            if (overlayReady) window.__bjOverlay.error({ message: `Failed to load handler for ${ats.id}` });
            return { success: false, error: `Failed to load handler for ${ats.id}: ${err.message}` };
          }
        } else {
          if (overlayReady) window.__bjOverlay.error({ message: 'Failed to load generic handler' });
          return { success: false, error: `Failed to load generic handler: ${err.message}` };
        }
      }
    }

    if (overlayReady) {
      window.__bjOverlay.progress({ filled: 0, total: fields.length, currentField: 'Filling fields…', pct: 15 });
    }

    // Execute the fill
    const result = await loadedHandler.handler.fill({
      profile: msg.profile,
      resume: msg.resume,
      preferences: msg.preferences,
      fields: fields,
      // Pass overlay callbacks so handlers can report per-field progress
      onFieldFilled: (fieldName, status, detail) => {
        if (overlayReady) {
          window.__bjOverlay.fieldResult({ name: fieldName, status: status || 'filled', detail });
        }
      },
      onProgress: (filled, total) => {
        if (overlayReady) {
          const pct = 15 + Math.round((filled / Math.max(total, 1)) * 80);
          window.__bjOverlay.progress({ filled, total, pct });
        }
      }
    });

    const fillTimeMs = Date.now() - fillStartMs;

    // ── Item #3: Show final overlay state ──
    if (overlayReady) {
      if (result.success !== false) {
        window.__bjOverlay.success({
          filled: result.filledCount || fields.length,
          total: fields.length,
          timeMs: fillTimeMs,
        });
      } else {
        window.__bjOverlay.error({ message: result.error || 'Fill encountered errors' });
      }
    }

    // ── Item #5: Report fill metrics ──
    try {
      const metricsUrl = chrome.runtime.getURL('utils/fillMetrics.js');
      const metricsModule = await import(metricsUrl);
      const fm = metricsModule.fillMetrics || metricsModule.default;
      if (fm && fm.trackFill) {
        fm.trackFill({
          ats: loadedHandler.id,
          url: window.location.href,
          fields: fields.length,
          filled: result.filledCount || 0,
          skipped: result.skippedCount || 0,
          errors: result.errorCount || 0,
          timeMs: fillTimeMs,
          usedGeneric: loadedHandler.id === 'generic' && ats.id !== 'generic',
          errorDetails: result.errors || [],
        });
      }
    } catch (metricsErr) {
      console.warn('[BJ] Fill metrics failed (non-fatal):', metricsErr.message);
    }

    return result;
  }

  // ============================================================
  // INIT — run on page load
  // ============================================================

  const ats = detectATS();
  if (ats) {
    // Notify background that we're on an ATS page
    const jd = extractJobDescription(ats.id);
    const fields = scanFormFields();
    fieldCount = fields.length;

    chrome.runtime.sendMessage({
      type: 'ats:pageDetected',
      ats: ats.id,
      url: window.location.href,
      jd,
      title: jd?.title || '',
      company: jd?.company || '',
      fieldCount: fields.length
    }).catch(e => { try { chrome.runtime.sendMessage({ type: 'reportError', payload: { context: 'content_script_msg', error: e?.message || String(e) } }).catch(() => {}); } catch {} });

    // Start observing for dynamic form changes
    startMutationObserver();

    // Start submission tracking (v3.8.0)
    startSubmitTracking();
  }
})();
