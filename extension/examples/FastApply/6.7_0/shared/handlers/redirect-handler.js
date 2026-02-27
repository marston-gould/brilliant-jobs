// shared/handlers/redirect-handler.js
// Handler for cross-domain redirects during job applications

import Logger from '../../core/logger.js';

/**
 * RedirectHandler - Manages redirects between domains during job applications
 *
 * Many job applications involve redirects:
 * - Aggregator → ATS (WeWorkRemotely → Greenhouse)
 * - Non-Easy Apply → External site (LinkedIn → Company careers)
 * - ATS → Company domain (Lever → mycompany.com)
 *
 * This handler:
 * - Tracks redirect chains
 * - Detects redirect loops
 * - Handles various redirect mechanisms (HTTP, meta refresh, JavaScript)
 * - Maintains context through redirects
 */
export default class RedirectHandler {
  constructor(config = {}) {
    this.devMode = config.devMode || false;
    this.logger = new Logger('RedirectHandler', this.devMode);

    // Redirect tracking
    this.redirectChain = [];
    this.maxRedirects = config.maxRedirects || 10;
    this.redirectTimeout = config.redirectTimeout || 10000;

    // Loop detection
    this.visitedUrls = new Set();
    this.loopThreshold = 2; // Same URL visited more than this = loop

    this.logger.log('RedirectHandler initialized');
  }

  /**
   * Follow redirects until we reach a final destination
   * @param {number} tabId - Chrome tab ID
   * @param {string} startUrl - Starting URL
   * @param {Object} options - Options
   * @returns {Promise<Object>} Final destination info
   */
  async followRedirects(tabId, startUrl, options = {}) {
    this.resetTracking();

    const {
      stopOnForm = true,      // Stop when we detect a form
      stopOnATS = true,       // Stop when we detect a known ATS
      maxDepth = this.maxRedirects,
      timeout = this.redirectTimeout,
    } = options;

    let currentUrl = startUrl;
    let depth = 0;

    this.logger.log(`Starting redirect chain from: ${startUrl}`);

    while (depth < maxDepth) {
      // Track this URL
      this.redirectChain.push({
        url: currentUrl,
        timestamp: Date.now(),
        depth,
      });

      // Check for redirect loop
      if (this.isLoop(currentUrl)) {
        this.logger.log(`Redirect loop detected at: ${currentUrl}`);
        return {
          success: false,
          reason: 'redirect_loop',
          chain: this.redirectChain,
          finalUrl: currentUrl,
        };
      }

      this.visitedUrls.add(currentUrl);

      // Wait for page to load
      await this.waitForLoad(tabId, timeout);

      // Get the current URL (might have changed due to redirect)
      const newUrl = await this.getCurrentUrl(tabId);

      // If URL changed, record it and continue
      if (newUrl !== currentUrl) {
        this.logger.log(`Redirect: ${currentUrl} → ${newUrl}`);
        currentUrl = newUrl;
        depth++;
        continue;
      }

      // No HTTP redirect - check for JS/meta redirects
      const pageRedirect = await this.detectPageRedirect(tabId);

      if (pageRedirect.hasRedirect) {
        this.logger.log(`Page redirect detected: ${pageRedirect.type}`);

        if (pageRedirect.url) {
          // Navigate to the redirect target
          await chrome.tabs.update(tabId, { url: pageRedirect.url });
          currentUrl = pageRedirect.url;
          depth++;
          continue;
        } else {
          // Wait for the redirect to happen
          await this.waitForNavigation(tabId, timeout / 2);
          const afterWaitUrl = await this.getCurrentUrl(tabId);

          if (afterWaitUrl !== currentUrl) {
            currentUrl = afterWaitUrl;
            depth++;
            continue;
          }
        }
      }

      // No more redirects detected
      break;
    }

    // Check if we hit the max depth
    if (depth >= maxDepth) {
      this.logger.log(`Max redirect depth reached: ${depth}`);
      return {
        success: false,
        reason: 'max_depth',
        chain: this.redirectChain,
        finalUrl: currentUrl,
      };
    }

    this.logger.log(`Final destination: ${currentUrl} (after ${depth} redirects)`);

    return {
      success: true,
      finalUrl: currentUrl,
      redirectCount: depth,
      chain: this.redirectChain,
    };
  }

