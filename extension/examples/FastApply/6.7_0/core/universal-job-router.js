// core/universal-job-router.js
// Universal Job Router - Routes any job URL to the appropriate handler

import { PageClassifier, PageType } from '../shared/algorithms/page-classifier.js';
import Logger from './logger.js';

/**
 * UniversalJobRouter - Central routing logic for all job applications
 *
 * This component:
 * 1. Classifies pages using PageClassifier
 * 2. Follows redirects from aggregators
 * 3. Routes to existing ATS handlers when detected
 * 4. Falls back to GenericFormHandler for unknown sites
 */
export default class UniversalJobRouter {
  constructor(automationController, devMode = false) {
    this.controller = automationController;
    this.classifier = new PageClassifier();
    this.logger = new Logger('UniversalJobRouter', devMode);
    this.devMode = devMode;

    // Map PageType to existing platform handlers
    this.handlerMap = {
      [PageType.ATS_GREENHOUSE]: 'greenhouse',
      [PageType.ATS_LEVER]: 'lever',
      [PageType.ATS_WORKDAY]: 'workday',
      [PageType.ATS_ICIMS]: 'icims',
      [PageType.ATS_TALEO]: 'taleo',
      [PageType.ATS_JOBVITE]: 'jobvite',
      [PageType.ATS_SMARTRECRUITERS]: 'smartrecruiters',
      [PageType.ATS_BAMBOOHR]: 'bamboohr',
      [PageType.ATS_ASHBY]: 'ashby',
      [PageType.ATS_RIPPLING]: 'rippling',
      [PageType.ATS_BREEZY]: 'breezy',
      [PageType.ATS_JAZZ]: 'jazz',
      [PageType.ATS_RECRUITEE]: 'recruitee',
      [PageType.ATS_PERSONIO]: 'personio',
      [PageType.ATS_SUCCESSFACTORS]: 'successfactors',
      [PageType.ATS_WORKABLE]: 'workable',
      [PageType.GENERIC_FORM]: 'generic',
      [PageType.LINKEDIN_EASY_APPLY]: 'linkedin',
      [PageType.INDEED_APPLY]: 'indeed',
    };

    // Blocking page types that require user intervention
    this.blockingTypes = [
      PageType.LOGIN_REQUIRED,
      PageType.CAPTCHA_BLOCKED,
      PageType.EXPIRED_LISTING,
    ];

    // Maximum redirect depth to prevent infinite loops
    this.maxRedirectDepth = 5;

    this.logger.log('UniversalJobRouter initialized');
  }

