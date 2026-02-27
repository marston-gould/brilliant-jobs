// platforms/aggregators/builtin.js
// BuiltIn Handler - Tech job aggregator

import BaseAggregator from './base-aggregator.js';

/**
 * BuiltInHandler - Handler for BuiltIn job boards
 *
 * BuiltIn operates multiple city-specific tech job boards:
 * - builtin.com (main)
 * - builtinnyc.com (New York)
 * - builtinchicago.com (Chicago)
 * - builtinla.com (Los Angeles)
 * - builtinboston.com (Boston)
 * - builtincolorado.com (Colorado)
 * - builtinaustin.com (Austin)
 * - builtinseattle.com (Seattle)
 */
export default class BuiltInHandler extends BaseAggregator {
  constructor(config) {
    super({
      ...config,
      name: 'BuiltIn',
    });

    // BuiltIn-specific selectors
    this.selectors = {
      jobListings: '.job-item, [data-id="job-card"]',
      jobTitle: '.job-title, h2[data-id="job-title"]',
      companyName: '.company-name, [data-id="company-name"]',
      applyButton: '.job-apply-button, [data-id="apply-button"], a[href*="apply"]',
      jobDescription: '.job-description, [data-id="job-description"]',
      jobLocation: '.job-location, [data-id="job-location"]',
      companyInfo: '.company-info',
      benefits: '.benefits, .perks',
    };

    // BuiltIn-specific apply patterns
    this.applyPatterns = [
      /apply\s*(now)?/i,
      /apply\s*for\s*this\s*job/i,
      /apply\s*on\s*company\s*site/i,
      /easy\s*apply/i,
    ];

    this.logger.log('BuiltInHandler initialized');
  }

  /**
   * Override extractJobInfo for BuiltIn-specific structure
   * @param {Object} jobElement - Job element or data
   * @returns {Promise<Object>} Job information
   */
  async extractJobInfo(jobElement) {
    if (typeof jobElement === 'object' && jobElement.title && jobElement.url) {
      return jobElement;
    }

    try {
      const result = await chrome.tabs.sendMessage(this.tabId, {
        type: 'EXTRACT_BUILTIN_JOB_INFO',
        selectors: this.selectors,
      });

      if (result?.success) {
        return {
          title: result.title || 'Unknown Position',
          company: result.company || 'Unknown Company',
          url: result.url || await this.getCurrentUrl(),
          location: result.location,
          companyInfo: result.companyInfo,
          benefits: result.benefits,
          description: result.description,
          source: 'builtin',
        };
      }

      return super.extractJobInfo(jobElement);

    } catch (error) {
      this.logger.error('Error extracting BuiltIn job info:', error);
      return super.extractJobInfo(jobElement);
    }
  }

  /**
   * Override clickApplyButton for BuiltIn-specific behavior
   * @returns {Promise<Object>} Click result
   */
  async clickApplyButton() {
    try {
      const builtinSelectors = [
        '.job-apply-button',
        '[data-id="apply-button"]',
        'a[href*="apply"]',
        'button.apply',
        '.apply-button',
      ];

      const result = await chrome.tabs.sendMessage(this.tabId, {
        type: 'CLICK_BUILTIN_APPLY',
        selectors: builtinSelectors,
        patterns: this.applyPatterns,
      });

      if (result?.success) {
        return result;
      }

      // Try to find external link
      const externalResult = await chrome.tabs.sendMessage(this.tabId, {
        type: 'FIND_EXTERNAL_APPLY_LINK',
        excludeDomains: ['builtin.com', 'builtinnyc.com', 'builtinchicago.com', 'builtinla.com'],
      });

      if (externalResult?.found) {
        await chrome.tabs.update(this.tabId, { url: externalResult.url });
        return { success: true, external: true, url: externalResult.url };
      }

      return super.clickApplyButton();

    } catch (error) {
      this.logger.error('Error clicking BuiltIn apply button:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Build BuiltIn search URL
   * @param {Object} params - Search parameters
   * @returns {string} Search URL
   */
  buildSearchUrl(params = {}) {
    const baseDomains = {
      'national': 'https://builtin.com',
      'nyc': 'https://www.builtinnyc.com',
      'chicago': 'https://www.builtinchicago.com',
      'la': 'https://www.builtinla.com',
      'boston': 'https://www.builtinboston.com',
      'colorado': 'https://www.builtincolorado.com',
      'austin': 'https://www.builtinaustin.com',
      'seattle': 'https://www.builtinseattle.com',
    };

    const baseUrl = baseDomains[params.city || 'national'] || baseDomains.national;
    let url = `${baseUrl}/jobs`;

    const queryParams = [];

    if (params.query) {
      queryParams.push(`search=${encodeURIComponent(params.query)}`);
    }

    if (params.remote) {
      queryParams.push('f[0]=job-location_remote');
    }

    if (params.experienceLevel) {
      queryParams.push(`f[1]=experience-level_${params.experienceLevel}`);
    }

    if (queryParams.length > 0) {
      url += '?' + queryParams.join('&');
    }

    return url;
  }

  /**
   * Find jobs on BuiltIn
   * @param {Object} searchParams - Search parameters
   * @returns {Promise<Array>} List of jobs
   */
  async findJobs(searchParams = {}) {
    try {
      const result = await chrome.tabs.sendMessage(this.tabId, {
        type: 'FIND_BUILTIN_JOBS',
        selectors: this.selectors,
        limit: searchParams.limit || 20,
      });

      return result?.jobs || [];

    } catch (error) {
      this.logger.error('Error finding BuiltIn jobs:', error);
      return [];
    }
  }
}
