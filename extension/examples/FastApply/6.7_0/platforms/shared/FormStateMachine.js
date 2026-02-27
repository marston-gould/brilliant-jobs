/**
 * FormStateMachine - State Machine for Multi-Step Form Automation
 *
 * Provides step fingerprinting, transition detection, and loop prevention
 * to ensure reliable form step navigation on Indeed/Glassdoor SmartApply.
 */

class FormStateMachine {
  constructor(options = {}) {
    // Step history for loop detection
    this.stepHistory = [];
    this.maxHistorySize = options.maxHistorySize || 10;

    // Loop prevention
    this.maxSameStepRetries = options.maxSameStepRetries || 3;
    this.currentStepRetries = 0;
    this.lastFingerprint = null;

    // Timing configuration (adaptive polling)
    this.transitionPollInterval = options.pollInterval || 200; // ms
    this.maxTransitionWait = options.maxTransitionWait || 8000; // ms
    this.minStabilityTime = options.minStabilityTime || 500; // ms DOM must be stable
  }

  /**
   * Generate a unique fingerprint for the current form step
   * Uses field count, field identifiers, button text, and visible content hash
   * @param {HTMLElement} container - Form container element
   * @returns {string} Unique step fingerprint
   */
  generateStepFingerprint(container) {
    if (!container) return "no-container";

    try {
      const parts = [];

      // 1. Count and identify visible form fields
      const inputs = container.querySelectorAll(
        'input:not([type="hidden"]), select, textarea'
      );
      const visibleInputs = Array.from(inputs).filter((el) =>
        this.isElementVisible(el)
      );
      parts.push(`fields:${visibleInputs.length}`);

      // 2. Get field identifiers (names, ids, data-testid)
      const fieldIds = visibleInputs
        .slice(0, 10) // Limit to first 10 for performance
        .map(
          (el) => el.name || el.id || el.getAttribute("data-testid") || el.type
        )
        .filter(Boolean)
        .join(",");
      parts.push(`ids:${fieldIds}`);

      // 3. Get action button text
      const actionButton = this.findPrimaryActionButton(container);
      if (actionButton) {
        parts.push(
          `btn:${actionButton.textContent?.trim().toLowerCase() || "unknown"}`
        );
      }

      // 4. Get legend/header text (step title)
      const legends = container.querySelectorAll(
        'legend, h1, h2, h3, [class*="header"], [class*="title"]'
      );
      const visibleLegends = Array.from(legends).filter((el) =>
        this.isElementVisible(el)
      );
      if (visibleLegends.length > 0) {
        const headerText =
          visibleLegends[0].textContent?.trim().slice(0, 50) || "";
        parts.push(`header:${headerText}`);
      }

      // 5. Check for resume step indicators
      const hasResumeIndicator = container.querySelector(
        '[data-testid*="resume"], [class*="resume"], input[type="file"]'
      );
      if (hasResumeIndicator) {
        parts.push("type:resume");
      }

      // 6. Add fieldset/question count for multi-question steps
      const fieldsets = container.querySelectorAll(
        'fieldset, [role="radiogroup"]'
      );
      const visibleFieldsets = Array.from(fieldsets).filter((el) =>
        this.isElementVisible(el)
      );
      parts.push(`groups:${visibleFieldsets.length}`);

      return parts.join("|");
    } catch (error) {
      console.warn("⚠️ Error generating fingerprint:", error);
      return `error:${Date.now()}`;
    }
  }

  /**
   * Find the primary action button (Continue, Next, Submit)
   * @param {HTMLElement} container - Form container
   * @returns {HTMLElement|null} The action button
   */
  findPrimaryActionButton(container) {
    const selectors = [
      '[data-testid="continue-button"]',
      '[data-testid="submit-button"]',
      '[data-testid="indeed-apply-button"]',
      'button[type="submit"]',
      'button[class*="continue"]',
      'button[class*="submit"]',
      'button[class*="next"]',
    ];

    for (const selector of selectors) {
      const button = container.querySelector(selector);
      if (button && this.isElementVisible(button)) {
        return button;
      }
    }

    // Fallback: find any visible button with action text
    const allButtons = container.querySelectorAll("button");
    for (const button of allButtons) {
      if (!this.isElementVisible(button)) continue;
      const text = button.textContent?.toLowerCase() || "";
      if (
        text.includes("continue") ||
        text.includes("next") ||
        text.includes("submit") ||
        text.includes("apply")
      ) {
        return button;
      }
    }

    return null;
  }

  /**
   * Check if element is visible
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} True if visible
   */
  isElementVisible(element) {
    if (!element) return false;

    try {
      const style = window.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    } catch {
      return false;
    }
  }

