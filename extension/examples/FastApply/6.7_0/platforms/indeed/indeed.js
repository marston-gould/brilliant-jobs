// platforms/indeed/indeed.js - STANDALONE VERSION (no inheritance)
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import FormHandler from "./indeed-form-handler.js";
import { IndeedFileHandler } from "./indeed-file-handler.js";
import { IndeedCoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";

export default class IndeedPlatform {
  constructor(config) {
    this.config = config || {};
    this.platform = "indeed";
    this.baseUrl = "https://www.indeed.com";

    this.config = config || {};

    // Simple state management
    this.state = {
      isRunning: false,
      currentJobIndex: 0,
      processedJobs: new Set(),
      jobQueue: [],
      isFallbackMode: false,
      isProcessingJob: false,
    };

    // Get userId from multiple sources with fallbacks
    // Note: sessionContext may be undefined at construction time
    this.userId = this.config.userId || null;
    this.sessionContext = this.config.sessionContext || null;

    // Get API hosts - may be null, will be properly set in setSessionContext
    this.aiApiHost =
      this.config.sessionContext?.sessionConfig?.aiApiHost || null;
    this.backendApiHost =
      this.config.sessionContext?.sessionConfig?.backendApiHost || null;

    if (!window.indeedHandlers) {
      window.indeedHandlers = {
        fileHandler: null,
        formHandler: null,
      };
    }

    this.formHandler = window.indeedHandlers.formHandler;
    this.fileHandler = window.indeedHandlers.fileHandler;

    // Initialize co-pilot state with auto-pilot as default
    // Copilot mode will be set in setSessionContext when preferences are available
    this.copilotState = new IndeedCoPilotState();
    this.copilotState.switchToAutoPilot();

    this.selectors = {
      // Primary job card selectors - target the actual result containers
      // Indeed uses div.cardOutline.tapItem.result with job_XXX class
      jobCards:
        "div.cardOutline.tapItem.result[class*='job_'], div.tapItem.result[class*='job_'], li > div.cardOutline.result, .slider_item:has(.job_seen_beacon), [data-testid='slider_item']:has(a[data-jk]), .job_seen_beacon, .jobsearch-SerpJobCard",
      jobTitle:
        ".jcs-JobTitle span, .jobTitle span, a[data-jk] span, span[id^='jobTitle-'], h2[data-testid='job-title'] a span, .jobTitle-color-purple span, h2.jobTitle span",
      companyName:
        "[data-testid='company-name'], .companyName, a[data-testid='company-name'], span[data-testid='company-name']",
      location:
        "[data-testid='text-location'], .companyLocation, [data-testid='job-location']",
      jobDescription:
        "#jobDescriptionText, .jobsearch-jobDescriptionText, [data-testid='job-description'], .jobsearch-JobComponent-description",
      easyApplyButton:
        "#indeedApplyButton[data-testid='indeedApplyButton-test'], #indeedApplyButton, .jobsearch-IndeedApplyButton-newDesign, .indeed-apply-button, .indeedApplyButton, button[data-testid*='apply-button']",
      easyApplyIndicator:
        ".iaIcon, [data-testid*='easy-apply'], .easy-apply-button, .indeed-apply-button", // The specific "Easily apply" indicator
      // Updated pagination selectors to match Indeed's current HTML structure
      nextPageButton:
        "[data-testid='pagination-page-next'], a[aria-label='Next page'], nav[aria-label='pagination'] a:last-child:not([aria-current]), a.serp-page-1v7ptvg, .np[aria-label='Next'], .pn, a[aria-label='Next']",
      contactInfoForm: "[class*='mosaic-provider-module-apply-contact-info']",
      continueButton:
        "[data-testid='continue-button'], button[data-testid*='e0a7c20aa761715b9c2fa0a89398cbd814fc5a1a3aa41414e6b664f4da9925e1']",
    };

    // Ensure it's visible if it was previously hidden
    notifyStatus({ type: "AUTOMATION_STARTING" });

    this.setupMessageListener();
    this.reason;
  }

  getAiApiHost() {
    return this.config.aiApiHost;
  }

  /**
   * Delay helper method
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get JWT token from session context
   */
  getJwtToken() {
    return (
      this.sessionContext?.jwtToken ||
      this.config.sessionContext?.jwtToken ||
      this.config.jwtToken
    );
  }

  /**
   * Wait for an element to appear in the DOM
   * @param {Function|string} selectorFn - Selector string or function returning element
   * @param {Object} options - Timeout and visibility options
   */
  async waitForElement(selectorFn, options = {}) {
    const timeout = options.timeout || 5000;
    const checkVisibility = options.checkVisibility !== false;
    const onProgress = options.onProgress;
    const startTime = Date.now();
    let checkCount = 0;

    while (Date.now() - startTime < timeout) {
      checkCount++;
      const elapsed = Date.now() - startTime;

      try {
        let element;
        if (typeof selectorFn === "function") {
          element = selectorFn();
        } else {
          element = document.querySelector(selectorFn);
        }

        if (element) {
          if (!checkVisibility || this.isElementVisible(element)) {
            return element;
          }
        }

        // Call onProgress callback if provided
        if (onProgress) {
          onProgress({ checkCount, elapsed });
        }
      } catch (error) {
        // Ignore errors during check
      }
      await this.delay(100);
    }
    throw new Error(`Element not found within ${timeout}ms`);
  }

  /**
   * Wait for any of the provided elements to appear
   * @param {Array<string|Object>} selectors - List of selectors to check
   * @param {Object} options - Timeout options
   */
  async waitForAnyElement(selectors, options = {}) {
    const timeout = options.timeout || 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      for (const item of selectors) {
        const selector = typeof item === "string" ? item : item.selector;
        const element = document.querySelector(selector);
        if (element && this.isElementVisible(element)) {
          return { element, selector };
        }
      }
      await this.delay(100);
    }
    throw new Error(`No matching elements found within ${timeout}ms`);
  }

  // Abstract methods required by base class
  getPlatformDomains() {
    return "https://www.indeed.com/";
  }

  getSearchLinkPattern() {
    return /^https:\/\/([a-z]{2}\.)?indeed\.com\/(viewjob|job|jobs|apply|.*[?&]q=.*|.*\/jobs.*)/;
  }

  isValidJobPage(url) {
    return /indeed\.com\/(viewjob|job)/i.test(url);
  }

  async initialize() {
    // Ensure userData is available from userProfile
    if (this.userProfile && !this.userData) {
      this.userData = this.userProfile;
    }

    // Update API hosts from latest session context
    this.aiApiHost = this.config.sessionContext?.sessionConfig?.aiApiHost;
    this.backendApiHost =
      this.config.sessionContext?.sessionConfig?.backendApiHost;

    // Apply session context preferences (including co-pilot mode)
    if (this.sessionContext) {
      await this.setSessionContext(this.sessionContext);
    }

    if (!window.indeedHandlers.fileHandler) {
      window.indeedHandlers.fileHandler = new IndeedFileHandler({
        backendApiHost: this.backendApiHost,
        aiApiHost: this.aiApiHost,
        jwtToken: this.getJwtToken(),
        jobPreferences:
          this.sessionContext?.preferences ||
          this.config.sessionContext?.preferences,
      });
    } else {
      window.indeedHandlers.fileHandler.updateConfig({
        backendApiHost: this.backendApiHost,
        aiApiHost: this.aiApiHost,
        jwtToken: this.getJwtToken(),
        jobPreferences:
          this.sessionContext?.preferences ||
          this.config.sessionContext?.preferences,
      });
    }
    this.fileHandler = window.indeedHandlers.fileHandler;

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    const url = window.location.href;
    console.log("🔍 Indeed init() called on URL:", url);

    // Check for post-apply page first
    if (
      url.includes("ng.smartapply.indeed.com/beta/indeedapply/form/post-apply")
    ) {
      this.handleApplicationSuccessPage();
    } else if (this.isSuccessPage(url) && this.isApplicationSuccess()) {
      this.handleApplicationSuccessPage();
    } else if (this.isSearchPage(url)) {
      this.registerSearchTab();
    } else if (this.isViewJobPage(url)) {
      this.handleViewJobPage();
    } else if (this.isFormPage(url)) {
      this.handleFormPage();
    } else {
      console.log("📝 Indeed platform loaded");
    }
  }

  isSearchPage(url) {
    if (url.includes("/viewjob")) {
      return false;
    }
    return /indeed\.com\/(jobs|search|.*[?&]q=.*)/i.test(url);
  }

  isViewJobPage(url) {
    return /indeed\.com\/viewjob\?.*jk=/i.test(url);
  }

  isFormPage(url) {
    // Exclude post-apply success pages
    if (url.includes("post-apply")) {
      return false;
    }
    return (
      url.includes("smartapply.indeed.com") || url.includes("indeed.com/apply")
    );
  }

  isSuccessPage(url) {
    return url.includes("smartapply.indeed.com") && url.includes("post-apply");
  }

  async start() {
    try {
      if (this.state.isRunning) {
        return true;
      }

      const authCheck = await this.checkAuthentication();
      if (!authCheck.canProceed) {
        this.handleAuthError(authCheck);
        return false;
      }

      this.state.isRunning = true;
      notifyStatus({ type: "AUTOMATION_STARTING" });

      // Ensure session context preferences are applied (fallback if initialize wasn't called)
      if (this.sessionContext) {
        await this.setSessionContext(this.sessionContext);
      }

      // Ensure correct mode buttons are shown after automation starts
      this.restoreModeButtons();

      if (!this.userProfile) {
        // User profile should be available from session context
        this.userProfile = this.sessionContext?.userProfile;
      }

      // Only start job processing on search pages, not form pages
      const url = window.location.href;
      if (this.isSearchPage(url)) {
        // Register search tab with background handler
        this.registerSearchTab();
        await this.startJobProcessing();
      }
      return true;
    } catch (error) {
      this.state.isRunning = false;
      return false;
    }
  }

  async startJobProcessing() {
    try {
      this.state.isRunning = true;
      console.log("🚀 Starting job processing on Indeed...");

      // Apply filters from user preferences before processing jobs
      await this.applyFiltersFromPreferences();

      // Log DOM state for debugging
      const primarySelector = "div.cardOutline.tapItem.result[class*='job_']";
      const primaryCount = document.querySelectorAll(primarySelector).length;
      console.log(
        `📊 DOM Analysis: ${primaryCount} elements match primary job card selector`
      );

      const jobCards = this.getJobCards();
      console.log(
        `📋 getJobCards() returned ${jobCards.length} eligible Easy Apply job cards`
      );

      if (jobCards.length === 0) {
        // Fallback: Check all job cards for Apply button
        const allJobCards = this.getAllJobCards();
        console.log(
          `📋 getAllJobCards() returned ${allJobCards.length} total job cards (fallback mode)`
        );

        if (allJobCards.length === 0) {
          console.log(
            "❌ No job cards found on this page - search may have completed"
          );
          await this.handleSearchCompleted(); // No jobs found at all
          return;
        }

        this.state.jobQueue = Array.from(allJobCards);
        this.state.isFallbackMode = true;

        notifyStatus({
          type: "JOB_SEARCH_STARTED",
          data: {
            preferences: {
              ...(this.sessionContext?.preferences || {}),
            },
          },
        });

        console.log(
          "🔄 Starting fallback mode - will check each job for Easy Apply"
        );
        // Start processing first job in fallback mode
        await this.processNextJob();
        return;
      }

      this.state.jobQueue = Array.from(jobCards);
      this.state.isFallbackMode = false;

      notifyStatus({
        type: "JOB_SEARCH_STARTED",
        data: {
          preferences: {
            ...(this.sessionContext?.preferences || {}),
          },
        },
      });

      console.log(
        `✅ Found ${jobCards.length} Easy Apply jobs - starting processing`
      );
      // Start processing first job
      await this.processNextJob();
    } catch (error) {
      console.error("❌ Error starting job processing:", error);
    }
  }

  async applyFiltersFromPreferences() {
    try {
      const preferences = this.sessionContext?.preferences;
      if (!preferences) {
        return;
      }

      // Only apply filters for United States users
      const userCountry = this.sessionContext?.userProfile?.country;
      if (userCountry !== "United States") {
        console.log(
          "⏭️ Skipping filter application - only available for United States users"
        );
        return;
      }

      // Apply Job Type filter
      if (preferences.jobType.length > 0) {
        await this.applyJobTypeFilter(preferences.jobType);
      }
    } catch (error) {
      console.error("❌ Error applying filters:", error);
    }
  }

  async applyDatePostedFilter(datePosted) {
    try {
      // Check if date filter is already applied in URL
      const currentUrl = window.location.href;
      if (currentUrl.includes("fromage=") || currentUrl.includes("&sc=")) {
        return;
      }

      // Map preferences to Indeed's date filter options
      const dateMapping = {
        1: "Last 24 hours",
        3: "Last 3 days",
        7: "Last 7 days",
        14: "Last 14 days",
        "Past 24 hours": "Last 24 hours",
        "Past 3 days": "Last 3 days",
        "Past week": "Last 7 days",
        "Past month": "Last 14 days",
      };

      const targetDateText = dateMapping[datePosted] || datePosted;
      if (!targetDateText) {
        return;
      }

      // Click the Date Posted dropdown button
      const dateButton = document.querySelector(
        '#fromAge_filter_button, button[aria-controls*=":R2kub:"]'
      );
      if (!dateButton) {
        return;
      }

      dateButton.click();
      await this.delay(500);

      // Find and click the matching option
      const dateOptions = document.querySelectorAll(
        '[role="menu"] a[role="link"]'
      );
      for (const option of dateOptions) {
        const optionText = option.textContent?.trim();
        if (optionText === targetDateText) {
          option.click();
          await this.delay(1000);
          return;
        }
      }
    } catch (error) {
      console.error("❌ Error applying date posted filter:", error);
    }
  }

  async applyJobTypeFilter(jobType) {
    try {
      const currentUrl = window.location.href;
      if (currentUrl.includes("&sc=") || currentUrl.includes("?sc=")) {
        return;
      }

      const jobTypes = Array.isArray(jobType) ? jobType : [jobType];

      const jobTypeButton = document.querySelector("#filter-jobtype1");
      if (!jobTypeButton) {
        return;
      }

      jobTypeButton.click();
      await this.delay(1000);

      const jobTypeModal = document.querySelector(
        '[role="dialog"][aria-label*="Job Type"]'
      );
      if (!jobTypeModal) {
        return;
      }

      const jobTypeForm = document.querySelector("#filter-jobtype1-menu");
      if (!jobTypeForm) {
        return;
      }

      const jobTypeMapping = {
        "Full-time": "Full-time",
        "Part-time": "Part-time",
        Contract: "Contract",
        Temporary: "Temporary",
        Internship: "Internship",
      };

      for (const type of jobTypes) {
        const targetText = jobTypeMapping[type] || type;

        const labels = jobTypeForm.querySelectorAll("label");

        for (const label of labels) {
          const spanText = label.querySelector("span")?.textContent?.trim();
          const checkbox = label.querySelector('input[type="checkbox"]');

          if (spanText === targetText && checkbox && !checkbox.checked) {
            checkbox.click();
            await this.delay(300);
          }
        }
      }

      await this.delay(500);

      const updateButton = jobTypeModal.querySelector('button[type="submit"]');
      if (updateButton) {
        updateButton.click();
        await this.delay(2000);
      } else {
        document.body.click();
        await this.delay(500);
      }
    } catch (error) {
      console.error("❌ Error applying job type filter:", error);
    }
  }

  async processNextJob() {
    try {
      if (!this.state.isRunning) {
        console.log("⏹️ Automation not running, skipping processNextJob");
        return;
      }

      if (this.state.isProcessingJob) {
        console.log("⏳ Already processing a job, skipping");
        return;
      }

      this.state.isProcessingJob = true;

      const unprocessedJobs = this.getUnprocessedJobs();

      if (unprocessedJobs.length === 0) {
        this.state.isProcessingJob = false;

        // If no new jobs found by scrolling, then try to go to the next page
        if (await this.goToNextPage()) {
          setTimeout(() => this.processNextJob(), 3000);
        } else {
          await this.handleSearchCompleted();
        }
        return;
      }

      const jobCard = unprocessedJobs[0];

      await this.expandJobDetails(jobCard);

      const jobInfo = await this.extractJobInfo(jobCard);

      await this.saveJobToStorage(jobInfo);

      // Wait adaptively for apply button to appear after clicking job card
      // This replaces the immediate detection which was too fast
      const applyButtonResult = await this.waitForApplyButtonAdaptive();

      if (applyButtonResult.type === "external") {
        console.log("⏭️ External apply only (company site) - skipping");
        this.state.processedJobs.add(this.getJobCardId(jobCard));
        this.state.isProcessingJob = false;
        setTimeout(() => this.processNextJob(), 500);
        return;
      }

      if (applyButtonResult.type === "none") {
        console.log("⏭️ No apply button found after waiting - skipping");
        this.state.processedJobs.add(this.getJobCardId(jobCard));
        this.state.isProcessingJob = false;
        setTimeout(() => this.processNextJob(), 500);
        return;
      }

      const applyButton = applyButtonResult.button;
      console.log("✅ Indeed Easy Apply button found");
      if (
        this.sessionContext?.preferences?.applyOnlyMatching ||
        this.sessionContext?.preferences?.applyOnlyQualified
      ) {
        const isMatch = await this.doesJobMatchPreferences(jobInfo);
        if (!isMatch) {
          this.state.processedJobs.add(this.getJobCardId(jobCard));
          this.state.isProcessingJob = false;

          // Show status message
          if (true) {
            // Global overlay
            notifyStatus({
              type: "DOES_NOT_MATCH_PREFERENCES",
              data: {
                reason: this.reason,
                title: jobInfo.title,
              },
            });
          }

          // Continue to next job
          setTimeout(() => this.processNextJob(), 2000);
          return;
        }
      }

      const jobTitleLink = jobCard.querySelector(
        "a.jcs-JobTitle, .jobTitle a, a[data-jk], h2 a, .jobTitle-color-purple a"
      );

      if (!jobTitleLink) {
        this.state.processedJobs.add(this.getJobCardId(jobCard));
        this.state.isProcessingJob = false;
        setTimeout(() => this.processNextJob(), 1000);
        return;
      }
      let jobUrl = jobTitleLink.getAttribute("href");
      if (jobUrl && jobUrl.startsWith("/")) {
        const domain = window.location.origin;
        jobUrl = domain + jobUrl;
      }

      if (!jobUrl) {
        this.state.processedJobs.add(this.getJobCardId(jobCard));
        this.state.isProcessingJob = false;
        setTimeout(() => this.processNextJob(), 1000);
        return;
      }

      // Show status message (async, non-blocking)
      if (true) {
        // Global overlay
        Promise.resolve().then(() => {
          notifyStatus({
            type: "APPLYING_TO_JOB",
            data: { title: jobInfo.title },
          });
        });
      }

      // Send START_APPLICATION to match Workable/Lever pattern
      this.sendMessage({
        type: "START_APPLICATION",
        data: {
          url: jobUrl,
          jobId: jobInfo.jobId,
          company: jobInfo.company,
          title: jobInfo.title,
          requestId: `req_${Date.now()}`,
          platform: "indeed",
        },
      });

      // Mark as processed - keep isProcessingJob = true until SEARCH_NEXT is received
      this.state.processedJobs.add(this.getJobCardId(jobCard));
    } catch (error) {
      console.error("❌ Error in processNextJob:", error);
      this.state.isProcessingJob = false;
      setTimeout(() => this.processNextJob(), 2000);
    }
  }

  getJobCards() {
    // Primary selector: Target actual job result containers with job_XXX class pattern
    const primarySelector = "div.cardOutline.tapItem.result[class*='job_']";
    let allCards = document.querySelectorAll(primarySelector);

    console.log(`🔍 Primary selector found ${allCards.length} job cards`);

    // If primary selector finds nothing, try fallback selectors
    if (allCards.length === 0) {
      // Fallback: use the full selector list
      allCards = document.querySelectorAll(this.selectors.jobCards);
      console.log(
        `🔍 Fallback selectors found ${allCards.length} potential cards`
      );
    }

    // Filter cards to only include actual job cards
    const eligibleCards = Array.from(allCards).filter((card) => {
      // Skip cards that are hidden (aria-hidden="true")
      if (card.getAttribute("aria-hidden") === "true") {
        return false;
      }

      // Skip promo/ad cards - they don't have job links
      const hasJobLink = card.querySelector(
        'a[data-jk], a[id^="job_"], a.jcs-JobTitle'
      );
      if (!hasJobLink) {
        return false;
      }

      // Skip if card class suggests it's not a job result
      const cardClass = card.className || "";
      if (
        cardClass.includes("nonJobContent") ||
        cardClass.includes("mosaic-empty-zone") ||
        cardClass.includes("uip-micro-content") ||
        cardClass.includes("app-download")
      ) {
        return false;
      }

      // Must be visible
      if (!this.isElementVisible(card)) {
        return false;
      }

      // Check for Easy Apply indicator
      return this.hasEasyApply(card);
    });

    console.log(
      `✅ Found ${eligibleCards.length} eligible Easy Apply job cards`
    );
    return eligibleCards;
  }

  getAllJobCards() {
    // Primary selector: Target actual job result containers
    const primarySelector = "div.cardOutline.tapItem.result[class*='job_']";
    let allCards = document.querySelectorAll(primarySelector);

    // If primary selector finds nothing, try fallback
    if (allCards.length === 0) {
      allCards = document.querySelectorAll(this.selectors.jobCards);
    }

    // Filter to only actual job cards (not promos, not hidden)
    return Array.from(allCards).filter((card) => {
      // Skip hidden cards
      if (card.getAttribute("aria-hidden") === "true") {
        return false;
      }

      // Must have a job link
      const hasJobLink = card.querySelector(
        'a[data-jk], a[id^="job_"], a.jcs-JobTitle'
      );
      if (!hasJobLink) {
        return false;
      }

      // Skip non-job content
      const cardClass = card.className || "";
      if (
        cardClass.includes("nonJobContent") ||
        cardClass.includes("mosaic-empty-zone") ||
        cardClass.includes("uip-micro-content") ||
        cardClass.includes("app-download")
      ) {
        return false;
      }

      return this.isElementVisible(card);
    });
  }

  getUnprocessedJobs() {
    const allCards = this.state.isFallbackMode
      ? this.getAllJobCards()
      : this.getJobCards();
    return Array.from(allCards).filter((card) => {
      const cardId = this.getJobCardId(card);
      return !this.state.processedJobs.has(cardId);
    });
  }

  async expandJobDetails(jobCard) {
    try {
      const jobLink = jobCard.querySelector(
        "a[data-jk], .jobTitle a, [data-testid='job-title'] a, h2 a, .jobTitle-color-purple a"
      );

      if (jobLink) {
        // Scroll into view
        jobLink.scrollIntoView({ behavior: "smooth", block: "center" });

        // Click with retry - NO FIXED DELAY
        const clickSuccess = await this.clickButtonWithRetry(jobLink, 2);
        if (!clickSuccess) {
          console.warn("⚠️ Failed to click job link, trying card click");
          jobCard.click();
        }
      } else {
        jobCard.scrollIntoView({ behavior: "smooth", block: "center" });
        jobCard.click();
      }

      // Wait for job description to load with actual content
      try {
        await this.waitForElement(
          () => {
            const descElement = document.querySelector(
              this.selectors.jobDescription
            );
            if (!descElement) return null;

            // Check if the outer element has content
            let textContent = descElement.textContent?.trim() || "";

            // If outer element doesn't have enough content, check inner div
            if (textContent.length < 100) {
              const innerDiv = descElement.querySelector("div");
              if (innerDiv) {
                textContent = innerDiv.textContent?.trim() || "";
              }
            }

            // Return element only if it has substantial content (at least 200 chars for a real job description)
            return textContent.length > 200 ? descElement : null;
          },
          {
            timeout: 8000,
            checkVisibility: false, // Don't check visibility - just check content exists
            onProgress: ({ checkCount, elapsed }) => {
              if (checkCount % 30 === 0) {
                const descElement = document.querySelector(
                  this.selectors.jobDescription
                );
                const currentLength =
                  descElement?.textContent?.trim().length || 0;
                console.log(
                  `⏳ Waiting for job description (${elapsed}ms, current length: ${currentLength} chars)...`
                );
              }
            },
          }
        );
      } catch (error) {
        console.log(error);
        console.warn(
          "⚠️ Job description did not load within timeout, continuing anyway"
        );
        await this.delay(2000); // Longer fallback delay
      }
    } catch (error) {
      this.safeSendPortMessage({
        type: "APPLICATION_ERROR",
        data: {
          url: window.location.href,
          error: error.message,
        },
      });
    }
  }

  async extractJobInfo(jobCard) {
    try {
      const title =
        jobCard.querySelector(this.selectors.jobTitle)?.textContent?.trim() ||
        "Unknown Position";
      const company =
        jobCard
          .querySelector(this.selectors.companyName)
          ?.textContent?.trim() || "Unknown Company";
      const location =
        jobCard.querySelector(this.selectors.location)?.textContent?.trim() ||
        "Unknown Location";

      // Try multiple selectors for job description
      let jobDescription = "";

      // Prioritize #jobDescriptionText as it's the most specific for actual job content
      let descriptionElement = document.querySelector("#jobDescriptionText");

      // Fallback to other selectors if specific ID not found
      if (!descriptionElement) {
        descriptionElement = document.querySelector(
          ".jobsearch-jobDescriptionText, [data-testid='job-description']"
        );
      }

      if (descriptionElement) {
        // Use innerText instead of textContent to get only visible text
        // This avoids grabbing CSS-in-JS style content
        jobDescription = descriptionElement.innerText?.trim() || "";

        // If innerText fails, try textContent on inner div only
        if (!jobDescription || jobDescription.length < 50) {
          const innerDiv = descriptionElement.querySelector("div");
          if (innerDiv) {
            jobDescription = innerDiv.innerText?.trim() || "";
          }
        }

        // Filter out any CSS content that might have leaked through
        // CSS content typically starts with class selectors or property names
        if (
          jobDescription.startsWith(".css-") ||
          jobDescription.startsWith("body ")
        ) {
          console.warn(
            "⚠️ Job description appears to contain CSS, attempting cleanup"
          );
          // Try to extract just the direct text content by iterating children
          const textParts = [];
          for (const node of descriptionElement.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent?.trim();
              if (text && text.length > 10) {
                textParts.push(text);
              }
            } else if (
              node.nodeType === Node.ELEMENT_NODE &&
              node.tagName !== "STYLE"
            ) {
              const text = node.innerText?.trim();
              if (
                text &&
                !text.startsWith(".css-") &&
                !text.startsWith("body ")
              ) {
                textParts.push(text);
              }
            }
          }
          jobDescription = textParts.join("\n").trim();
        }
      }

      let salary = "";
      const salaryElement = document.querySelector(
        "#salaryInfoAndJobType, .salary-snippet-container, .metadata.salary-snippet-container"
      );
      if (salaryElement) {
        salary = salaryElement.textContent?.trim() || "";
      }

      // Extract job ID from Indeed specific attributes
      const jobLink = jobCard.querySelector("a");
      let jobId = "";
      if (jobLink?.href) {
        const match = jobLink.href.match(/jk=([^&]+)/);
        jobId = match ? match[1] : "";
      }

      const jobInfo = {
        jobId,
        title,
        company,
        location,
        salary,
        description: jobDescription,
        jobUrl: jobLink?.href || window.location.href,
        platform: this.platform,
        timestamp: Date.now(),
      };

      return jobInfo;
    } catch (error) {
      return {
        title: "Unknown Position",
        company: "Unknown Company",
        location: "Unknown Location",
        salary: "",
        description: "",
        platform: this.platform,
      };
    }
  }

  async saveJobToStorage(jobInfo) {
    try {
      const MAX_DESCRIPTION_LENGTH = 5000;
      const limitedJobInfo = {
        ...jobInfo,
        description:
          jobInfo.description?.substring(0, MAX_DESCRIPTION_LENGTH) || "",
        timestamp: Date.now(),
      };

      await chrome.storage.local.remove("currentJobData");

      await chrome.storage.local.set({
        currentJobData: limitedJobInfo,
      });

      try {
        this.safeSendPortMessage({
          action: "reportProgress",
          sessionId: this.sessionId,
          progress: {
            type: "job_found",
            jobData: jobInfo,
            timestamp: Date.now(),
          },
        });
      } catch (error) {
        console.warn("Could not report progress to background:", error);
      }
    } catch (error) {
      // If still failing, try clearing all storage and retry
      if (error.message?.includes("quota")) {
        try {
          await chrome.storage.local.clear();
          await chrome.storage.local.set({
            currentJobData: {
              ...jobInfo,
              description: jobInfo.description?.substring(0, 1000) || "", // Even shorter
              timestamp: Date.now(),
            },
          });
        } catch (retryError) {
          console.error("❌ Failed even after clearing storage:", retryError);
        }
      }
    }
  }

  hasEasyApply(jobCard) {
    // Check for Indeed's specific Easy Apply indicator using the updated selector
    const easyApplyIndicator = jobCard.querySelector(
      this.selectors.easyApplyIndicator
    );
    if (easyApplyIndicator && this.isElementVisible(easyApplyIndicator)) {
      const text = easyApplyIndicator.textContent?.toLowerCase() || "";
      if (
        text.includes("easily apply") ||
        text.includes("easy apply") ||
        text.includes("apply now")
      ) {
        return true;
      }
    }

    // Also check for apply buttons directly on the job card
    const applyButton = jobCard.querySelector(this.selectors.easyApplyButton);
    if (applyButton && this.isElementVisible(applyButton)) {
      const buttonText = applyButton.textContent?.toLowerCase() || "";
      if (buttonText.includes("apply") && !buttonText.includes("applied")) {
        return true;
      }
    }

    // Check for specific Indeed classes that indicate Easy Apply
    const hasEasyApplyClass = jobCard.querySelector(
      '.indeed-apply-button, .easy-apply, [data-testid*="easy-apply"]'
    );
    if (hasEasyApplyClass && this.isElementVisible(hasEasyApplyClass)) {
      return true;
    }

    return false;
  }

  /**
   * Find apply button with immediate detection - returns type and button
   * @returns {{ type: 'indeed' | 'external' | 'none', button: HTMLElement | null }}
   */
  findApplyButtonImmediate() {
    // Check for external apply buttons FIRST (to skip immediately)
    const externalIndicators = [
      'a[href*="applystart"]',
      'button[data-testid*="external"]',
      'a[data-testid*="external"]',
    ];

    for (const selector of externalIndicators) {
      const externalBtn = document.querySelector(selector);
      if (externalBtn && this.isElementVisible(externalBtn)) {
        const text = externalBtn.textContent?.toLowerCase() || "";
        if (
          text.includes("company site") ||
          text.includes("employer") ||
          text.includes("external")
        ) {
          return { type: "external", button: null };
        }
      }
    }

    // Also check button text for external apply
    const allButtons = document.querySelectorAll("button, a");
    for (const btn of allButtons) {
      if (!this.isElementVisible(btn)) continue;
      const text = btn.textContent?.toLowerCase() || "";
      if (
        (text.includes("apply") && text.includes("company site")) ||
        (text.includes("apply") && text.includes("employer")) ||
        text.includes("apply on company site") ||
        text.includes("apply on employer")
      ) {
        return { type: "external", button: null };
      }
    }

    // Now look for Indeed Easy Apply button
    const indeedApplyButton = document.querySelector(
      '#indeedApplyButton[data-testid="indeedApplyButton-test"]'
    );
    if (
      indeedApplyButton &&
      this.isElementVisible(indeedApplyButton) &&
      !indeedApplyButton.disabled
    ) {
      // Check that button is not still loading
      const buttonText =
        indeedApplyButton.textContent?.trim().toLowerCase() || "";
      if (buttonText.includes("apply") && !buttonText.includes("loading")) {
        return { type: "indeed", button: indeedApplyButton };
      }
    }

    // Then try the configured selectors
    const specificButtons = document.querySelectorAll(
      this.selectors.easyApplyButton
    );
    for (const button of specificButtons) {
      if (this.isElementVisible(button) && !button.disabled) {
        const text = button.textContent?.toLowerCase() || "";
        // Check it's not loading, not external, and actually has "apply" in the text
        if (
          text.includes("apply") &&
          !text.includes("loading") &&
          !text.includes("company site") &&
          !text.includes("employer")
        ) {
          return { type: "indeed", button };
        }
      }
    }

    // Search all buttons for "Apply Now" or "Easy Apply"
    for (const button of allButtons) {
      if (!this.isElementVisible(button) || button.disabled) continue;
      const buttonText = button.textContent?.trim().toLowerCase() || "";

      // Skip if already applied
      if (buttonText.includes("applied")) continue;

      // Skip if still loading
      if (buttonText === "loading" || buttonText.includes("loading")) continue;

      // Skip external buttons
      if (
        buttonText.includes("company site") ||
        buttonText.includes("employer") ||
        buttonText.includes("external")
      ) {
        continue;
      }

      if (
        buttonText === "apply now" ||
        buttonText === "apply" ||
        buttonText.includes("easy apply") ||
        buttonText.includes("easily apply")
      ) {
        return { type: "indeed", button };
      }
    }

    return { type: "none", button: null };
  }

  // Keep legacy method for backward compatibility
  findApplyButton() {
    const result = this.findApplyButtonImmediate();
    return result.type === "indeed" ? result.button : null;
  }

  /**
   * Adaptively wait for apply button to appear after clicking a job card.
   * Uses real-time polling instead of hardcoded delays.
   * @param {Object} options - Configuration options
   * @param {number} options.maxWaitMs - Maximum time to wait (default: 5000ms)
   * @param {number} options.pollIntervalMs - Polling interval (default: 100ms)
   * @returns {Promise<{ type: 'indeed' | 'external' | 'none', button: HTMLElement | null }>}
   */
  async waitForApplyButtonAdaptive(options = {}) {
    const maxWaitMs = options.maxWaitMs || 5000;
    const pollIntervalMs = options.pollIntervalMs || 100;
    const startTime = Date.now();
    let lastLogTime = startTime;

    console.log("⏳ Waiting for apply button to appear...");

    while (Date.now() - startTime < maxWaitMs) {
      // Check for button using immediate detection
      const result = this.findApplyButtonImmediate();

      // If we found an Indeed Easy Apply button, return immediately
      if (result.type === "indeed") {
        const elapsed = Date.now() - startTime;
        console.log(`✅ Apply button found after ${elapsed}ms`);
        return result;
      }

      // If we detected it's external-only, return immediately (no need to wait more)
      if (result.type === "external") {
        const elapsed = Date.now() - startTime;
        console.log(`⏭️ External apply detected after ${elapsed}ms`);
        return result;
      }

      // Log progress every second
      const now = Date.now();
      if (now - lastLogTime >= 1000) {
        const elapsed = now - startTime;
        console.log(
          `⏳ Still waiting for apply button... (${elapsed}ms elapsed)`
        );
        lastLogTime = now;
      }

      // Wait before next poll
      await this.delay(pollIntervalMs);
    }

    // Final check after timeout
    const finalResult = this.findApplyButtonImmediate();
    console.log(
      `⏱️ Apply button wait completed after ${maxWaitMs}ms. Result: ${finalResult.type}`
    );
    return finalResult;
  }

  async clickApply(button) {
    try {
      await this.delay(3000);

      const href = button.href || button.getAttribute("href");

      if (href) {
        window.open(href, "_blank");
      } else {
        const ctrlClickEvent = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          metaKey: true,
          button: 0,
        });
        button.dispatchEvent(ctrlClickEvent);
      }

      await this.delay(1000);
    } catch (error) {}
  }

  async handleViewJobPage() {
    try {
      console.log("📄 Handling view job page - waiting for apply button...");

      // Use adaptive waiting instead of fixed delay
      const applyButtonResult = await this.waitForApplyButtonAdaptive({
        maxWaitMs: 8000, // Give more time on view job page since it's a fresh page load
        pollIntervalMs: 150,
      });

      // Handle external-only jobs
      if (applyButtonResult.type === "external") {
        console.log("⏭️ External apply only (company site) - skipping");
        this.sendMessage({
          type: "APPLICATION_SKIPPED",
          data: {
            url: window.location.href,
            reason: "External apply only - requires company site",
          },
        });
        setTimeout(() => window.close(), 1000);
        return;
      }

      // Handle no button found
      if (applyButtonResult.type === "none") {
        console.log(
          "⏭️ No Indeed Easy Apply button found after waiting - skipping"
        );
        this.sendMessage({
          type: "APPLICATION_SKIPPED",
          data: {
            url: window.location.href,
            reason: "No Indeed Easy Apply button found",
          },
        });
        setTimeout(() => window.close(), 1000);
        return;
      }

      const applyButton = applyButtonResult.button;

      // Check button text for validation
      const buttonText = applyButton.textContent?.trim().toLowerCase() || "";
      // Check if already applied
      if (buttonText.includes("applied")) {
        console.log("⏭️ Job already applied (button shows 'Applied')");
        this.sendMessage({
          type: "ALREADY_APPLIED",
          data: {
            url: window.location.href,
            reason: "Job already applied (button shows 'Applied')",
          },
        });
        setTimeout(() => window.close(), 1000);
        return;
      }

      // Verify it's an "Apply now" or similar button
      if (!buttonText.includes("apply")) {
        console.log(
          `⏭️ Button text "${applyButton.textContent?.trim()}" doesn't contain 'apply' - skipping`
        );
        this.sendMessage({
          type: "APPLICATION_SKIPPED",
          data: {
            url: window.location.href,
            reason: `Unexpected button text: "${applyButton.textContent?.trim()}"`,
          },
        });
        setTimeout(() => window.close(), 1000);
        return;
      }

      console.log(
        `✅ Found Indeed Easy Apply button with text: "${applyButton.textContent?.trim()}"`
      );

      // Scroll to button and click
      applyButton.scrollIntoView({ behavior: "smooth", block: "center" });
      await this.delay(500);

      const clickSuccess = await this.clickButtonWithRetry(applyButton, 3);

      if (!clickSuccess) {
        console.log("❌ Failed to click Apply button");
        this.sendMessage({
          type: "APPLICATION_ERROR",
          data: {
            url: window.location.href,
            error: "Failed to click Apply button",
          },
        });
      }
    } catch (error) {
      console.error("❌ Error in handleViewJobPage:", error);
      this.sendMessage({
        type: "APPLICATION_ERROR",
        data: {
          url: window.location.href,
          error: error.message,
        },
      });
    }
  }

  /**
   * Click button with retry logic and verification (Windows-compatible)
   * @param {HTMLElement} button - Button to click
   * @param {number} maxRetries - Maximum number of retry attempts
   * @returns {Promise<boolean>}
   */
  async clickButtonWithRetry(button, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const currentUrl = window.location.href;

        button.focus();
        button.click();

        const rect = button.getBoundingClientRect();
        const clickEvent = new MouseEvent("click", {
          view: window,
          bubbles: true,
          cancelable: true,
          buttons: 1,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        });
        button.dispatchEvent(clickEvent);

        const pointerDownEvent = new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          isPrimary: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        });
        const pointerUpEvent = new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          isPrimary: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        });
        button.dispatchEvent(pointerDownEvent);
        button.dispatchEvent(pointerUpEvent);

        const enterEvent = new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          bubbles: true,
          cancelable: true,
        });
        button.dispatchEvent(enterEvent);

        try {
          const result = await this.waitForAnyElement(
            [
              {
                selector:
                  ".ia-ApplyFormScreen, #ia-container, [class*='indeed-apply']",
              },
            ],
            {
              timeout: 3000,
              checkVisibility: true,
            }
          );

          if (result) {
            console.log(
              `✅ Click successful - form appeared (attempt ${attempt + 1})`
            );
            return true;
          }
        } catch (waitError) {
          // Check alternative success indicators
          if (window.location.href !== currentUrl) {
            console.log(
              `✅ Click successful - URL changed (attempt ${attempt + 1})`
            );
            return true;
          }

          if (!this.isElementVisible(button)) {
            console.log(
              `✅ Click successful - button disappeared (attempt ${
                attempt + 1
              })`
            );
            return true;
          }

          console.log(`⚠️ Click attempt ${attempt + 1} - no visible change`);
        }
      } catch (error) {
        console.error(`❌ Error on click attempt ${attempt + 1}:`, error);
      }

      // Small delay before retry (but adaptive!)
      if (attempt < maxRetries - 1) {
        await this.delay(300);
      }
    }

    return false;
  }

  /**
   * Wait for session context to be available (set by background script)
   * @param {number} timeout - Maximum time to wait in ms
   * @returns {Promise<boolean>} True if session context is available
   */
  async waitForSessionContext(timeout = 10000) {
    const startTime = Date.now();
    const checkInterval = 200;

    while (Date.now() - startTime < timeout) {
      // Check if session context and user data are available
      if (
        this.sessionContext &&
        (this.userProfile || this.userData) &&
        Object.keys(this.userProfile || this.userData || {}).length > 0
      ) {
        console.log("✅ Session context is ready");
        return true;
      }

      // Also check if it's available in config
      if (
        this.config?.sessionContext?.userProfile &&
        Object.keys(this.config.sessionContext.userProfile).length > 0
      ) {
        // Copy from config to instance if available there
        this.sessionContext = this.config.sessionContext;
        this.userProfile = this.config.sessionContext.userProfile;
        this.userData = this.userProfile;
        console.log("✅ Session context loaded from config");
        return true;
      }

      await this.delay(checkInterval);
    }

    console.warn("⚠️ Session context not available within timeout");
    return false;
  }

  async handleFormPage() {
    console.log("✅ Form page detected");
    try {
      // Wait for session context to be available before proceeding
      const hasSessionContext = await this.waitForSessionContext(15000);
      if (!hasSessionContext) {
        console.error("❌ Cannot process form without session context");
        this.safeSendPortMessage({
          type: "APPLICATION_ERROR",
          data: {
            url: window.location.href,
            error: "Session context not available - please restart automation",
          },
        });
        return;
      }

      await this.delay(2000);

      try {
        const alreadyAppliedElement = await this.waitForElement(
          "h1.ia-HasApplied-bodyTop--text",
          {
            timeout: 2000,
            checkVisibility: true,
            retryOnFail: false,
          }
        );

        if (
          alreadyAppliedElement &&
          alreadyAppliedElement.textContent.includes(
            "You've applied to this job"
          )
        ) {
          this.safeSendPortMessage({
            type: "APPLICATION_ALREADY_APPLIED",
            data: {
              url: window.location.href,
              message: "Job already applied",
            },
          });
          setTimeout(() => window.close(), 2000);
          return;
        }
      } catch (error) {}

      const jobData = await chrome.storage.local.get("currentJobData");
      const currentJob = jobData.currentJobData || {};

      console.log("📋 Job Data for application:", {
        title: currentJob.title || "N/A",
        company: currentJob.company || "N/A",
        location: currentJob.location || "N/A",
        salary: currentJob.salary || "N/A",
        jobId: currentJob.jobId || "N/A",
        jobUrl: currentJob.jobUrl || "N/A",
        descriptionLength: currentJob.description?.length || 0,
        description: currentJob.description || "N/A",
      });

      // Set job description from storage, prepending job metadata for AI context
      if (currentJob.description) {
        const jobMeta = [
          currentJob.title ? `Job Title: ${currentJob.title}` : "",
          currentJob.company ? `Company: ${currentJob.company}` : "",
          currentJob.location ? `Location: ${currentJob.location}` : "",
          currentJob.salary ? `Salary: ${currentJob.salary}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        this.jobDescription = jobMeta
          ? `${jobMeta}\n\n${currentJob.description}`
          : currentJob.description;
      }
      const jobId = currentJob.jobId;

      // Ensure userData is available from userProfile or sessionContext
      if (!this.userData || Object.keys(this.userData).length === 0) {
        this.userData =
          this.userProfile || this.sessionContext?.userProfile || {};
      }

      // If still no userData, log warning
      if (!this.userData || Object.keys(this.userData).length === 0) {
        console.warn("⚠️ userData is still empty after session context check");
      }

      // Initialize file handler first - use sessionContext (set by setSessionContext) as primary source
      if (!window.indeedHandlers.fileHandler) {
        this.aiApiHost =
          this.sessionContext?.sessionConfig?.aiApiHost ||
          this.config.sessionContext?.sessionConfig?.aiApiHost ||
          this.aiApiHost;
        this.backendApiHost =
          this.sessionContext?.sessionConfig?.backendApiHost ||
          this.config.sessionContext?.sessionConfig?.backendApiHost ||
          this.backendApiHost;

        window.indeedHandlers.fileHandler = new IndeedFileHandler({
          backendApiHost: this.backendApiHost,
          aiApiHost: this.aiApiHost,
          jwtToken: this.getJwtToken(),
          jobPreferences:
            this.sessionContext?.preferences ||
            this.config.sessionContext?.preferences,
        });
      } else {
        window.indeedHandlers.fileHandler.updateConfig({
          backendApiHost: this.backendApiHost,
          aiApiHost: this.aiApiHost,
          jwtToken: this.getJwtToken(),
          jobPreferences:
            this.sessionContext?.preferences ||
            this.config.sessionContext?.preferences,
        });
      }
      this.fileHandler = window.indeedHandlers.fileHandler;

      if (
        !window.indeedHandlers.formHandler ||
        !window.indeedHandlers.formHandler.userData ||
        Object.keys(window.indeedHandlers.formHandler.userData).length === 0
      ) {
        window.indeedHandlers.formHandler = new FormHandler({
          host: this.aiApiHost,
          platform: "indeed",
          userPreferences:
            this.config.sessionContext?.preferences ||
            this.sessionContext?.preferences,
          userData: this.userData,
          jobDescription: this.jobDescription,
          jobId: jobId,
          // statusOverlay removed - uses global overlay
          fileHandler: this.fileHandler,
        });
      } else {
        window.indeedHandlers.formHandler.updateConfig({
          host: this.aiApiHost,
          userPreferences:
            this.config.sessionContext?.preferences ||
            this.sessionContext?.preferences,
          userData: this.userData,
          jobDescription: this.jobDescription,
          jobId: jobId,
          fileHandler: this.fileHandler,
        });
      }
      this.formHandler = window.indeedHandlers.formHandler;

      // Pass co-pilot mode and state to form handler
      const isInCoPilotMode = this.copilotState.isInCoPilotMode();
      this.formHandler.copilotMode = isInCoPilotMode;
      this.formHandler.copilotState = this.copilotState;
      this.formHandler.currentJobTitle = currentJob.title || "this job";
      this.formHandler.fileHandler = this.fileHandler; // Ensure file handler is always set

      // Use the form handler to fill the form (it handles user data internally)
      const formResult = await this.formHandler.fillCompleteForm();
      if (formResult === true) {
        this.handleApplicationSuccessPage();
      } else if (formResult === "CAPTCHA_PENDING") {
        console.log("⏳ CAPTCHA pending - waiting for user");
      } else {
        this.safeSendPortMessage({
          type: "APPLICATION_ERROR",
          data: { url: window.location.href, error: "Form processing failed" },
        });

        // Recovery: try to close tab after delay
        setTimeout(() => {
          console.log("🔄 Closing failed form tab");
          window.close();
        }, 5000);
      }
    } catch (error) {
      console.error("❌ Error in handleFormPage:", error);
      this.safeSendPortMessage({
        type: "APPLICATION_ERROR",
        data: { url: window.location.href, error: error.message },
      });

      // Recovery: try to close tab after delay
      setTimeout(() => {
        console.log("🔄 Closing error form tab");
        window.close();
      }, 5000);
    }
  }

  async handleApplicationSuccessPage() {
    // Get stored job data
    const jobData = await chrome.storage.local.get("currentJobData");
    const currentJob = jobData.currentJobData || {};

    const jobDetails = {
      jobId: currentJob.jobId || this.extractJobIdFromCurrentUrl() || this.extractJobIdFromUrl(currentJob.jobUrl) || `indeed-${Date.now()}`,
      title: currentJob.title || "Job on Indeed",
      company: currentJob.company || "Unknown Company",
      location: currentJob.location || "Unknown Location",
      description: currentJob.description || "",
      jobUrl: currentJob.jobUrl || window.location.href,
      salary: currentJob.salary || "Not specified",
      workplace: currentJob.workplace || "Not specified",
      postedDate: currentJob.postedDate || null,
      applicants: currentJob.applicants || null,
    };

    // Save the applied job using the new API
    try {
      // Show success status
      if (true) {
        // Global overlay
        notifyStatus({
          type: "APPLICATION_SUBMITTED",
          data: { title: jobDetails.title },
        });
      }

      // Send APPLICATION_COMPLETED to match Workable/Lever pattern
      this.sendMessage({
        type: "APPLICATION_COMPLETED",
        data: {
          jobId: jobDetails.jobId,
          title: jobDetails.title,
          company: jobDetails.company,
          location: jobDetails.location,
          jobUrl: jobDetails.jobUrl,
          platform: "indeed",
          appliedAt: Date.now(),
          description: jobDetails.description,
        },
      });

      // Close the post-apply tab after successful processing
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Brief delay
      window.close();
    } catch (error) {
      console.error("❌ Error processing application:", error);

      // Still try to close the tab even if there was an error
      setTimeout(() => {
        window.close();
      }, 2000);
    }
  }

  monitorFormCompletion() {
    // Monitor for success/error indicators only (no automatic form filling)
    const checkCompletion = () => {
      if (this.isApplicationSuccess()) {
        console.log("✅ Application success detected manually");
        this.handleApplicationSuccessPage();
        return;
      }

      if (this.isApplicationError()) {
        console.log("❌ Application error detected");
        this.safeSendPortMessage({
          type: "APPLICATION_ERROR",
          data: { url: window.location.href },
        });
        return;
      }

      // Continue monitoring
      setTimeout(checkCompletion, 2000);
    };

    setTimeout(checkCompletion, 3000);
  }

  isApplicationSuccess() {
    // Check for Indeed's specific success message
    const successElement = document.querySelector("h1");
    if (
      successElement &&
      successElement.textContent?.includes(
        "Your application has been submitted!"
      )
    ) {
      return true;
    }

    // Fallback: check for success indicators in page text
    const pageText = document.body.textContent?.toLowerCase() || "";
    return (
      pageText.includes("your application has been submitted") ||
      pageText.includes("application submitted") ||
      pageText.includes("successfully applied") ||
      pageText.includes("application complete")
    );
  }

  isApplicationError() {
    const pageText = document.body.textContent?.toLowerCase() || "";

    return (
      pageText.includes("error") ||
      pageText.includes("failed") ||
      pageText.includes("try again") ||
      document.querySelector(".error, .alert-error")
    );
  }

  setupMessageListener() {
    // Store reference to the active instance globally to prevent multiple handlers
    if (window.activeIndeedPlatform && window.activeIndeedPlatform !== this) {
      return;
    }

    console.log("📝 Setting up Indeed message listener");
    window.activeIndeedPlatform = this;

    // Only set up listener if not already done
    if (!window.indeedMessageListenerSetup) {
      window.indeedMessageListenerSetup = true;

      // Listen for DOM events from the overlay (direct, more reliable)
      document.addEventListener("copilot-control-action", (event) => {
        const { action } = event.detail || {};
        if (action) {
          console.log("🎮 Received copilot-control-action DOM event:", action);
          const activeInstance = window.activeIndeedPlatform;
          if (activeInstance) {
            activeInstance.handleCoPilotAction({ action });
          }
        }
      });

      // Also listen for chrome.runtime messages (from background script)
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        try {
          console.log("📨 Indeed received message:", message);

          // Always use the active instance for handling messages
          const activeInstance = window.activeIndeedPlatform;
          if (!activeInstance) {
            console.warn("⚠️ No active Indeed instance found");
            return;
          }

          if (message.action === "initializeAutomation") {
            activeInstance.handleInitializeAutomation(message);
            sendResponse({ success: true });
          } else if (message.action === "platformMessage") {
            activeInstance.handleBackgroundMessage(message);
            sendResponse({ success: true });
          } else if (message.type === "CONTROL_ACTION") {
            // Handle co-pilot button actions
            activeInstance.handleCoPilotAction({ action: message.action });
            sendResponse({ success: true });
          } else if (message.type === "SEARCH_NEXT") {
            // Handle search next - continue to next job
            console.log("📥 SEARCH_NEXT received");
            activeInstance.handleSearchNext(message.data);
            sendResponse({ success: true });
          } else if (message.type === "COMPANY_BLACKLISTED") {
            // Handle company blacklisted - show notification
            console.log("📥 COMPANY_BLACKLISTED received");
            activeInstance.handleCompanyBlacklisted(message.data);
            sendResponse({ success: true });
          }
        } catch (error) {
          console.error("❌ Error handling background message:", error);
          sendResponse({ success: false, error: error.message });
        }
        return true;
      });
    }
  }

  async setSessionContext(context) {
    console.log("📦 Setting session context:", context?.sessionId);

    // Store session context
    this.sessionContext = context;

    // Update basic properties if available
    if (context.sessionId) this.sessionId = context.sessionId;
    if (context.platform) this.platform = context.platform;
    if (context.userId) this.userId = context.userId;
    if (context.userProfile) {
      this.userProfile = context.userProfile;
      // Also set userData from userProfile for form handler compatibility
      this.userData = context.userProfile;
    }

    // Extract API hosts from context
    this.aiApiHost =
      context.sessionConfig?.aiApiHost ||
      context.aiApiHost ||
      this.config.aiApiHost;
    this.backendApiHost =
      context.sessionConfig?.backendApiHost ||
      context.backendApiHost ||
      this.config.backendApiHost;

    // Update existing file handler with session data
    if (window.indeedHandlers.fileHandler) {
      window.indeedHandlers.fileHandler.updateConfig({
        backendApiHost: this.backendApiHost,
        aiApiHost: this.aiApiHost,
        jwtToken: this.getJwtToken(),
        jobPreferences: context.preferences,
      });
      this.fileHandler = window.indeedHandlers.fileHandler;
    }

    // Update existing form handler with session data
    if (window.indeedHandlers.formHandler) {
      window.indeedHandlers.formHandler.updateConfig({
        host: this.aiApiHost,
        userData: this.userData,
        userPreferences: context.preferences,
        fileHandler: this.fileHandler,
      });
      this.formHandler = window.indeedHandlers.formHandler;
    }

    // ApplicationTrackerService handled by message-router (START_APPLICATION/APPLICATION_COMPLETED)

    // Update copilot mode from session context
    if (context.preferences?.hasOwnProperty("copilotMode")) {
      const isCoPilot =
        context.preferences.copilotMode === true ||
        context.preferences.copilotMode === "co-pilot";

      if (isCoPilot) {
        this.copilotState.switchToCoPilot();
      } else {
        this.copilotState.switchToAutoPilot();
      }

      if (this.formHandler) {
        this.formHandler.copilotMode = isCoPilot;
      }

      if (true) {
        // Global overlay
        updateStatusButtons(isCoPilot ? "co-pilot-search" : "auto-pilot");
      }
    }
  }

  async handleInitializeAutomation(message) {
    try {
      // Set session context and config
      if (message.sessionContext) {
        await this.setSessionContext(message.sessionContext);
        this.sessionId = message.sessionContext.sessionId;

        // Update file handler with job preferences after session context is set
        if (
          window.indeedHandlers.fileHandler &&
          message.sessionContext.preferences
        ) {
          window.indeedHandlers.fileHandler.updateConfig({
            jobPreferences: message.sessionContext.preferences,
          });
          console.log(
            "✅ Updated fileHandler.jobPreferences:",
            window.indeedHandlers.fileHandler.jobPreferences
          );
        }
      }

      if (message.sessionId) {
        this.sessionId = message.sessionId;
      }

      if (message.config) {
        this.config = { ...this.config, ...message.config };
        console.log("🔄 Updated config:", this.config);

        // Reinitialize services with updated config
        const userId =
          this.userId || this.config.userId || this.sessionContext?.userId;

        if (userId) {
          // Update API hosts from latest session context
          this.aiApiHost = this.config.sessionContext?.sessionConfig?.aiApiHost;
          this.backendApiHost =
            this.getInjectedBackendApiHost() ||
            this.config.backendApiHost ||
            this.sessionContext?.backendApiHost ||
            this.config.sessionContext?.backendApiHost ||
            this.sessionContext?.sessionConfig?.backendApiHost ||
            this.config.sessionContext?.sessionConfig?.backendApiHost;

          // ApplicationTrackerService handled by message-router

          if (window.indeedHandlers.fileHandler) {
            window.indeedHandlers.fileHandler.updateConfig({
              backendApiHost: this.backendApiHost,
              aiApiHost: this.aiApiHost,
              jwtToken: this.getJwtToken(),
            });
          }
          if (window.indeedHandlers.formHandler) {
            window.indeedHandlers.formHandler.updateConfig({
              host: this.aiApiHost,
            });
          }
        }

        // Start the automation
        await this.start();
      }
    } catch (error) {
      console.error("❌ Error initializing automation:", error);
    }
  }

  handleBackgroundMessage(message) {
    const { type, data } = message;

    switch (type) {
      case "SEARCH_NEXT":
        this.handleSearchNext(data);
        break;
      case "APPLICATION_SUCCESS":
        this.handleApplicationSuccess(data);
        break;
      case "APPLICATION_ERROR":
        this.handleApplicationError(data);
        break;
      case "APPLICATION_SKIPPED":
        this.handleApplicationSkipped(data);
        break;
      case "COPILOT_ACTION":
        this.handleCoPilotAction(data);
        break;
      case "COMPANY_BLACKLISTED":
        this.handleCompanyBlacklisted(data);
        break;
    }
  }

  handleCompanyBlacklisted(data) {
    console.log("🚫 Company blacklisted:", data);
    notifyStatus({
      type: "COMPANY_BLACKLISTED",
      data: {
        title: data?.title || "Job",
        company: data?.company || "this company",
      },
    });
    this.state.isProcessingJob = false;
  }

  /**
   * Handle platform-specific port messages
   */
  handlePlatformSpecificMessage(type, data) {
    switch (type) {
      case "COPILOT_MODE_UPDATED":
        // Update mode from background broadcast
        console.log(`🎮 Received mode update from background: ${data.mode}`);
        if (data.mode === "co-pilot") {
          this.copilotState.switchToCoPilot();
          if (this.formHandler) {
            this.formHandler.copilotMode = true;
          }
          if (true) {
            // Global overlay
            updateStatusButtons("co-pilot-search");
          }
        } else {
          this.copilotState.switchToAutoPilot();
          if (this.formHandler) {
            this.formHandler.copilotMode = false;
          }
          if (true) {
            // Global overlay
            updateStatusButtons("auto-pilot");
          }
        }
        break;
    }
  }

  /**
   * Handle co-pilot button actions from status overlay
   * @param {Object} data - Action data
   */
  handleCoPilotAction(data) {
    const { action } = data;
    console.log("🎮 Co-pilot action received:", action);

    switch (action) {
      case COPILOT_ACTIONS.SWITCH_TO_COPILOT:
        this.copilotState.switchToCoPilot();

        // Update session context preferences
        if (this.sessionContext && this.sessionContext.preferences) {
          this.sessionContext.preferences.copilotMode = "co-pilot";
        }

        // Notify background script to update session for all tabs
        this.safeSendPortMessage({
          type: "UPDATE_COPILOT_MODE",
          data: { mode: "co-pilot", sessionId: this.sessionId },
        });

        // Update formHandler if it exists
        if (this.formHandler) {
          this.formHandler.copilotMode = true;
          console.log("✅ Updated formHandler.copilotMode to true");
        }

        if (true) {
          // Global overlay
          notifyStatus({
            type: "MODE_SWITCHED",
            data: { mode: "co-pilot" },
          });
          // Show co-pilot search buttons
          updateStatusButtons("co-pilot-search");
        }
        break;

      case COPILOT_ACTIONS.SWITCH_TO_AUTOPILOT:
        this.copilotState.switchToAutoPilot();

        // Update session context preferences
        if (this.sessionContext && this.sessionContext.preferences) {
          this.sessionContext.preferences.copilotMode = "auto-pilot";
        }

        // Notify background script to update session for all tabs
        this.safeSendPortMessage({
          type: "UPDATE_COPILOT_MODE",
          data: { mode: "auto-pilot", sessionId: this.sessionId },
        });

        // Update formHandler if it exists
        if (this.formHandler) {
          this.formHandler.copilotMode = false;
          console.log("✅ Updated formHandler.copilotMode to false");
        }

        if (true) {
          // Global overlay
          notifyStatus({
            type: "MODE_SWITCHED",
            data: { mode: "auto-pilot" },
          });
          // Show auto-pilot buttons
          updateStatusButtons("auto-pilot");
        }
        break;

      case COPILOT_ACTIONS.SUBMIT:
      case "NEXT": // Handle NEXT action same as SUBMIT
        // Resolve form handler's user action promise
        if (this.formHandler) {
          this.formHandler.resolveUserAction(
            action === "NEXT" ? "NEXT" : "SUBMIT"
          );
        }
        break;

      case COPILOT_ACTIONS.SKIP:
        // Only handle skip on form pages, not search pages
        if (this.isFormPage(window.location.href)) {
          // Resolve form handler's user action promise with SKIP
          if (this.formHandler) {
            this.formHandler.resolveUserAction("SKIP");
          }
          // Also show status message that job was skipped
          if (true) {
            // Global overlay
            notifyStatus({
              type: "JOB_SKIPPED",
              data: { title: this.formHandler?.currentJobTitle || "this job" },
            });
          }

          // Send APPLICATION_SKIPPED message to background to coordinate next job
          this.safeSendPortMessage({
            type: "APPLICATION_SKIPPED",
            data: {
              url: window.location.href,
              reason: "User clicked skip button",
              jobTitle: this.formHandler?.currentJobTitle || "Unknown job",
            },
          });

          // Close the form tab after a delay
          setTimeout(() => {
            console.log("⏭️ Closing form tab after skip");
            window.close();
          }, 1500);
        }
        break;

      case COPILOT_ACTIONS.TAKE_CONTROL:
        this.copilotState.takeManualControl();
        if (this.formHandler) {
          this.formHandler.resolveUserAction("TAKE_CONTROL");
        }
        break;

      case COPILOT_ACTIONS.LET_AI_CONTINUE:
        this.copilotState.letAIContinue();
        if (this.formHandler) {
          this.formHandler.resolveUserAction("LET_AI_CONTINUE");
        }
        break;

      case COPILOT_ACTIONS.PAUSE:
        this.state.isRunning = false;
        if (true) {
          // Global overlay
          notifyStatus({ type: "AUTOMATION_PAUSED" });
        }
        break;

      case COPILOT_ACTIONS.RESUME:
        this.state.isRunning = true;
        this.processNextJob();
        if (true) {
          // Global overlay
          notifyStatus({ type: "AUTOMATION_RESUMED" });
        }
        break;

      default:
        console.warn("Unknown co-pilot action:", action);
    }
  }

  /**
   * Restore appropriate mode buttons based on current copilot state
   */
  restoreModeButtons() {
    // Check current mode and show appropriate buttons
    if (this.copilotState.isInCoPilotMode()) {
      updateStatusButtons("co-pilot-search");
    } else {
      updateStatusButtons("auto-pilot");
    }
  }

  isRemoteJob(jobDetails) {
    const workplace = jobDetails.workplace?.toLowerCase() || "";
    const location = jobDetails.location?.toLowerCase() || "";
    const description = jobDetails.description?.toLowerCase() || "";

    const remoteKeywords = ["remote", "work from home", "wfh", "telecommute"];

    return remoteKeywords.some(
      (keyword) =>
        workplace.includes(keyword) ||
        location.includes(keyword) ||
        description.includes(keyword)
    );
  }

  async doesJobMatchPreferences(jobInfo) {
    const preferences = this.sessionContext?.preferences || {};
    const backendApiHost = this.sessionContext?.backendApiHost;
    const jwtToken = this.sessionContext?.jwtToken;

    if (!backendApiHost) {
      console.error("❌ No backendApiHost configured");
      return true;
    }

    try {
      const jobInformation = {
        title: jobInfo.title || "",
        company: jobInfo.company || "",
        location: jobInfo.location || "",
        description: jobInfo.description || "",
        salary: jobInfo.salary || "",
        jobType: jobInfo.type || "",
      };

      if (preferences.applyOnlyQualified) {
        const profileData = {
          name: `${this.userProfile?.firstName || ""} ${
            this.userProfile?.lastName || ""
          }`.trim(),
          headline: this.userProfile?.headline || "",
          summary: this.userProfile?.summary || "",
          skills: this.userProfile?.skills || [],
          yearsOfExperience: this.userProfile?.yearsOfExperience || 0,
          experience: this.userProfile?.experience || [],
          education: this.userProfile?.education || [],
          certifications: this.userProfile?.certifications || [],
          languages: this.userProfile?.languages || ["English"],
          location: this.userProfile?.location || "",
          workAuthorization: this.userProfile?.workAuthorization || "",
          requiresSponsorship: this.userProfile?.requiresSponsorship || "No",
        };

        const response = await fetch(
          `${backendApiHost}/api/v1/job-eligibility/check`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(jwtToken && { Authorization: `Bearer ${jwtToken}` }),
            },
            body: JSON.stringify({
              profileData,
              jobDescription: jobInfo.description || "",
            }),
          }
        );

        if (!response.ok) return true;
        const result = await response.json();
        this.reason = result.reason || "";
        return result.canApply !== false;
      } else if (preferences.applyOnlyMatching) {
        const jobPreferences = {
          jobType: preferences.jobType || [],
          experience: preferences.experience || [],
          salary: preferences.salary || [0, 500000],
          positions: preferences.positions || [],
          remoteOnly: preferences.remoteOnly || false,
          companyBlacklist: preferences.companyBlacklist || [],
        };

        const response = await fetch(
          `${backendApiHost}/api/v1/job-eligibility/match`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(jwtToken && { Authorization: `Bearer ${jwtToken}` }),
            },
            body: JSON.stringify({
              jobInfo: jobInformation,
              jobPreferences,
            }),
          }
        );

        if (!response.ok) return true;
        const result = await response.json();
        this.reason = result.reason || "";
        return result.canApply !== false;
      }

      return true;
    } catch (error) {
      console.error("Error checking job eligibility:", error);
      return true;
    }
  }

  extractSalaryFromJobInfo(jobInfo) {
    const salaryText = jobInfo.salary || jobInfo.description || "";
    const kRangeMatch = salaryText.match(
      /\$(\d{1,3}(?:\.\d+)?)\s*K\s*-\s*\$(\d{1,3}(?:\.\d+)?)\s*K/i
    );
    if (kRangeMatch) {
      // Return the minimum salary from the range, multiply by 1000
      const minSalary = Math.round(parseFloat(kRangeMatch[1]) * 1000);

      return minSalary;
    }

    // Try to extract salary range with commas (e.g., "$77,000 - $143,000 a year")
    const rangeMatch = salaryText.match(
      /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*-\s*\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/
    );
    if (rangeMatch) {
      // Return the minimum salary from the range
      const minSalary = parseInt(rangeMatch[1].replace(/,/g, ""));
      return minSalary;
    }

    // Try to extract single salary value with K notation (e.g., "$85K")
    const kMatch = salaryText.match(/\$(\d{1,3}(?:\.\d+)?)\s*K/i);
    if (kMatch) {
      const salary = Math.round(parseFloat(kMatch[1]) * 1000);
      return salary;
    }

    // Try to extract single salary value with commas
    const singleMatch = salaryText.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
    if (singleMatch) {
      const salary = parseInt(singleMatch[1].replace(/,/g, ""));
      return salary;
    }

    return null;
  }

  handleSearchNext(data) {
    console.log("🔄 Received SEARCH_NEXT from background", data);

    // Prevent duplicate processing - if already not processing, ignore this message
    if (!this.state.isProcessingJob) {
      console.log("⚠️ Not currently processing a job, ignoring SEARCH_NEXT");
      return;
    }

    // Reset processing flag now that background has finished
    this.state.isProcessingJob = false;
    console.log("✅ Reset isProcessingJob to false, ready for next job");

    // Update job card status based on result
    if (data?.status === "SUCCESS") {
      this.markLastJobCard("applied");
    } else if (data?.status === "ERROR" || data?.status === "SKIPPED") {
      this.markLastJobCard("skipped");
    }

    // Display status overlay based on reason
    if (data?.reason === "Already applied") {
      notifyStatus({
        type: "ALREADY_APPLIED",
        data: { title: data?.title || "Job" },
      });
    } else if (data?.reason === "Company blacklisted") {
      this.handleCompanyBlacklisted(data);
    } else if (data?.reason === "Limit reached") {
      notifyStatus({ type: "LIMIT_EXCEEDED" });
      return;
    }

    // Continue to next job
    if (this.state.isRunning) {
      console.log("▶️ Continuing to next job in 2 seconds...");
      setTimeout(() => this.processNextJob(), 500);
    } else {
      console.log("⏹️ Automation not running, not continuing to next job");
    }
  }

  handleApplicationSuccess(data) {
    notifyStatus({
      type: "APPLICATION_SUBMITTED",
      data: { title: data.title || "Job" },
    });
  }

  handleApplicationError() {
    notifyStatus({ type: "APPLICATION_ERROR" });
  }

  handleApplicationSkipped() {
    notifyStatus({ type: "APPLICATION_SKIPPED" });
  }

  async goToNextPage() {
    try {
      console.log("🔄 Attempting to navigate to next page...");

      // Try multiple strategies to find the next page button
      let nextButton = null;

      // Strategy 1: Use the configured selector
      nextButton = document.querySelector(this.selectors.nextPageButton);

      // Strategy 2: Look for specific pagination patterns
      if (!nextButton || !this.isElementVisible(nextButton)) {
        // Try pagination nav with 'Next page' aria-label
        nextButton = document.querySelector(
          'nav[aria-label="pagination"] a[aria-label="Next page"]'
        );
      }

      // Strategy 3: Find the last link in pagination that's not current page
      if (!nextButton || !this.isElementVisible(nextButton)) {
        const paginationLinks = document.querySelectorAll(
          'nav[aria-label="pagination"] a:not([aria-current="page"])'
        );
        if (paginationLinks.length > 0) {
          // Get the last non-current page link (should be "next" or a higher page number)
          nextButton = paginationLinks[paginationLinks.length - 1];
        }
      }

      // Strategy 4: Look for SVG arrow icon in pagination
      if (!nextButton || !this.isElementVisible(nextButton)) {
        const paginationNav = document.querySelector(
          'nav[aria-label="pagination"]'
        );
        if (paginationNav) {
          // Find links containing arrow SVG
          const linksWithArrows = paginationNav.querySelectorAll("a svg");
          if (linksWithArrows.length > 0) {
            // The last one with an arrow is typically "next"
            nextButton =
              linksWithArrows[linksWithArrows.length - 1].closest("a");
          }
        }
      }

      if (!nextButton || !this.isElementVisible(nextButton)) {
        console.log("📄 No next page button found - may be on last page");
        return false;
      }

      // Get the href before clicking (for verification)
      const expectedHref = nextButton.href || nextButton.getAttribute("href");
      console.log(`📄 Found next page button, navigating to: ${expectedHref}`);

      // Scroll the button into view
      nextButton.scrollIntoView({ behavior: "smooth", block: "center" });
      await this.delay(300);

      // Click the button
      nextButton.click();

      // Wait for page to load with adaptive approach
      const startUrl = window.location.href;
      const startTime = Date.now();
      const maxWaitTime = 10000; // 10 seconds max

      // Wait for either URL change or new content
      while (Date.now() - startTime < maxWaitTime) {
        await this.delay(200);

        // Check if URL changed (page navigation)
        if (window.location.href !== startUrl) {
          console.log("📄 URL changed, page is loading...");
          // Wait a bit more for content
          await this.delay(2000);
          break;
        }

        // Check for job cards (might be AJAX loaded)
        const newCards = this.getAllJobCards();
        if (newCards.length > 0) {
          console.log(`📄 Found ${newCards.length} job cards on new page`);
          break;
        }
      }

      // Reset processed jobs for new page
      this.state.processedJobs.clear();
      this.state.currentJobIndex = 0;

      // Final check for job cards
      const jobCards = this.getJobCards();
      console.log(
        `✅ Found ${jobCards.length} eligible Easy Apply jobs on the new page`
      );

      if (jobCards.length === 0) {
        // Try fallback mode
        const allCards = this.getAllJobCards();
        if (allCards.length > 0) {
          console.log(
            `📄 No Easy Apply jobs, but found ${allCards.length} total job cards`
          );
          this.state.isFallbackMode = true;
          return true;
        }
      }

      return jobCards.length > 0;
    } catch (error) {
      console.error("❌ Error going to next page:", error);
      return false;
    }
  }

  async handleNoJobsFound() {
    this.safeSendPortMessage({
      type: "SEARCH_COMPLETED",
      data: { reason: "no_jobs_found" },
    });
    notifyStatus({ type: "SEARCH_COMPLETED" });
    this.state.isRunning = false;
  }

  async handleSearchCompleted() {
    this.safeSendPortMessage({
      type: "SEARCH_COMPLETED",
      data: { reason: "completed" },
    });
    notifyStatus({ type: "SEARCH_COMPLETED" });
    this.state.isRunning = false;
  }

  // Utility methods
  getJobCardId(jobCard) {
    // Try to get Indeed's data-jk attribute first
    const dataJk = jobCard.getAttribute("data-jk");
    if (dataJk) return dataJk;

    const jobLink = jobCard.querySelector("a");
    if (jobLink?.href) {
      const match = jobLink.href.match(/jk=([^&]+)/);
      if (match) return match[1];
    }

    // Fallback: use title + company as ID
    const title =
      jobCard.querySelector(this.selectors.jobTitle)?.textContent?.trim() || "";
    const company =
      jobCard.querySelector(this.selectors.companyName)?.textContent?.trim() ||
      "";
    return `${title}-${company}`.replace(/\s+/g, "").toLowerCase();
  }

  markJobCard(jobCard, status) {
    try {
      const existingHighlight = jobCard.querySelector(".job-highlight");
      if (existingHighlight) {
        existingHighlight.remove();
      }

      const highlight = document.createElement("div");
      highlight.className = "job-highlight";

      let color, text;
      switch (status) {
        case "processing":
          color = "#2196F3";
          text = "Processing";
          break;
        case "applied":
          color = "#4CAF50";
          text = "Applied";
          break;
        case "skipped":
          color = "#FF9800";
          text = "Skipped";
          break;
        case "error":
          color = "#F44336";
          text = "Error";
          break;
        default:
          color = "#9E9E9E";
          text = "Unknown";
      }

      highlight.style.cssText = `
        position: absolute;
        top: 0;
        right: 0;
        background-color: ${color};
        color: white;
        padding: 3px 8px;
        font-size: 12px;
        font-weight: bold;
        border-radius: 0 0 0 5px;
        z-index: 999;
      `;
      highlight.textContent = text;

      jobCard.style.border = `2px solid ${color}`;
      jobCard.style.position = "relative";
      jobCard.appendChild(highlight);
    } catch (error) {
      console.error("❌ Error marking job card:", error);
    }
  }

  markLastJobCard(status) {
    try {
      const jobCards = this.getJobCards();
      if (jobCards.length > 0 && this.state.currentJobIndex < jobCards.length) {
        const lastJobCard = jobCards[this.state.currentJobIndex];
        this.markJobCard(lastJobCard, status);
      }
    } catch (error) {
      console.error("❌ Error marking last job card:", error);
    }
  }

  async checkAuthentication() {
    try {
      // Check for login indicators specific to Indeed
      const signInButton =
        document.querySelector("#signInMobile") ||
        document.querySelector(
          'li.link-signin a#signIn[href*="account/login"]'
        ) ||
        document.querySelector('a[href*="account/login"]') ||
        document.querySelector('button[data-testid="signin-button"]');

      if (signInButton && this.isElementVisible(signInButton)) {
        return {
          canProceed: false,
          reason: "login",
          message: "🔐 Please log in to your Indeed account first",
        };
      }

      // Check for Cloudflare protection
      const cloudflareIndicators = [
        "main.error h1#heading",
        'p#paragraph[id*="Ray ID"]',
        'input[name="cf-turnstile-response"]',
        "div.core-msg.spacer",
      ];

      for (const selector of cloudflareIndicators) {
        const element = document.querySelector(selector);
        if (element && this.isElementVisible(element)) {
          return {
            canProceed: false,
            reason: "recaptcha",
            message:
              "🛡️ Cloudflare protection detected. Please complete the verification manually.",
          };
        }
      }

      return {
        canProceed: true,
        reason: "authenticated",
        message: "✅ Ready to start",
      };
    } catch (error) {
      return {
        canProceed: false,
        reason: "error",
        message: "❌ Error checking authentication",
      };
    }
  }

  handleAuthError(authCheck) {
    console.log(authCheck);
    if (authCheck.reason === "captcha" || authCheck.reason === "recaptcha") {
      notifyStatus({
        type: "RECAPTCHA_DETECTED",
        data: {
          message: authCheck.message,
          reason: authCheck.reason,
        },
      });
    } else if (authCheck.reason === "login") {
      notifyStatus({ type: "LOGIN_REQUIRED" });
    } else {
      notifyStatus({ type: "APPLICATION_ERROR" });
    }
  }

  isElementVisible(element, options = {}) {
    if (!element) return false;
    const requireViewport =
      options.requireViewport !== undefined ? options.requireViewport : false;

    try {
      const style = window.getComputedStyle(element);
      // Check CSS visibility properties
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
        // Note: Removed pointerEvents check as it doesn't affect visibility
      ) {
        return false;
      }

      const rect = element.getBoundingClientRect();

      // Check if element has dimensions
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }

      // For job cards in a list, we don't need to require viewport visibility
      // since they may be below the fold but still valid
      if (!requireViewport) {
        // Just check that it's not hidden via CSS
        return true;
      }

      // Only check viewport if explicitly required (e.g., for buttons we need to click)
      const isInViewport =
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0;

      if (!isInViewport) {
        return false;
      }

      // Check if element is not covered by an overlay (Windows-specific fix)
      // Sample a few points on the element
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const elementAtPoint = document.elementFromPoint(centerX, centerY);

      // If the element at center point is this element or a descendant, it's visible
      if (elementAtPoint === element || element.contains(elementAtPoint)) {
        return true;
      }

      // Sometimes the element itself might not be at the center (e.g., SVG icons)
      // Check if we can reach it through the DOM hierarchy
      let parent = elementAtPoint;
      while (parent && parent !== document.body) {
        if (parent === element) {
          return true;
        }
        parent = parent.parentElement;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  extractJobIdFromCurrentUrl() {
    return this.extractJobIdFromUrl(window.location.href);
  }

  extractJobIdFromUrl(url) {
    try {
      if (!url) return null;
      const match = url.match(/jk=([^&]+)/);
      return match ? match[1] : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Send message to background script - matches Workable pattern
   */
  sendMessage(message) {
    try {
      chrome.runtime.sendMessage(message);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  }

  // Keep legacy method for backward compatibility
  safeSendPortMessage(message) {
    try {
      const formattedMessage = {
        ...message,
        action: message.type || message.action,
      };
      chrome.runtime.sendMessage(formattedMessage);
    } catch (error) {
      console.warn("Failed to send message to background:", error);
    }
  }

  registerSearchTab() {
    try {
      console.log("📝 Registering Indeed search tab with background");
      this.safeSendPortMessage({
        type: "REGISTER_SEARCH_TAB",
        data: {
          url: window.location.href,
          platform: "indeed",
        },
      });
    } catch (error) {
      console.error("❌ Error registering search tab:", error);
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  cleanup() {
    // Clean up status overlay
    if (true) {
      // Global overlay
      try {
        // Global overlay - cleanup handled automatically
      } catch (e) {
        console.warn("Error destroying status overlay:", e);
      }
      // Global overlay - no local instance needed
    }

    // Clear global reference
    if (window.indeedStatusOverlay) {
      window.indeedStatusOverlay = null;
    }

    this.state.isRunning = false;
  }
}
