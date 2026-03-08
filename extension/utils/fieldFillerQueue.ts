// utils/fieldFillerQueue.ts — Serialized Field Filler Queue
// v3.0.0: Prevents race conditions when filling multiple dropdowns.
// Greenhouse react-select components break if you open two simultaneously.
// This queue processes one field at a time with proper wait times.

/**
 * Creates a new FieldFillerQueue instance.
 * All fill operations are serialized — next starts only after previous completes.
 */
export class FieldFillerQueue {
  constructor(options = {}) {
    this.queue = [];
    this.running = false;
    this.aborted = false;

    // Configurable delays
    this.renderDelay = options.renderDelay || 300;       // Wait for dropdown to render
    this.lazyLoadDelay = options.lazyLoadDelay || 1000;  // Wait for lazy-loaded options
    this.betweenFields = options.betweenFields || 150;   // Pause between fields
    this.scrollDelay = options.scrollDelay || 100;       // Wait after scroll correction

    // Callbacks
    this.onProgress = options.onProgress || (() => {});
    this.onError = options.onError || (() => {});
    this.onComplete = options.onComplete || (() => {});
  }

  /**
   * Add a fill operation to the queue.
   *
   * @param {Function} fillFn - Async function that fills a single field.
   *   Receives no arguments. Should return { success: boolean, field: string, error?: string }
   * @param {string} fieldName - Human-readable field name for logging
   * @returns {Promise} Resolves when this specific operation completes
   */
  enqueue(fillFn, fieldName = 'unknown') {
    return new Promise((resolve, reject) => {
      this.queue.push({ fillFn, fieldName, resolve, reject });
      this._processNext();
    });
  }

  /**
   * Add multiple fill operations at once.
   *
   * @param {Array<{fillFn: Function, fieldName: string}>} operations
   * @returns {Promise<Array>} Resolves with all results when queue is drained
   */
  enqueueAll(operations) {
    const promises = operations.map(op =>
      this.enqueue(op.fillFn, op.fieldName)
    );
    return Promise.allSettled(promises);
  }

  /**
   * Abort all pending operations. Current operation will finish.
   */
  abort() {
    this.aborted = true;
    // Reject all pending
    while (this.queue.length > 0) {
      const op = this.queue.shift();
      op.reject(new Error('Queue aborted'));
    }
  }

  /**
   * Reset the queue for reuse.
   */
  reset() {
    this.abort();
    this.aborted = false;
    this.running = false;
  }

  /**
   * Process the next item in the queue.
   * @private
   */
  async _processNext() {
    if (this.running || this.queue.length === 0 || this.aborted) return;

    this.running = true;
    const { fillFn, fieldName, resolve, reject } = this.queue.shift();

    try {
      this.onProgress({
        field: fieldName,
        remaining: this.queue.length,
        status: 'filling'
      });

      const result = await fillFn();

      // Scroll correction — prevent page jumping after dropdown operations
      await this._scrollBack();

      // Pause between fields for stability
      await sleep(this.betweenFields);

      this.onProgress({
        field: fieldName,
        remaining: this.queue.length,
        status: result.success ? 'done' : 'failed',
        result
      });

      resolve(result);
    } catch (err) {
      this.onError({ field: fieldName, error: err.message });
      resolve({ success: false, field: fieldName, error: err.message });
    } finally {
      this.running = false;

      if (this.queue.length > 0 && !this.aborted) {
        this._processNext();
      } else if (this.queue.length === 0) {
        this.onComplete();
      }
    }
  }

  /**
   * Scroll back to prevent page jumping after dropdown interactions.
   * @private
   */
  async _scrollBack() {
    // Some dropdowns cause scroll — restore position
    window.scrollTo({ top: window.scrollY, behavior: 'instant' });
    await sleep(this.scrollDelay);
  }
}

/**
 * Fill a searchable dropdown (react-select, select2, etc.)
 * Serialized 6-step process:
 * 1. Clear existing value via React props or DOM
 * 2. Open dropdown via mouseUp event
 * 3. Wait for render (300ms)
 * 4. If <100 options: scan and click match
 *    If >=100 options: type into search input (lazy-loaded)
 * 5. Wait for filtered result, click match
 * 6. Close via onBlur
 *
 * @param {HTMLElement} container - The dropdown container element
 * @param {string} value - The value to select
 * @param {Object} options - Configuration
 * @returns {Object} { success: boolean, error?: string }
 */
export async function fillSearchableDropdown(container, value, options = {}) {
  const renderDelay = options.renderDelay || 300;
  const lazyLoadDelay = options.lazyLoadDelay || 1000;

  try {
    // Step 1: Find the control element
    const control = container.querySelector(
      '.select__control, .css-1s2u09g-control, [class*="control"], ' +
      '.select2-selection, [role="combobox"]'
    );
    if (!control) {
      return { success: false, error: 'Dropdown control not found' };
    }

    // Step 2: Open the dropdown
    control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    control.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    control.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await sleep(renderDelay);

    // Step 3: Find the options menu
    const menu = container.querySelector(
      '.select__menu, [class*="menu"], [role="listbox"], ' +
      '.select2-results, .select2-dropdown'
    );
    if (!menu) {
      return { success: false, error: 'Dropdown menu did not open' };
    }

    // Step 4: Count options and decide strategy
    let optionEls = menu.querySelectorAll(
      '[role="option"], .select__option, [class*="option"], .select2-results__option'
    );

    if (optionEls.length >= 100) {
      // Lazy-loaded: type into search
      const searchInput = container.querySelector(
        'input[role="combobox"], .select__input input, input[aria-autocomplete]'
      );
      if (searchInput) {
        searchInput.focus();
        searchInput.value = value;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(lazyLoadDelay);

        // Re-query options after search
        optionEls = menu.querySelectorAll(
          '[role="option"], .select__option, [class*="option"], .select2-results__option'
        );
      }
    }

    // Step 5: Find and click the matching option
    const normalizedValue = value.toLowerCase().trim();
    let matched = false;

    for (const opt of optionEls) {
      const optText = opt.textContent.trim().toLowerCase();
      if (optText === normalizedValue || optText.includes(normalizedValue)) {
        opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        opt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        opt.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Step 6: Close dropdown even on failure
      control.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      return { success: false, error: `Option "${value}" not found in dropdown` };
    }

    // Step 6: Close via blur
    await sleep(100);
    control.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    return { success: true };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// Helpers
// ============================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