  /**
   * Record the current step fingerprint in history
   * @param {string} fingerprint - Step fingerprint
   */
  recordStep(fingerprint) {
    // Check if same as last step
    if (fingerprint === this.lastFingerprint) {
      this.currentStepRetries++;
      console.log(
        `🔄 Same step detected (retry ${this.currentStepRetries}/${this.maxSameStepRetries})`
      );
    } else {
      this.currentStepRetries = 0;
      this.lastFingerprint = fingerprint;

      // Add to history
      this.stepHistory.push({
        fingerprint,
        timestamp: Date.now(),
      });

      // Trim history if needed
      if (this.stepHistory.length > this.maxHistorySize) {
        this.stepHistory.shift();
      }

      console.log(`📝 New step recorded: ${fingerprint.slice(0, 80)}...`);
    }
  }

  /**
   * Check if we're stuck in a loop (same step repeated too many times)
   * @returns {boolean} True if stuck
   */
  isStuckInLoop() {
    return this.currentStepRetries >= this.maxSameStepRetries;
  }

  /**
   * Wait for step transition (DOM change after button click)
   * Uses adaptive polling instead of fixed delays
   * @param {string} beforeFingerprint - Fingerprint before button click
   * @param {HTMLElement} container - Form container
   * @param {number} timeout - Max wait time in ms
   * @returns {Promise<{transitioned: boolean, newFingerprint: string}>}
   */
  async waitForStepTransition(beforeFingerprint, container, timeout = null) {
    const maxWait = timeout || this.maxTransitionWait;
    const startTime = Date.now();
    let lastFingerprint = beforeFingerprint;
    let stableTime = 0;

    console.log("⏳ Waiting for step transition...");

    while (Date.now() - startTime < maxWait) {
      await this.sleep(this.transitionPollInterval);

      const currentFingerprint = this.generateStepFingerprint(container);

      // Check if fingerprint changed
      if (currentFingerprint !== beforeFingerprint) {
        // Fingerprint changed - wait for DOM to stabilize
        if (currentFingerprint === lastFingerprint) {
          stableTime += this.transitionPollInterval;

          // DOM has been stable long enough
          if (stableTime >= this.minStabilityTime) {
            console.log("✅ Step transition detected and stable");
            this.recordStep(currentFingerprint);
            return { transitioned: true, newFingerprint: currentFingerprint };
          }
        } else {
          // DOM still changing, reset stability timer
          stableTime = 0;
          lastFingerprint = currentFingerprint;
        }
      }
    }

    // Timeout - check one more time
    const finalFingerprint = this.generateStepFingerprint(container);
    if (finalFingerprint !== beforeFingerprint) {
      console.log("⚠️ Step transition detected at timeout");
      this.recordStep(finalFingerprint);
      return { transitioned: true, newFingerprint: finalFingerprint };
    }

    console.log("❌ No step transition detected within timeout");
    this.recordStep(beforeFingerprint); // Record same step (will increment retry counter)
    return { transitioned: false, newFingerprint: beforeFingerprint };
  }

  /**
   * Check if current step has no fillable fields (empty step)
   * These steps should proceed directly to clicking the action button
   * @param {HTMLElement} container - Form container
   * @returns {boolean} True if step has no fields
   */
  isEmptyStep(container) {
    if (!container) return true;

    const inputs = container.querySelectorAll(
      'input:not([type="hidden"]):not([type="file"]), select, textarea'
    );
    const visibleInputs = Array.from(inputs).filter((el) =>
      this.isElementVisible(el)
    );

    return visibleInputs.length === 0;
  }

  /**
   * Check if current step is a review/confirmation step
   * @param {HTMLElement} container - Form container
   * @returns {boolean} True if review step
   */
  isReviewStep(container) {
    if (!container) return false;

    const reviewIndicators = [
      '[class*="review"]',
      '[class*="confirm"]',
      '[class*="summary"]',
      '[data-testid*="review"]',
    ];

    for (const selector of reviewIndicators) {
      if (container.querySelector(selector)) {
        return true;
      }
    }

    // Also check for text content
    const text = container.textContent?.toLowerCase() || "";
    return (
      text.includes("review your") ||
      text.includes("confirm your") ||
      text.includes("summary")
    );
  }

  /**
   * Get diagnostic info for debugging
   * @returns {Object} State machine diagnostics
   */
  getDiagnostics() {
    return {
      stepCount: this.stepHistory.length,
      currentRetries: this.currentStepRetries,
      lastFingerprint: this.lastFingerprint?.slice(0, 50),
      isStuck: this.isStuckInLoop(),
      history: this.stepHistory.slice(-3).map((s) => ({
        fingerprint: s.fingerprint.slice(0, 50),
        timestamp: s.timestamp,
      })),
    };
  }

  /**
   * Reset state machine for new form
   */
  reset() {
    this.stepHistory = [];
    this.currentStepRetries = 0;
    this.lastFingerprint = null;
    console.log("🔄 Form state machine reset");
  }

  /**
   * Sleep helper
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default FormStateMachine;
