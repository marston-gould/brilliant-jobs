// jobSiteStrategy.js - Strategy pattern for different job sites
console.log("==== JOB SITE STRATEGY MODULE LOADED ====");

// Prevent multiple loading by checking and early exit
if (window.JobSiteStrategy) {
  console.log("⚠️ JobSiteStrategy already loaded, skipping redeclaration");
} else {

/**
 * Base Strategy Interface for all job sites
 */
class JobSiteStrategyBase {
  constructor() {
    this.siteName = 'base';
  }
  
  // Must be implemented by subclasses
  findEasyApplyButton() {
    throw new Error('findEasyApplyButton must be implemented');
  }
  
  findExternalApplyButton() {
    throw new Error('findExternalApplyButton must be implemented');
  }
  
  extractJobContext() {
    throw new Error('extractJobContext must be implemented');
  }
  
  isInApplicationFlow() {
    throw new Error('isInApplicationFlow must be implemented');
  }
  
  findApplicationForm() {
    throw new Error('findApplicationForm must be implemented');
  }
  
  findNextButton() {
    throw new Error('findNextButton must be implemented');
  }
  
  findSubmitButton() {
    throw new Error('findSubmitButton must be implemented');
  }
  
  findReviewButton() {
    throw new Error('findReviewButton must be implemented');
  }
  
  getFormSelectors() {
    // Common selectors that might work across sites
    return [
      'form[id*="application"]',
      'form[id*="apply"]',
      'form[class*="application"]',
      'form[class*="apply"]',
      'form[action*="apply"]',
      'form[action*="submit"]',
      '#application-form',
      '.application-form',
      'form'
    ];
  }
}

/**
 * CareerGPT job queue strategy
 */
class CareerGPTStrategy extends JobSiteStrategyBase {
  constructor() {
    super();
    this.siteName = 'careergpt';
  }
  
  findJobCards() {
    // Find all job cards on the page
    return document.querySelectorAll('.job-card, [class*="job-item"], [class*="job-listing"]');
  }
  
  findViewOnLinkedInButton(jobCard) {
    // Find the "VIEW ON LINKEDIN" button within a job card
    if (!jobCard) {
      // If no job card specified, find all buttons
      return document.querySelector('a[href*="linkedin.com/jobs"], [class*="linkedin-button"]');
    }
    
    return jobCard.querySelector('a[href*="linkedin.com/jobs"], [class*="linkedin-button"]');
  }
  
  extractJobsFromQueue() {
    const jobs = [];
    const jobCards = this.findJobCards();
    
    jobCards.forEach((card, index) => {
      const titleElement = card.querySelector('h2, h3, [class*="job-title"], [class*="position"]');
      const companyElement = card.querySelector('[class*="company"], [class*="employer"]');
      const locationElement = card.querySelector('[class*="location"]');
      const matchElement = card.querySelector('[class*="match"]');
      const linkedInButton = this.findViewOnLinkedInButton(card);
      
      if (titleElement && linkedInButton) {
        const linkedInUrl = linkedInButton.href || linkedInButton.getAttribute('data-href');
        
        jobs.push({
          index: index,
          title: titleElement.textContent.trim(),
          company: companyElement ? companyElement.textContent.trim() : '',
          location: locationElement ? locationElement.textContent.trim() : '',
          matchScore: matchElement ? matchElement.textContent.trim() : '',
          linkedInUrl: linkedInUrl,
          element: card,
          button: linkedInButton
        });
      }
    });
    
    return jobs;
  }
  
  markJobAsProcessed(jobCard) {
    // Add visual indication that job has been processed
    jobCard.style.opacity = '0.6';
    jobCard.setAttribute('data-processed', 'true');
    
    // Disable the button
    const button = this.findViewOnLinkedInButton(jobCard);
    if (button) {
      button.disabled = true;
      button.textContent = 'PROCESSED';
    }
  }
  
  // These methods don't apply to CareerGPT but need to be implemented
  findEasyApplyButton() { return null; }
  findExternalApplyButton() { return null; }
  extractJobContext() { return {}; }
  isInApplicationFlow() { return false; }
  findApplicationForm() { return null; }
  findNextButton() { return null; }
  findSubmitButton() { return null; }
  findReviewButton() { return null; }
}

/**
 * LinkedIn-specific implementation
 */
class LinkedInStrategy extends JobSiteStrategyBase {
  constructor() {
    super();
    this.siteName = 'linkedin';
  }
  
  findEasyApplyButton() {
    console.log("🔍 Looking for Easy Apply button on job details page...");
    
    // MOST COMPREHENSIVE selectors for 2024 LinkedIn interface
    const selectors = [
      // NEWEST LinkedIn Easy Apply selectors (December 2024)
      'button[data-test-id="apply-button"]',
      'button[data-control-name="job_search_job_apply"]',
      '.jobs-apply-button[data-control-name*="apply"]',
      
      // UPDATED: Current LinkedIn Interface (as of screenshot)
      'button[class*="jobs-apply-button"]:not([class*="outsideApply"])',
      'button.jobs-apply-button--primary',
      'button.artdeco-button--primary[aria-label*="Apply"]',
      'button[class*="apply-button"][class*="artdeco-button"]',
      
      // LinkedIn logo + Easy Apply combinations
      'button:has([data-test-id="linkedin-logo"]) [aria-label*="Apply"]',
      'button:has(.jobs-apply-button__linkedin-logo)',
      // Note: :contains() is not valid in CSS selectors for querySelectorAll - will check text content manually
      
      // Traditional Easy Apply selectors
      'button[aria-label*="Easy Apply"]',
      '[data-easy-apply-button="true"]',
      '[aria-label*="Easy Apply"]',
      '[data-control-name="easy_apply_button"]',
      
      // Standard Apply buttons (filtered) - ENHANCED
      '.jobs-apply-button:not(.jobs-apply-button--outsideApply):not([aria-label*="Save"]):not([aria-label*="Follow"])',
      '.jobs-apply-button[aria-label*="Apply"]:not([aria-label*="Save"]):not([aria-label*="Follow"])',
      'button.jobs-apply-button:not([aria-label*="Save"]):not([aria-label*="Follow"])',
      
      // Job card specific selectors
      '.job-card button[aria-label*="Apply"]',
      '.jobs-search-results-list button[aria-label*="Apply"]',
      '.scaffold-layout__detail button[aria-label*="Apply"]',
      
      // Form and modal area selectors
      '.jobs-s-apply button[aria-label*="Apply"]',
      '.jobs-apply-button--primary',
      '[data-test-modal-id="easy-apply-desktop"]',
      
      // Broader selectors with enhanced filtering
      'button[data-control-name*="apply"]:not([data-control-name*="save"]):not([data-control-name*="follow"])',
      'button[aria-label*="apply" i]:not([aria-label*="save" i]):not([aria-label*="follow" i]):not([aria-label*="share" i])',
      '.jobs-apply-button[data-control-name*="apply"]',
      
      // Text-based detection (more robust)
      'button[type="button"][aria-label*="Apply"]',
      'button[class*="apply"]',
      
      // Emergency fallback selectors
      'button:has-text("Easy Apply")',
      'button:has-text("Apply")',
      '.jobs-unified-top-card button[aria-label*="Apply"]',
      '.jobs-details-top-card button[aria-label*="Apply"]'
    ];
    
    console.log(`Testing ${selectors.length} different Easy Apply selectors...`);
    
    for (const selector of selectors) {
      try {
        const buttons = document.querySelectorAll(selector);
        console.log(`Selector "${selector}": found ${buttons.length} elements`);
        
        for (const button of buttons) {
          if (!button) continue;
          
          const buttonText = (button.textContent || '').toLowerCase().trim();
          const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
          const dataControl = button.getAttribute('data-control-name') || '';
          const dataTestId = button.getAttribute('data-test-id') || '';
          const isVisible = this.isElementVisible(button);
          const isClickable = !button.disabled && !button.hasAttribute('disabled');
          
          console.log(`  Testing button:`, {
            selector,
            text: buttonText,
            ariaLabel: ariaLabel,
            dataControl: dataControl,
            dataTestId: dataTestId,
            visible: isVisible,
            clickable: isClickable,
            classes: button.className,
            element: button
          });
          
          // ENHANCED filtering logic with multiple checks
          const isEasyApply = this.isValidEasyApplyButton(button, buttonText, ariaLabel, dataControl, dataTestId);
          
          if (isEasyApply && isVisible && isClickable) {
            console.log("✅ CONFIRMED Easy Apply button found!", {
              selector,
              text: buttonText,
              ariaLabel,
              dataControl,
              dataTestId,
              finalCheck: 'PASSED'
            });
            return button;
          } else if (isEasyApply) {
            console.log(`⚠️  Found Easy Apply button but not clickable:`, {
              visible: isVisible,
              clickable: isClickable,
              disabled: button.disabled
            });
          }
        }
      } catch (error) {
        console.log(`❌ Error testing selector "${selector}":`, error.message);
      }
    }
    
    // FALLBACK: Try to find ANY apply button if no Easy Apply found
    console.log("🔄 No Easy Apply found, trying fallback detection...");
    return this.findAnyApplyButton();
  }
  
  // Enhanced validation method for Easy Apply buttons
  isValidEasyApplyButton(button, buttonText, ariaLabel, dataControl, dataTestId) {
    console.log(`🔍 Validating button: text="${buttonText}", aria="${ariaLabel}", dataControl="${dataControl}", dataTestId="${dataTestId}"`);
    
    // Direct Easy Apply indicators (highest priority)
    if (buttonText.includes('easy apply') || 
        ariaLabel.includes('easy apply') || 
        dataControl.includes('easy_apply') ||
        dataTestId.includes('apply')) {
      console.log("✅ Direct Easy Apply match found");
      return true;
    }
    
    // Check for "Apply" text in various contexts
    const hasApplyText = buttonText.includes('apply') || ariaLabel.includes('apply');
    
    // Exclude unwanted actions (more comprehensive)
    const excludedActions = ['save', 'follow', 'share', 'bookmark', 'message', 'connect', 'view', 'more'];
    const isNotExcludedAction = !excludedActions.some(action => 
      buttonText.includes(action) || 
      ariaLabel.includes(action) || 
      dataControl.includes(action)
    );
    
    // Check for external/outside apply indicators
    const isNotExternalApply = !button.closest('.jobs-apply-button--outsideApply') && 
                              !button.closest('[data-control-name*="save"]') &&
                              !button.classList.contains('jobs-apply-button--outsideApply') &&
                              !button.classList.contains('outside-apply');
    
    // Enhanced LinkedIn apply button detection
    const isLinkedInApplyButton = button.classList.contains('jobs-apply-button') ||
                                 button.classList.contains('artdeco-button--primary') ||
                                 button.hasAttribute('data-control-name') ||
                                 button.closest('.jobs-apply-button');
    
    // Check for LinkedIn logo (indicates Easy Apply)
    const hasLinkedInLogo = button.querySelector('[data-test-id="linkedin-logo"]') ||
                           button.querySelector('.jobs-apply-button__linkedin-logo') ||
                           button.querySelector('.linkedin-logo');
    
    const result = hasApplyText && isNotExcludedAction && isNotExternalApply;
    
    // Enhanced logging
    console.log(`🔍 Validation result:`, {
      hasApplyText,
      isNotExcludedAction,
      isNotExternalApply,
      isLinkedInApplyButton,
      hasLinkedInLogo,
      finalResult: result
    });
    
    // Be more inclusive - if it has "Apply" and isn't excluded, consider it valid
    return result || (hasApplyText && isLinkedInApplyButton);
  }
  
  // Fallback method to find any apply button
  findAnyApplyButton() {
    console.log("🔄 FALLBACK: Looking for any apply button...");
    
    // First, try very broad apply button detection
    const broadSelectors = [
      // Any button with "apply" in text
      'button',
      'a[href*="apply"]',
      '.jobs-apply-button',
      '.apply-button',
      '[class*="apply"]',
      'input[type="submit"]',
      // Very broad selectors
      'button[type="button"]',
      'a[role="button"]'
    ];
    
    for (const selector of broadSelectors) {
      const elements = document.querySelectorAll(selector);
      console.log(`🔍 Checking ${elements.length} elements with selector: ${selector}`);
      
      for (const element of elements) {
        const text = (element.textContent || '').toLowerCase().trim();
        const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
        const href = element.getAttribute('href') || '';
        const className = element.className || '';
        
        // More comprehensive text matching
        const hasApplyInText = text.includes('apply') || text.includes('申请') || text.includes('응용');
        const hasApplyInAria = ariaLabel.includes('apply') || ariaLabel.includes('申请') || ariaLabel.includes('응용');
        const hasApplyInHref = href.includes('apply');
        const hasApplyInClass = className.includes('apply');
        
        // Check if it's an apply-related button
        if ((hasApplyInText || hasApplyInAria || hasApplyInHref || hasApplyInClass) &&
            !text.includes('save') && !text.includes('follow') && 
            !ariaLabel.includes('save') && !ariaLabel.includes('follow') &&
            this.isElementVisible(element)) {
          
          console.log("✅ FALLBACK: Found potential apply button:", {
            text: text,
            ariaLabel: ariaLabel,
            href: href,
            className: className,
            element: element
          });
          
          return element;
        }
      }
    }
    
    // Even more aggressive fallback - look for ANY blue button that might be apply
    console.log("🔄 ULTRA-FALLBACK: Looking for ANY blue primary button...");
    const primaryButtons = document.querySelectorAll(
      'button.artdeco-button--primary, .btn-primary, button[class*="primary"], button[style*="blue"]'
    );
    
    for (const button of primaryButtons) {
      if (this.isElementVisible(button) && !button.disabled) {
        const text = (button.textContent || '').toLowerCase().trim();
        const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
        
        // If it's a primary button and doesn't have excluded words, try it
        const excludedWords = ['save', 'follow', 'share', 'message', 'connect', 'cancel', 'close'];
        const hasExcludedWord = excludedWords.some(word => 
          text.includes(word) || ariaLabel.includes(word)
        );
        
        if (!hasExcludedWord) {
          console.log("✅ ULTRA-FALLBACK: Found primary button:", {
            text: text,
            ariaLabel: ariaLabel,
            element: button
          });
          return button;
        }
      }
    }
    
    // Final desperate attempt - just look for ANY visible, clickable button
    console.log("🔄 DESPERATE-FALLBACK: Looking for ANY button...");
    const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
    
    for (const button of allButtons) {
      if (this.isElementVisible(button) && !button.disabled) {
        const text = (button.textContent || button.value || '').toLowerCase().trim();
        const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
        
        // Log all buttons for debugging
        console.log(`🔍 Button found: "${text}" | aria: "${ariaLabel}" | classes: ${button.className}`);
        
        // If it's in a job-related area and has any apply-like characteristics
        const isInJobArea = button.closest('.jobs-details') || 
                           button.closest('.scaffold-layout__detail') ||
                           button.closest('.job-details') ||
                           button.closest('[data-job-id]');
        
        if (isInJobArea && (text.length > 0 || ariaLabel.length > 0)) {
          console.log("✅ DESPERATE-FALLBACK: Found button in job area:", {
            text: text,
            ariaLabel: ariaLabel,
            element: button
          });
          return button;
        }
      }
    }
    
    console.log("❌ FALLBACK: No apply button found at all");
    return null;
  }
  
  // Helper method to check if element is visible
  isElementVisible(element) {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           rect.width > 0 && 
           rect.height > 0 &&
           rect.top >= 0 &&
           rect.left >= 0;
  }
  
  findExternalApplyButton() {
    // If no Easy Apply button, look for external apply
    if (!this.findEasyApplyButton()) {
      return document.querySelector(
        '[aria-label*="Apply"], ' +
        '.jobs-apply-button--outsideApply, ' +
        '.jobs-apply-button'
      );
    }
    return null;
  }
  
  extractJobContext() {
    const context = {
      title: '',
      company: '',
      location: '',
      description: '',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      source: 'linkedin'
    };
    
    // Extract job title
    const titleElement = document.querySelector(
      '.jobs-unified-top-card__job-title, ' +
      '.jobs-details-top-card__job-title, ' +
      'h1.jobs-unified-top-card__job-title'
    );
    if (titleElement) {
      context.title = titleElement.textContent.trim();
    }
    
    // Extract company name
    const companyElement = document.querySelector(
      '.jobs-unified-top-card__company-name, ' +
      '.jobs-details-top-card__company-info, ' +
      '.jobs-unified-top-card__primary-description a'
    );
    if (companyElement) {
      context.company = companyElement.textContent.trim();
    }
    
    // Extract location
    const locationElement = document.querySelector(
      '.jobs-unified-top-card__bullet, ' +
      '.jobs-details-top-card__bullet, ' +
      '.jobs-unified-top-card__workplace-type'
    );
    if (locationElement) {
      context.location = locationElement.textContent.trim();
    }
    
    // Extract job description
    const descriptionElement = document.querySelector(
      '.jobs-description-content__text, ' +
      '.jobs-description, ' +
      '.jobs-box__html-content'
    );
    if (descriptionElement) {
      context.description = descriptionElement.textContent.trim();
    }
    
    return context;
  }
  
  isInApplicationFlow() {
    return document.querySelector('.jobs-easy-apply-content') !== null;
  }
  
  findApplicationForm() {
    return document.querySelector('.jobs-easy-apply-content form');
  }
  
  findNextButton() {
    return document.querySelector(
      '.jobs-easy-apply-content .artdeco-button--primary, ' +
      '[aria-label="Continue to next step"]'
    );
  }
  
  findSubmitButton() {
    return document.querySelector('[aria-label*="Submit application"]');
  }
  
  findReviewButton() {
    return document.querySelector('[aria-label*="Review your application"]');
  }
  
  findCloseButton() {
    return document.querySelector(
      '[aria-label="Dismiss"], ' +
      '.artdeco-modal__dismiss'
    );
  }
  
  // LinkedIn-specific methods
  findComplexQuestionGroups() {
    return document.querySelectorAll(
      '.jobs-easy-apply-form-section__grouping, ' +
      '.jobs-easy-apply-form-section'
    );
  }
  
  getEasyApplyModalSelectors() {
    return '.jobs-easy-apply-content';
  }
  
  // Job Listing Page Methods (new)
  findJobCards() {
    // Find all job cards on the job listing page with updated selectors
    return document.querySelectorAll(
      '.jobs-search-results__list-item, ' +
      '.job-card-container, ' +
      '.jobs-search__results .jobs-search-results__list-item, ' +
      '[data-job-id], ' +
      '.artdeco-entity-lockup--result, ' +
      '.ember-view[data-job-id], ' +
      '.scaffold-layout__list-item, ' +
      'li[data-occludable-job-id]'
    );
  }
  
  findEasyApplyButtonInCard(jobCard) {
    // Look for Easy Apply button within a specific job card with updated selectors
    console.log("🔍 Looking for Easy Apply button in job card:", jobCard);
    
    const selectors = [
      // Most specific Easy Apply selectors
      'button[data-control-name="job_search_job_apply"]',
      'button[aria-label*="Easy Apply"]',
      '[data-easy-apply-button="true"]',
      '[aria-label*="Easy Apply"]',
      
      // Traditional selectors
      '.jobs-apply-button[aria-label*="Easy Apply"]',
      '.jobs-apply-button:not([aria-label*="Save"]):not([aria-label*="Follow"]):not(.jobs-apply-button--outsideApply)',
      'button[data-control-name*="apply"]:not([data-control-name*="save"]):not([data-control-name*="follow"])',
      
      // Form area selectors
      '.jobs-s-apply button[aria-label*="Apply"]',
      'button.jobs-apply-button:not([aria-label*="Save"]):not([aria-label*="Follow"])',
      '.jobs-apply-button--top-card',
      
      // Broader selectors with filtering
      'button[data-control-name="job_card_apply"]',
      '.jobs-apply-button[data-control-name*="apply"]',
      'button[aria-label*="apply" i]:not([aria-label*="save" i]):not([aria-label*="follow" i])',
      '[data-test-id*="apply"]'
    ];
    
    for (const selector of selectors) {
      try {
        const buttons = jobCard.querySelectorAll(selector);
        
        for (const button of buttons) {
          if (!button) continue;
          
          const buttonText = (button.textContent || '').toLowerCase().trim();
          const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
          const dataControl = button.getAttribute('data-control-name') || '';
          const isVisible = this.isElementVisible(button);
          const isClickable = !button.disabled && !button.hasAttribute('disabled');
          
          console.log(`Testing card button with selector "${selector}":`, {
            text: buttonText,
            ariaLabel: ariaLabel,
            dataControl: dataControl,
            visible: isVisible,
            clickable: isClickable
          });
          
          // Enhanced Easy Apply detection logic
          const isEasyApply = (
            // Direct Easy Apply indicators
            buttonText.includes('easy apply') ||
            ariaLabel.includes('easy apply') ||
            dataControl.includes('easy_apply') ||
            
            // Apply buttons (excluding save/follow actions)
            (
              (buttonText.includes('apply') || ariaLabel.includes('apply')) &&
              !buttonText.includes('save') &&
              !buttonText.includes('follow') &&
              !buttonText.includes('share') &&
              !buttonText.includes('bookmark') &&
              !ariaLabel.includes('save') &&
              !ariaLabel.includes('follow') &&
              !ariaLabel.includes('share') &&
              !ariaLabel.includes('bookmark') &&
              !dataControl.includes('save') &&
              !dataControl.includes('follow') &&
              !dataControl.includes('share') &&
              !button.closest('.jobs-apply-button--outsideApply') &&
              !button.closest('[data-control-name*="save"]')
            )
          );
          
          if (isEasyApply && isVisible && isClickable) {
            console.log("✅ CONFIRMED Easy Apply button in card!", {
              selector,
              text: buttonText,
              ariaLabel,
              dataControl
            });
            return button;
          }
        }
      } catch (error) {
        console.log(`Error testing card selector "${selector}":`, error.message);
      }
    }
    
    console.log("❌ No Easy Apply button found in this job card");
    return null;
  }
  
  extractJobContextFromCard(jobCard) {
    const context = {
      title: '',
      company: '',
      location: '',
      description: '',
      url: '',
      timestamp: new Date().toISOString(),
      source: 'linkedin-listing',
      jobCard: jobCard
    };
    
    // Extract job title from card
    const titleElement = jobCard.querySelector(
      'h3 a[data-control-name="job_search_job_title"], ' +
      '.job-card-container__title a, ' +
      '.jobs-search-results__list-item h3 a, ' +
      'a[data-control-name="job_search_job_title"]'
    );
    if (titleElement) {
      context.title = titleElement.textContent.trim();
      context.url = titleElement.href || window.location.href;
    }
    
    // Extract company name from card
    const companyElement = jobCard.querySelector(
      'h4 a[data-control-name="job_search_company_name"], ' +
      '.job-card-container__company a, ' +
      '.jobs-search-results__list-item h4 a, ' +
      'a[data-control-name="job_search_company_name"]'
    );
    if (companyElement) {
      context.company = companyElement.textContent.trim();
    }
    
    // Extract location from card
    const locationElement = jobCard.querySelector(
      '.job-card-container__metadata-wrapper span:last-child, ' +
      '.jobs-search-results__list-item .job-card-container__metadata-item:last-child, ' +
      '.artdeco-entity-lockup__metadata .tvm__text'
    );
    if (locationElement) {
      context.location = locationElement.textContent.trim();
    }
    
    return context;
  }
  
  getJobsWithEasyApply() {
    console.log("=== COMPREHENSIVE EASY APPLY SEARCH ON LISTING PAGE ===");
    
    const jobCards = this.findJobCards();
    console.log(`🎴 Found ${jobCards.length} total job cards on page`);
    
    if (jobCards.length === 0) {
      console.log("❌ No job cards found - might not be a job listing page");
      return [];
    }
    
    const jobsWithEasyApply = [];
    
    jobCards.forEach((card, index) => {
      console.log(`\n🔍 Analyzing job card ${index + 1}/${jobCards.length}:`);
      
      // Extract basic job info first
      const title = card.querySelector('h3 a, .jobs-card-container__link, a[data-control-name="job_search_job_title"]')?.textContent?.trim() || 'Unknown Job';
      const company = card.querySelector('h4 a, .jobs-card-container__company-name, a[data-control-name="job_search_company_name"]')?.textContent?.trim() || 'Unknown Company';
      
      console.log(`  📄 Job: "${title}" at "${company}"`);
      
      // Look for Easy Apply button in this card
      const easyApplyButton = this.findEasyApplyButtonInCard(card);
      
      if (easyApplyButton) {
        const jobContext = this.extractJobContextFromCard(card);
        console.log(`  ✅ Job card ${index + 1} HAS Easy Apply:`, {
          title: jobContext.title,
          company: jobContext.company,
          buttonText: easyApplyButton.textContent?.trim(),
          buttonAriaLabel: easyApplyButton.getAttribute('aria-label'),
          button: easyApplyButton
        });
        
        jobsWithEasyApply.push({
          index: index,
          jobCard: card,
          easyApplyButton: easyApplyButton,
          jobContext: jobContext,
          processed: card.hasAttribute('data-auto-apply-processed')
        });
      } else {
        console.log(`  ❌ Job card ${index + 1} does NOT have Easy Apply`);
        
        // Debug: Show what buttons were found in this card
        const allButtons = card.querySelectorAll('button, a[href*="apply"], .jobs-apply-button');
        if (allButtons.length > 0) {
          console.log(`    🔍 Found ${allButtons.length} other buttons in card:`);
          allButtons.forEach((btn, btnIndex) => {
            console.log(`      ${btnIndex + 1}. "${btn.textContent?.trim()}" (${btn.tagName}) - aria: "${btn.getAttribute('aria-label') || 'none'}"`);
          });
        } else {
          console.log(`    ⚠️  No buttons found in this job card at all`);
        }
      }
    });
    
    console.log(`\n📊 === FINAL RESULT: Found ${jobsWithEasyApply.length}/${jobCards.length} jobs with Easy Apply ===`);
    
    if (jobsWithEasyApply.length === 0) {
      console.log("⚠️  NO EASY APPLY JOBS FOUND - DEBUGGING INFO:");
      console.log("🔍 Page URL:", window.location.href);
      console.log("🔍 Page title:", document.title);
      console.log("🔍 Is LinkedIn?", window.location.hostname.includes('linkedin.com'));
      console.log("🔍 Job cards found:", jobCards.length);
      console.log("🔍 First job card sample:", jobCards[0]);
      
      // Try alternative detection
      console.log("🔄 Trying alternative job card detection...");
      const alternativeCards = document.querySelectorAll('[data-job-id], li[data-occludable-job-id], .artdeco-entity-lockup');
      console.log(`🔄 Alternative detection found ${alternativeCards.length} potential job cards`);
    }
    
    return jobsWithEasyApply;
  }
  
  markJobCardAsProcessed(jobCard, success = true) {
    jobCard.setAttribute('data-auto-apply-processed', 'true');
    jobCard.style.opacity = success ? '0.7' : '0.5';
    
    // Add visual indicator
    const indicator = document.createElement('div');
    indicator.style.cssText = `
      position: absolute;
      top: 5px;
      right: 5px;
      background: ${success ? '#28a745' : '#dc3545'};
      color: white;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: bold;
      z-index: 1000;
    `;
    indicator.textContent = success ? 'APPLIED' : 'FAILED';
    
    // Make job card position relative for absolute positioning
    if (getComputedStyle(jobCard).position === 'static') {
      jobCard.style.position = 'relative';
    }
    
    jobCard.appendChild(indicator);
  }
  
  // DEBUG: Comprehensive Easy Apply detection debug function
  debugEasyApplyDetection() {
    console.log("🐛 === COMPREHENSIVE EASY APPLY DEBUG ===");
    console.log("📍 Current page URL:", window.location.href);
    console.log("📍 Page title:", document.title);
    
    // Find ALL buttons on the page
    const allButtons = document.querySelectorAll('button, a[role="button"], input[type="button"], input[type="submit"]');
    console.log(`🔘 Total buttons found on page: ${allButtons.length}`);
    
    // Analyze each button
    const applyLikeButtons = [];
    allButtons.forEach((button, index) => {
      const text = (button.textContent || '').toLowerCase().trim();
      const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
      const className = button.className || '';
      const dataControl = button.getAttribute('data-control-name') || '';
      
      // Check if button might be related to apply
      if (text.includes('apply') || ariaLabel.includes('apply') || className.includes('apply') || dataControl.includes('apply')) {
        applyLikeButtons.push({
          index,
          element: button,
          text: text,
          ariaLabel: ariaLabel,
          className: className,
          dataControl: dataControl,
          visible: this.isElementVisible(button),
          disabled: button.disabled
        });
      }
    });
    
    console.log(`🎯 Found ${applyLikeButtons.length} apply-related buttons:`);
    applyLikeButtons.forEach((btn, i) => {
      console.log(`  ${i + 1}. "${btn.text}" (aria: "${btn.ariaLabel}") - visible: ${btn.visible}, disabled: ${btn.disabled}`);
      console.log(`     classes: ${btn.className}`);
      console.log(`     data-control: ${btn.dataControl}`);
      console.log(`     element:`, btn.element);
    });
    
    // Test current detection logic
    console.log("\n🧪 Testing current detection logic...");
    const foundButton = this.findEasyApplyButton();
    console.log("Current detection result:", foundButton);
    
    // Test job card detection
    console.log("\n📋 Testing job listing detection...");
    const jobsWithEasyApply = this.getJobsWithEasyApply();
    console.log(`Found ${jobsWithEasyApply.length} jobs with Easy Apply in listings`);
    
    return {
      totalButtons: allButtons.length,
      applyLikeButtons: applyLikeButtons,
      currentDetection: foundButton,
      jobListingDetection: jobsWithEasyApply
    };
  }
}

/**
 * Enhanced External Site Strategy with ATS detection
 */
class ExternalSiteStrategy extends JobSiteStrategyBase {
  constructor() {
    super();
    this.siteName = 'external';
    this.detectedATS = null;
    this.cachedContext = null;
  }
  
  /**
   * Set the detected ATS system
   */
  setDetectedATS(atsName) {
    this.detectedATS = atsName;
    console.log(`ATS set to: ${atsName}`);
  }
  
  /**
   * Enhanced ATS detection based on DOM elements and URL patterns
   */
  detectATS() {
    if (this.detectedATS) {
      return this.detectedATS;
    }
    
    const url = window.location.href.toLowerCase();
    
    // URL-based detection
    const urlPatterns = {
      workday: /workday\.com|\.myworkdayjobs\.com/,
      greenhouse: /greenhouse\.io|\.greenhouse\.io/,
      lever: /lever\.co|\.lever\.co/,
      bamboohr: /bamboohr\.com/,
      smartrecruiters: /smartrecruiters\.com/,
      jobvite: /jobvite\.com/,
      icims: /icims\.com/,
      cornerstone: /csod\.com/,
      taleo: /taleo\.net/,
      successfactors: /successfactors\.com/
    };
    
    for (const [ats, pattern] of Object.entries(urlPatterns)) {
      if (pattern.test(url)) {
        this.detectedATS = ats;
        console.log(`Detected ATS by URL: ${ats}`);
        return ats;
      }
    }
    
    // DOM-based detection
    const domDetection = {
      workday: () => document.querySelector('[data-automation-id], .css-1dbjc4n, .workday, [class*="workday"]'),
      greenhouse: () => document.querySelector('[data-source="greenhouse"], .application-form, .greenhouse-application'),
      lever: () => document.querySelector('.lever-form, [data-qa="application-form"], .lever'),
      bamboohr: () => document.querySelector('.bamboo-form, .application-container, [class*="bamboo"]'),
      smartrecruiters: () => document.querySelector('.sr-application-form, [class*="smartrecruiters"]'),
      jobvite: () => document.querySelector('.jv-form, [class*="jobvite"]'),
      icims: () => document.querySelector('.icims-form, .iCIMS_MainWrapper'),
      cornerstone: () => document.querySelector('.csod-form, [class*="csod"]'),
      taleo: () => document.querySelector('.taleo-form, [class*="taleo"]'),
      successfactors: () => document.querySelector('[class*="successfactors"], [class*="sap-success"]')
    };
    
    for (const [ats, detector] of Object.entries(domDetection)) {
      if (detector()) {
        this.detectedATS = ats;
        console.log(`Detected ATS by DOM: ${ats}`);
        return ats;
      }
    }
    
    this.detectedATS = 'unknown';
    return 'unknown';
  }
  
  findEasyApplyButton() {
    return null; // External sites don't have easy apply
  }
  
  findExternalApplyButton() {
    const selectors = {
      workday: '[data-automation-id="applyBtn"], [data-automation-id="applyButton"]',
      greenhouse: '#apply_button, .js-apply-button, a[href*="/apply"]',
      lever: '.postings-btn, [data-qa="btn-apply"]',
      icims: '.iCIMS_ApplyButton, .btn-apply',
      taleo: '.submit-button, input[type="submit"][value*="Apply"]',
      bamboohr: '#apply-button, .apply-now',
      smartrecruiters: '.sr-apply-button, [data-test="apply-button"]',
      default: 'a[href*="apply"], input[type="submit"][value*="Apply"]'
    };
    
    const selector = selectors[this.detectedATS] || selectors.default;
    const elements = document.querySelectorAll(selector);
    
    // Check each element for "Apply" text since we can't use :contains()
    for (const element of elements) {
      const text = element.textContent?.toLowerCase() || '';
      const value = element.value?.toLowerCase() || '';
      
      if (text.includes('apply') || value.includes('apply')) {
        return element;
      }
    }
    
    return null;
  }
  
  extractJobContext() {
    // Use stored data if available
    const pendingApp = window.pendingExternalApplication;
    if (pendingApp) {
      return {
        title: pendingApp.title || '',
        company: pendingApp.company || '',
        location: pendingApp.location || '',
        description: pendingApp.description || '',
        url: window.location.href,
        timestamp: new Date().toISOString(),
        source: this.detectedATS || 'external',
        ats: this.detectedATS
      };
    }
    
    // Extract from page
    const context = {
      title: '',
      company: '',
      location: '',
      description: '',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      source: this.detectedATS || 'external',
      ats: this.detectedATS
    };
    
    // ATS-specific extraction
    if (this.detectedATS === 'workday') {
      context.title = document.querySelector('[data-automation-id="jobPostingTitle"]')?.textContent.trim() || '';
      context.location = document.querySelector('[data-automation-id="locationText"]')?.textContent.trim() || '';
      context.description = document.querySelector('[data-automation-id="jobPostingDescription"]')?.textContent.trim() || '';
    } else if (this.detectedATS === 'greenhouse') {
      context.title = document.querySelector('.job-title, h1.app-title')?.textContent.trim() || '';
      context.company = document.querySelector('.company-name')?.textContent.trim() || '';
      context.location = document.querySelector('.location')?.textContent.trim() || '';
      context.description = document.querySelector('#content, .content')?.textContent.trim() || '';
    } else if (this.detectedATS === 'lever') {
      context.title = document.querySelector('h2[data-qa="posting-name"]')?.textContent.trim() || '';
      context.location = document.querySelector('.posting-categories .location')?.textContent.trim() || '';
      context.description = document.querySelector('.posting-description')?.textContent.trim() || '';
      context.company = window.location.hostname.split('.')[0];
    } else {
      // Generic extraction
      context.title = document.querySelector('h1')?.textContent.trim() || document.title;
      context.company = window.location.hostname.split('.')[0];
    }
    
    return context;
  }
  
  isInApplicationFlow() {
    const formSelectors = {
      workday: '[data-automation-id*="applicationForm"], [data-automation-id*="applyForm"]',
      greenhouse: '#application, #application_form, form[id*="job_application"]',
      lever: '.application-form, [data-qa="application-form"]',
      icims: '.iCIMS_MainWrapper form',
      taleo: '.taleo-form, form[name*="apply"]',
      bamboohr: '#applicationForm',
      smartrecruiters: '.sr-apply-form',
      default: this.getFormSelectors()
    };
    
    const selectors = formSelectors[this.detectedATS] || formSelectors.default;
    
    if (Array.isArray(selectors)) {
      return selectors.some(sel => document.querySelector(sel));
    }
    
    return !!document.querySelector(selectors);
  }
  
  findApplicationForm() {
    const formSelectors = {
      workday: '[data-automation-id*="applicationForm"], [data-automation-id*="applyForm"]',
      greenhouse: '#application, #application_form, form[id*="job_application"]',
      lever: '.application-form, [data-qa="application-form"]',
      icims: '.iCIMS_MainWrapper form',
      taleo: '.taleo-form, form[name*="apply"]',
      bamboohr: '#applicationForm',
      smartrecruiters: '.sr-apply-form',
      default: this.getFormSelectors()
    };
    
    const selectors = formSelectors[this.detectedATS] || formSelectors.default;
    const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
    
    for (const selector of selectorArray) {
      const form = document.querySelector(selector);
      if (form && this.isValidApplicationForm(form)) {
        return form;
      }
    }
    
    // Check containers that might act as forms
    const containers = document.querySelectorAll(
      '[class*="application-container"], ' +
      '[id*="application-form"], ' +
      'div[data-application], ' +
      'section[class*="application"]'
    );
    
    for (const container of containers) {
      if (this.isValidApplicationForm(container)) {
        return container;
      }
    }
    
    return null;
  }
  
  isValidApplicationForm(element) {
    if (!element) return false;
    const inputs = element.querySelectorAll('input:not([type="hidden"]), textarea, select');
    return inputs.length >= 2;
  }
  
  findNextButton() {
    const selectors = {
      workday: '[data-automation-id="bottom-navigation-next-button"], button[aria-label="Next"]',
      greenhouse: 'input[type="submit"][value*="Next"]',
      lever: null, // Single page forms
      icims: '.btn-next, button[title="Next"]',
      taleo: '.next-button, input[value="Next"]',
      bamboohr: null, // Single page forms
      smartrecruiters: '[data-test="next-button"]',
      default: 'input[type="submit"][value*="Next"]'
    };
    
    const selector = selectors[this.detectedATS];
    if (selector === null) return null;
    
    const actualSelector = selector || selectors.default;
    const elements = document.querySelectorAll(actualSelector);
    
    // Check each element for "Next" or "Continue" text since we can't use :contains()
    for (const element of elements) {
      const text = element.textContent?.toLowerCase() || '';
      const value = element.value?.toLowerCase() || '';
      const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
      
      if (text.includes('next') || text.includes('continue') || 
          value.includes('next') || value.includes('continue') ||
          ariaLabel.includes('next') || ariaLabel.includes('continue')) {
        return element;
      }
    }
    
    return null;
  }
  
  findSubmitButton() {
    const selectors = {
      workday: '[data-automation-id="submit"], button[aria-label*="Submit"]',
      greenhouse: 'input[type="submit"][value*="Submit"]',
      lever: 'button[type="submit"], [data-qa="btn-submit"]',
      icims: '.btn-submit, button[title="Submit"]',
      taleo: '.submit-button, input[value="Submit"]',
      bamboohr: 'button[type="submit"], #submit-application',
      smartrecruiters: '[data-test="submit-application"]',
      default: 'button[type="submit"], input[type="submit"][value*="Submit"]'
    };
    
    const selector = selectors[this.detectedATS] || selectors.default;
    const elements = document.querySelectorAll(selector);
    
    // Check each element for "Submit" text since we can't use :contains()
    for (const element of elements) {
      const text = element.textContent?.toLowerCase() || '';
      const value = element.value?.toLowerCase() || '';
      const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
      
      if (text.includes('submit') || value.includes('submit') || ariaLabel.includes('submit')) {
        return element;
      }
    }
    
    return null;
  }
  
  findReviewButton() {
    const selectors = {
      workday: '[data-automation-id="reviewButton"], button[aria-label*="Review"]',
      greenhouse: null, // Typically no review step
      lever: null, // Typically no review step
      icims: '.btn-review',
      taleo: '.review-button, input[value="Review"]',
      bamboohr: null,
      smartrecruiters: '[data-test="review-application"]',
      default: 'input[value*="Review"], input[value*="Preview"]'
    };
    
    const selector = selectors[this.detectedATS];
    if (selector === null) return null;
    
    const actualSelector = selector || selectors.default;
    const elements = document.querySelectorAll(actualSelector);
    
    // Check each element for "Review" or "Preview" text since we can't use :contains()
    for (const element of elements) {
      const text = element.textContent?.toLowerCase() || '';
      const value = element.value?.toLowerCase() || '';
      const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
      
      if (text.includes('review') || text.includes('preview') || 
          value.includes('review') || value.includes('preview') ||
          ariaLabel.includes('review') || ariaLabel.includes('preview')) {
        return element;
      }
    }
    
    return null;
  }
  
  findCloseButton() {
    return null; // External sites typically don't have modal close buttons
  }
}

/**
 * Strategy Factory
 */
class StrategyFactory {
  static createStrategy(siteName) {
    switch (siteName) {
      case 'careergpt':
        return new CareerGPTStrategy();
      case 'linkedin':
        return new LinkedInStrategy();
      case 'workday':
        return new ExternalSiteStrategy(); // Will auto-detect
      case 'greenhouse':
        return new ExternalSiteStrategy(); // Will auto-detect
      case 'lever':
        return new ExternalSiteStrategy(); // Will auto-detect
      case 'indeed':
        // TODO: Implement IndeedStrategy when needed
        return new LinkedInStrategy(); // Fallback for now
      case 'glassdoor':
        // TODO: Implement GlassdoorStrategy when needed
        return new LinkedInStrategy(); // Fallback for now
      case 'external':
        return new ExternalSiteStrategy();
      default:
        return new ExternalSiteStrategy();
    }
  }
}

// Export for use in other scripts
window.JobSiteStrategy = JobSiteStrategyBase;
window.CareerGPTStrategy = CareerGPTStrategy;
window.LinkedInStrategy = LinkedInStrategy;
window.ExternalSiteStrategy = ExternalSiteStrategy;
window.StrategyFactory = StrategyFactory;

// Global debugging functions for LinkedIn
window.linkedinDebug = {
  // Quick Easy Apply analysis
  testEasyApply: function() {
    console.log("🔧 === MANUAL EASY APPLY TEST ===");
    const strategy = new LinkedInStrategy();
    return strategy.debugEasyApplyDetection();
  },
  
  // Quick page analysis
  analyzePage: function() {
    console.log("🔧 === PAGE ANALYSIS ===");
    const siteInfo = window.SiteDetector ? window.SiteDetector.detectSite() : null;
    console.log("Site detection:", siteInfo);
    
    if (siteInfo && siteInfo.name === 'linkedin') {
      const strategy = new LinkedInStrategy();
      const easyApplyButton = strategy.findEasyApplyButton();
      const jobsWithEasyApply = strategy.getJobsWithEasyApply();
      
      return {
        siteInfo,
        easyApplyButton,
        jobsWithEasyApply: jobsWithEasyApply.length,
        pageType: siteInfo.isJobDetailsPage ? 'Job Details' : (siteInfo.isJobListPage ? 'Job Listing' : 'Other')
      };
    }
    
    return { error: "Not on LinkedIn or site detector not available" };
  },
  
  // Manual apply attempt
  applyNow: function() {
    console.log("🔧 === MANUAL APPLY ATTEMPT ===");
    if (window.globalAgent) {
      return window.globalAgent.applyToJob();
    } else {
      console.log("❌ Global agent not available");
      return null;
    }
  },
  
  // Force re-detection
  refresh: function() {
    console.log("🔧 === FORCING RE-DETECTION ===");
    if (window.extensionDebug && window.extensionDebug.triggerAutoApply) {
      window.extensionDebug.triggerAutoApply();
    } else {
      console.log("❌ Extension debug not available");
    }
  },
  
  // Get current settings
  getSettings: function() {
    if (window.extensionDebug && window.extensionDebug.getSettings) {
      return window.extensionDebug.getSettings();
    } else {
      console.log("❌ Extension debug not available");
      return null;
    }
  },
  
  // Help
  help: function() {
    console.log(`
🔧 === LINKEDIN DEBUG COMMANDS ===

window.linkedinDebug.testEasyApply()     - Comprehensive Easy Apply detection test
window.linkedinDebug.analyzePage()      - Quick page analysis
window.linkedinDebug.applyNow()         - Manual apply attempt  
window.linkedinDebug.refresh()          - Force re-detection
window.linkedinDebug.getSettings()      - Get current settings
window.linkedinDebug.help()             - Show this help

Example usage:
> linkedinDebug.testEasyApply()
> linkedinDebug.analyzePage()
    `);
  }
};

console.log("🔧 LinkedIn debugging available via window.linkedinDebug - type linkedinDebug.help() for commands");
}