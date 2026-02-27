// shared/content/page-analyzer.js
// Content script helper for page analysis - used by Universal Job Router
// This file can be injected via chrome.scripting.executeScript() for external tabs

/**
 * PageAnalyzer - Runs in content script context to analyze page content
 * Provides data for page classification, form detection, and blocked state detection
 */
class PageAnalyzer {
  constructor() {
    this.setupMessageListeners();
  }

  /**
   * Set up message listeners for background script requests
   */
  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      const { type } = request;

      switch (type) {
        case 'GET_PAGE_CONTENT':
        case 'GET_PAGE_CONTENT_REQUEST':
          this.handleGetPageContent(sendResponse);
          return true;

        case 'GET_BLOCKED_STATE_INFO':
          this.handleGetBlockedStateInfo(sendResponse);
          return true;

        case 'DETECT_PAGE_REDIRECT':
          this.handleDetectPageRedirect(sendResponse);
          return true;

        case 'EXECUTE_CLICK_APPLY':
        case 'CLICK_APPLY_BUTTON':
          this.handleClickApply(request.selector || request.selectors, sendResponse);
          return true;

        case 'ANALYZE_FORM':
          this.handleAnalyzeForm(request.formSelector, sendResponse);
          return true;

        case 'GET_PAGE_FINGERPRINT':
          this.handleGetPageFingerprint(sendResponse);
          return true;
      }

