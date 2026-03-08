// utils/mutationWatcher.ts — MutationObserver for Dynamic Forms
// v3.0.0: Watches for dynamically loaded form fields on multi-step forms.
// LinkedIn Easy Apply has 1-10+ steps, Workday has 4+ pages.
// Without this, fields beyond the first visible set won't fill.

/**
 * MutationWatcher — monitors DOM for form field changes.
 *
 * Usage:
 *   const watcher = new MutationWatcher({
 *     onFieldsAdded: (fields) => { ... },
 *     onStepChange: (stepInfo) => { ... }
 *   });
 *   watcher.start();
 *   // ... later
 *   watcher.stop();
 */
export class MutationWatcher {
  constructor(options = {}) {
    this.observer = null;
    this.onFieldsAdded = options.onFieldsAdded || (() => {});
    this.onStepChange = options.onStepChange || (() => {});
    this.onFormSubmit = options.onFormSubmit || (() => {});

    // Debounce to avoid excessive callbacks from rapid DOM changes
    this.debounceMs = options.debounceMs || 200;
    this._debounceTimer = null;
    this._previousFieldCount = 0;

    // Track step/page changes
    this._previousURL = window.location.href;
    this._stepCounter = 0;

    // Form selectors to watch
    this.formSelectors = [
      'input:not([type="hidden"]):not([type="submit"])',
      'select',
      'textarea',
      '[role="combobox"]',
      '[role="listbox"]',
      'input[type="file"]',
      '[role="radiogroup"]',
      '[role="checkbox"]'
    ].join(', ');
  }

  /**
   * Start watching for DOM mutations.
   * @param {HTMLElement} root - Root element to observe (default: document.body)
   */
  start(root = document.body) {
    if (this.observer) this.stop();

    this.observer = new MutationObserver(mutations => {
      this._handleMutations(mutations);
    });

    this.observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'disabled']
    });

    // Also watch for URL changes (SPA navigation / multi-step)
    this._urlCheckInterval = setInterval(() => {
      if (window.location.href !== this._previousURL) {
        this._previousURL = window.location.href;
        this._stepCounter++;
        this.onStepChange({
          step: this._stepCounter,
          url: window.location.href
        });
      }
    }, 500);

    // Watch for form submissions
    document.addEventListener('submit', this._onSubmit.bind(this), true);
  }

  /**
   * Stop watching.
   */
  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this._urlCheckInterval) {
      clearInterval(this._urlCheckInterval);
      this._urlCheckInterval = null;
    }
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    document.removeEventListener('submit', this._onSubmit.bind(this), true);
  }

  /**
   * Get current step count.
   */
  getStepCount() {
    return this._stepCounter;
  }

  /**
   * Reset step counter (e.g., when starting a new application).
   */
  resetSteps() {
    this._stepCounter = 0;
    this._previousURL = window.location.href;
  }

  /**
   * Handle mutations — debounced.
   * @private
   */
  _handleMutations(mutations) {
    let formRelated = false;

    for (const mutation of mutations) {
      // Check added nodes
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            if (this._isFormRelated(node)) {
              formRelated = true;
              break;
            }
          }
        }
      }

      // Check attribute changes (e.g., field becoming visible)
      if (mutation.type === 'attributes') {
        if (this._isFormRelated(mutation.target)) {
          formRelated = true;
        }
      }

      if (formRelated) break;
    }

    if (formRelated) {
      // Debounce — wait for DOM to settle
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this._emitFieldChanges();
      }, this.debounceMs);
    }
  }

  /**
   * Check if an element is form-related.
   * @private
   */
  _isFormRelated(el) {
    if (!el.matches && !el.querySelector) return false;

    try {
      return (
        (el.matches && el.matches(this.formSelectors)) ||
        (el.querySelector && el.querySelector(this.formSelectors))
      );
    } catch {
      return false;
    }
  }

  /**
   * Count current visible form fields and emit if changed.
   * @private
   */
  _emitFieldChanges() {
    const fields = document.querySelectorAll(this.formSelectors);
    const visibleFields = Array.from(fields).filter(el => {
      // Only count visible fields
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        el.getAttribute('aria-hidden') !== 'true'
      );
    });

    const count = visibleFields.length;
    if (count !== this._previousFieldCount) {
      const added = count > this._previousFieldCount;
      this._previousFieldCount = count;

      if (added) {
        this.onFieldsAdded({
          count,
          fields: visibleFields.map(el => ({
            tag: el.tagName.toLowerCase(),
            type: el.type || el.getAttribute('role') || 'text',
            name: el.name || el.id || '',
            visible: true
          }))
        });
      }
    }
  }

  /**
   * Handle form submit events for auto-tracking.
   * @private
   */
  _onSubmit(event) {
    const form = event.target;
    if (form && form.tagName === 'FORM') {
      this.onFormSubmit({
        action: form.action,
        method: form.method,
        url: window.location.href,
        timestamp: new Date().toISOString()
      });
    }
  }
}

/**
 * Detect submit-like button clicks for application tracking.
 * Matches /(apply|submit|send application)/i pattern.
 *
 * @param {Function} callback - Called when a submit-like click is detected
 * @returns {Function} Cleanup function to remove the listener
 */
export function watchForSubmitClicks(callback) {
  const submitPattern = /(apply|submit|send\s+application|confirm|complete)/i;

  function handler(event) {
    const el = event.target.closest('button, a, [role="button"], input[type="submit"]');
    if (!el) return;

    const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
    if (submitPattern.test(text)) {
      callback({
        text,
        element: el.tagName.toLowerCase(),
        url: window.location.href,
        timestamp: new Date().toISOString()
      });
    }
  }

  document.addEventListener('click', handler, true);

  return () => document.removeEventListener('click', handler, true);
}
