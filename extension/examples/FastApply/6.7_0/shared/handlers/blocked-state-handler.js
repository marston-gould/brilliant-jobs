// shared/handlers/blocked-state-handler.js
// Handler for blocked states during job applications (login, captcha, expired, etc.)

import Logger from '../../core/logger.js';

/**
 * BlockedState - Types of blocking states
 */
export const BlockedState = {
  NONE: 'none',
  LOGIN_REQUIRED: 'login_required',
  CAPTCHA: 'captcha',
  EXPIRED: 'expired',
  ALREADY_APPLIED: 'already_applied',
  NOT_ACCEPTING: 'not_accepting',
  LOCATION_RESTRICTED: 'location_restricted',
  ACCOUNT_REQUIRED: 'account_required',
  VERIFICATION_REQUIRED: 'verification_required',
  RATE_LIMITED: 'rate_limited',
  ERROR_PAGE: 'error_page',
  MAINTENANCE: 'maintenance',
  UNKNOWN: 'unknown',
};

/**
 * BlockedStateAction - What to do when blocked
 */
export const BlockedStateAction = {
  SKIP: 'skip',           // Skip this job, move to next
  RETRY: 'retry',         // Retry after delay
  MANUAL: 'manual',       // Request manual intervention
  LOGIN: 'login',         // Attempt login flow
  WAIT: 'wait',           // Wait for user action
  ABORT: 'abort',         // Abort entire session
};

/**
 * Detection patterns for various blocked states
 */
