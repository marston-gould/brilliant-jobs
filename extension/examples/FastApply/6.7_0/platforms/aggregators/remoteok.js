// platforms/aggregators/remoteok.js
// RemoteOK Handler - Remote job aggregator

import BaseAggregator from './base-aggregator.js';

/**
 * RemoteOKHandler - Handler for RemoteOK job board
 *
 * RemoteOK is a popular remote job board that aggregates jobs
 * from various companies. Jobs redirect to company career pages.
 */
export default class RemoteOKHandler extends BaseAggregator {
  constructor(config) {
    super({
      ...config,
      name: 'RemoteOK',
    });

    // RemoteOK-specific selectors
    this.selectors = {
      jobListings: 'tr.job, .job-listing',
      jobTitle: '.company_and_position h2, [itemprop="title"]',
      companyName: '.company h3, [itemprop="hiringOrganization"]',
      applyButton: '.apply-button, a[data-job-apply], .apply a',
      jobDescription: '.description, .job-description',
      jobLocation: '.location, [itemprop="jobLocation"]',
      jobType: '.job-type',
      salary: '.salary, [itemprop="baseSalary"]',
      tags: '.tags .tag, .skills',
    };

    // RemoteOK-specific apply patterns
    this.applyPatterns = [
      /apply\s*(now)?/i,
      /apply\s*for\s*this\s*job/i,
      /apply$/i,
    ];

    this.logger.log('RemoteOKHandler initialized');
  }

  /**
   * Override extractJobInfo for RemoteOK-specific structure
   * @param {Object} jobElement - Job element or data
   * @returns {Promise<Object>} Job information
   */
  async extractJobInfo(jobElement) {
    if (typeof jobElement === 'object' && jobElement.title && jobElement.url) {
      return jobElement;
    }

    try {
      const result = await chrome.tabs.sendMessage(this.tabId, {
        type: 'EXTRACT_REMOTEOK_JOB_INFO',
        selectors: this.selectors,
      });

      if (result?.success) {
        return {
          title: result.title || 'Unknown Position',
          company: result.company || 'Unknown Company',
          url: result.url || await this.getCurrentUrl(),
          location: result.location || 'Remote',
          salary: result.salary,
          tags: result.tags || [],
          description: result.description,
          source: 'remoteok',
        };
      }

      return super.extractJobInfo(jobElement);

    } catch (error) {
      this.logger.error('Error extracting RemoteOK job info:', error);
      return super.extractJobInfo(jobElement);
    }
  }

  /**
   * Override clickApplyButton for RemoteOK-specific behavior
   * @returns {Promise<Object>} Click result
   */
  async clickApplyButton() {
    try {
      const remoteokSelectors = [
        'a.apply-button',
        'a[data-job-apply]',
        '.apply a',
        'a[href*="apply"]',
        'button.apply',
      ];

      const result = await chrome.tabs.sendMessage(this.tabId, {
        type: 'CLICK_REMOTEOK_APPLY',
        selectors: remoteokSelectors,
        patterns: this.applyPatterns,
      });

      if (result?.success) {
        return result;
      }

      // Try to find external link
      const externalResult = await chrome.tabs.sendMessage(this.tabId, {
        type: 'FIND_EXTERNAL_APPLY_LINK',
        excludeDomains: ['remoteok.com', 'remoteok.io'],
      });

      if (externalResult?.found) {
        await chrome.tabs.update(this.tabId, { url: externalResult.url });
        return { success: true, external: true, url: externalResult.url };
      }

      return super.clickApplyButton();

    } catch (error) {
      this.logger.error('Error clicking RemoteOK apply button:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Build RemoteOK search URL
   * @param {Object} params - Search parameters
   * @returns {string} Search URL
   */
  buildSearchUrl(params = {}) {
    let url = 'https://remoteok.com';

    const tagMap = {
      'javascript': '/remote-javascript-jobs',
      'python': '/remote-python-jobs',
      'react': '/remote-react-jobs',
      'nodejs': '/remote-nodejs-jobs',
      'golang': '/remote-golang-jobs',
      'rust': '/remote-rust-jobs',
      'devops': '/remote-devops-jobs',
      'design': '/remote-design-jobs',
      'marketing': '/remote-marketing-jobs',
      'sales': '/remote-sales-jobs',
      'customer-support': '/remote-customer-support-jobs',
    };

    if (params.tag && tagMap[params.tag]) {
      url += tagMap[params.tag];
    } else if (params.query) {
      url += `/remote-${params.query.toLowerCase().replace(/\s+/g, '-')}-jobs`;
    }

    return url;
  }

  /**
   * Find jobs on RemoteOK
   * @param {Object} searchParams - Search parameters
   * @returns {Promise<Array>} List of jobs
   */
  async findJobs(searchParams = {}) {
    try {
      const result = await chrome.tabs.sendMessage(this.tabId, {
        type: 'FIND_REMOTEOK_JOBS',
        selectors: this.selectors,
        limit: searchParams.limit || 20,
      });

      return result?.jobs || [];

    } catch (error) {
      this.logger.error('Error finding RemoteOK jobs:', error);
      return [];
    }
  }
}
