// utils/applicationTracker.ts — Auto-Application Tracking
// v3.1.0: Expanded confirmation detection patterns (Item #16)
// Detects form submissions and button clicks matching
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
      // ── Generic / cross-ATS ──
      /application\s+(received|submitted|sent|confirmed)/i,
      /thank\s+you\s+for\s+(applying|your\s+application|your\s+interest|your\s+submission)/i,
      /successfully\s+(submitted|applied|sent|received)/i,
      /we('ve|\s+have)\s+received\s+your/i,
      /your\s+application\s+(has\s+been|was)\s+(submitted|received|sent)/i,
      /application\s+(complete|completed|confirmation)/i,

      // ── Greenhouse ──
      /thanks\s+for\s+applying/i,
      /your\s+application\s+has\s+been\s+submitted\s+to/i,
      /application\s+submitted\s+for/i,

      // ── Lever ──
      /we('ve|\s+have)\s+received\s+your\s+application/i,
      /thanks!\s+your\s+application\s+has\s+been\s+received/i,

      // ── Workday ──
      /you\s+have\s+successfully\s+submitted\s+your/i,
      /application\s+submitted\s+successfully/i,
      /thank\s+you,?\s+your\s+information\s+has\s+been\s+submitted/i,
      /submission\s+successful/i,
      /your\s+submission\s+has\s+been\s+completed/i,

      // ── Indeed ──
      /your\s+application\s+has\s+been\s+sent\s+to/i,
      /application\s+sent/i,
      /your\s+resume\s+has\s+been\s+sent/i,
      /applied\s+successfully/i,

      // ── LinkedIn Easy Apply ──
      /your\s+application\s+was\s+sent\s+to/i,
      /application\s+sent\s+to/i,

      // ── Ashby / iCIMS / BambooHR / Jobvite / SmartRecruiters ──
      /we\s+appreciate\s+your\s+interest/i,
      /thanks\s+for\s+your\s+interest\s+in/i,
      /your\s+application\s+is\s+in/i,
      /application\s+received!/i,
      /you('ve|\s+have)\s+applied\s+(for|to)/i,
      /congratulations.*application/i,

      // ── URL path patterns (confirmation pages) ──
      /\/application[_-]?confirm(ation|ed)?/i,
      /\/apply[_-]?(success|complete|done|confirm)/i,
      /\/thank[_-]?you/i,
      /\/submitted/i,

      // ── Title-based confirmation ──
      /^application\s+(confirmed?|submitted|received)/i,
      /^thank\s+you/i,
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
    const urlPath = window.location.pathname + window.location.search;
    const combinedText = bodyText + ' ' + titleText + ' ' + urlPath;

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
