// platforms/aggregators/base-aggregator.js
// Base class for job aggregator platforms

import Logger from '../../core/logger.js';

/**
 * BaseAggregator - Base class for job aggregator platforms
 *
 * Aggregators (WeWorkRemotely, RemoteOK, BuiltIn, etc.) don't host application forms.
 * They redirect to company career pages or ATS systems.
 *
 * This base class handles:
 * - Job listing navigation
 * - Apply button detection and clicking
 * - Redirect following
 * - Handoff to UniversalJobRouter
 */
export default class BaseAggregator {
  constructor(config) {
    this.config = config;
    this.name = config.name || 'BaseAggregator';
    this.devMode = config.devMode || false;
    this.logger = new Logger(this.name, this.devMode);

    // References
    this.universalRouter = config.universalRouter;
    this.automationController = config.automationController;

    // Tab/Window management
    this.tabId = null;
    this.windowId = null;

    // Session context
    this.sessionContext = null;

    // Platform-specific selectors (override in subclasses)
    this.selectors = {
      jobListings: '.job-listing, .job-item, [data-job]',
      jobTitle: '.job-title, h2, h3',
      companyName: '.company-name, .company',
      applyButton: '.apply-button, .apply-btn, [data-apply], a[href*="apply"]',
      jobDescription: '.job-description, .description',
      jobLocation: '.location, .job-location',
      jobType: '.job-type, .employment-type',
    };

    // Apply button patterns
    this.applyPatterns = [
      /apply\s*(now)?/i,
      /submit\s*application/i,
      /apply\s*for\s*this\s*job/i,
      /apply\s*on\s*company\s*site/i,
      /apply\s*externally/i,
    ];

    this.logger.log(`${this.name} initialized`);
  }

  /**
   * Set the tab ID for this handler
   * @param {number} tabId - Chrome tab ID
   */
  setTab(tabId) {
    this.tabId = tabId;
  }

  /**
   * Set the window ID for this handler
   * @param {number} windowId - Chrome window ID
   */
  setWindow(windowId) {
    this.windowId = windowId;
  }

  /**
   * Set session context
   * @param {Object} sessionContext - Session context
   */
  setSessionContext(sessionContext) {
    this.sessionContext = sessionContext;
  }