  /**
   * Main entry point - route any job URL to appropriate handler
   * @param {string} jobUrl - The job URL to process
   * @param {number} tabId - Chrome tab ID
   * @param {Object} sessionContext - Session context with user data
   * @returns {Promise<Object>} Routing result
   */
  async routeJob(jobUrl, tabId, sessionContext) {
    this.logger.log(`Routing job: ${jobUrl}`);
    console.log(`🔄 UniversalJobRouter.routeJob called:`, { jobUrl, tabId, hasContext: !!sessionContext });

    try {
      // Get current page content for classification
      console.log(`📄 Getting page content from tab ${tabId}...`);
      const pageContent = await this.getPageContent(tabId);
      console.log(`📄 Got page content: ${pageContent?.length || 0} chars`);

      const currentUrl = await this.getCurrentUrl(tabId);
      console.log(`📄 Current URL: ${currentUrl}`);

      // Classify the current page
      console.log(`🔍 Classifying page...`);
      let classification = await this.classifier.classify(currentUrl, pageContent);
      this.logger.log(`Initial classification: ${classification.pageType} (confidence: ${classification.confidence})`);
      console.log(`🔍 Classification result:`, { pageType: classification.pageType, confidence: classification.confidence });

      // If we're on a job listing page (not application form), click Apply
      if (this.isJobListingPage(classification, pageContent)) {
        this.logger.log('Detected job listing page, looking for Apply button');

        const applyResult = await this.clickApplyButton(tabId);
        if (!applyResult.success) {
          return {
            success: false,
            reason: 'Could not find or click apply button',
            classification,
          };
        }

        // Wait for navigation/redirect
        await this.waitForNavigation(tabId, 5000);

        // Re-classify after navigation
        const newPageContent = await this.getPageContent(tabId);
        const newUrl = await this.getCurrentUrl(tabId);
        classification = await this.classifier.classify(newUrl, newPageContent);
        this.logger.log(`Post-apply classification: ${classification.pageType} (confidence: ${classification.confidence})`);
      }

      // Handle external redirects (follow up to maxRedirectDepth times)
      let redirectCount = 0;
      while (classification.pageType === PageType.EXTERNAL_REDIRECT && redirectCount < this.maxRedirectDepth) {
        this.logger.log(`Following redirect (${redirectCount + 1}/${this.maxRedirectDepth})`);

        await this.waitForNavigation(tabId, 5000);

        const newPageContent = await this.getPageContent(tabId);
        const newUrl = await this.getCurrentUrl(tabId);
        classification = await this.classifier.classify(newUrl, newPageContent);

        redirectCount++;
      }

      // Route based on final classification
      console.log(`🚀 Routing to handler for pageType: ${classification.pageType}`);
      return this.handleClassifiedPage(classification, tabId, sessionContext);

    } catch (error) {
      this.logger.error('Error in routeJob:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Handle a classified page - route to appropriate handler
   * @param {Object} classification - PageClassifier result
   * @param {number} tabId - Chrome tab ID
   * @param {Object} sessionContext - Session context
   * @returns {Promise<Object>} Handler result
   */
  async handleClassifiedPage(classification, tabId, sessionContext) {
    const { pageType, confidence, warnings } = classification;

    this.logger.log(`Handling page type: ${pageType}`);
    console.log(`🎯 handleClassifiedPage:`, { pageType, confidence, warnings });

    // Check for blocking conditions
    if (this.blockingTypes.includes(pageType)) {
      console.log(`🚫 Blocked state detected: ${pageType}`);
      return this.handleBlockedState(pageType, classification, sessionContext);
    }

    // Get the handler name for this page type
    const handlerName = this.handlerMap[pageType];
    console.log(`🔎 Handler lookup for ${pageType}: ${handlerName || 'none'}`);

    if (handlerName && handlerName !== 'generic') {
      // Route to existing ATS handler - NO REINVENTION!
      this.logger.log(`Routing to existing handler: ${handlerName}`);
      console.log(`✅ Delegating to existing handler: ${handlerName}`);
      return this.delegateToExistingHandler(handlerName, tabId, sessionContext);
    }

    if (pageType === PageType.GENERIC_FORM || pageType === PageType.UNKNOWN || confidence < 0.5) {
      // Use GenericFormHandler for unknown sites
      this.logger.log('Routing to GenericFormHandler');
      console.log(`✅ Routing to GenericFormHandler (pageType=${pageType}, confidence=${confidence})`);
      return this.delegateToGenericHandler(tabId, sessionContext, classification);
    }

    // Handle special cases
    if (pageType === PageType.EMAIL_APPLICATION) {
      return this.handleEmailApplication(tabId, sessionContext, classification);
    }

    if (pageType === PageType.PDF_APPLICATION) {
      return this.handlePdfApplication(tabId, sessionContext, classification);
    }

    return {
      success: false,
      reason: `Unhandled page type: ${pageType}`,
      classification,
      needsManualAction: true,
    };
  }

  /**
   * Delegate to an existing platform handler by injecting context
   * The handler will be loaded by content-bridge.js and run in the content script context
   * @param {string} handlerName - Platform handler name
   * @param {number} tabId - Chrome tab ID
   * @param {Object} sessionContext - Session context
   * @returns {Promise<Object>} Handler result
   */
  async delegateToExistingHandler(handlerName, tabId, sessionContext) {
    try {
      this.logger.log(`Delegating to existing handler: ${handlerName} for tab ${tabId}`);

      // Build context for the platform handler
      const context = {
        sessionId: sessionContext.sessionId,
        platform: handlerName,
        userId: sessionContext.userId,
        userProfile: sessionContext.userProfile,
        aiApiHost: sessionContext.aiApiHost,
        backendApiHost: sessionContext.backendApiHost,
        jwtToken: sessionContext.jwtToken,
        devMode: this.devMode,
        jobsToApply: 1, // Single job application
        preferences: sessionContext.preferences,
        isExternalApply: sessionContext.isExternalApply || false,
        sourceUrl: sessionContext.sourceUrl || '',
        jobDetails: sessionContext.jobDetails || sessionContext.jobInfo,
      };

      // First, inject context into window (for any new listeners)
      await this.controller.injectContext(tabId, {
        getContext: () => context,
      });

      // Send message to content-bridge to start automation with this context
      // This handles the case where content-bridge has already initialized
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: 'START_AUTOMATION_NOW',
          context,
        });

        if (response?.started) {
          this.logger.log(`Handler ${handlerName} started via message`);
          return {
            success: true,
            handlerName,
            delegated: true,
            message: `Started ${handlerName} handler via message`,
          };
        }

        if (response?.error === 'Already initialized') {
          this.logger.log(`Handler already running in tab ${tabId}`);
          return {
            success: true,
            handlerName,
            delegated: true,
            message: `Handler already running`,
          };
        }
      } catch (msgError) {
        this.logger.warn(`Could not send START_AUTOMATION_NOW: ${msgError.message}`);
      }

      // Fallback: context was injected, content-bridge should pick it up
      this.logger.log(`Context injected for ${handlerName}, waiting for content-bridge pickup`);

      // Return success - the handler should start via the injected context
      return {
        success: true,
        handlerName,
        delegated: true,
        message: `Delegated to ${handlerName} handler`,
      };

    } catch (error) {
      this.logger.error(`Error delegating to handler ${handlerName}:`, error);
      return {
        success: false,
        error: error.message,
        handler: handlerName,
      };
    }
  }

