// utils/applicationTracker.js — Auto-Application Tracking
// v3.0.0: Detects form submissions and button clicks matching
// apply/submit patterns. Automatically logs to pipeline.

/**
 * ApplicationTracker — watches for and records application submissions.
 *
 * Tracks:
 * - Form submit events
 * - Button clicks matching /(apply|submit|send application)/i
 * - URL changes after submit (confirmation page detection)
 * - Status reporting back to background.js
 */
export class ApplicationTracker {
  constructor(options = {}) {
    this.supabaseUrl = options.supabaseUrl || '';
    this.onSubmitDetected = options.onSubmitDetected || (() => {});
    this.onConfirmationDetected = options.onConfirmationDetected || (() => {});

    this._cleanupFns = [];
    this._pendingSubmit = null;
    this._confirmationPatterns = [
      /application\s+(received|submitted|sent|confirmed)/i,
      /thank\s+you\s+for\s+(applying|your\s+application)/i,
      /successfully\s+(submitted|applied)/i,
      /we('ve|\s+have)\s+received\s+your/i
    ];
  }

  /**
   * Start tracking submissions on the current page.
   */
  start() {
    // Watch form submits
    const formHandler = (event) => {
      const form = event.target;
      if (form?.tagName === 'FORM') {
        this._handleSubmit({
          type: 'form_submit',
          action: form.action,
          method: form.method,
          url: window.location.href,
          timestamp: new Date().toISOString()
        });
      }
    };
    document.addEventListener('submit', formHandler, true);
    this._cleanupFns.push(() => document.removeEventListener('submit', formHandler, true));

    // Watch button clicks matching submit patterns
    const submitPattern = /(apply|submit|send\s+application|confirm\s+application|complete\s+application)/i;
    const clickHandler = (event) => {
      const el = event.target.closest('button, a, [role="button"], input[type="submit"]');
      if (!el) return;

      const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
      if (submitPattern.test(text)) {
        this._handleSubmit({
          type: 'button_click',
          buttonText: text,
          url: window.location.href,
          timestamp: new Date().toISOString()
        });
      }
    };
    document.addEventListener('click', clickHandler, true);
    this._cleanupFns.push(() => document.removeEventListener('click', clickHandler, true));

    // Watch for confirmation page after submit
    this._confirmationInterval = setInterval(() => {
      if (this._pendingSubmit) {
        this._checkForConfirmation();
      }
    }, 1000);
    this._cleanupFns.push(() => clearInterval(this._confirmationInterval));
  }

  /**
   * Stop all tracking.
   */
  stop() {
    this._cleanupFns.forEach(fn => fn());
    this._cleanupFns = [];
    this._pendingSubmit = null;
  }

  /**
   * Handle a detected submit event.
   * @private
   */
  _handleSubmit(info) {
    this._pendingSubmit = info;
    this.onSubmitDetected(info);

    // Report to background.js
    chrome.runtime.sendMessage({
      type: 'ats:submitDetected',
      ...info
    }).catch(() => {});

    // Auto-clear pending after 30 seconds if no confirmation found
    setTimeout(() => {
      if (this._pendingSubmit === info) {
        this._pendingSubmit = null;
      }
    }, 30000);
  }

  /**
   * Check page content for confirmation messages.
   * @private
   */
  _checkForConfirmation() {
    const bodyText = document.body?.textContent || '';
    const titleText = document.title || '';
    const combinedText = bodyText + ' ' + titleText;

    for (const pattern of this._confirmationPatterns) {
      if (pattern.test(combinedText)) {
        const confirmation = {
          type: 'confirmation_detected',
          pattern: pattern.source,
          url: window.location.href,
          submitInfo: this._pendingSubmit,
          timestamp: new Date().toISOString()
        };

        this.onConfirmationDetected(confirmation);

        // Report to background.js
        chrome.runtime.sendMessage({
          type: 'ats:confirmationDetected',
          ...confirmation
        }).catch(() => {});

        this._pendingSubmit = null;
        break;
      }
    }
  }
}