const BLOCKED_STATE_PATTERNS = {
  [BlockedState.LOGIN_REQUIRED]: {
    urlPatterns: [
      /\/login/i,
      /\/signin/i,
      /\/sign-in/i,
      /\/auth/i,
      /\/sso/i,
      /\/oauth/i,
      /accounts\./i,
      /\/session\/new/i,
    ],
    textPatterns: [
      /sign\s*in\s*to\s*continue/i,
      /log\s*in\s*to\s*apply/i,
      /please\s*log\s*in/i,
      /create\s*an?\s*account/i,
      /sign\s*up\s*to\s*apply/i,
      /you\s*must\s*be\s*logged\s*in/i,
      /authentication\s*required/i,
    ],
    selectors: [
      'form[action*="login"]',
      'form[action*="signin"]',
      '#login-form',
      '.login-container',
      '[data-testid="login-form"]',
    ],
    action: BlockedStateAction.LOGIN,
    priority: 1,
  },

  [BlockedState.CAPTCHA]: {
    urlPatterns: [],
    textPatterns: [
      /verify\s*you.*human/i,
      /complete\s*the\s*captcha/i,
      /security\s*check/i,
      /robot\s*verification/i,
    ],
    selectors: [
      '.g-recaptcha',
      '.h-captcha',
      '[data-sitekey]',
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      '.cf-turnstile',
      '#captcha',
      '.captcha-container',
    ],
    action: BlockedStateAction.MANUAL,
    priority: 2,
  },

  [BlockedState.EXPIRED]: {
    urlPatterns: [
      /expired/i,
      /closed/i,
      /no-longer/i,
    ],
    textPatterns: [
      /position.*no\s*longer\s*available/i,
      /job.*has\s*been\s*filled/i,
      /application.*closed/i,
      /this\s*job\s*has\s*expired/i,
      /posting.*expired/i,
      /no\s*longer\s*accepting/i,
      /position.*been\s*filled/i,
      /role.*been\s*filled/i,
    ],
    selectors: [
      '.job-expired',
      '.position-filled',
      '[data-job-status="closed"]',
    ],
    action: BlockedStateAction.SKIP,
    priority: 3,
  },

  [BlockedState.ALREADY_APPLIED]: {
    urlPatterns: [],
    textPatterns: [
      /already\s*applied/i,
      /you.*applied.*this\s*job/i,
      /application.*submitted/i,
      /thank\s*you.*applying/i,
      /we.*received.*application/i,
      /duplicate\s*application/i,
    ],
    selectors: [
      '.already-applied',
      '[data-applied="true"]',
      '.application-submitted',
    ],
    action: BlockedStateAction.SKIP,
    priority: 4,
  },

  [BlockedState.NOT_ACCEPTING]: {
    urlPatterns: [],
    textPatterns: [
      /not\s*accepting\s*applications/i,
      /applications?\s*paused/i,
      /hiring\s*freeze/i,
      /position\s*on\s*hold/i,
      /temporarily\s*closed/i,
    ],
    selectors: [
      '.not-accepting',
      '.applications-paused',
    ],
    action: BlockedStateAction.SKIP,
    priority: 5,
  },

  [BlockedState.LOCATION_RESTRICTED]: {
    urlPatterns: [],
    textPatterns: [
      /not\s*available\s*in\s*your\s*(location|country|region)/i,
      /location\s*restricted/i,
      /geo\s*restricted/i,
      /only\s*accepting.*from/i,
      /must\s*be\s*authorized\s*to\s*work/i,
    ],
    selectors: [
      '.location-restricted',
      '.geo-blocked',
    ],
    action: BlockedStateAction.SKIP,
    priority: 6,
  },

  [BlockedState.ACCOUNT_REQUIRED]: {
    urlPatterns: [],
    textPatterns: [
      /create\s*an?\s*account\s*to\s*apply/i,
      /registration\s*required/i,
      /sign\s*up\s*first/i,
      /join.*to\s*apply/i,
    ],
    selectors: [
      'form[action*="register"]',
      'form[action*="signup"]',
      '.registration-form',
    ],
    action: BlockedStateAction.MANUAL,
    priority: 7,
  },

  [BlockedState.VERIFICATION_REQUIRED]: {
    urlPatterns: [
      /verify/i,
      /confirm/i,
    ],
    textPatterns: [
      /verify\s*your\s*email/i,
      /confirmation\s*required/i,
      /check\s*your\s*inbox/i,
      /we.*sent.*verification/i,
      /phone\s*verification/i,
    ],
    selectors: [
      '.verification-pending',
      '.email-verification',
    ],
    action: BlockedStateAction.MANUAL,
    priority: 8,
  },

  [BlockedState.RATE_LIMITED]: {
    urlPatterns: [
      /rate.?limit/i,
      /too.?many/i,
    ],
    textPatterns: [
      /too\s*many\s*requests/i,
      /rate\s*limit/i,
      /slow\s*down/i,
      /try\s*again\s*later/i,
      /temporarily\s*blocked/i,
    ],
    selectors: [],
    action: BlockedStateAction.RETRY,
    retryDelay: 60000, // 1 minute
    priority: 9,
  },

  [BlockedState.ERROR_PAGE]: {
    urlPatterns: [
      /error/i,
      /404/,
      /500/,
      /not.?found/i,
    ],
    textPatterns: [
      /page\s*not\s*found/i,
      /404\s*error/i,
      /something\s*went\s*wrong/i,
      /internal\s*server\s*error/i,
      /oops/i,
      /we.*couldn.*find/i,
    ],
    selectors: [
      '.error-page',
      '.not-found',
      '[data-error="true"]',
    ],
    action: BlockedStateAction.SKIP,
    priority: 10,
  },

  [BlockedState.MAINTENANCE]: {
    urlPatterns: [
      /maintenance/i,
      /down.?for/i,
    ],
    textPatterns: [
      /under\s*maintenance/i,
      /temporarily\s*unavailable/i,
      /scheduled\s*maintenance/i,
      /we.*be\s*back/i,
      /site.*down/i,
    ],
    selectors: [
      '.maintenance-page',
      '.site-down',
    ],
    action: BlockedStateAction.RETRY,
    retryDelay: 300000, // 5 minutes
    priority: 11,
  },
};

/**
 * BlockedStateHandler - Detects and handles blocked states
 */
export default class BlockedStateHandler {
  constructor(config = {}) {
    this.devMode = config.devMode || false;
    this.logger = new Logger('BlockedStateHandler', this.devMode);

    this.maxRetries = config.maxRetries || 3;
    this.retryCount = 0;

    this.logger.log('BlockedStateHandler initialized');
  }