  /**
   * Delegate to GenericFormHandler for unknown forms
   * @param {number} tabId - Chrome tab ID
   * @param {Object} sessionContext - Session context
   * @param {Object} classification - Page classification
   * @returns {Promise<Object>} Handler result
   */
  async delegateToGenericHandler(tabId, sessionContext, classification) {
    console.log(`🔧 delegateToGenericHandler called for tab ${tabId}`);
    try {
      // Import GenericFormHandler dynamically
      console.log(`📦 Importing GenericFormHandler...`);
      const { default: GenericFormHandler } = await import('../platforms/generic/generic.js');
      console.log(`📦 GenericFormHandler imported successfully`);

      const handler = new GenericFormHandler({
        tabId,
        sessionContext,
        classification,
        devMode: this.devMode,
      });

      console.log(`🚀 Starting GenericFormHandler...`);
      const result = await handler.start(tabId, sessionContext);
      console.log(`🚀 GenericFormHandler completed:`, result);
      return result;

    } catch (error) {
      this.logger.error('Error in GenericFormHandler:', error);
      console.error(`❌ Error in GenericFormHandler:`, error);
      return {
        success: false,
        error: error.message,
        needsManualAction: true,
        userMessage: 'Unable to automate this application form. Please complete manually.',
      };
    }
  }

  /**
   * Handle blocked states (login required, captcha, expired)
   * @param {string} pageType - The blocking page type
   * @param {Object} classification - Full classification
   * @param {Object} sessionContext - Session context
   * @returns {Object} Blocked state result
   */
  handleBlockedState(pageType, classification, sessionContext) {
    const blockMessages = {
      [PageType.LOGIN_REQUIRED]: 'This application requires you to login or create an account. Please sign in to continue.',
      [PageType.CAPTCHA_BLOCKED]: 'CAPTCHA detected. Please complete the CAPTCHA to continue.',
      [PageType.EXPIRED_LISTING]: 'This job posting appears to be expired or no longer available.',
    };

    const message = blockMessages[pageType] || 'Unable to proceed with this application.';

    this.logger.log(`Blocked: ${pageType} - ${message}`);

    return {
      success: false,
      blocked: true,
      blockType: pageType,
      reason: message,
      needsUserAction: pageType !== PageType.EXPIRED_LISTING,
      userMessage: message,
      classification,
    };
  }

  /**
   * Handle email-only applications
   * @param {number} tabId - Chrome tab ID
   * @param {Object} sessionContext - Session context
   * @param {Object} classification - Classification result
   * @returns {Object} Email application result
   */
  handleEmailApplication(tabId, sessionContext, classification) {
    return {
      success: false,
      blocked: true,
      blockType: 'email_application',
      reason: 'This position requires applying via email.',
      needsUserAction: true,
      userMessage: 'Please compose and send an email to apply for this position.',
      emailInfo: classification.metadata,
    };
  }

  /**
   * Handle PDF applications
   * @param {number} tabId - Chrome tab ID
   * @param {Object} sessionContext - Session context
   * @param {Object} classification - Classification result
   * @returns {Object} PDF application result
   */
  handlePdfApplication(tabId, sessionContext, classification) {
    return {
      success: false,
      blocked: true,
      blockType: 'pdf_application',
      reason: 'This position requires downloading and filling a PDF application.',
      needsUserAction: true,
      userMessage: 'Please download the PDF application form and fill it manually.',
    };
  }