      return false;
    });
  }

  /**
   * Get page content for analysis
   */
  handleGetPageContent(sendResponse) {
    try {
      const content = {
        url: window.location.href,
        title: document.title,
        bodyText: document.body?.innerText?.substring(0, 10000) || '',
        scripts: this.getScriptSources(),
        forms: this.getFormInfo(),
        links: this.getApplyLinks(),
        meta: this.getMetaInfo(),
        // Include actual HTML for DOM-based classification
        html: document.documentElement?.outerHTML?.substring(0, 50000) || '',
      };

      sendResponse({ success: true, content });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Get page fingerprint for ATS classification
   */
  handleGetPageFingerprint(sendResponse) {
    try {
      const fingerprint = {
        url: window.location.href,
        hostname: window.location.hostname,
        pathname: window.location.pathname,
        scripts: this.getScriptSources(),
        selectors: this.checkSelectors(),
        bodyText: document.body?.innerText?.substring(0, 5000) || '',
        meta: this.getMetaInfo(),
      };

      sendResponse({ success: true, fingerprint });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Get info for blocked state detection
   */
  handleGetBlockedStateInfo(sendResponse) {
    try {
      const info = {
        url: window.location.href,
        content: document.body?.innerText?.substring(0, 5000) || '',
        hasSelectors: this.checkBlockedSelectors(),
      };

      sendResponse(info);
    } catch (error) {
      sendResponse({ url: window.location.href, content: '', hasSelectors: {} });
    }
  }

  /**
   * Detect page redirect mechanisms
   */
  handleDetectPageRedirect(sendResponse) {
    try {
      const result = {
        hasRedirect: false,
        type: null,
        url: null,
      };

      // Check meta refresh
      const metaRefresh = document.querySelector('meta[http-equiv="refresh"]');
      if (metaRefresh) {
        const content = metaRefresh.getAttribute('content') || '';
        const match = content.match(/url=(.+)/i);
        if (match) {
          result.hasRedirect = true;
          result.type = 'meta_refresh';
          result.url = match[1].trim();
        }
      }

      // Check JavaScript redirects in page
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        if (text.includes('window.location') || text.includes('location.href')) {
          const match = text.match(/(?:window\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/);
          if (match) {
            result.hasRedirect = true;
            result.type = 'javascript';
            result.url = match[1];
            break;
          }
        }
      }

      // Check for redirect message on page
      const bodyText = document.body?.innerText?.toLowerCase() || '';
      if (bodyText.includes('redirecting') || bodyText.includes('please wait')) {
        result.hasRedirect = true;
        result.type = 'page_message';
      }

      sendResponse(result);
    } catch (error) {
      sendResponse({ hasRedirect: false });
    }
  }

  /**
   * Click apply button with selector(s)
   * @param {string|string[]} selectorOrSelectors - Single selector or array of selectors
   * @param {Function} sendResponse - Response callback
   */
  handleClickApply(selectorOrSelectors, sendResponse) {
    try {
      let button = null;

      // Handle array of selectors
      const selectorsToTry = Array.isArray(selectorOrSelectors)
        ? selectorOrSelectors
        : selectorOrSelectors ? [selectorOrSelectors] : [];

      // Try provided selectors first
      for (const sel of selectorsToTry) {
        try {
          button = document.querySelector(sel);
          if (button) break;
        } catch {
          // Invalid selector, continue
        }
      }

      // Fallback: try common apply button selectors
      if (!button) {
        const applySelectors = [
          'button[data-apply]',
          'a[href*="apply"]',
          '[class*="apply-button"]',
          '[class*="applyButton"]',
          '[class*="apply_button"]',
          'a.apply',
          'button.apply',
          '#apply-button',
          '#applyButton',
          '.apply-now',
          '.apply-btn',
          '[aria-label*="apply" i]',
          '[title*="apply" i]',
        ];

        for (const sel of applySelectors) {
          try {
            button = document.querySelector(sel);
            if (button) break;
          } catch {
            // Invalid selector, continue
          }
        }
      }

      // Text-based fallback
      if (!button) {
        const buttons = document.querySelectorAll('button, a[role="button"], a.btn, a[class*="btn"]');
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase() || '';
          if (text.includes('apply') && !text.includes('already')) {
            button = btn;
            break;
          }
        }
      }

      if (button) {
        button.click();
        sendResponse({ success: true, clicked: true });
      } else {
        sendResponse({ success: false, error: 'Apply button not found' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Analyze form on page
   */
  handleAnalyzeForm(formSelector, sendResponse) {
    try {
      const form = formSelector
        ? document.querySelector(formSelector)
        : document.querySelector('form');

      if (!form) {
        sendResponse({ success: false, error: 'No form found' });
        return;
      }

      const fields = [];
      const inputs = form.querySelectorAll('input, select, textarea');

      for (const input of inputs) {
        fields.push({
          type: input.type || input.tagName.toLowerCase(),
          name: input.name || '',
          id: input.id || '',
          placeholder: input.placeholder || '',
          required: input.required,
          autocomplete: input.autocomplete || '',
          label: this.getInputLabel(input),
          options: input.tagName === 'SELECT' ? this.getSelectOptions(input) : null,
        });
      }

      sendResponse({
        success: true,
        form: {
          action: form.action,
          method: form.method,
          id: form.id,
          fields,
        },
      });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Get script sources from page
   */
  getScriptSources() {
    const scripts = document.querySelectorAll('script[src]');
    return Array.from(scripts)
      .map((s) => s.src)
      .filter((src) => src);
  }

  /**
   * Get form information from page
   */
  getFormInfo() {
    const forms = document.querySelectorAll('form');
    return Array.from(forms).map((form) => ({
      action: form.action,
      method: form.method,
      id: form.id,
      fieldCount: form.querySelectorAll('input, select, textarea').length,
    }));
  }

  /**
   * Get apply-related links
   */
  getApplyLinks() {
    const links = document.querySelectorAll('a[href]');
    return Array.from(links)
      .filter((link) => {
        const href = link.href?.toLowerCase() || '';
        const text = link.textContent?.toLowerCase() || '';
        return (
          href.includes('apply') ||
          text.includes('apply') ||
          href.includes('submit') ||
          text.includes('submit')
        );
      })
      .map((link) => ({
        href: link.href,
        text: link.textContent?.trim(),
      }));
  }

  /**
   * Get meta information
   */
  getMetaInfo() {
    const metas = {};
    const metaTags = document.querySelectorAll('meta[name], meta[property]');

    for (const meta of metaTags) {
      const name = meta.getAttribute('name') || meta.getAttribute('property');
      const content = meta.getAttribute('content');
      if (name && content) {
        metas[name] = content;
      }
    }

    return metas;
  }

  /**
   * Check common ATS selectors
   */
  checkSelectors() {
    const selectorMap = {
      // Greenhouse
      '.greenhouse-form': !!document.querySelector('.greenhouse-form'),
      '#grnhse_app': !!document.querySelector('#grnhse_app'),
      '[data-greenhouse]': !!document.querySelector('[data-greenhouse]'),

      // Lever
      '.lever-application': !!document.querySelector('.lever-application'),
      '#lever-jobs-container': !!document.querySelector('#lever-jobs-container'),
      '.lever-form': !!document.querySelector('.lever-form'),

      // Workable
      '[data-ui="workable"]': !!document.querySelector('[data-ui="workable"]'),
      '.workable-form': !!document.querySelector('.workable-form'),

      // Ashby
      '.ashby-job-posting': !!document.querySelector('.ashby-job-posting'),
      '[data-ashby]': !!document.querySelector('[data-ashby]'),

      // Recruitee
      '.recruitee-careers': !!document.querySelector('.recruitee-careers'),
      '[data-recruitee]': !!document.querySelector('[data-recruitee]'),

      // Generic forms
      'form': !!document.querySelector('form'),
      'input[type="file"]': !!document.querySelector('input[type="file"]'),
    };

    return selectorMap;
  }

  /**
   * Check blocked state selectors
   */
  checkBlockedSelectors() {
    const selectors = [
      // Login
      'form[action*="login"]',
      'form[action*="signin"]',
      '#login-form',
      '.login-container',
      '[data-testid="login-form"]',

      // Captcha
      '.g-recaptcha',
      '.h-captcha',
      '[data-sitekey]',
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      '.cf-turnstile',
      '#captcha',
      '.captcha-container',

      // Expired
      '.job-expired',
      '.position-filled',
      '[data-job-status="closed"]',

      // Already applied
      '.already-applied',
      '[data-applied="true"]',
      '.application-submitted',
    ];

    const result = {};
    for (const selector of selectors) {
      try {
        result[selector] = !!document.querySelector(selector);
      } catch {
        result[selector] = false;
      }
    }

    return result;
  }

  /**
   * Get label for an input element
   */
  getInputLabel(input) {
    // Check for explicit label
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) return label.textContent?.trim();
    }

    // Check parent label
    const parentLabel = input.closest('label');
    if (parentLabel) return parentLabel.textContent?.trim();

    // Check aria-label
    if (input.getAttribute('aria-label')) {
      return input.getAttribute('aria-label');
    }

    // Check previous sibling
    const prev = input.previousElementSibling;
    if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN')) {
      return prev.textContent?.trim();
    }

    return '';
  }

  /**
   * Get options for select element
   */
  getSelectOptions(select) {
    return Array.from(select.options).map((opt) => ({
      value: opt.value,
      text: opt.textContent?.trim(),
    }));
  }
}

// Initialize if in content script context
if (typeof window !== 'undefined' && !window.__pageAnalyzerInitialized) {
  window.__pageAnalyzerInitialized = true;
  window.__pageAnalyzer = new PageAnalyzer();
}