  /**
   * Detect various redirect mechanisms on the page
   * @param {number} tabId - Chrome tab ID
   * @returns {Promise<Object>} Redirect detection result
   */
  async detectPageRedirect(tabId) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, {
        type: 'DETECT_PAGE_REDIRECT',
      });

      return result || { hasRedirect: false };

    } catch (error) {
      return { hasRedirect: false };
    }
  }

  /**
   * Check if we're in a redirect loop
   * @param {string} url - Current URL
   * @returns {boolean} True if loop detected
   */
  isLoop(url) {
    const normalizedUrl = this.normalizeUrl(url);

    const visitCount = this.redirectChain.filter(
      entry => this.normalizeUrl(entry.url) === normalizedUrl
    ).length;

    return visitCount >= this.loopThreshold;
  }

  /**
   * Normalize URL for comparison
   * @param {string} url - URL to normalize
   * @returns {string} Normalized URL
   */
  normalizeUrl(url) {
    try {
      const parsed = new URL(url);
      // Remove trailing slashes and fragments
      return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
    } catch {
      return url;
    }
  }

  /**
   * Wait for page to fully load
   * @param {number} tabId - Chrome tab ID
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<void>}
   */
  async waitForLoad(tabId, timeout) {
    return new Promise((resolve) => {
      let resolved = false;

      const checkComplete = async () => {
        if (resolved) return;

        try {
          const tab = await chrome.tabs.get(tabId);
          if (tab.status === 'complete') {
            resolved = true;
            resolve();
          }
        } catch (error) {
          resolved = true;
          resolve();
        }
      };

      // Check immediately
      checkComplete();

      // Set up listener
      const onUpdated = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete' && !resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(onUpdated);

      // Timeout fallback
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve();
        }
      }, timeout);
    });
  }

  /**
   * Wait for navigation to occur
   * @param {number} tabId - Chrome tab ID
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<boolean>} True if navigation occurred
   */
  async waitForNavigation(tabId, timeout) {
    const startUrl = await this.getCurrentUrl(tabId);

    return new Promise((resolve) => {
      let resolved = false;

      const onUpdated = async (updatedTabId, changeInfo) => {
        if (updatedTabId !== tabId || resolved) return;

        if (changeInfo.url && changeInfo.url !== startUrl) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve(true);
        }
      };

      chrome.tabs.onUpdated.addListener(onUpdated);

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve(false);
        }
      }, timeout);
    });
  }

  /**
   * Get current URL from tab
   * @param {number} tabId - Chrome tab ID
   * @returns {Promise<string>} Current URL
   */
  async getCurrentUrl(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      return tab.url || '';
    } catch {
      return '';
    }
  }

  /**
   * Reset tracking state
   */
  resetTracking() {
    this.redirectChain = [];
    this.visitedUrls.clear();
  }

  /**
   * Get the redirect chain
   * @returns {Array} Redirect chain
   */
  getChain() {
    return [...this.redirectChain];
  }

  /**
   * Get statistics about redirects
   * @returns {Object} Redirect statistics
   */
  getStats() {
    if (this.redirectChain.length === 0) {
      return { count: 0 };
    }

    const first = this.redirectChain[0];
    const last = this.redirectChain[this.redirectChain.length - 1];

    const domains = new Set(
      this.redirectChain.map(entry => {
        try {
          return new URL(entry.url).hostname;
        } catch {
          return entry.url;
        }
      })
    );

    return {
      count: this.redirectChain.length - 1,
      startUrl: first.url,
      endUrl: last.url,
      duration: last.timestamp - first.timestamp,
      uniqueDomains: domains.size,
      domains: Array.from(domains),
    };
  }
}
