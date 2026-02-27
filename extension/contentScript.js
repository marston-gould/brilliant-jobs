// contentScript.js — ATS Detection & Handler Router
// v3.0.0: Multi-ATS content script that detects the current platform
// and routes to the appropriate handler.
//
// This script is injected on all ATS domains (manifest content_scripts).
// It does NOT auto-fill. It waits for a message from background.js
// (triggered by user clicking "Autofill" in the popup or dashboard).

(function () {
  'use strict';

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
    }
  };

  /**
   * Detect which ATS platform we're on based on hostname.
   * Returns { id, config } or null if unrecognized.
   */
  function detectATS() {
    const hostname = window.location.hostname;

    for (const [id, config] of Object.entries(ATS_HANDLERS)) {
      if (config.hostnames && config.hostnames.includes(hostname)) {
        return { id, config };
      }
      if (config.hostnamePattern && config.hostnamePattern.test(hostname)) {
        return { id, config };
      }
      if (config.hostnames && config.hostnames.includes(hostname) && config.pathPattern) {
        if (config.pathPattern.test(window.location.pathname)) return { id, config };
      }
    }
    return null;
  }

  // ============================================================
  // JD EXTRACTION (runs on page load — no user action needed)
  // ============================================================

  const JD_SELECTORS = {
    'greenhouse-legacy': '#content .content, section#content .body',
    'greenhouse-react': '[data-mapped="true"] .job-post-content, .job__description',
    'lever': '.posting-page .content .posting-categories + div, .posting .content-wrapper .posting-headline + div',
    'ashby': 'div[data-ui="job-description"], .ashby-job-posting-description',
    'workable': '.job-description, [data-ui="job-description"]',
    'recruitee': '.job-description, .posting-description',
    'linkedin-easy-apply': '.jobs-description__content, .jobs-box__html-content, .jobs-description-content__text'
  };

  function extractJobDescription(atsId) {
    const selectorChain = JD_SELECTORS[atsId] || '';
    const selectors = selectorChain.split(',').map(s => s.trim());

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim().length > 50) {
        return {
          text: el.textContent.trim(),
          html: el.innerHTML,
          url: window.location.href,
          extractedAt: new Date().toISOString()
        };
      }
    }
    return null;
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
          }).catch(() => {});
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
      return { success: false, error: 'Not on a recognized ATS page' };
    }

    // Security check: triple-layer gate
    if (!msg.userInitiated) {
      return { success: false, error: 'Fill requires explicit user initiation' };
    }

    // Load handler if not already loaded
    if (!loadedHandler || loadedHandler.id !== ats.id) {
      try {
        // Dynamic import via chrome.runtime.getURL
        const handlerUrl = chrome.runtime.getURL(ats.config.module);
        const module = await import(handlerUrl);
        loadedHandler = { id: ats.id, handler: module.default || module };
      } catch (err) {
        return { success: false, error: `Failed to load handler for ${ats.id}: ${err.message}` };
      }
    }

    // Execute the fill
    const result = await loadedHandler.handler.fill({
      profile: msg.profile,
      resume: msg.resume,
      preferences: msg.preferences,
      fields: scanFormFields()
    });

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
      fieldCount: fields.length
    }).catch(() => {});

    // Start observing for dynamic form changes
    startMutationObserver();
  }
})();