  /**
   * Detect blocked state from page
   * @param {number} tabId - Chrome tab ID
   * @returns {Promise<Object>} Detection result
   */
  async detectBlockedState(tabId) {
    try {
      // Get page info
      const pageInfo = await this.getPageInfo(tabId);

      if (!pageInfo) {
        return { state: BlockedState.NONE, confidence: 0 };
      }

      const { url, content, hasSelectors } = pageInfo;

      // Check each pattern set
      const detections = [];

      for (const [state, patterns] of Object.entries(BLOCKED_STATE_PATTERNS)) {
        const detection = this.checkPatterns(state, patterns, url, content, hasSelectors);

        if (detection.matched) {
          detections.push({
            state,
            ...detection,
            action: patterns.action,
            retryDelay: patterns.retryDelay,
            priority: patterns.priority,
          });
        }
      }

      // No blocked state detected
      if (detections.length === 0) {
        return {
          state: BlockedState.NONE,
          confidence: 1,
          action: null,
        };
      }

      // Sort by priority and confidence
      detections.sort((a, b) => {
        if (a.confidence !== b.confidence) {
          return b.confidence - a.confidence;
        }
        return a.priority - b.priority;
      });

      const best = detections[0];

      this.logger.log(`Blocked state detected: ${best.state} (confidence: ${best.confidence})`);

      return {
        state: best.state,
        confidence: best.confidence,
        action: best.action,
        retryDelay: best.retryDelay,
        matchedPatterns: best.matchedPatterns,
        allDetections: detections,
      };

    } catch (error) {
      this.logger.log(`Error detecting blocked state: ${error.message}`);
      return { state: BlockedState.UNKNOWN, confidence: 0.5, action: BlockedStateAction.MANUAL };
    }
  }

