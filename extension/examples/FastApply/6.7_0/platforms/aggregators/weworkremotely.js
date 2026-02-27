// platforms/aggregators/weworkremotely.js
// WeWorkRemotely Handler - Remote job aggregator

import BaseAggregator from './base-aggregator.js';

/**
 * WeWorkRemotelyHandler - Handler for WeWorkRemotely job board
 *
 * WeWorkRemotely is a popular remote job board that aggregates jobs
 * from various companies. Most jobs redirect to company career pages
 * or ATS systems like Greenhouse, Lever, Workable, etc.
 */
export default class WeWorkRemotelyHandler extends BaseAggregator {
  constructor(config) {
    super({
      ...config,
      name: 'WeWorkRemotely',
    });

    // WeWorkRemotely-specific selectors
    this.selectors = {
      jobListings: '.jobs article, .job',
      jobTitle: '.title, h2.title',
      companyName: '.company, span.company',
      applyButton: '.apply-button, .apply a, a.button[href*="apply"], a[href*="/jobs/"][href$="/apply"]',
      jobDescription: '.listing-container, .job-description',
      jobLocation: '.region, .location',
      jobType: '.job-type',
      jobCategory: '.category',
      viewLink: 'a.view, a[href*="/remote-jobs/"]',
    };

    // WeWorkRemotely-specific apply patterns
    this.applyPatterns = [
      /apply\s*for\s*this\s*(job|position)/i,
      /apply\s*now/i,
      /apply$/i,
      /view\s*(and\s*)?apply/i,
      /apply\s*on\s*company\s*(website|site)/i,
    ];

    this.logger.log('WeWorkRemotelyHandler initialized');
  }

  /**
   * Override extractJobInfo for WeWorkRemotely-specific structure
   * @param {Object} jobElement - Job element or data
   * @returns {Promise<Object>} Job information
   */
  async extractJobInfo(jobElement) {
    // If already extracted
    if (typeof jobElement === 'object' && jobElement.title && jobElement.url) {
      return jobElement;
    }

    try {
      const result = await chrome.tabs.sendMessage(this.tabId, {
        type: 'EXTRACT_WWR_JOB_INFO',
        selectors: this.selectors,
      });

      if (result?.success) {
        return {
          title: result.title || 'Unknown Position',
          company: result.company || 'Unknown Company',
          url: result.url || await this.getCurrentUrl(),
          location: result.location || 'Remote',
          category: result.category,
          description: result.description,
          source: 'weworkremotely',
        };
      }

      // Fallback to parent method
      return super.extractJobInfo(jobElement);

    } catch (error) {
      this.logger.error('Error extracting WWR job info:', error);
      return super.extractJobInfo(jobElement);
    }
  }

  /**
   * Override clickApplyButton for WeWorkRemotely-specific behavior
   * @returns {Promise<Object>} Click result
   */
  async clickApplyButton() {
    try {
      // First, try WeWorkRemotely-specific selectors
      const wwrSelectors = [
        // Primary apply button
        'a.apply-button',
        'a[href$="/apply"]',
        // Secondary - view job link that goes to apply
        '.apply a',
        'a.button.apply',
        // Generic fallbacks
        '[class*="apply"]',
        'a[href*="apply"]',
      ];

      const result = await chrome.tabs.sendMessage(this.tabId, {
        type: 'CLICK_WWR_APPLY',
        selectors: wwrSelectors,
        patterns: this.applyPatterns,
      });

      if (result?.success) {
        return result;
      }

      // Fallback: Look for external apply links
      const externalResult = await chrome.tabs.sendMessage(this.tabId, {
        type: 'FIND_EXTERNAL_APPLY_LINK',
        excludeDomains: ['weworkremotely.com'],
      });

      if (externalResult?.found) {
        // Navigate to the external link
        await chrome.tabs.update(this.tabId, { url: externalResult.url });
        return { success: true, external: true, url: externalResult.url };
      }

      // Final fallback to parent method
      return super.clickApplyButton();

    } catch (error) {
      this.logger.error('Error clicking WWR apply button:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Find jobs on WeWorkRemotely search results page
   * @param {Object} searchParams - Search parameters
   * @returns {Promise<Array>} List of job elements
   */
  async findJobs(searchParams = {}) {
    try {
      const result = await chrome.tabs.sendMessage(this.tabId, {
        type: 'FIND_WWR_JOBS',
        selectors: this.selectors,
        limit: searchParams.limit || 20,
      });

      return result?.jobs || [];

    } catch (error) {
      this.logger.error('Error finding WWR jobs:', error);
      return [];
    }
  }

  /**
   * Build WeWorkRemotely search URL
   * @param {Object} params - Search parameters
   * @returns {string} Search URL
   */
  buildSearchUrl(params = {}) {
    const baseUrl = 'https://weworkremotely.com/remote-jobs';

    const categoryMap = {
      'programming': 'search/programming',
      'design': 'search/design',
      'devops': 'search/devops-sysadmin',
      'marketing': 'search/marketing',
      'sales': 'search/sales',
      'customer-support': 'search/customer-support',
      'copywriting': 'search/copywriting',
      'product': 'search/product',
      'business': 'search/business-and-management',
      'all': '',
    };

    const category = categoryMap[params.category] || '';

    if (category) {
      return `${baseUrl}/${category}`;
    }

    if (params.query) {
      return `${baseUrl}/search?term=${encodeURIComponent(params.query)}`;
    }

    return baseUrl;
  }

  /**
   * Iterate through jobs on WeWorkRemotely
   * @param {Object} params - Automation parameters
   * @param {Function} callback - Callback for each job
   * @returns {Promise<Object>} Iteration result
   */
  async iterateJobs(params, callback) {
    const { limit = 10, skipApplied = true } = params;

    // Navigate to search page
    const searchUrl = this.buildSearchUrl(params);
    await chrome.tabs.update(this.tabId, { url: searchUrl });
    await this.waitForPageLoad();

    // Find jobs
    const jobs = await this.findJobs({ limit });

    this.logger.log(`Found ${jobs.length} jobs on WeWorkRemotely`);

    const results = {
      total: jobs.length,
      applied: 0,
      skipped: 0,
      failed: 0,
      results: [],
    };

    for (const job of jobs) {
      try {
        // Check if already applied (if tracking enabled)
        if (skipApplied && await this.hasApplied(job)) {
          results.skipped++;
          continue;
        }

        // Apply to this job
        const result = await this.applyToJob(job, this.sessionContext);

        if (result.success) {
          results.applied++;
          results.results.push({ job, result });

          if (callback) {
            await callback(job, result);
          }
        } else {
          results.failed++;
          results.results.push({ job, result, error: result.error });
        }

        // Small delay between applications
        await this.wait(2000);

      } catch (error) {
        this.logger.error(`Error processing job ${job.title}:`, error);
        results.failed++;
        results.results.push({ job, error: error.message });
      }
    }

    return results;
  }

  /**
   * Check if already applied to this job
   * @param {Object} job - Job info
   * @returns {Promise<boolean>} True if already applied
   */
  async hasApplied(job) {
    // This would check the application tracker
    // For now, return false
    return false;
  }
}