  /**
   * Check if the current page is a job listing (not an application form)
   * @param {Object} classification - Page classification
   * @param {string} pageContent - Page HTML content
   * @returns {boolean} True if this is a listing page
   */
  isJobListingPage(classification, pageContent) {
    // If confidence is low and we see apply buttons, it's likely a listing page
    if (classification.confidence < 0.5) {
      const hasApplyButton = /apply\s*(now|for|to)?|submit\s*application/i.test(pageContent);
      const hasJobDetails = /job\s*description|responsibilities|requirements|qualifications/i.test(pageContent);

      if (hasApplyButton && hasJobDetails) {
        return true;
      }
    }

    // Check for common job listing indicators
    const listingPatterns = [
      /class=["'][^"']*job[-_]?listing/i,
      /class=["'][^"']*job[-_]?details/i,
      /class=["'][^"']*job[-_]?description/i,
      /id=["']job[-_]?listing/i,
    ];

    return listingPatterns.some(p => p.test(pageContent));
  }

  /**
   * Click the Apply button on a job listing page
   * @param {number} tabId - Chrome tab ID
   * @returns {Promise<Object>} Click result
   */
  async clickApplyButton(tabId) {
    try {
      // Common apply button selectors
      const applySelectors = [
        'button[data-apply]',
        'a[data-apply]',
        '[class*="apply-button"]',
        '[class*="apply_button"]',
        '[class*="applyButton"]',
        'button:contains("Apply")',
        'a:contains("Apply")',
        '[aria-label*="apply" i]',
        '[title*="apply" i]',
        'button.apply',
        'a.apply',
        '#apply-button',
        '#applyButton',
        '.apply-now',
        '.apply-btn',
      ];

      // Try to find and click the apply button via content script
      const result = await chrome.tabs.sendMessage(tabId, {
        type: 'CLICK_APPLY_BUTTON',
        selectors: applySelectors,
      });

      return result || { success: false };

    } catch (error) {
      this.logger.error('Error clicking apply button:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for page navigation to complete
   * @param {number} tabId - Chrome tab ID
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<void>}
   */
  async waitForNavigation(tabId, timeout = 5000) {
    return new Promise((resolve) => {
      let resolved = false;

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
   * Get page content from tab
   * @param {number} tabId - Chrome tab ID
   * @returns {Promise<string>} Page HTML content or body text
   */
  async getPageContent(tabId) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, {
        type: 'GET_PAGE_CONTENT',
      });

      if (result?.success && result?.content) {
        // PageAnalyzer returns { success, content: { url, title, bodyText, scripts, forms, links, meta, html } }
        // Prefer actual HTML for accurate DOM-based classification
        if (result.content.html) {
          return result.content.html;
        }
        // Fallback: construct pseudo-HTML from available data
        const content = result.content;
        return `
          <html>
            <head><title>${content.title || ''}</title></head>
            <body>${content.bodyText || ''}</body>
          </html>
        `;
      }

      // Fallback: result might be a string directly
      if (typeof result === 'string') {
        return result;
      }

      return result?.content || '';
    } catch (error) {
      this.logger.error('Error getting page content:', error);
      return '';
    }
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
    } catch (error) {
      this.logger.error('Error getting current URL:', error);
      return '';
    }
  }

  /**
   * Check if a URL matches a known aggregator
   * @param {string} url - URL to check
   * @returns {boolean} True if this is an aggregator URL
   */
  isAggregatorUrl(url) {
    const aggregatorDomains = [
      'weworkremotely.com',
      'remoteok.com',
      'remoteok.io',
      'builtin.com',
      'angel.co',
      'wellfound.com',
      'remote.co',
      'flexjobs.com',
      'workingnomads.com',
      'remotive.com',
      'himalayas.app',
      'nodesk.co',
      'justremote.co',
    ];

    const urlLower = url.toLowerCase();
    return aggregatorDomains.some(domain => urlLower.includes(domain));
  }

  /**
   * Check if we should use the universal router for this URL
   * @param {string} url - URL to check
   * @param {string|null} platform - Detected platform (if any)
   * @returns {boolean} True if universal router should handle this
   */
  shouldUseUniversalRouter(url, platform) {
    // Use universal router for:
    // 1. URLs from aggregator sites
    if (this.isAggregatorUrl(url)) {
      return true;
    }

    // 2. URLs with no detected platform
    if (!platform) {
      return true;
    }

    // 3. URLs that might redirect (external links from job boards)
    const redirectIndicators = [
      /\/external[-_]?apply/i,
      /\/redirect/i,
      /\/apply[-_]?external/i,
      /outbound/i,
    ];

    if (redirectIndicators.some(p => p.test(url))) {
      return true;
    }

    return false;
  }
}
