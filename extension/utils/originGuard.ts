// utils/originGuard.ts — Triple-Layer Origin Verification
// v3.6.0: Validates external messages from dashboard
//
// Layer 1: externally_connectable allowlist (manifest.json — Chrome enforces)
// Layer 2: sender.url/origin validation (this module)
// Layer 3: sender tab URL verification (this module)
//
// Chrome's externally_connectable already blocks messages from non-matching
// origins, but we add defense-in-depth in case of browser bugs or
// future manifest changes.

const BJ_ORIGIN_GUARD = (() => {
  'use strict';

  // Allowed origins — must match externally_connectable in manifest.json
  const ALLOWED_ORIGINS = [
    'https://brilliantjobs.app',
    'https://www.brilliantjobs.app',
    'https://dev.brilliantjobs.app',
    'https://staging.brilliantjobs.app',
  ];

  // Regex for any brilliantjobs.app subdomain over HTTPS
  const ORIGIN_PATTERN = /^https:\/\/([a-z0-9-]+\.)*brilliantjobs\.app$/;

  /**
   * Layer 2: Validate sender origin from onMessageExternal.
   * @param {object} sender - Chrome message sender object
   * @returns {{ valid: boolean, reason?: string, origin: string }}
   */
  function validateSender(sender) {
    const senderUrl = sender.url || sender.origin || '';
    let origin;

    try {
      origin = new URL(senderUrl).origin;
    } catch {
      return { valid: false, reason: 'invalid_sender_url', origin: senderUrl };
    }

    // Must be HTTPS
    if (!origin.startsWith('https://')) {
      return { valid: false, reason: 'not_https', origin };
    }

    // Must match allowed pattern
    if (!ORIGIN_PATTERN.test(origin)) {
      return { valid: false, reason: 'origin_not_allowed', origin };
    }

    return { valid: true, origin };
  }

  /**
   * Layer 3: Verify the sender's tab URL matches expected domain.
   * This catches edge cases where a compromised page might relay messages.
   * @param {object} sender - Chrome message sender object
   * @returns {Promise<{ valid: boolean, reason?: string }>}
   */
  async function validateSenderTab(sender) {
    // If sender has a tab, verify the tab's actual URL
    if (sender.tab && sender.tab.id) {
      try {
        const tab = await chrome.tabs.get(sender.tab.id);
        if (tab.url) {
          const tabOrigin = new URL(tab.url).origin;
          if (!ORIGIN_PATTERN.test(tabOrigin)) {
            return { valid: false, reason: 'tab_origin_mismatch', tabUrl: tab.url };
          }
        }
      } catch {
        // Tab may have closed — that's OK for non-tab senders
      }
    }
    return { valid: true };
  }

  /**
   * Full triple-layer validation.
   * Layer 1 is enforced by Chrome via externally_connectable.
   * This function handles Layers 2 + 3.
   *
   * @param {object} sender - Chrome onMessageExternal sender
   * @returns {Promise<{ valid: boolean, reason?: string, origin?: string }>}
   */
  async function validate(sender) {
    // Layer 2: Origin check
    const originCheck = validateSender(sender);
    if (!originCheck.valid) {
      return originCheck;
    }

    // Layer 3: Tab URL check
    const tabCheck = await validateSenderTab(sender);
    if (!tabCheck.valid) {
      return tabCheck;
    }

    return { valid: true, origin: originCheck.origin };
  }

  /**
   * Rate limiting for external messages.
   * Prevents abuse by limiting message frequency.
   */
  const _rateLimiter = {
    counts: new Map(), // origin -> { count, windowStart }
    MAX_PER_MINUTE: 60,
    WINDOW_MS: 60000,

    check(origin) {
      const now = Date.now();
      const entry = this.counts.get(origin);

      if (!entry || now - entry.windowStart > this.WINDOW_MS) {
        this.counts.set(origin, { count: 1, windowStart: now });
        return { allowed: true };
      }

      entry.count++;
      if (entry.count > this.MAX_PER_MINUTE) {
        return { allowed: false, reason: 'rate_limited' };
      }

      return { allowed: true };
    },

    // Cleanup old entries every 5 minutes
    cleanup() {
      const now = Date.now();
      for (const [origin, entry] of this.counts) {
        if (now - entry.windowStart > this.WINDOW_MS * 2) {
          this.counts.delete(origin);
        }
      }
    }
  };

  // Periodic cleanup
  setInterval(() => _rateLimiter.cleanup(), 300000);

  /**
   * Combined validation + rate limiting.
   * Use this as the single entry point in onMessageExternal.
   */
  async function guard(sender) {
    const validation = await validate(sender);
    if (!validation.valid) return validation;

    const rateCheck = _rateLimiter.check(validation.origin);
    if (!rateCheck.allowed) {
      return { valid: false, reason: rateCheck.reason, origin: validation.origin };
    }

    return { valid: true, origin: validation.origin };
  }

  return { validate, validateSender, validateSenderTab, guard };
})();