  /**
   * Get page information for detection
   * @param {number} tabId - Chrome tab ID
   * @returns {Promise<Object>} Page info
   */
  async getPageInfo(tabId) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, {
        type: 'GET_BLOCKED_STATE_INFO',
      });

      return result;
    } catch (error) {
      // Fallback to basic tab info
      try {
        const tab = await chrome.tabs.get(tabId);
        return {
          url: tab.url || '',
          content: tab.title || '',
          hasSelectors: {},
        };
      } catch {
        return null;
      }
    }
  }

  /**
   * Check patterns against page info
   * @param {string} state - State being checked
   * @param {Object} patterns - Pattern set
   * @param {string} url - Page URL
   * @param {string} content - Page text content
   * @param {Object} hasSelectors - Map of selector presence
   * @returns {Object} Check result
   */
  checkPatterns(state, patterns, url, content, hasSelectors) {
    let confidence = 0;
    const matchedPatterns = [];

    // Check URL patterns (weight: 0.4)
    for (const pattern of patterns.urlPatterns) {
      if (pattern.test(url)) {
        confidence += 0.4;
        matchedPatterns.push({ type: 'url', pattern: pattern.toString() });
        break; // Only count once
      }
    }

    // Check text patterns (weight: 0.35)
    for (const pattern of patterns.textPatterns) {
      if (pattern.test(content)) {
        confidence += 0.35;
        matchedPatterns.push({ type: 'text', pattern: pattern.toString() });
        break; // Only count once
      }
    }

    // Check selectors (weight: 0.25)
    for (const selector of patterns.selectors) {
      if (hasSelectors[selector]) {
        confidence += 0.25;
        matchedPatterns.push({ type: 'selector', selector });
        break; // Only count once
      }
    }

    return {
      matched: confidence > 0,
      confidence: Math.min(confidence, 1),
      matchedPatterns,
    };
  }

  /**
   * Handle a blocked state
   * @param {string} state - Blocked state
   * @param {Object} options - Handler options
   * @returns {Promise<Object>} Handle result
   */
  async handleBlockedState(state, options = {}) {
    const {
      tabId,
      action,
      retryDelay,
      onRetry,
      onSkip,
      onManual,
      onLogin,
      onAbort,
    } = options;

    this.logger.log(`Handling blocked state: ${state}, action: ${action}`);

    switch (action) {
      case BlockedStateAction.SKIP:
        if (onSkip) await onSkip();
        return { handled: true, action: 'skipped', reason: state };

      case BlockedStateAction.RETRY:
        if (this.retryCount >= this.maxRetries) {
          this.logger.log(`Max retries reached for ${state}`);
          if (onSkip) await onSkip();
          return { handled: true, action: 'skipped', reason: 'max_retries' };
        }

        this.retryCount++;
        const delay = retryDelay || 30000;

        this.logger.log(`Retrying in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);

        await this.sleep(delay);

        if (onRetry) await onRetry();
        return { handled: true, action: 'retried', retryCount: this.retryCount };

      case BlockedStateAction.MANUAL:
        if (onManual) await onManual();
        return { handled: false, action: 'manual_required', reason: state };

      case BlockedStateAction.LOGIN:
        if (onLogin) {
          const loginResult = await onLogin();
          if (loginResult.success) {
            return { handled: true, action: 'logged_in' };
          }
        }
        if (onManual) await onManual();
        return { handled: false, action: 'login_failed', reason: state };

      case BlockedStateAction.WAIT:
        // Signal that we're waiting for user
        if (onManual) await onManual();
        return { handled: false, action: 'waiting', reason: state };

      case BlockedStateAction.ABORT:
        if (onAbort) await onAbort();
        return { handled: true, action: 'aborted', reason: state };

      default:
        this.logger.log(`Unknown action: ${action}`);
        return { handled: false, action: 'unknown', reason: state };
    }
  }

  /**
   * Check if we should skip this job
   * @param {string} state - Blocked state
   * @returns {boolean} True if should skip
   */
  shouldSkip(state) {
    const skipStates = [
      BlockedState.EXPIRED,
      BlockedState.ALREADY_APPLIED,
      BlockedState.NOT_ACCEPTING,
      BlockedState.LOCATION_RESTRICTED,
      BlockedState.ERROR_PAGE,
    ];

    return skipStates.includes(state);
  }

  /**
   * Check if state requires manual intervention
   * @param {string} state - Blocked state
   * @returns {boolean} True if manual required
   */
  requiresManual(state) {
    const manualStates = [
      BlockedState.CAPTCHA,
      BlockedState.ACCOUNT_REQUIRED,
      BlockedState.VERIFICATION_REQUIRED,
    ];

    return manualStates.includes(state);
  }

  /**
   * Get human-readable message for state
   * @param {string} state - Blocked state
   * @returns {string} Message
   */
  getStateMessage(state) {
    const messages = {
      [BlockedState.NONE]: 'No issues detected',
      [BlockedState.LOGIN_REQUIRED]: 'Login required to continue',
      [BlockedState.CAPTCHA]: 'CAPTCHA verification required',
      [BlockedState.EXPIRED]: 'This job posting has expired',
      [BlockedState.ALREADY_APPLIED]: 'You have already applied to this job',
      [BlockedState.NOT_ACCEPTING]: 'This position is not accepting applications',
      [BlockedState.LOCATION_RESTRICTED]: 'This job is not available in your location',
      [BlockedState.ACCOUNT_REQUIRED]: 'Account creation required to apply',
      [BlockedState.VERIFICATION_REQUIRED]: 'Email or phone verification required',
      [BlockedState.RATE_LIMITED]: 'Too many requests - please wait',
      [BlockedState.ERROR_PAGE]: 'Error loading the page',
      [BlockedState.MAINTENANCE]: 'Site is under maintenance',
      [BlockedState.UNKNOWN]: 'Unknown issue encountered',
    };

    return messages[state] || 'Unknown state';
  }

  /**
   * Reset retry counter
   */
  resetRetries() {
    this.retryCount = 0;
  }

  /**
   * Sleep helper
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