  /**
   * Main entry point - apply to a job from this aggregator
   * @param {Object} jobElement - Job listing element or URL
   * @param {Object} sessionContext - Session context
   * @returns {Promise<Object>} Application result
   */
  async applyToJob(jobElement, sessionContext) {
    this.sessionContext = sessionContext;

    try {
      // Step 1: Extract job info from the listing
      const jobInfo = await this.extractJobInfo(jobElement);
      this.logger.log(`Processing job: ${jobInfo.title} at ${jobInfo.company}`);

      // Step 2: Navigate to job listing if needed
      if (jobInfo.url && !this.isOnJobPage(jobInfo.url)) {
        await this.navigateToJob(jobInfo.url);
        await this.waitForPageLoad();
      }

      // Step 3: Find and click the Apply button
      const applyResult = await this.clickApplyButton();

      if (!applyResult.success) {
        this.logger.error('Could not find or click apply button');
        return {
          success: false,
          reason: 'Apply button not found',
          jobInfo,
        };
      }

      // Step 4: Wait for redirect
      await this.waitForRedirect(5000);

      // Step 5: Get current URL after redirect
      const currentUrl = await this.getCurrentUrl();
      this.logger.log(`Redirected to: ${currentUrl}`);

      // Step 6: Merge job info into session context
      const enrichedContext = {
        ...sessionContext,
        jobInfo: {
          ...sessionContext.jobInfo,
          ...jobInfo,
          sourceAggregator: this.name,
        },
      };

      // Step 7: Delegate to UniversalJobRouter
      if (this.universalRouter) {
        return await this.universalRouter.routeJob(currentUrl, this.tabId, enrichedContext);
      } else {
        // Fallback: return info about where we landed
        return {
          success: true,
          redirected: true,
          currentUrl,
          jobInfo,
          message: 'Redirected to application page - continue manually',
        };
      }

    } catch (error) {
      this.logger.error('Error in applyToJob:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Extract job information from a listing
   * @param {Object} jobElement - Job listing element or data
   * @returns {Promise<Object>} Job information
   */
  async extractJobInfo(jobElement) {
    // If jobElement is already a data object, return it
    if (typeof jobElement === 'object' && jobElement.url) {
      return jobElement;
    }

    // Otherwise, try to extract from the page
    try {
      const result = await chrome.tabs.sendMessage(this.tabId, {
        type: 'EXTRACT_JOB_INFO',
        selectors: this.selectors,
      });

      return {
        title: result?.title || 'Unknown Position',
        company: result?.company || 'Unknown Company',
        url: result?.url || await this.getCurrentUrl(),
        location: result?.location,
        type: result?.type,
        description: result?.description,
        postedDate: result?.postedDate,
      };
    } catch (error) {
      this.logger.error('Error extracting job info:', error);
      return {
        title: 'Unknown Position',
        company: 'Unknown Company',
        url: await this.getCurrentUrl(),
      };
    }
  }

  /**
   * Find and click the Apply button
   * @returns {Promise<Object>} Click result
   */
  async clickApplyButton() {
    try {
      // Build comprehensive selector list
      const applySelectors = [
        this.selectors.applyButton,
        'button[data-apply]',
        'a[data-apply]',
        'button:contains("Apply")',
        'a:contains("Apply")',
        '[class*="apply"]',
        '[id*="apply"]',
        'a[href*="apply"]',
        '.apply-now',
        '.apply-btn',
        '.btn-apply',
        '#apply-button',
        '#applyButton',
        '[aria-label*="apply" i]',
        '[title*="apply" i]',
      ];

      const result = await chrome.tabs.sendMessage(this.tabId, {
        type: 'CLICK_APPLY_BUTTON',
        selectors: applySelectors,
        patterns: this.applyPatterns,
      });

      return result || { success: false };

    } catch (error) {
      this.logger.error('Error clicking apply button:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Navigate to a job URL
   * @param {string} url - Job URL
   * @returns {Promise<void>}
   */
  async navigateToJob(url) {
    await chrome.tabs.update(this.tabId, { url });
  }

  /**
   * Wait for page load to complete
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<void>}
   */
  async waitForPageLoad(timeout = 10000) {
    return new Promise((resolve) => {
      let resolved = false;

      const onUpdated = (tabId, changeInfo) => {
        if (tabId === this.tabId && changeInfo.status === 'complete' && !resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(onUpdated);

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
   * Wait for redirect after clicking apply
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<void>}
   */
  async waitForRedirect(timeout = 5000) {
    const startUrl = await this.getCurrentUrl();

    return new Promise((resolve) => {
      let resolved = false;

      const checkUrl = async () => {
        if (resolved) return;

        const currentUrl = await this.getCurrentUrl();
        if (currentUrl !== startUrl) {
          resolved = true;
          // Wait for new page to fully load
          await this.waitForPageLoad(5000);
          resolve();
        }
      };

      // Check periodically
      const interval = setInterval(checkUrl, 500);

      // Also listen for navigation events
      const onUpdated = (tabId, changeInfo) => {
        if (tabId === this.tabId && changeInfo.status === 'complete' && !resolved) {
          checkUrl();
        }
      };

      chrome.tabs.onUpdated.addListener(onUpdated);

      // Timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          clearInterval(interval);
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve();
        }
      }, timeout);
    });
  }

  /**
   * Check if we're on the job page
   * @param {string} jobUrl - Expected job URL
   * @returns {Promise<boolean>} True if on job page
   */
  async isOnJobPage(jobUrl) {
    const currentUrl = await this.getCurrentUrl();
    return currentUrl.includes(jobUrl) || jobUrl.includes(currentUrl);
  }

  /**
   * Get current URL
   * @returns {Promise<string>} Current URL
   */
  async getCurrentUrl() {
    try {
      const tab = await chrome.tabs.get(this.tabId);
      return tab.url || '';
    } catch (error) {
      return '';
    }
  }

  /**
   * Get page content
   * @returns {Promise<string>} Page HTML content
   */
  async getPageContent() {
    try {
      const result = await chrome.tabs.sendMessage(this.tabId, {
        type: 'GET_PAGE_CONTENT',
      });
      return result?.content || '';
    } catch (error) {
      return '';
    }
  }

  /**
   * Wait for specified milliseconds
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
