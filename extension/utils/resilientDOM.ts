// utils/resilientDOM.ts — Resilient DOM selector utilities
// CS-010: EXT-FE-001 + EXT-FE-004 — Graceful degradation when selectors miss
// 
// Provides wrapper functions that:
// 1. Try multiple selectors in priority order
// 2. Wait for elements with configurable timeout
// 3. Report selector misses to PostHog (non-blocking)
// 4. Return null instead of throwing on miss

/**
 * Try multiple selectors in order, returning the first match.
 * Reports to PostHog if all selectors miss.
 * @param {string[]} selectors - CSS selectors in priority order
 * @param {Element} [root=document] - Root element to search within
 * @param {Object} [opts] - Options
 * @param {string} [opts.context] - Context string for error reporting (e.g. 'linkedin:modal')
 * @param {boolean} [opts.silent=false] - If true, suppress PostHog reporting
 * @returns {Element|null}
 */
export function queryResilient(selectors, root = document, opts = {}) {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch (e) {
      // Invalid selector — skip silently
    }
  }

  // All selectors missed
  if (!opts.silent) {
    _reportSelectorMiss('queryResilient', selectors, opts.context);
  }
  return null;
}

/**
 * Try multiple selectors for querySelectorAll, returning combined results.
 * Uses first selector that returns any results.
 * @param {string[]} selectors - CSS selectors in priority order
 * @param {Element} [root=document] - Root element to search within
 * @param {Object} [opts] - Options
 * @param {string} [opts.context] - Context string for error reporting
 * @param {boolean} [opts.silent=false] - If true, suppress PostHog reporting
 * @returns {Element[]}
 */
export function queryAllResilient(selectors, root = document, opts = {}) {
  for (const sel of selectors) {
    try {
      const els = root.querySelectorAll(sel);
      if (els.length > 0) return Array.from(els);
    } catch (e) {
      // Invalid selector — skip silently
    }
  }

  if (!opts.silent) {
    _reportSelectorMiss('queryAllResilient', selectors, opts.context);
  }
  return [];
}

/**
 * Wait for an element to appear in the DOM, trying multiple selectors.
 * @param {string[]} selectors - CSS selectors in priority order
 * @param {Object} [opts] - Options
 * @param {number} [opts.timeout=5000] - Max wait time in ms
 * @param {number} [opts.interval=200] - Polling interval in ms
 * @param {Element} [opts.root=document] - Root element to search within
 * @param {string} [opts.context] - Context string for error reporting
 * @returns {Promise<Element|null>}
 */
export function waitForElement(selectors, opts = {}) {
  const { timeout = 5000, interval = 200, root = document, context } = opts;

  return new Promise((resolve) => {
    // Immediate check
    const immediate = queryResilient(selectors, root, { silent: true });
    if (immediate) return resolve(immediate);

    const startTime = Date.now();

    const poll = setInterval(() => {
      const el = queryResilient(selectors, root, { silent: true });
      if (el) {
        clearInterval(poll);
        resolve(el);
        return;
      }

      if (Date.now() - startTime >= timeout) {
        clearInterval(poll);
        _reportSelectorMiss('waitForElement', selectors, context, { timeout });
        resolve(null);
      }
    }, interval);
  });
}

/**
 * Safely get text content from an element found by resilient selectors.
 * @param {string[]} selectors
 * @param {Element} [root=document]
 * @param {Object} [opts]
 * @returns {string}
 */
export function getTextResilient(selectors, root = document, opts = {}) {
  const el = queryResilient(selectors, root, { ...opts, silent: true });
  return el ? el.textContent.trim() : '';
}

/**
 * Wrap a handler's fill function with graceful degradation.
 * If the handler throws, catches the error, reports it, and returns
 * a structured error result instead of crashing.
 * @param {Function} fillFn - The handler's fill function
 * @param {string} handlerId - ATS handler identifier (e.g. 'greenhouse-react')
 * @returns {Function} Wrapped fill function
 */
export function withGracefulDegradation(fillFn, handlerId) {
  return async function (opts) {
    try {
      return await fillFn(opts);
    } catch (err) {
      const errorMsg = err?.message || String(err);
      console.error(`[BJ:${handlerId}] Handler error (gracefully degraded):`, errorMsg);

      // Report to PostHog via background
      try {
        chrome.runtime.sendMessage({
          type: 'ats:handlerError',
          handler: handlerId,
          error: errorMsg,
          url: window.location.href,
          timestamp: new Date().toISOString()
        }).catch(e => { try { chrome.runtime.sendMessage({ type: 'reportError', payload: { context: 'handler_error_report_' + handlerId, error: e?.message || String(e) } }).catch(() => {}); } catch {} });
      } catch (_) { console.warn('[BJ]', handlerId, 'error report failed'); }

      return {
        success: false,
        error: `${handlerId} handler failed: ${errorMsg}`,
        filledCount: 0,
        skippedCount: opts?.fields?.length || 0,
        errorCount: 1,
        errors: [{ field: '_handler', error: errorMsg }],
        degraded: true
      };
    }
  };
}

// ── Internal: PostHog reporting ──

let _missBuffer = [];
let _missFlushTimer = null;

function _reportSelectorMiss(fn, selectors, context, extra = {}) {
  _missBuffer.push({
    fn,
    selectors: selectors.slice(0, 3), // Cap to avoid huge payloads
    context: context || 'unknown',
    url: window.location.href,
    timestamp: Date.now(),
    ...extra
  });

  // Batch-flush every 2 seconds to avoid spamming
  if (!_missFlushTimer) {
    _missFlushTimer = setTimeout(() => {
      _flushMisses();
      _missFlushTimer = null;
    }, 2000);
  }
}

function _flushMisses() {
  if (_missBuffer.length === 0) return;

  const misses = _missBuffer.splice(0, 20); // Max 20 per flush
  try {
    chrome.runtime.sendMessage({
      type: 'ats:selectorMisses',
      misses,
      count: misses.length,
      url: window.location.href
    }).catch(e => { try { chrome.runtime.sendMessage({ type: 'reportError', payload: { context: 'selector_miss_report', error: e?.message || String(e) } }).catch(() => {}); } catch {} });
  } catch (_) { console.warn('[BJ] selector miss report failed'); }
}
