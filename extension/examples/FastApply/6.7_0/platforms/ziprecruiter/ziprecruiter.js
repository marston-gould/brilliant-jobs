// platforms/ziprecruiter/ziprecruiter.js - STANDALONE VERSION (no inheritance)

import FormHandler from "./ziprecruiter-form-handler.js";
import { DomUtils } from "../../shared/utilities/index.js";
import ApplicationTrackerService from "../../services/application-tracker-service.js";
import AIService from "../../services/ai-service.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";

export default class ZipRecruiterPlatform {
  constructor(config) {
    this.platform = "ziprecruiter";
    this.baseUrl = "https://www.ziprecruiter.com";

    // Initialize co-pilot state
    this.copilotState = new CoPilotState();

    // Set initial mode from session context preferences
    const copilotMode = this.sessionContext?.preferences?.copilotMode;
    if (copilotMode === "co-pilot") {
      this.copilotState.switchToCoPilot();
    } else {
      this.copilotState.switchToAutoPilot();
    }

    // Defer service initialization until handleInitializeAutomation
    this.sessionApiHost = null;
    this.sessionAiApiHost = null;
    this.aiApiHost = null;
    this.backendApiHost = null;
    this.applicationTracker = null;
    this.aiService = null;

    this.initializeState();
    this.initializeConfig();
    this.setupObservers();
    this.reason = "";
  }

  // ========================================
  // STATUS OVERLAY METHODS
  // ========================================

  showStatusMessage(type, data = {}) {
    if (true) {
      // Global overlay
      notifyStatus({ type, data });
    }
  }

  updateAutomationStatus(status) {
    if (true) {
      // Global overlay
      notifyStatus(status);
    }
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  initializeState() {
    // Consolidated state management
    this.state = {
      // Initialization
      initialized: false,
      ready: false,

      // Automation flow
      isRunning: false,
      currentPhase: "idle", // 'idle', 'searching', 'applying', 'completed'
      isProcessingQueue: false, // Flag to prevent duplicate queue processing

      // Job processing
      processedJobIds: new Set(),
      processedCount: 0,
      currentJobIndex: 0,
      currentJobDetails: null,
      lastClickedJobCard: null,

      // Application state
      isApplicationInProgress: false,
      applicationStartTime: null,
      formDetected: false,

      // Health monitoring
      lastActivity: Date.now(),
    };

    // Search configuration
    this.searchData = null;
    this.userProfile = null;
    this.formHandler = null;
    this.cachedJobDescription = null;
  }

  initializeConfig() {
    this.config = {
      selectors: {
        jobCardsContainer: ["section.job_results_two_pane"],
        jobCards: [
          "article[id*='job-card-']",
          ".job_result_two_pane",
          ".job_result",
          "[data-testid='job-card']",
          ".job",
        ],
        jobTitle: [
          "h2.font-bold.text-primary",
          "h2.text-header-sm",
          ".job-title",
          "[data-testid='job-title']",
          "h2 a",
        ],
        jobTitleButton: [
          "button[aria-label*='View ']",
          "button.text-left",
          "h2 button",
        ],
        companyName: [
          "[data-testid='job-card-company']",
          "a[data-testid='job-card-company']",
          ".company-name",
          "a[aria-label*='company']",
        ],
        location: [
          "[data-testid='job-card-location']",
          "a[data-testid='job-card-location']",
          ".location",
          "p.text-primary",
        ],
        oneClickApplyBadge: [
          ".text-brand",
          ".bg-badge-brand",
          "p:contains('1-click apply')",
        ],
        applyButton: [
          "button[aria-label*='1-Click Apply']",
          "button[aria-label*='Quick Apply']",
          ".apply-button",
        ],
        modalContainer: [
          ".ApplyFlowApp",
          ".application-modal",
          ".modal",
          "[role='dialog']",
          "[data-zds-component='modal']",
        ],
        noJobsFound: [".jobs_not_found", ".no-results"],
        nextPageButton: [
          "button[title='Next Page']",
          "a[title='Next Page']",
          ".next-page",
          ".pagination-next",
        ],
        prevPageButton: [
          "button[title='Previous Page']",
          "a[title='Previous Page']",
          ".prev-page",
          ".pagination-prev",
        ],
        paginationContainer: [
          ".pagination_container_two_pane",
          ".pagination-container",
          ".pagination",
        ],
        jobDescription: [
          ".job-description",
          ".description",
          "[data-testid='job-description']",
        ],
      },
      timeouts: {
        standard: 3000,
        extended: 8000,
        applicationTimeout: 8 * 60 * 1000,
        pageLoad: 3000,
      },
      delays: {
        betweenJobs: 8000, // Increased from 3s to 8s for slower processing
        formFilling: 2000, // Increased for better form handling
        pageLoad: 4000, // Increased for better page load waiting
        newPageJobStart: 8000, // Wait time before starting job selection on new page
        modalWait: 3000, // Wait time for modal operations
      },
      urlPatterns: {
        searchPage: /ziprecruiter\.com\/(jobs|search)/,
        jobPage: /ziprecruiter\.com\/job\//,
        applyPage: /ziprecruiter\.com\/apply/,
      },
    };
  }

  setupObservers() {
    this.healthCheckTimer = setInterval(() => this.performHealthCheck(), 30000);
    this.setupFormDetectionObserver();
  }

  async initialize() {
    console.log("🚀 Initializing platform automation");

    // Setup message listener for co-pilot actions
    this.setupMessageListener();

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () =>
        this.initializePage()
      );
    } else {
      this.initializePage();
    }

    this.state.initialized = true;
  }

  setupMessageListener() {
    // Listen for DOM events from the overlay (direct, more reliable)
    document.addEventListener("copilot-control-action", (event) => {
      const { action } = event.detail || {};
      if (action) {
        console.log("🎮 Received copilot-control-action DOM event:", action);
        this.handleCoPilotAction({ action });
      }
    });

    // Also listen for chrome.runtime messages (from background script)
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      try {
        if (!message || !message.type) {
          return true;
        }

        const { type, data } = message;

        switch (type) {
          case "CONTROL_ACTION":
            this.handleCoPilotAction({ action: message.action });
            sendResponse({ success: true });
            break;

          case "SEARCH_TASK":
          case "SEARCH_TASK_DATA":
            // Handle search task data from background
            if (data) {
              this.searchData = {
                limit: data.limit || 10,
                current: data.current || 0,
                submittedLinks: data.submittedLinks || [],
              };
              if (data.userProfile) {
                this.userProfile = data.userProfile;
              }
            }
            sendResponse({ success: true });
            break;

          case "SEARCH_NEXT":
            if (this.handleSearchNext) {
              this.handleSearchNext(data);
            }
            sendResponse({ success: true });
            break;

          case "ALREADY_APPLIED":
          case "DUPLICATE":
            if (this.handleDuplicateJob) {
              this.handleDuplicateJob(data);
            }
            sendResponse({ success: true });
            break;

          case "LIMIT_REACHED":
            notifyStatus({ type: "LIMIT_REACHED" });
            sendResponse({ success: true });
            break;

          case "START_AUTOMATION_NOW":
            console.log("🚀 Received START_AUTOMATION_NOW");
            this.handleInitializeAutomation(message);
            sendResponse({ success: true });
            break;

          default:
            break;
        }
      } catch (error) {
        console.error("❌ Error handling message:", error);
        sendResponse({ success: false, error: error.message });
      }
      return true;
    });
  }

  /**
   * Handle platform-specific messages from background script
   */
  handlePlatformSpecificMessage(type, data) {
    switch (type) {
      case "APPLICATION_START_RESPONSE":
        if (data && data.limitReached) {
          console.log("⚠️ Limit reached, showing message");
          this.showStatusMessage("LIMIT_EXCEEDED", data.data);
          this.stop();
        } else if (data && data.duplicate) {
          console.log("⚠️ Duplicate application detected");
          this.showStatusMessage("ALREADY_APPLIED", data.data);
        }
        break;

      default:
        // Pass to parent or ignore
        break;
    }
  }

  // ========================================
  // PAGE TYPE DETECTION & ROUTING
  // ========================================

  async initializePage() {
    try {
      const pageType = this.detectPageType();
      switch (pageType) {
        case "google_search":
          await this.handleGoogleSearchPage();
          break;
        case "ziprecruiter_search":
          await this.handleZipRecruiterSearchPage();
          break;
        case "ziprecruiter_job":
          await this.handleZipRecruiterJobPage();
          break;
        case "ziprecruiter_apply":
          await this.handleZipRecruiterApplicationPage();
          break;
        default:
          await this.waitForValidPage();
      }

      this.state.ready = true;
    } catch (error) {
      this.handleError("Page initialization failed", error);
    }
  }

  detectPageType() {
    const url = window.location.href;

    if (url.includes("google.com/search")) return "google_search";
    if (this.config.urlPatterns.applyPage.test(url))
      return "ziprecruiter_apply";
    if (this.config.urlPatterns.jobPage.test(url)) return "ziprecruiter_job";
    if (this.config.urlPatterns.searchPage.test(url))
      return "ziprecruiter_search";

    return "unknown";
  }

  // ========================================
  // PAGE HANDLERS
  // ========================================

  async handleGoogleSearchPage() {
    this.state.currentPhase = "searching";
    await this.requestSearchTaskData();
  }

  async handleZipRecruiterSearchPage() {
    this.state.currentPhase = "searching";

    const { jobsFound, jobCount } = this.checkIfJobsFound();
    if (!jobsFound) {
      return;
    }
    await this.requestSearchTaskData();
  }

  async handleZipRecruiterJobPage() {
    this.state.currentPhase = "applying";
    this.cachedJobDescription = await this.extractJobDescription();
    await this.requestApplicationTaskData();
  }

  async handleZipRecruiterApplicationPage() {
    this.state.currentPhase = "applying";
    this.state.formDetected = true;
    await this.requestApplicationTaskData();
  }

  // ========================================
  // MAIN AUTOMATION FLOW
  // ========================================

  async start(params = {}) {
    try {
      if (this.state.isRunning) return true;

      // Show automation starting message
      this.showStatusMessage("AUTOMATION_STARTING");
      this.updateAutomationStatus("searching");

      // Ensure session context preferences are applied (fallback if initialize wasn't called)
      if (this.sessionContext) {
        await this.setSessionContext(this.sessionContext);
      }

      const validationResult = await this.validatePreconditions();
      if (!validationResult.isValid) {
        this.showStatusMessage("APPLICATION_ERROR");
        return false;
      }

      this.state.isRunning = true;
      await this.loadUserProfile();
      await this.initializeFormHandler();

      this.config = { ...this.config, ...params };
      this.updateProgress({
        total: params.jobsToApply || 0,
        completed: 0,
        current: "Starting automation...",
      });

      await this.waitForPageLoad();

      // Route based on current page type
      const pageType = this.detectPageType();
      if (pageType === "ziprecruiter_search") {
        this.showStatusMessage("JOB_SEARCH_STARTED", {
          preferences: {
            ...(this.sessionContext?.preferences || this.config?.preferences || {}),
          },
        });
        await this.startJobProcessing();
      } else if (
        pageType === "ziprecruiter_apply" ||
        pageType === "ziprecruiter_job"
      ) {
        console.log("🚀 Processing current application");
        await this.processCurrentApplication();
      }

      return true;
    } catch (error) {
      this.handleError("Failed to start automation", error);
      this.showStatusMessage("APPLICATION_ERROR");
      this.state.isRunning = false;
      return false;
    }
  }

  // ========================================
  // VALIDATION & AUTHENTICATION
  // ========================================

  async validatePreconditions() {
    try {
      await this.delay(2000);
      // await this.checkLoginStatus(); // Removed as per new logic
      await this.delay(2000);
      await this.checkCaptchaStatus();
      return { isValid: true, message: "Ready to start" };
    } catch (error) {
      return {
        isValid: false,
        message:
          error.message || "Validation failed - please refresh and try again",
      };
    }
  }

  async checkCaptchaStatus() {
    try {
      // ZipRecruiter specific CAPTCHA selectors based on the provided HTML
      const captchaSelectors = [
        'p:contains("Verify you are human by completing the action below")',
        "p.h2.spacer-bottom", // The specific class from the HTML
        '[class*="captcha"]',
        '[id*="captcha"]',
        ".g-recaptcha",
        ".h-captcha",
        "[data-ray]",
        ".cf-browser-verification",
      ];

      let captchaFound = false;

      // Check each selector
      for (const selector of captchaSelectors) {
        let element;

        if (selector.includes(":contains")) {
          // Handle :contains selector manually for ZipRecruiter's specific text
          const elements = document.querySelectorAll("p");
          element = Array.from(elements).find(
            (p) =>
              (p.textContent || "").includes(
                "Verify you are human by completing the action below"
              ) ||
              (p.textContent || "").includes("Access blocked") ||
              (p.textContent || "").includes("Verification Required")
          );
        } else {
          element = document.querySelector(selector);
        }

        if (element && this.isElementVisible(element)) {
          captchaFound = true;
          break;
        }
      }

      if (captchaFound) {
        this.showStatusMessage("RECAPTCHA_DETECTED");
        await this.waitForCaptchaResolution();
      }
    } catch (error) {
      throw error;
    }
  }

  async waitForCaptchaResolution() {
    const maxWaitTime = 10 * 60 * 1000; // 10 minutes
    const checkInterval = 10000; // 10 seconds
    let waitTime = 0;
    while (waitTime < maxWaitTime) {
      await this.delay(checkInterval);
      waitTime += checkInterval;

      // Check if CAPTCHA is still present
      const captchaSelectors = [
        'p:contains("Verify you are human by completing the action below")',
        "p.h2.spacer-bottom",
        '[class*="captcha"]',
        '[id*="captcha"]',
        ".g-recaptcha",
        ".h-captcha",
      ];

      let captchaStillPresent = false;

      for (const selector of captchaSelectors) {
        let element;

        if (selector.includes(":contains")) {
          const elements = document.querySelectorAll("p");
          element = Array.from(elements).find(
            (p) =>
              (p.textContent || "").includes(
                "Verify you are human by completing the action below"
              ) ||
              (p.textContent || "").includes("Access blocked") ||
              (p.textContent || "").includes("Verification Required")
          );
        } else {
          element = document.querySelector(selector);
        }

        if (element && this.isElementVisible(element)) {
          captchaStillPresent = true;
          break;
        }
      }

      if (!captchaStillPresent) {
        return;
      }
    }

    throw new Error(
      "Captcha resolution timeout - please refresh and try again"
    );
  }

  /**
   * Reusable canApply check with UI notifications
   * @param {string} jobId - The job ID to check
   * @param {object} jobDetails - Job details for display
   * @returns {Promise<{action: 'continue'|'skip'|'stop', canApplyResult?: object}>}
   */
  async checkCanApplyAndNotify(jobId, jobDetails) {
    try {
      const canApplyResult = await this.applicationTracker.checkCanApply(jobId);

      if (canApplyResult.error) {
        return { action: "continue", canApplyResult: null };
      }

      if (canApplyResult.alreadyApplied) {
        this.showStatusMessage("ALREADY_APPLIED", {
          title: jobDetails?.title || "Unknown Job",
          jobId: jobDetails?.jobId,
        });
        return { action: "skip", reason: "already_applied", canApplyResult };
      }

      // Check if company is blacklisted
      const companyBlacklist = this.config?.preferences?.companyBlacklist || [];
      if (jobDetails?.company && companyBlacklist.length > 0) {
        const normalizedCompany = jobDetails.company.toLowerCase().trim();
        const isBlacklisted = companyBlacklist.some(
          (blacklistedCompany) =>
            blacklistedCompany.toLowerCase().trim() === normalizedCompany
        );

        if (isBlacklisted) {
          console.log(
            `🚫 Company "${jobDetails.company}" is blacklisted - skipping`
          );
          notifyStatus({
            type: "COMPANY_BLACKLISTED",
            data: {
              title: jobDetails?.title || "Job",
              company: jobDetails.company,
            },
          });
          return { action: "skip", reason: "blacklisted", canApplyResult };
        }
      }

      // Check if user has reached their credit/application limit
      if (!canApplyResult.canApply) {
        this.showStatusMessage("LIMIT_EXCEEDED", {
          planType: this.userProfile?.plan,
          credits: canApplyResult.credits,
        });
        return { action: "stop", canApplyResult };
      }

      // Can proceed with application
      return { action: "continue", canApplyResult };
    } catch (error) {
      console.error("Error checking can apply:", error);
      // On error, allow continuation (don't block)
      return { action: "continue", canApplyResult: null };
    }
  }

  // Updated checkForInterference method to be more specific
  checkForInterference(type) {
    if (type === "captcha") {
      // Quick synchronous check for CAPTCHA
      const captchaElements = document.querySelectorAll("p");
      const hasCaptcha = Array.from(captchaElements).some((p) =>
        (p.textContent || "").includes(
          "Verify you are human by completing the action below"
        )
      );

      return {
        isValid: !hasCaptcha,
        message: hasCaptcha
          ? "🛡️ CAPTCHA verification required. Please complete before continuing."
          : "",
      };
    }
    // DEPRECATED: Login check removed from this function.
    return { isValid: true };
  }

  // ========================================
  // JOB PROCESSING PIPELINE
  // ========================================

  async startJobProcessing() {
    try {
      this.state.currentPhase = "searching";
      this.updateAutomationStatus("searching");

      const { jobsFound, jobCount } = this.checkIfJobsFound();
      console.log("🚀 Found", jobCount, "jobs");
      if (!jobsFound) {
        this.showStatusMessage("SEARCH_COMPLETED");
        this.completeAutomation();
        return;
      }

      // Pass copilotMode to status overlay
      this.showStatusMessage("JOB_SEARCH_STARTED", {
        preferences: {
          ...(this.sessionContext?.preferences || this.config?.preferences || {}),
          copilotMode: this.copilotState.isInCoPilotMode()
            ? "co-pilot"
            : "auto-pilot",
        },
      });

      this.showStatusMessage("JOB_FOUND");
      this.resetJobProcessingState();
      await this.processJobQueue();
    } catch (error) {
      console.log("❌ Job processing failed:", error);
      this.handleError("Job processing failed", error);
      this.showStatusMessage("APPLICATION_ERROR");
    }
  }

  async processJobQueue() {
    // Prevent duplicate queue processing
    if (this.state.isProcessingQueue) {
      return;
    }

    this.state.isProcessingQueue = true;

    try {
      while (this.state.isRunning) {
        try {
          // PRIORITY: Check for modal first - this is CRITICAL!
          if (this.isFormModalVisible()) {
            await this.delay(3000);
            continue;
          }

          // Critical: Don't process new jobs if an application is already in progress
          if (this.state.isApplicationInProgress) {
            await this.delay(2000); // Wait and check again
            continue;
          }

          const jobCard = await this.getNextJobCard();

          if (!jobCard) {
            // Check if we're on the last page before attempting to navigate
            if (this.isOnLastPage()) {
              this.completeAutomation();
              break;
            }

            // Try to go to next page
            const nextPageSuccess = await this.goToNextPage();
            if (nextPageSuccess) {
              await this.delay(this.config.delays.pageLoad);
              continue;
            } else {
              this.completeAutomation();
              break;
            }
          }

          // Final modal check before processing job
          if (this.isFormModalVisible()) {
            await this.delay(3000);
            continue;
          }

          console.log("🚀 Processing job application");

          // Process the job application
          await this.processJobApplication(jobCard);

          // Wait between jobs only if not in application progress
          if (!this.state.isApplicationInProgress) {
            await this.delay(this.config.delays.betweenJobs);
          }
        } catch (error) {
          this.handleError("Job processing error", error);
          await this.delay(this.config.delays.betweenJobs);
        }
      }
    } finally {
      this.state.isProcessingQueue = false;
    }
  }

  async getNextJobCard() {
    const allJobCards = this.getJobCards();

    for (const jobCard of allJobCards) {
      const jobId = this.extractJobId(jobCard);
      if (!this.state.processedJobIds.has(jobId)) {
        return jobCard;
      }
    }

    return null;
  }

  async processJobApplication(jobCard) {
    try {
      if (!this.applicationTracker) {
        const backendApiHost = this.getApiHost();
        const userId = this.sessionContext?.userId || this.config?.userId;
        const jobProfileId =
          this.sessionContext?.userProfile?.id || this.userProfile?.id;
        const jwtToken = this.getJwtToken();

        if (!backendApiHost || !jobProfileId) {
          console.error(
            "❌ Cannot initialize ApplicationTrackerService - missing required values:",
            {
              backendApiHost,
              jobProfileId,
            }
          );
        }

        this.applicationTracker = new ApplicationTrackerService({
          backendApiHost,
          userId,
          jobProfileId,
          jwtToken,
        });
      }

      const jobDetails = this.extractJobDetails(jobCard);
      const jobId = jobDetails.jobId;

      this.state.processedJobIds.add(jobId);
      this.state.currentJobDetails = jobDetails;
      this.state.lastClickedJobCard = jobCard;

      this.markJobCard(jobCard, "processing");

      // Show applying to job message (NOT in co-pilot mode - form handler will send its own messages)
      if (!this.copilotState.isInCoPilotMode()) {
        this.showStatusMessage("APPLYING_TO_JOB", {
          title: jobDetails.title,
          company: jobDetails.company,
        });
      }
      this.updateAutomationStatus("applying");

      // Check user authorization before applying (using reusable method)
      const checkResult = await this.checkCanApplyAndNotify(
        jobDetails.jobId,
        jobDetails
      );
      if (checkResult.action === "stop") {
        this.showStatusMessage("LIMIT_REACHED");
        // Limit reached - stop automation
        this.completeAutomation();
        return;
      }

      if (checkResult.action === "skip") {
        // Mark job card based on reason
        if (checkResult.reason === "blacklisted") {
          this.markJobCard(jobCard, "blacklisted");
        } else {
          this.markJobCard(jobCard, "already_applied");
        }
        this.state.processedCount++;
        return;
      }

      // Expand job details if needed - this loads the job description into the panel
      await this.expandJobDetails(jobCard);

      // Extract job description AFTER expanding - ensures we get this job's description, not the previous one
      this.cachedJobDescription = await this.extractJobDescription();

      // Merge description into currentJobDetails so it's available for tracking
      if (
        this.state.currentJobDetails &&
        this.cachedJobDescription?.fullDescription
      ) {
        this.state.currentJobDetails.description =
          this.cachedJobDescription.fullDescription;
      }

      // Check if user wants us to apply to matching jobs only (after expanding so we have the full job description)
      if (
        this.config.preferences?.applyOnlyMatching ||
        this.config.preferences?.applyOnlyQualified
      ) {
        // Check if job matches user preferences
        if (!(await this.doesJobMatchPreferences(jobDetails))) {
          this.showStatusMessage("DOES_NOT_MATCH_PREFERENCES", {
            title: jobDetails.title,
            reason: this.reason,
          });
          this.markJobCard(jobCard, "skipped");
          this.state.processedCount++;
          return;
        }
      }

      // Find and validate apply button
      const applyButton = await this.findApplyButton();
      if (!applyButton) {
        this.showStatusMessage("ALREADY_APPLIED", {
          // add the job information to the message
          title: jobDetails.title,
          company: jobDetails.company,
          location: jobDetails.location,
          salary: jobDetails.salary,
          jobUrl: jobDetails.jobUrl,
        });
        this.markJobCard(jobCard, "skipped");
        this.state.processedCount++;
        return;
      }

      // Start application process
      this.prepareForApplication();
      this.clickElement(applyButton);

      // Wait for application to complete
      await this.waitForApplicationCompletion();
    } catch (error) {
      console.error("Application failed:", error);
      // this.showStatusMessage("APPLICATION_ERROR");
      // this.markJobCard(jobCard, "failed");
      this.state.processedCount++;
      return;
    }
  }

  async expandJobDetails(jobCard) {
    // Find the job title button to expand details
    let titleButton = null;

    for (const selector of this.config.selectors.jobTitleButton) {
      titleButton = jobCard.querySelector(selector);
      if (titleButton && this.isElementVisible(titleButton)) {
        break;
      }
    }

    if (!titleButton) {
      // Try to find button by aria-label pattern
      const buttons = jobCard.querySelectorAll("button");
      for (const button of buttons) {
        const ariaLabel = button.getAttribute("aria-label") || "";
        if (
          ariaLabel.toLowerCase().startsWith("view ") &&
          this.isElementVisible(button)
        ) {
          titleButton = button;
          break;
        }
      }
    }

    if (titleButton) {
      this.clickElement(titleButton);
      await this.delay(this.config.timeouts.standard);
    } else {
      this.showStatusMessage("APPLICATION_ERROR", {
        message: "No expandable job title button found - skipping to next job",
      });
      this.markJobCard(jobCard, "skipped");
      this.state.processedCount++;
      return;
    }
  }

  prepareForApplication() {
    this.state.isApplicationInProgress = true;
    this.state.applicationStartTime = Date.now();
    this.state.formDetected = false;
    this.storeJobData();
  }

  async waitForApplicationCompletion() {
    const timeout = this.config.timeouts.applicationTimeout;
    const startTime = Date.now();
    let formDetected = false;
    let initialButtonState = null;
    let buttonStateChanged = false;

    // Capture initial button state
    const initialApplyButton = this.findInitialApplyButton();
    if (initialApplyButton) {
      initialButtonState = {
        text: initialApplyButton.textContent?.trim(),
        disabled: initialApplyButton.disabled,
        opacity: initialApplyButton.style.opacity,
        classes: initialApplyButton.className,
      };
    }

    while (
      this.state.isApplicationInProgress &&
      Date.now() - startTime < timeout
    ) {
      await this.delay(1000);

      // Check if button changed to "Applied" state (primary success indicator)
      if (this.checkApplicationSuccess()) {
        console.log(
          "✅ waitForApplicationCompletion: Success detected via checkApplicationSuccess"
        );
        break; // Exit loop - success will be handled after the loop
      }

      // Monitor button state changes
      if (initialApplyButton && !buttonStateChanged) {
        const currentState = {
          text: initialApplyButton.textContent?.trim(),
          disabled: initialApplyButton.disabled,
          opacity: initialApplyButton.style.opacity,
          classes: initialApplyButton.className,
        };

        // Check if button state has changed (loading or applied)
        if (
          currentState.text !== initialButtonState.text ||
          currentState.disabled !== initialButtonState.disabled ||
          currentState.opacity !== initialButtonState.opacity ||
          currentState.classes !== initialButtonState.classes
        ) {
          buttonStateChanged = true;

          // If button shows "Applied" state, mark as success
          if (
            currentState.text?.toLowerCase().includes("applied") ||
            (currentState.disabled &&
              currentState.classes.includes("opacity-50"))
          ) {
            console.log(
              "✅ waitForApplicationCompletion: Button state shows Applied"
            );
            break; // Exit loop - success will be handled after the loop
          }
        }
      }

      // Check if already applied only when no modal is open
      if (!this.isFormModalVisible() && (await this.checkAlreadyApplied())) {
        this.handleAlreadyApplied();
        break;
      }

      // Check for form modal appearance
      if (!formDetected && this.isFormModalVisible()) {
        formDetected = true;
        // Continue waiting - form needs to be filled
      }

      // If form was detected and is now gone, check for completion again
      if (formDetected && !this.isFormModalVisible()) {
        await this.delay(2000); // Give time for button state to update
        if (this.checkApplicationSuccess()) {
          console.log(
            "✅ waitForApplicationCompletion: Form closed and success detected"
          );
          break; // Exit loop - success will be handled after the loop
        }
      }
    }

    // SINGLE POINT: Handle success/timeout after loop exits
    if (this.checkApplicationSuccess()) {
      this.handleApplicationSuccess();
    } else if (
      this.state.isApplicationInProgress &&
      Date.now() - startTime >= timeout
    ) {
      this.handleApplicationTimeout();
    }
  }

  isFormModalVisible() {
    // Check for form modal containers based on the provided structure
    const modalSelectors = [
      "[role='dialog'][aria-modal='true']", // Primary selector from your structure
      "[data-zds-component='modal']", // ZipRecruiter specific modal component
      ".ApplyFlowApp", // Application flow container
      ".application-modal",
      ".modal",
      "[role='dialog']",
      ".ReactModal__Content",
      ".modal-content",
      ".apply-modal",
      "[data-testid*='modal']",
      "[class*='Modal']",
    ];

    for (const selector of modalSelectors) {
      const modal = document.querySelector(selector);
      if (modal && this.isElementVisible(modal)) {
        // Enhanced checks for application modal content
        const hasFormElements = modal.querySelector(
          'input, textarea, select, form, button[type="submit"], .form-field, .input-field, fieldset'
        );
        const hasApplicationContent = modal.querySelector(
          '[class*="apply"], [class*="application"], [id*="apply"], [id*="application"], .question_form'
        );
        const hasApplyFlowContent = modal.querySelector(
          ".ApplyFlowApp, .apply_flow_screen, .question_form"
        );

        if (hasFormElements || hasApplicationContent || hasApplyFlowContent) {
          return true;
        }
      }
    }

    // Additional check: look for specific ZipRecruiter modal elements
    const zipRecruiterModalElements = [
      ".overscroll-none.bg-white[role='dialog']",
      ".ApplyingToHeader",
      ".apply_flow_screen",
      ".question_form",
    ];

    for (const selector of zipRecruiterModalElements) {
      const element = document.querySelector(selector);
      if (element && this.isElementVisible(element)) {
        return true;
      }
    }

    return false;
  }

  // ========================================
  // APPLICATION FORM PROCESSING
  // ========================================

  async processCurrentApplication() {
    try {
      if (!this.userProfile) {
        await this.loadUserProfile();
      }

      this.cachedJobDescription = await this.extractJobDescription();
      console.log("Job description extracted:", this.cachedJobDescription);

      // If already successful (instant apply), let processApplicationForm handle it
      // This avoids duplicate tracking by centralizing success handling
      if (!this.isFormModalVisible() && this.checkApplicationSuccess()) {
        console.log(
          "✅ processCurrentApplication: Early success detected, delegating to processApplicationForm"
        );
        // Fall through to processApplicationForm which will handle success
      }

      // Avoid false already-applied while the modal is open
      if (!this.isFormModalVisible() && (await this.checkAlreadyApplied())) {
        await this.handleAlreadyApplied();
        return;
      }

      await this.processApplicationForm();
    } catch (error) {
      this.handleError("Application processing failed", error);
    }
  }

  async processApplicationForm() {
    if (!this.userProfile) {
      console.log("No user profile available for form processing");
      this.showStatusMessage("APPLICATION_ERROR");
      return;
    }

    let applicationSucceeded = false;

    try {
      // Don't show FILLING_FORM in co-pilot mode - form handler will send its own messages
      if (!this.copilotState.isInCoPilotMode()) {
        this.showStatusMessage("FILLING_FORM");
      }

      if (!this.state.isApplicationInProgress && this.isFormModalVisible()) {
        this.state.isApplicationInProgress = true;
        this.state.applicationStartTime = Date.now();
        this.state.formDetected = true;
      }

      // Ensure we're still in application progress mode
      if (!this.state.isApplicationInProgress) {
        return;
      }

      await this.initializeFormHandler();

      // Check if modal is still visible before processing
      if (!this.isFormModalVisible()) {
        // Modal already closed - check if it was successful
        applicationSucceeded = this.checkApplicationSuccess();
        console.log(
          `📋 Modal closed before form fill, success: ${applicationSucceeded}`
        );
      } else {
        console.log("🚀 Starting form fill...");
        const formFillResult = await this.formHandler.fillCompleteForm();
        console.log(`📋 Form fill result: ${formFillResult}`);

        // Show submitting message
        this.showStatusMessage("SUBMITTING_APPLICATION");

        // After form processing, wait a moment and check final state
        await this.delay(2000);

        // Determine success: form fill succeeded OR success indicators present
        applicationSucceeded = formFillResult || this.checkApplicationSuccess();
        console.log(`📋 Final success determination: ${applicationSucceeded}`);
      }

      // SINGLE DECISION POINT: Handle success or failure
      if (applicationSucceeded) {
        console.log("✅ processApplicationForm: Application successful");
        this.handleApplicationSuccess();
      } else {
        console.log("❌ processApplicationForm: Application failed");
        this.handleApplicationFailure();
      }
    } catch (error) {
      console.error("❌ processApplicationForm error:", error);
      this.showStatusMessage("APPLICATION_ERROR");
      this.handleApplicationFailure();
    }
  }

  /**
   * Build enriched job description by merging cachedJobDescription with currentJobDetails.
   * currentJobDetails (from job card) has accurate title/company/salary/location,
   * while cachedJobDescription (from page DOM) may have wrong values from generic selectors.
   */
  buildEnrichedJobDescriptionObject() {
    const jobDesc = this.cachedJobDescription || {};
    const jobDetails = this.state.currentJobDetails || {};

    return {
      // Prefer job card data over generic DOM extraction
      title: jobDetails.title || jobDesc.title || "",
      company: jobDetails.company || jobDesc.company || "",
      location: jobDetails.location || jobDesc.location || "",
      salary: jobDetails.salary || jobDesc.salary || "",
      fullDescription: jobDesc.fullDescription || "",
    };
  }

  async initializeFormHandler() {
    const enrichedJobDescription = this.buildEnrichedJobDescriptionObject();

    if (this.formHandler && this.userProfile) {
      this.formHandler.userData = this.userProfile;
      this.formHandler.jobDescription = enrichedJobDescription;

      // Update co-pilot mode in existing form handler
      const isInCoPilotMode = this.copilotState.isInCoPilotMode();
      this.formHandler.copilotMode = isInCoPilotMode;
      this.formHandler.copilotState = this.copilotState;
      this.formHandler.currentJobTitle =
        this.state.currentJobDetails?.title || "this job";

      return;
    }

    this.formHandler = new FormHandler({
      enableDebug: this.config.debug || true,
      host: this.getAiApiHost(),
      backendApiHost: this.backendApiHost,
      aiApiHost: this.aiApiHost,
      jwtToken: this.getJwtToken(),
      preferences: this.sessionContext?.preferences,
      userData: this.userProfile || {},
      jobDescription: enrichedJobDescription,
      platform: "ziprecruiter",
      // statusOverlay removed - uses global overlay
    });

    // Pass co-pilot mode and state to form handler
    const isInCoPilotMode = this.copilotState.isInCoPilotMode();
    this.formHandler.copilotMode = isInCoPilotMode;
    this.formHandler.copilotState = this.copilotState;
    this.formHandler.currentJobTitle =
      this.state.currentJobDetails?.title || "this job";
  }

  // ========================================
  // JOB CARD UTILITIES
  // ========================================

  getJobCards() {
    // Get job cards and filter for 1-click apply
    for (const selector of this.config.selectors.jobCards) {
      const cards = document.querySelectorAll(selector);
      if (cards.length > 0) {
        const eligibleCards = Array.from(cards)
          .filter((card) => this.isElementVisible(card))
          .filter((card) => this.hasOneClickApply(card));
        if (eligibleCards.length > 0) return eligibleCards;
      }
    }

    // Fallback - look for cards with 1-click apply
    const fallbackCards = document.querySelectorAll(
      '[data-job], [class*="job"], [id*="job"]'
    );
    return Array.from(fallbackCards).filter(
      (card) =>
        this.isElementVisible(card) &&
        card.querySelector('a[href*="job"]') &&
        this.hasOneClickApply(card)
    );
  }

  hasOneClickApply(jobCard) {
    // Check for 1-click apply badge text
    const badgeTexts = ["1-click apply", "quick apply", "1 click apply"];

    // Method 1: Check text content
    const allText = jobCard.textContent?.toLowerCase() || "";
    for (const text of badgeTexts) {
      if (allText.includes(text)) {
        return true;
      }
    }

    // Method 2: Check specific badge elements
    const badgeElements = jobCard.querySelectorAll(
      ".text-brand, .bg-badge-brand, p, span"
    );
    for (const element of badgeElements) {
      const text = element.textContent?.toLowerCase() || "";
      if (badgeTexts.some((badge) => text.includes(badge))) {
        return true;
      }
    }

    return false;
  }

  extractJobId(jobCard) {
    // Priority 1: Try data attributes
    const dataId =
      jobCard.getAttribute("data-job-id") ||
      jobCard.getAttribute("data-id") ||
      jobCard.id;

    if (dataId) return dataId;

    // Priority 2: Extract ID from job URL (most reliable)
    const titleLink = jobCard.querySelector('a[href*="job"]');
    if (titleLink?.href) {
      try {
        const url = new URL(titleLink.href);
        const pathParts = url.pathname.split("/").filter((p) => p);
        const jobIndex = pathParts.indexOf("job");
        if (jobIndex !== -1 && pathParts[jobIndex + 1]) {
          return pathParts[jobIndex + 1];
        }
        return titleLink.href;
      } catch (e) {
        console.error("Error parsing job URL:", e);
        return titleLink.href;
      }
    }

    const title = this.extractTextFromCard(
      jobCard,
      this.config.selectors.jobTitle
    );
    const company = this.extractTextFromCard(
      jobCard,
      this.config.selectors.companyName
    );

    return (
      `${title}-${company}-${Date.now()}`.replace(/\s+/g, "").toLowerCase() ||
      `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
  }

  extractJobDetails(jobCard) {
    try {
      return {
        jobId: this.extractJobId(jobCard),
        title:
          this.extractTextFromCard(jobCard, this.config.selectors.jobTitle) ||
          "Unknown Position",
        company:
          this.extractTextFromCard(
            jobCard,
            this.config.selectors.companyName
          ) || "Unknown Company",
        location: this.extractLocationFromCard(jobCard) || "Unknown Location",
        salary: this.extractSalaryTextFromCard(jobCard) || "Not specified",
        jobUrl: this.extractJobUrl(jobCard) || window.location.href,
        platform: "ziprecruiter",
        extractedAt: Date.now(),
        postedDate: this.extractPostedDate(jobCard),
      };
    } catch (error) {
      return {
        jobId: this.extractJobId(jobCard),
        title: "Unknown Position",
        company: "Unknown Company",
        location: "Unknown Location",
        salary: "Not specified",
        jobUrl: window.location.href,
        platform: "ziprecruiter",
        extractedAt: Date.now(),
      };
    }
  }

  extractTextFromCard(card, selectors) {
    for (const selector of selectors) {
      const element = card.querySelector(selector);
      if (element) {
        const text =
          element.getAttribute("title") || element.textContent?.trim();
        if (text && text.length > 0) return text;
      }
    }
    return "";
  }

  extractLocationFromCard(jobCard) {
    const textElements = jobCard.querySelectorAll("p.text-primary");

    for (const element of textElements) {
      const text = element.textContent?.trim() || "";

      if (text.match(/\$/)) {
        continue;
      }
      if (text.toLowerCase().includes("posted")) {
        continue;
      }

      if (
        text.match(/[A-Z][a-z]+,\s*[A-Z]{2}/) ||
        text.includes("•") ||
        text.toLowerCase().includes("remote") ||
        text.toLowerCase().includes("on-site") ||
        text.toLowerCase().includes("onsite") ||
        text.toLowerCase().includes("hybrid")
      ) {
        return text;
      }
    }

    return this.extractTextFromCard(jobCard, this.config.selectors.location);
  }

  extractSalaryTextFromCard(jobCard) {
    const textElements = jobCard.querySelectorAll("p.text-primary");
    for (const element of textElements) {
      const text = element.textContent?.trim() || "";
      if (text.match(/\$\d+/)) {
        return text;
      }
    }
    const salarySelectors = [
      ".salary",
      "[data-testid='salary']",
      "p:contains('$')",
    ];

    for (const selector of salarySelectors) {
      if (selector.includes(":contains")) {
        const elements = jobCard.querySelectorAll("p");
        for (const elem of elements) {
          if (elem.textContent?.includes("$")) {
            return elem.textContent.trim();
          }
        }
      } else {
        const element = jobCard.querySelector(selector);
        if (element) {
          return element.textContent?.trim();
        }
      }
    }

    return "";
  }

  extractJobUrl(jobCard) {
    const link = jobCard.querySelector('a[href*="job"]');
    return link?.href || "";
  }

  extractPostedDate(jobCard) {
    const elements = jobCard.querySelectorAll("p.text-primary, .date, .posted");
    for (const element of elements) {
      const text = element.textContent?.trim();
      if (text?.toLowerCase().includes("posted")) return text;
    }
    return "Not specified";
  }

  async doesJobMatchPreferences(jobInfo) {
    const preferences =
      this.sessionContext?.preferences || this.config?.preferences || {};
    const backendApiHost =
      this.sessionContext?.backendApiHost || this.config?.backendApiHost;
    const jwtToken = this.sessionContext?.jwtToken || this.config?.jwtToken;

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
              jobDescription: this.cachedJobDescription?.fullDescription || "",
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

  extractSalaryFromJobDetails(jobDetails) {
    const salaryText = jobDetails.salary || jobDetails.description || "";

    const salaryRangeMatch = salaryText.match(
      /\$(\d+(?:,\d{3})*(?:\.\d+)?)\s*([KkMm])?\s*-\s*\$(\d+(?:,\d{3})*(?:\.\d+)?)\s*([KkMm])?/
    );

    if (salaryRangeMatch) {
      const minSalary = this.parseSalaryValue(
        salaryRangeMatch[1],
        salaryRangeMatch[2]
      );
      const maxSalary = this.parseSalaryValue(
        salaryRangeMatch[3],
        salaryRangeMatch[4]
      );

      return Math.floor((minSalary + maxSalary) / 2);
    }

    const singleSalaryMatch = salaryText.match(
      /\$(\d+(?:,\d{3})*(?:\.\d+)?)\s*([KkMm])?/
    );

    if (singleSalaryMatch) {
      return this.parseSalaryValue(singleSalaryMatch[1], singleSalaryMatch[2]);
    }

    return null;
  }

  parseSalaryValue(value, multiplier) {
    let numValue = parseFloat(value.replace(/,/g, ""));

    if (multiplier) {
      const mult = multiplier.toUpperCase();
      if (mult === "K") {
        numValue *= 1000;
      } else if (mult === "M") {
        numValue *= 1000000;
      }
    }

    return Math.floor(numValue);
  }

  markJobCard(jobCard, status) {
    try {
      const existingHighlight = jobCard.querySelector(".job-highlight");
      if (existingHighlight) existingHighlight.remove();

      const statusConfig = {
        processing: { color: "#2196F3", text: "Processing" },
        applied: { color: "#4CAF50", text: "Applied" },
        already_applied: { color: "#8BC34A", text: "Already Applied" },
        blacklisted: { color: "#9C27B0", text: "Blacklisted" },
        skipped: { color: "#FF9800", text: "Skipped" },
        error: { color: "#F44336", text: "Error" },
      };

      const config = statusConfig[status] || {
        color: "#9E9E9E",
        text: "Unknown",
      };

      const highlight = document.createElement("div");
      highlight.className = "job-highlight";
      highlight.style.cssText = `
        position: absolute; top: 0; right: 0;
        background-color: ${config.color}; color: white;
        padding: 3px 8px; font-size: 12px; font-weight: bold;
        border-radius: 0 0 0 5px; z-index: 999;
      `;
      highlight.textContent = config.text;

      jobCard.style.border = `2px solid ${config.color}`;
      jobCard.style.position = "relative";
      jobCard.appendChild(highlight);
    } catch (error) {
      console.error("Error marking job card:", error);
    }
  }

  // ========================================
  // APPLY BUTTON & INTERACTION
  // ========================================

  async findApplyButton() {
    // Try configured selectors first
    for (const selector of this.config.selectors.applyButton) {
      const button = this.querySelector(selector);
      if (button && !button.disabled) {
        return button;
      }
    }

    // Search by button text
    const applyTexts = [
      "1-click apply",
      "quick apply",
      "apply now",
      "continue application",
    ];
    const buttons = document.querySelectorAll("button, a");

    for (const button of buttons) {
      const buttonText = button.textContent?.toLowerCase() || "";

      if (
        applyTexts.some((text) => buttonText.includes(text)) &&
        this.isElementVisible(button) &&
        !button.disabled
      ) {
        return button;
      }
    }

    return null;
  }

  findInitialApplyButton() {
    // Find the apply button that we're about to click
    // This could be the same as findApplyButton but we want to track it specifically
    const applyTexts = [
      "1-click apply",
      "quick apply",
      "apply now",
      "continue application",
    ];
    const buttons = document.querySelectorAll("button, a");

    for (const button of buttons) {
      const buttonText = button.textContent?.toLowerCase() || "";
      const ariaLabel = button.getAttribute("aria-label")?.toLowerCase() || "";

      if (
        (applyTexts.some((text) => buttonText.includes(text)) ||
          applyTexts.some((text) => ariaLabel.includes(text))) &&
        this.isElementVisible(button)
      ) {
        return button;
      }
    }
    return null;
  }

  findClickableJobElement(jobCard) {
    const selectors = [
      "h2 a",
      "h1 a",
      ".job-title a",
      'a[data-testid="job-title"]',
      ".JobCard_trackingLink__HMyun",
      "h2 button",
    ];

    for (const selector of selectors) {
      const element = jobCard.querySelector(selector);
      if (element && this.isElementVisible(element)) {
        return element;
      }
    }

    // Fallback to job card itself or any visible link
    if (this.isElementVisible(jobCard)) {
      return jobCard;
    }

    const links = jobCard.querySelectorAll("a[href], button");
    for (const link of links) {
      if (
        this.isElementVisible(link) &&
        !link.href?.includes("/jobseeker/home")
      ) {
        return link;
      }
    }

    return null;
  }

  clickElement(element) {
    try {
      if (!element) return false;

      // Add click protection to prevent rapid successive clicks
      if (element.dataset.clicking === "true") {
        return false;
      }

      // Mark element as being clicked
      element.dataset.clicking = "true";

      // Scroll into view
      element.scrollIntoView({ behavior: "smooth", block: "center" });

      // Use simple, single click approach to prevent multiple modal triggers
      if (element.focus) element.focus();

      // Only use the native click method - no multiple events
      element.click();

      // Clear the clicking flag after a short delay
      setTimeout(() => {
        if (element.dataset) {
          delete element.dataset.clicking;
        }
      }, 2000);

      return true;
    } catch (error) {
      // Clear clicking flag on error
      if (element && element.dataset) {
        delete element.dataset.clicking;
      }
      console.error("Click element error:", error);
      return false;
    }
  }

  // ========================================
  // APPLICATION STATUS & COMPLETION
  // ========================================

  checkApplicationSuccess() {
    // Method 1: Check for "Applied" button state (primary indicator)
    const appliedButton = this.findAppliedButton();
    if (appliedButton) {
      return true;
    }

    // Method 2: Check for button state change by comparing original apply button
    const currentApplyButtons = document.querySelectorAll("button");
    for (const button of currentApplyButtons) {
      const buttonText = button.textContent?.toLowerCase() || "";
      const ariaLabel = button.getAttribute("aria-label")?.toLowerCase() || "";

      // Check if this is an apply button that has changed to "Applied" state
      if (
        (buttonText.includes("applied") || ariaLabel.includes("applied")) &&
        (button.classList.contains("opacity-50") ||
          button.style.opacity === "0.5" ||
          button.disabled ||
          button.hasAttribute("disabled"))
      ) {
        return true;
      }
    }

    // Method 3: Check URL patterns
    const url = window.location.href;
    if (
      url.includes("success") ||
      url.includes("confirmation") ||
      url.includes("applied")
    ) {
      return true;
    }

    // Method 4: Check success elements
    const successSelectors = [
      ".application-success",
      ".success-message",
      ".confirmation",
    ];
    if (successSelectors.some((selector) => this.querySelector(selector))) {
      return true;
    }

    // Method 5: Check page text
    const pageText = document.body.innerText?.toLowerCase() || "";
    return (
      pageText.includes("application submitted") ||
      pageText.includes("successfully applied") ||
      pageText.includes("thank you for applying") ||
      pageText.includes("application complete")
    );
  }

  findAppliedButton() {
    // Prefer buttons within the last clicked job card to avoid cross-card false positives
    const container = this.state.lastClickedJobCard || document;
    const buttons = container.querySelectorAll("button");
    for (const button of buttons) {
      if (!this.isElementVisible(button)) continue;
      const buttonText = button.textContent?.toLowerCase() || "";
      const ariaLabel = button.getAttribute("aria-label")?.toLowerCase() || "";

      // Check for "Applied" text
      if (buttonText.includes("applied") || ariaLabel.includes("applied")) {
        // Check for disabled state indicators
        const isDisabled =
          button.disabled ||
          button.getAttribute("aria-disabled") === "true" ||
          button.classList.contains("opacity-50") ||
          button.style.opacity === "0.5" ||
          button.style.pointerEvents === "none" ||
          button.hasAttribute("disabled");

        if (isDisabled) {
          return button;
        }
      }
    }
    return null;
  }

  async checkAlreadyApplied() {
    // Never claim already-applied while a form modal is visible
    if (this.isFormModalVisible()) {
      return false;
    }

    // Scope detection to the current job card if available
    const container = this.state.lastClickedJobCard || null;
    if (container) {
      // Look for applied badge/label within the job card
      const appliedBadgeSelectors = [
        '[aria-label*="applied" i]',
        '[data-testid*="applied" i]',
        ".applied-status",
        ".application-submitted",
        ".already-applied",
      ];
      for (const selector of appliedBadgeSelectors) {
        const el = container.querySelector(selector);
        if (el && this.isElementVisible(el)) {
          return true;
        }
      }

      // Check the primary apply button in the card for an applied/disabled state
      const buttons = container.querySelectorAll("button");
      for (const button of buttons) {
        if (!this.isElementVisible(button)) continue;
        const txt = (button.textContent || "").toLowerCase();
        const aria = (button.getAttribute("aria-label") || "").toLowerCase();
        const looksApplied =
          txt.includes("applied") || aria.includes("applied");
        const disabled =
          button.disabled ||
          button.getAttribute("aria-disabled") === "true" ||
          button.classList.contains("opacity-50") ||
          button.hasAttribute("disabled");
        if (looksApplied && disabled) {
          return true;
        }
      }
    }

    // As a conservative fallback (no card context and no modal): check visible, explicit messages only
    const explicitTextSelectors = [
      '[role="alert" i]',
      '[data-testid*="message" i]',
      ".toast, .notification, .banner, .alert",
    ];
    for (const selector of explicitTextSelectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (!this.isElementVisible(node)) continue;
        const text = (node.textContent || "").toLowerCase();
        if (
          text.includes("you've applied to this job") ||
          text.includes("already applied")
        ) {
          return true;
        }
      }
    }

    return false;
  }

  handleApplicationSuccess() {
    // Guard: Only track if we haven't already tracked this application
    if (!this.state.currentJobDetails) {
      console.warn(
        "⚠️ handleApplicationSuccess called but no currentJobDetails"
      );
      this.completeCurrentApplication();
      return;
    }

    if (this.state.applicationTracked) {
      console.log(
        "⏭️ handleApplicationSuccess called but already tracked, skipping"
      );
      // Still complete the application state
      if (this.state.lastClickedJobCard) {
        this.markJobCard(this.state.lastClickedJobCard, "applied");
      }
      this.completeCurrentApplication();
      return;
    }

    this.state.applicationTracked = true;
    console.log(
      "✅ handleApplicationSuccess - tracking application:",
      this.state.currentJobDetails.jobId
    );

    // Now safe to track (flag is already set, so duplicate calls will be skipped)
    this.trackApplication(this.state.currentJobDetails);

    chrome.runtime
      .sendMessage({
        action: "platformNotification",
        type: "applicationSubmitted",
        data: {
          jobData: this.state.currentJobDetails,
          applicationData: {},
        },
        sessionId: this.sessionId,
        platform: "ziprecruiter",
      })
      .catch((err) => console.error("Error sending notification:", err));

    if (this.state.lastClickedJobCard) {
      this.markJobCard(this.state.lastClickedJobCard, "applied");
    }

    this.completeCurrentApplication();
  }

  handleApplicationFailure() {
    this.showStatusMessage("APPLICATION_ERROR");

    if (this.state.lastClickedJobCard) {
      this.markJobCard(this.state.lastClickedJobCard, "error");
    }

    this.completeCurrentApplication();
  }

  handleAlreadyApplied() {
    const jobTitle = this.state.currentJobDetails?.title || "this position";
    this.showStatusMessage("ALREADY_APPLIED", { title: jobTitle });

    if (this.state.lastClickedJobCard) {
      this.markJobCard(this.state.lastClickedJobCard, "already_applied");
    }

    this.completeCurrentApplication();
  }

  handleApplicationTimeout() {
    if (this.state.lastClickedJobCard) {
      this.markJobCard(this.state.lastClickedJobCard, "error");
    }

    this.completeCurrentApplication();
  }

  completeCurrentApplication() {
    // Reset application state
    this.state.isApplicationInProgress = false;
    this.state.applicationStartTime = null;
    this.state.formDetected = false;
    this.state.applicationTracked = false;
    this.state.processedCount++;
    this.state.lastActivity = Date.now();

    // Clear any modal-related state and check if modals are still open
    const modals = document.querySelectorAll(
      '[role="dialog"], .ApplyFlowApp, .modal'
    );
    let modalStillOpen = false;
    modals.forEach((modal) => {
      if (modal && this.isElementVisible(modal)) {
        modalStillOpen = true;
      }
    });

    if (!this.state.isProcessingQueue && this.state.isRunning) {
      setTimeout(
        () => {
          if (!this.state.isProcessingQueue && this.state.isRunning) {
            this.processJobQueue();
          }
        },
        modalStillOpen ? 5000 : 2000
      ); // Wait longer if modal still open
    }
  }

  completeAutomation() {
    this.state.isRunning = false;
    this.state.currentPhase = "completed";
    this.updateAutomationStatus("ready");
    this.showStatusMessage("SEARCH_COMPLETED");
    this.safeSendPortMessage({ type: "SEARCH_COMPLETED" });
  }

  // ========================================
  // PAGE NAVIGATION
  // ========================================

  async goToNextPage() {
    try {
      // First, ensure no modals are open before navigation
      await this.waitForModalClosure();

      // Try to find the "Next Page" button using updated selectors
      let nextButton = null;

      for (const selector of this.config.selectors.nextPageButton) {
        const button = document.querySelector(selector);
        if (button && this.isElementVisible(button) && !button.disabled) {
          nextButton = button;
          break;
        }
      }

      // If no direct next button found, look for pagination buttons
      if (!nextButton) {
        nextButton = this.findNextPageButton();
      }

      if (nextButton && !nextButton.disabled) {
        // Scroll button into view
        nextButton.scrollIntoView({ behavior: "smooth", block: "center" });
        await this.delay(1000);

        this.clickElement(nextButton);
        await this.delay(this.config.delays.pageLoad);

        // Wait for page to load and check for jobs
        await this.waitForPageToLoad();

        // CRITICAL: Wait longer before starting job selection on new page
        await this.delay(this.config.delays.newPageJobStart);

        // Ensure no modals are still open from previous page before proceeding
        await this.ensureNoModalBeforeJobSelection();

        const { jobsFound } = this.checkIfJobsFound();

        if (jobsFound) {
          this.state.processedJobIds.clear();
          this.state.currentJobIndex = 0;
          this.state.lastActivity = Date.now();
          return true;
        } else {
          return false;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  checkIfJobsFound() {
    const jobCards = this.getJobCards();

    if (jobCards.length === 0) {
      // Check for explicit "no results" indicators
      const noResultsFound = this.config.selectors.noJobsFound.some(
        (selector) => this.querySelector(selector)
      );

      if (noResultsFound) {
        return { jobsFound: false, jobCount: 0 };
      }

      // Check page text
      const pageText = document.body.textContent?.toLowerCase() || "";
      if (
        pageText.includes("no jobs found") ||
        pageText.includes("0 jobs") ||
        pageText.includes("no results")
      ) {
        return { jobsFound: false, jobCount: 0 };
      }
    }

    return { jobsFound: jobCards.length > 0, jobCount: jobCards.length };
  }

  findNextPageButton() {
    // Look for pagination container first
    const paginationContainer = document.querySelector(
      ".pagination_container_two_pane, .pagination-container, .pagination"
    );

    if (paginationContainer) {
      // Look for "Next Page" button specifically
      const nextButton = paginationContainer.querySelector(
        'button[title="Next Page"]'
      );
      if (
        nextButton &&
        !nextButton.disabled &&
        !nextButton.classList.contains("cursor-not-allowed")
      ) {
        return nextButton;
      }

      // Alternative: look for the last enabled pagination button (likely next page)
      const pageButtons = paginationContainer.querySelectorAll(
        'button[title*="Page"]'
      );
      for (let i = pageButtons.length - 1; i >= 0; i--) {
        const button = pageButtons[i];
        if (
          !button.disabled &&
          !button.classList.contains("cursor-not-allowed") &&
          !button.classList.contains("bg-button-primary-default")
        ) {
          // Not current page
          return button;
        }
      }
    }

    // Fallback: look for any button with next/forward arrow
    const arrowButtons = document.querySelectorAll("button svg title");
    for (const title of arrowButtons) {
      if (title.textContent?.toLowerCase().includes("next")) {
        const button = title.closest("button");
        if (
          button &&
          !button.disabled &&
          !button.classList.contains("cursor-not-allowed")
        ) {
          return button;
        }
      }
    }

    return null;
  }

  async waitForPageToLoad() {
    // Wait for page content to update
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      await this.delay(1000);

      // Check if page is still loading
      if (document.readyState === "complete") {
        // Additional wait to ensure content is rendered
        await this.delay(2000);
        break;
      }

      attempts++;
    }
  }

  isOnLastPage() {
    try {
      // Check if "Next Page" button is disabled
      const nextButtons = document.querySelectorAll(
        'button[title="Next Page"]'
      );
      for (const button of nextButtons) {
        if (
          button.disabled ||
          button.classList.contains("cursor-not-allowed") ||
          button.classList.contains("opacity-45")
        ) {
          return true;
        }
      }

      // Check pagination container for last page indicators
      const paginationContainer = document.querySelector(
        ".pagination_container_two_pane"
      );
      if (paginationContainer) {
        const pageInfo = paginationContainer.querySelector("p");
        if (pageInfo) {
          const text = pageInfo.textContent || "";
          // Look for patterns like "Showing 1-20 of 20 results" (last page)
          const match = text.match(/Showing (\d+)-(\d+)(?:\s+of\s+(\d+))?/i);
          if (match) {
            const endResult = parseInt(match[2]);
            const totalResults = match[3] ? parseInt(match[3]) : null;

            if (totalResults && endResult >= totalResults) {
              return true;
            }
          }
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  async waitForModalClosure() {
    let attempts = 0;
    const maxAttempts = 10; // 30 seconds max wait

    while (attempts < maxAttempts) {
      const hasModal = this.isFormModalVisible();

      if (!hasModal) {
        return;
      }

      await this.delay(3000);
      attempts++;
    }
  }

  async ensureNoModalBeforeJobSelection() {
    // Check if any modal is currently open
    if (this.isFormModalVisible()) {
      let attempts = 0;
      const maxAttempts = 20; // 60 seconds max wait for modal closure

      while (attempts < maxAttempts && this.isFormModalVisible()) {
        await this.delay(3000);
        attempts++;

        // Check if modal processing completed - just break, don't handle success here
        // Success will be handled by the main flow (processApplicationForm or waitForApplicationCompletion)
        if (this.checkApplicationSuccess()) {
          console.log(
            "✅ ensureNoModalBeforeJobSelection: Success detected, breaking loop"
          );
          break;
        }
      }

      if (this.isFormModalVisible()) {
        this.completeCurrentApplication();
      }
    }

    await this.delay(this.config.delays.modalWait);
  }

  // ========================================
  // DATA MANAGEMENT
  // ========================================

  async loadUserProfile() {
    if (this.userProfile) return;

    try {
      this.userProfile = this.getInjectedUserProfile();
    } catch (error) {
      console.error("Failed to load user profile:", error);
    }
  }

  storeJobData() {
    const jobData = {
      description: this.extractJobDescriptionText(),
      timestamp: Date.now(),
    };
    chrome.storage.local.set({ currentJobData: jobData });
  }

  async getStoredJobData() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["currentJobData"], (result) => {
        if (result.currentJobData) {
          const jobData = result.currentJobData;
          if (Date.now() - jobData.timestamp < 300000) {
            // 5 minutes
            resolve(jobData.description);
            return;
          }
        }
        resolve("");
      });
    });
  }

  extractJobDescriptionText() {
    try {
      // Method 1: Look for h2 with "Job description" text and get the next sibling div
      const headings = document.querySelectorAll("h2");
      for (const heading of headings) {
        if (heading.textContent?.trim().toLowerCase() === "job description") {
          // Get the parent container and find the description div
          const container = heading.closest(".flex.flex-col");
          if (container) {
            const descDiv = container.querySelector(
              ".text-primary.whitespace-pre-line"
            );
            if (descDiv) {
              return descDiv.textContent?.trim() || "";
            }
          }

          // Alternative: get next sibling
          const nextSibling = heading.nextElementSibling;
          if (nextSibling && this.isElementVisible(nextSibling)) {
            return nextSibling.textContent?.trim() || "";
          }
        }
      }

      // Method 2: Try configured selectors as fallback
      const descElement = this.querySelector(
        this.config.selectors.jobDescription.join(", ")
      );
      if (descElement) {
        return descElement.textContent?.trim() || "";
      }

      return "";
    } catch (error) {
      console.error("Error extracting job description text:", error);
      return "";
    }
  }

  async extractJobDescription() {
    try {
      const jobDescription = {
        title: DomUtils.extractText([
          "h1",
          ".job-title",
          "[data-testid='job-title']",
        ]),
        company: DomUtils.extractText([
          ".company-name",
          "[data-testid='company-name']",
        ]),
        location: DomUtils.extractText([
          ".location",
          "[data-testid='location']",
        ]),
        salary: DomUtils.extractText([".salary", "[data-testid='salary']"]),
      };

      // Use the updated extraction method
      const fullDescription = this.extractJobDescriptionText();
      if (fullDescription) {
        jobDescription.fullDescription = fullDescription;
      }

      return jobDescription;
    } catch (error) {
      console.error("Error extracting job description:", error);
      return { title: document.title || "Job Position" };
    }
  }

  async trackApplication(jobDetails) {
    try {
      if (!this.userProfile) return;
      await this.applicationTracker.saveAppliedJob({
        ...jobDetails,
        userId: this.userProfile.userId,
        applicationPlatform: "ziprecruiter",
      });

      chrome.runtime
        .sendMessage({
          type: "NOTIFY_JOB_APPLIED",
          jobData: {
            ...jobDetails,
            platform: "ziprecruiter",
          },
          sessionId: this.sessionId,
        })
        .catch(() => {});
    } catch (error) {
      return false;
    }
  }

  // ========================================
  // TASK DATA MANAGEMENT
  // ========================================

  async requestSearchTaskData() {
    const success = this.safeSendPortMessage({ type: "GET_SEARCH_TASK" });
    if (!success) {
      throw new Error("Failed to request search task data");
    }
  }

  async requestApplicationTaskData() {
    const success = this.safeSendPortMessage({ type: "GET_APPLICATION_TASK" });
    if (!success) {
      throw new Error("Failed to request application task data");
    }
  }

  handleSearchTaskData(data) {
    try {
      if (!data) {
        return;
      }

      this.searchData = {
        limit: data.limit || 10,
        current: data.current || 0,
        submittedLinks: data.submittedLinks || [],
        searchLinkPattern: data.searchLinkPattern
          ? new RegExp(data.searchLinkPattern.replace(/^\/|\/[gimy]*$/g, ""))
          : this.getDefaultSearchPattern(),
      };

      if (data.profile && !this.userProfile) {
        this.userProfile = data.profile;
      }

      // Start processing after data is loaded
      setTimeout(() => this.startJobProcessing(), 1000);
    } catch (error) {
      this.handleError("Error processing search data", error);
    }
  }

  handleApplicationTaskData(data) {
    try {
      if (data?.profile && !this.userProfile) {
        this.userProfile = data.profile;
      }

      // Start application processing
      setTimeout(() => this.processCurrentApplication(), 1000);
    } catch (error) {
      this.handleError("Error processing application data", error);
    }
  }

  // ========================================
  // FORM DETECTION OBSERVER
  // ========================================

  /**
   * Detects if the current modal is a login/registration form based on a content fingerprint.
   * This replaces the previous upfront login check.
   * @returns {boolean} - True if the login form is detected, false otherwise.
   */
  /**
   * Detects and automatically skips the "Early Access" / "Candidate Spotlight" modal
   * @returns {boolean} - True if the modal was detected and handled, false otherwise
   */
  detectAndSkipEarlyAccessModal() {
    try {
      // Look for the modal with Early Access badge and "Get your application seen first" text
      const modal = document.querySelector(".apply_flow_screen");
      if (!modal || !this.isElementVisible(modal)) {
        return false;
      }

      // Check for specific fingerprints of the Early Access modal
      const hasEarlyAccessBadge = modal
        .querySelector(".bg-badge-brand p")
        ?.textContent?.includes("Early Access");
      const hasStandOutHeading = modal
        .querySelector("h2")
        ?.textContent?.includes("Get your application seen first");

      if (hasEarlyAccessBadge && hasStandOutHeading) {
        console.log(
          'Early Access modal detected - automatically clicking "Skip for Now"'
        );

        // Find and click the "Skip for Now" button
        const buttons = modal.querySelectorAll("button");
        for (const button of buttons) {
          const buttonText = button.textContent?.trim() || "";
          if (
            buttonText.includes("Skip for Now") ||
            buttonText.includes("Skip")
          ) {
            console.log('Clicking "Skip for Now" button');
            this.clickElement(button);
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.error("Error in detectAndSkipEarlyAccessModal:", error);
      return false;
    }
  }

  detectLoginForm() {
    const modal = this.querySelector(
      this.config.selectors.modalContainer.join(", ")
    );
    if (!modal) return false;

    // Fingerprint for the login form
    const fingerprints = [
      {
        type: "h2",
        text: "What email should the hiring manager reach you at?",
      },
      { type: "iframe", srcPart: "accounts.google.com/gsi/button" },
      { type: "input", inputType: "email" },
      { type: "button", testId: "reg-base-form-submit" },
    ];

    let matchCount = 0;

    for (const fp of fingerprints) {
      let element;
      if (fp.type === "h2") {
        element = modal.querySelector(fp.type);
        if (element && element.textContent.trim().includes(fp.text)) {
          matchCount++;
        }
      } else if (fp.type === "iframe") {
        element = modal.querySelector(`${fp.type}[src*="${fp.srcPart}"]`);
        if (element) {
          matchCount++;
        }
      } else if (fp.type === "input") {
        element = modal.querySelector(`${fp.type}[type="${fp.inputType}"]`);
        if (element) {
          matchCount++;
        }
      } else if (fp.type === "button") {
        element = modal.querySelector(`${fp.type}[data-testid="${fp.testId}"]`);
        if (element) {
          matchCount++;
        }
      }
    }

    // If we have a high confidence match (e.g., title + one other element), it's the login form.
    const isLoginForm = matchCount >= 2;

    if (isLoginForm) {
      console.log("Login form detected based on fingerprint.");
    }

    return isLoginForm;
  }

  setupFormDetectionObserver() {
    try {
      this.formObserver = new MutationObserver(async () => {
        if (this.detectAndSkipEarlyAccessModal()) {
          return;
        }

        if (this.state.isApplicationInProgress) {
          const hasForm = this.isFormModalVisible();

          if (hasForm && !this.state.formDetected) {
            if (this.detectLoginForm()) {
              this.showStatusMessage("LOGIN_REQUIRED");
              this.handleApplicationFailure();
              return;
            }

            if (!this.state.isApplicationInProgress) {
              this.state.isApplicationInProgress = true;
              this.state.applicationStartTime = Date.now();
            }

            this.state.formDetected = true;

            // Show form detection message
            this.showStatusMessage("COLLECTING_FIELDS");

            setTimeout(() => {
              this.processApplicationForm();
            }, 3000);
            return;
          }

          // Don't call handleApplicationSuccess from MutationObserver - it races with the main flow
          // Success will be detected by waitForApplicationCompletion or processApplicationForm
          if (this.checkApplicationSuccess()) {
            console.log(
              "✅ MutationObserver: Success detected, main flow will handle tracking"
            );
            return;
          }

          if (!this.state.formDetected && this.state.applicationStartTime) {
            const waitTime = Date.now() - this.state.applicationStartTime;

            if (waitTime > 3000) {
              const instantSuccess = await this.checkForInstantSuccess();

              // Don't track here - let the main flow handle it
              if (instantSuccess) {
                console.log(
                  "✅ MutationObserver: Instant success detected, main flow will handle tracking"
                );
                return;
              }

              // After 6 seconds, check for "already applied" status (only if no modal)
              if (waitTime > 6000 && !this.isFormModalVisible()) {
                const alreadyApplied = await this.checkAlreadyApplied();

                if (alreadyApplied) {
                  this.handleAlreadyApplied();
                  return;
                }
              }
            }
          }
        }
      });

      this.formObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "disabled", "aria-label"],
      });
    } catch (error) {
      return false;
    }
  }

  async checkForInstantSuccess() {
    try {
      // Method 1: Check for "Applied" button
      const appliedSelectors = [
        'button[aria-label*="Applied"]',
        'button:contains("Applied")',
        '.apply-button:contains("Applied")',
      ];

      for (const selector of appliedSelectors) {
        let element;
        if (selector.includes(":contains")) {
          // Handle :contains selector manually
          const buttons = document.querySelectorAll("button");
          element = Array.from(buttons).find((btn) =>
            (btn.textContent || btn.innerText || "").includes("Applied")
          );
        } else {
          element = document.querySelector(selector);
        }

        if (element && this.isElementVisible(element)) {
          return true;
        }
      }

      // Method 2: Check for success messages in page content
      const pageText = document.body.innerText?.toLowerCase() || "";
      const successPhrases = [
        "application submitted",
        "successfully applied",
        "thank you for applying",
        "application complete",
        "application received",
        "your application has been submitted",
      ];

      if (successPhrases.some((phrase) => pageText.includes(phrase))) {
        return true;
      }

      // Method 3: Check URL for success indicators
      const url = window.location.href.toLowerCase();
      if (
        url.includes("success") ||
        url.includes("confirmation") ||
        url.includes("applied")
      ) {
        return true;
      }

      // Method 4: Check for success elements
      const successSelectors = [
        ".application-success",
        ".success-message",
        ".confirmation",
        '[data-testid*="success"]',
        '[class*="success"]',
      ];

      for (const selector of successSelectors) {
        const element = document.querySelector(selector);
        if (element && this.isElementVisible(element)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  isOnApplicationPage() {
    const url = window.location.href;
    return (
      this.config.urlPatterns.applyPage.test(url) ||
      this.config.urlPatterns.jobPage.test(url)
    );
  }

  // ========================================
  // HEALTH MONITORING
  // ========================================

  performHealthCheck() {
    try {
      // Check for stuck applications
      if (
        this.state.isApplicationInProgress &&
        this.state.applicationStartTime
      ) {
        const applicationTime = Date.now() - this.state.applicationStartTime;

        if (applicationTime > this.config.timeouts.applicationTimeout) {
          this.handleApplicationTimeout();
        }
      }

      // Check for inactive automation
      if (this.state.isRunning) {
        const inactiveTime = Date.now() - this.state.lastActivity;

        if (inactiveTime > 120000) {
          // 2 minutes
          this.recoverFromInactivity();
        }
      }
    } catch (error) {
      return false;
    }
  }

  recoverFromInactivity() {
    if (this.state.isApplicationInProgress) {
      this.completeCurrentApplication();
    }

    this.state.lastActivity = Date.now();

    if (
      this.state.currentPhase === "searching" &&
      !this.state.isProcessingQueue
    ) {
      this.processJobQueue();
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  resetJobProcessingState() {
    this.state.currentJobIndex = 0;
    this.state.processedCount = 0;
    this.state.lastActivity = Date.now();
    this.state.currentJobDetails = null;
    this.state.lastClickedJobCard = null;
  }

  querySelector(selector) {
    const element = document.querySelector(selector);
    return element && this.isElementVisible(element) ? element : null;
  }

  findElementByIndicator(indicator) {
    if (indicator.includes(":contains")) {
      const text = indicator.match(/contains\("(.+)"\)/)?.[1];
      if (text) {
        const elements = document.querySelectorAll("*");
        return Array.from(elements).find(
          (el) => el.textContent?.includes(text) && this.isElementVisible(el)
        );
      }
    }
    return this.querySelector(indicator);
  }

  isElementVisible(element) {
    if (!element) return false;

    try {
      const style = window.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    } catch (error) {
      return false;
    }
  }

  getSearchLinkPattern() {
    return /^https:\/\/(www\.)?ziprecruiter\.com\/(job|Job|partner|apply).*$/;
  }

  async waitForPageLoad() {
    if (document.readyState !== "complete") {
      await new Promise((resolve) => {
        if (document.readyState === "complete") {
          resolve();
        } else {
          window.addEventListener("load", resolve, { once: true });
        }
      });
    }
    await this.delay(1000);
  }

  async waitForValidPage(timeout = 30000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const pageType = this.detectPageType();

      if (pageType !== "unknown") {
        await this.initializePage();
        return;
      }

      await this.delay(1000);
    }

    throw new Error("Timeout waiting for valid page");
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ========================================
  // MESSAGE HANDLING
  // ========================================

  handlePortMessage(message) {
    try {
      const { type, data } = message || {};
      if (!type) return;

      switch (type) {
        case "CONNECTION_ESTABLISHED":
          break;

        case "SEARCH_TASK_DATA":
          this.handleSearchTaskData(data);
          break;

        case "APPLICATION_TASK_DATA":
          this.handleApplicationTaskData(data);
          break;

        case "SUCCESS":
          this.handleSuccessMessage(data);
          break;

        case "ERROR":
          this.handleErrorMessage(data);
          break;

        case "KEEPALIVE_RESPONSE":
          break;

        case "DUPLICATE":
          this.completeCurrentApplication();
          break;

        case "SEARCH_NEXT":
          this.handleSearchNext(data);
          break;

        default:
          break;
      }
    } catch (error) {
      return false;
    }
  }

  handleSuccessMessage(data) {
    if (data?.submittedLinks !== undefined) {
      this.handleSearchTaskData(data);
    } else if (data?.profile !== undefined && !this.userProfile) {
      this.handleApplicationTaskData(data);
    }
  }

  handleErrorMessage(data) {
    return false;
  }

  handleSearchNext(data) {
    if (data) {
      if (data.submittedLinks) {
        this.searchData.submittedLinks = data.submittedLinks;
      }

      if (data.current !== undefined) {
        this.searchData.current = data.current;
      }
    }

    if (!this.state.isApplicationInProgress && !this.state.isProcessingQueue) {
      setTimeout(() => this.processJobQueue(), 1000);
    }
  }

  // ========================================
  // ERROR HANDLING
  // ========================================

  handleError(message, error) {
    this.reportError(error, { action: message });
  }

  // ========================================
  // SESSION MANAGEMENT
  // ========================================

  async setSessionContext(sessionContext) {
    try {
      // Standalone version - no parent class to call

      this.sessionContext = sessionContext;

      // Set basic properties
      if (sessionContext.sessionId) this.sessionId = sessionContext.sessionId;
      if (sessionContext.platform) this.platform = sessionContext.platform;
      if (sessionContext.userId) this.userId = sessionContext.userId;
      if (sessionContext.apiHost) this.sessionApiHost = sessionContext.apiHost;

      // Set user profile
      if (sessionContext.userProfile) {
        this.userProfile = this.userProfile
          ? { ...this.userProfile, ...sessionContext.userProfile }
          : sessionContext.userProfile;
      }

      // Initialize API hosts and services
      this.aiApiHost =
        this.getInjectedAiApiHost() ||
        this.config.aiApiHost ||
        sessionContext.aiApiHost ||
        sessionContext.sessionConfig?.aiApiHost;
      this.backendApiHost =
        this.getInjectedBackendApiHost() ||
        this.config.backendApiHost ||
        sessionContext.backendApiHost ||
        sessionContext.sessionConfig?.backendApiHost;

      // Initialize ApplicationTrackerService
      if (!this.applicationTracker) {
        this.applicationTracker = new ApplicationTrackerService({
          backendApiHost: this.backendApiHost,
          userId: this.config.userId || sessionContext.userId,
          jobProfileId: this.sessionContext.userProfile?.id,
          jwtToken: this.getJwtToken(),
        });
      }

      // Initialize AIService
      if (!this.aiService) {
        this.aiService = new AIService({
          aiApiHost: this.aiApiHost,
          platform: this.platform,
        });
      }

      // Update form handler if it exists
      if (this.formHandler && this.userProfile) {
        this.formHandler.userData = this.userProfile;
      }

      // Copy preferences to config for easy access
      if (sessionContext.preferences) {
        this.config.preferences = sessionContext.preferences;
        console.log("✅ Preferences loaded:", this.config.preferences);
      }

      // Load co-pilot mode preference from session context
      if (sessionContext.preferences?.hasOwnProperty("copilotMode")) {
        if (sessionContext.preferences.copilotMode === true) {
          this.copilotState.switchToCoPilot();
          if (true) {
            // Global overlay
            updateStatusButtons("co-pilot-search");
          }
        } else {
          this.copilotState.switchToAutoPilot();
          if (true) {
            // Global overlay
            updateStatusButtons("auto-pilot");
          }
        }
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle initialization automation message - called when START_AUTOMATION_NOW is received
   * Following the simplyhired.js pattern for proper session initialization
   */
  async handleInitializeAutomation(message) {
    try {
      // Prevent multiple initialization calls
      if (this.state.isRunning) {
        console.log(
          "🔄 Automation already running, ignoring duplicate initialization"
        );
        return;
      }

      if (message.sessionContext) {
        await this.setSessionContext(message.sessionContext);
        this.sessionId = message.sessionContext.sessionId;
      }

      if (message.sessionId) {
        this.sessionId = message.sessionId;
      }

      if (message.config) {
        this.config = { ...this.config, ...message.config };
      }

      // Extract API hosts from the correct nested path (like simplyhired.js)
      this.sessionApiHost =
        this.sessionContext?.sessionConfig?.backendApiHost ||
        this.sessionContext?.backendApiHost ||
        this.sessionContext?.apiHost;
      this.sessionAiApiHost =
        this.sessionContext?.sessionConfig?.aiApiHost ||
        this.sessionContext?.aiApiHost;

      // Initialize AIService
      if (!this.aiService) {
        this.aiService = new AIService({
          aiApiHost: this.getAiApiHost(),
          platform: this.platform,
        });
      }

      // Initialize FormHandler
      if (!this.formHandler) {
        await this.initializeFormHandler();
      }

      await this.start();
    } catch (error) {
      console.error("❌ Error initializing automation:", error);
    }
  }

  // ========================================
  // PLATFORM-SPECIFIC UTILITIES
  // ========================================

  getPlatformDomains() {
    return ["https://www.ziprecruiter.com"];
  }

  getDefaultSearchPattern() {
    return /^https:\/\/(www\.)?ziprecruiter\.com\/(job|jobs|apply).*$/;
  }

  getApiHost() {
    return (
      this.sessionApiHost ||
      this.sessionContext?.sessionConfig?.backendApiHost ||
      this.sessionContext?.backendApiHost ||
      this.sessionContext?.apiHost ||
      this.config.sessionContext?.backendApiHost ||
      this.config.sessionContext?.apiHost ||
      this.config.backendApiHost ||
      this.config.apiHost
    );
  }

  getAiApiHost() {
    return (
      this.sessionAiApiHost ||
      this.sessionContext?.sessionConfig?.aiApiHost ||
      this.sessionContext?.aiApiHost ||
      this.config.sessionContext?.aiApiHost ||
      this.config.aiApiHost
    );
  }

  platformSpecificUrlNormalization(url) {
    return url
      .replace(/[?&](utm_|source=|campaign=)[^&]*/g, "")
      .replace(/[?&]+$/, "");
  }

  // ========================================
  // CO-PILOT ACTION HANDLING
  // ========================================

  /**
   * Handle co-pilot button actions from status overlay
   */
  handleCoPilotAction(data) {
    try {
      const { action } = data || {};
      if (!action) return;

      console.log("🎮 Co-pilot action received:", action);

      switch (action) {
        case COPILOT_ACTIONS.SWITCH_TO_COPILOT:
          this.copilotState.switchToCoPilot();

          if (this.formHandler) {
            this.formHandler.copilotMode = true;
          }

          if (true) {
            // Global overlay
            notifyStatus({
              type: "MODE_SWITCHED",
              data: { mode: "co-pilot" },
            });
            updateStatusButtons("co-pilot-search");
          }
          break;

        case COPILOT_ACTIONS.SWITCH_TO_AUTOPILOT:
          this.copilotState.switchToAutoPilot();

          if (this.formHandler) {
            this.formHandler.copilotMode = false;
          }

          if (true) {
            // Global overlay
            notifyStatus({
              type: "MODE_SWITCHED",
              data: { mode: "auto-pilot" },
            });
            updateStatusButtons("auto-pilot");
          }
          break;

        case COPILOT_ACTIONS.SUBMIT:
        case "NEXT":
          if (this.formHandler) {
            this.formHandler.resolveUserAction(
              action === "NEXT" ? "NEXT" : "SUBMIT"
            );
          }
          break;

        case COPILOT_ACTIONS.TAKE_CONTROL:
          console.log("✋ User taking manual control");
          this.copilotState.takeManualControl();
          if (this.formHandler) {
            this.formHandler.userHasControl = true;
          }
          if (true) {
            // Global overlay
            notifyStatus({
              type: "COPILOT_USER_HAS_CONTROL",
              data: { title: this.formHandler?.currentJobTitle || "this job" },
            });
            updateStatusButtons("user-control");
          }
          break;

        case COPILOT_ACTIONS.LET_AI_CONTINUE:
          console.log("🤖 User returning control to AI");
          this.copilotState.letAIContinue();
          if (this.formHandler) {
            this.formHandler.userHasControl = false;
            this.formHandler.resolveUserAction("LET_AI_CONTINUE");
          }
          if (true) {
            // Global overlay
            notifyStatus({
              type: "AI_RESUMED_CONTROL",
              data: { title: this.formHandler?.currentJobTitle || "this job" },
            });
            updateStatusButtons("co-pilot-filling");
          }
          break;

        case COPILOT_ACTIONS.SKIP:
          if (this.formHandler) {
            this.formHandler.resolveUserAction("SKIP");
          }

          if (true) {
            // Global overlay
            notifyStatus({
              type: "JOB_SKIPPED",
              data: { title: this.formHandler?.currentJobTitle || "this job" },
            });
          }

          this.safeSendPortMessage({
            type: "APPLICATION_SKIPPED",
            data: {
              url: window.location.href,
              reason: "User clicked skip button",
              skipReason: "user_skip",
              jobTitle: this.formHandler?.currentJobTitle || "Unknown job",
            },
          });

          this.completeCurrentApplication();
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
          this.processJobQueue();
          if (true) {
            // Global overlay
            notifyStatus({ type: "AUTOMATION_RESUMED" });
          }
          break;

        default:
          console.warn("Unknown co-pilot action:", action);
      }
    } catch (error) {
      console.error("Error in handleCoPilotAction:", error);
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

  // ========================================
  // CLEANUP
  // ========================================

  cleanup() {
    // Clear timers
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Disconnect observers
    if (this.formObserver) {
      this.formObserver.disconnect();
      this.formObserver = null;
    }

    // Cleanup status overlay
    if (true) {
      // Global overlay
      // Global overlay - cleanup handled automatically
      // Global overlay - no local instance needed
    }

    // Clear references
    this.formHandler = null;
    this.cachedJobDescription = null;

    // Reset state
    if (this.state.processedJobIds) {
      this.state.processedJobIds.clear();
    }
    this.resetJobProcessingState();

    // Cleanup complete (standalone version, no parent class)
  }

  // ========================================
  // LOGGING
  // ========================================

  log(message, data = {}) {
    const contextInfo = {
      platform: this.platform,
      sessionId: this.sessionId?.slice(-6),
      phase: this.state.currentPhase,
      isRunning: this.state.isRunning,
      isApplicationInProgress: this.state.isApplicationInProgress,
      processedCount: this.state.processedCount,
    };
  }

  // ========================================
  // METHODS FROM BASEPLATFORM
  // ========================================

  // Note: Constructor fields are merged into the main constructor above
  // The following are utility methods from BasePlatform:
  // (initialize, start, findJobs, applyToJob are implemented above)

  handlePortMessage(message) {
    const { type, data } = message || {};

    switch (type) {
      case "CONNECTION_ESTABLISHED":
        break;

      case "KEEPALIVE_RESPONSE":
        // Acknowledge keepalive
        break;

      default:
        break;
    }
  }

  // Common utility methods
  async pause() {
    this.isPaused = true;
  }

  async resume() {
    this.isPaused = false;
  }

  async stop() {
    this.isRunning = false;
    this.isPaused = false;
  }

  // Progress reporting
  updateProgress(updates) {
    this.progress = { ...this.progress, ...updates };

    if (this.onProgress) {
      this.onProgress(this.progress);
    }

    // Notify content script
    this.notifyContentScript("progress", this.progress);
  }

  reportError(error, context = {}) {
    const errorInfo = {
      message: error.message || error,
      context,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      platform: this.platform,
    };
    if (this.onError) {
      this.onError(errorInfo);
    }

    // Notify content script
    this.notifyContentScript("error", errorInfo);
  }

  reportComplete() {
    this.isRunning = false;
    if (this.onComplete) {
      this.onComplete();
    }

    // Notify content script
    this.notifyContentScript("complete", {
      sessionId: this.sessionId,
      progress: this.progress,
    });
  }

  reportApplicationSubmitted(jobData, applicationData) {
    this.progress.completed++;
    this.updateProgress({
      completed: this.progress.completed,
      current: null,
    });

    if (this.onApplicationSubmitted) {
      this.onApplicationSubmitted(jobData, applicationData);
    }

    // Notify content script
    this.notifyContentScript("applicationSubmitted", {
      jobData,
      applicationData,
      sessionId: this.sessionId,
    });
  }

  // Basic DOM utility methods (generic only)
  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Communication with content script and background
  async notifyContentScript(type, data) {
    if (this.contentScript && this.contentScript.sendMessageToBackground) {
      try {
        await this.contentScript.sendMessageToBackground({
          action: "platformNotification",
          type,
          data,
          sessionId: this.sessionId,
          platform: this.platform,
        });
      } catch (error) {
        console.error("Error notifying content script:", error);
      }
    }
  }

  // Utility methods
  log(message, data = {}) {
    const logEntry = `🤖 [${this.platform}-${this.sessionId?.slice(
      -6
    )}] ${message}`;
    this.logger.info(logEntry, data);
  }

  getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Standardized method for getting AI answers with field analysis
   */
  async getAIAnswer(
    question,
    options = [],
    fieldElement = null,
    additionalContext = {}
  ) {
    const context = {
      platform: this.platform,
      userData: this.userData || this.userProfile,
      jobDescription:
        this.jobDescription || this.scrapeJobDescription?.() || "",
      fieldElement,
      ...additionalContext,
    };

    return await this.aiService.getAnswer(question, options, context);
  }

  /**
   * Helper method to scrape job description (override in platforms)
   */
  scrapeJobDescription() {
    // Default implementation - override in specific platforms
    return "";
  }

  cleanup() {
    this.isRunning = false;
    this.isPaused = false;
  }

  // ========================================
  // METHODS FROM BASEPLATFORMAUTOMATION
  // ========================================

  // Note: Constructor fields are merged into the main constructor above
  // The following are utility methods from BasePlatformAutomation:

  /**
   * Get userProfile from injected automation context
   * @returns {Object|null} userProfile from window or sessionStorage
   */
  getInjectedUserProfile() {
    try {
      // Check consolidated context first
      if (window.automationContext?.userProfile) {
        return window.automationContext.userProfile;
      }

      // Fallback to legacy window property
      if (typeof window !== "undefined" && window.automationUserProfile) {
        return window.automationUserProfile;
      }

      // Check consolidated storage
      if (typeof sessionStorage !== "undefined") {
        const storedContext = sessionStorage.getItem("automationContext");
        if (storedContext) {
          const context = JSON.parse(storedContext);
          if (context.userProfile) return context.userProfile;
        }

        // Fallback to legacy storage
        const stored = sessionStorage.getItem("automationUserProfile");
        if (stored) {
          return JSON.parse(stored);
        }
      }

      return null;
    } catch (error) {
      console.warn("Error reading injected userProfile:", error);
      return null;
    }
  }

  /**
   * Get AI API host from injected automation context
   * @returns {string|null} aiApiHost from window or sessionStorage
   */
  getInjectedAiApiHost() {
    try {
      if (typeof window !== "undefined" && window.automationAiApiHost) {
        return window.automationAiApiHost;
      }
      if (typeof sessionStorage !== "undefined") {
        const stored = sessionStorage.getItem("automationAiApiHost");
        if (stored) {
          return stored;
        }
      }
      return null;
    } catch (error) {
      console.warn("Error reading injected aiApiHost:", error);
      return null;
    }
  }

  /**
   * Get Backend API host from injected automation context
   * @returns {string|null} backendApiHost from window or sessionStorage
   */
  getInjectedBackendApiHost() {
    try {
      if (typeof window !== "undefined" && window.automationBackendApiHost) {
        return window.automationBackendApiHost;
      }
      if (typeof sessionStorage !== "undefined") {
        const stored = sessionStorage.getItem("automationBackendApiHost");
        if (stored) {
          return stored;
        }
      }
      return null;
    } catch (error) {
      console.warn("Error reading injected backendApiHost:", error);
      return null;
    }
  }

  /**
   * @deprecated Use getInjectedAiApiHost() or getInjectedBackendApiHost() instead
   */
  getInjectedApiHost() {
    return this.getInjectedAiApiHost();
  }

  /**
   * Get userId from userProfile
   * @returns {string|null} userId from userProfile
   */
  getUserId() {
    return this.userProfile?.userId || null;
  }

  /**
   * Get jwtToken from injected automation context
   * @returns {string|null} jwtToken from window or sessionStorage
   */
  getJwtToken() {
    try {
      // First try window.automationJwtToken (direct injection)
      if (typeof window !== "undefined" && window.automationJwtToken) {
        return window.automationJwtToken;
      }

      // Fallback to sessionStorage (persistent across page loads)
      if (typeof sessionStorage !== "undefined") {
        const stored = sessionStorage.getItem("automationJwtToken");
        if (stored) {
          return stored;
        }
      }

      // Also check sessionConfig
      if (this.sessionContext?.jwtToken) {
        return this.sessionContext.jwtToken;
      }

      if (this.sessionContext?.sessionConfig?.jwtToken) {
        return this.sessionContext.sessionConfig.jwtToken;
      }

      return null;
    } catch (error) {
      console.warn("Error reading injected jwtToken:", error);
      return null;
    }
  }

  // Note: getPlatformDomains(), getSearchLinkPattern(), isValidJobPage(), getApiHost()
  // are already implemented earlier in this file (around line 3060-3085)

  /**
   * Initialize platform automation with enhanced chatbot
   */
  async initialize() {
    console.log("🚀 Initializing platform automation");

    // Context is already available from constructor (passed by content-bridge)
    // Sync from window.automationContext as a fallback if not already set
    if (!this.sessionContext && window.automationContext) {
      this.sessionContext = window.automationContext;
      this.hasSessionContext = true;
      // Also sync userProfile if not already set
      if (!this.userProfile && this.sessionContext.userProfile) {
        this.userProfile = this.sessionContext.userProfile;
      }
    }

    // Set up communication and monitoring
    this.initializePortConnection();
    this.startHealthCheck();
    this.startStateVerification();

    // Set up message listeners for control actions (co-pilot/auto-pilot buttons)
    this.setupMessageListener();
  }

  /**
   * Wait for automation context to be available
   */
  async waitForContext(timeout = 5000) {
    return new Promise((resolve) => {
      // 1. Check if context is already available
      if (window.automationContext) {
        this.sessionContext = window.automationContext;
        this.hasSessionContext = true;
        resolve(this.sessionContext);
        return;
      }

      // 2. Check sessionStorage
      try {
        const stored = sessionStorage.getItem("automationContext");
        if (stored) {
          this.sessionContext = JSON.parse(stored);
          this.hasSessionContext = true;
          window.automationContext = this.sessionContext; // Sync back to window
          resolve(this.sessionContext);
          return;
        }
      } catch (e) {
        console.warn("Error reading context from sessionStorage:", e);
      }

      // 3. Wait for event
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.warn("Timeout waiting for automation context");
        resolve(null); // Resolve with null on timeout
      }, timeout);

      window.addEventListener(
        "AUTOMATION_CONTEXT_READY",
        (event) => {
          clearTimeout(timeoutId);
          this.sessionContext = event.detail;
          this.hasSessionContext = true;
          resolve(this.sessionContext);
        },
        { once: true, signal: controller.signal }
      );
    });
  }

  /**
   * Pause automation functionality
   */
  async pauseAutomation() {
    this.isRunning = false;
    this.isPaused = true;

    // Clear any pending timeouts
    if (this.sendCvPageNotRespondTimeout) {
      clearTimeout(this.sendCvPageNotRespondTimeout);
      this.sendCvPageNotRespondTimeout = null;
    }

    // Notify background script
    this.safeSendPortMessage({
      type: "AUTOMATION_PAUSED",
      sessionId: this.sessionId,
    });
  }

  /**
   * Resume automation functionality
   */
  async resumeAutomation() {
    this.isRunning = true;
    this.isPaused = false;

    console.log("▶️ Automation resumed by user");

    // Notify background script
    this.safeSendPortMessage({
      type: "AUTOMATION_RESUMED",
      sessionId: this.sessionId,
    });

    // Continue with search after a brief delay
    setTimeout(() => {
      if (!this.state.isApplicationInProgress) {
        this.searchNext();
      }
    }, 1000);
  }

  /**
   * Stop automation functionality
   */
  async stopAutomation() {
    this.isRunning = false;
    this.isPaused = false;

    // Clear all timeouts
    if (this.sendCvPageNotRespondTimeout) {
      clearTimeout(this.sendCvPageNotRespondTimeout);
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }
    if (this.stateVerificationInterval) {
      clearInterval(this.stateVerificationInterval);
    }

    console.log("⏹️ Automation stopped by user");

    // Notify background script
    this.safeSendPortMessage({
      type: "AUTOMATION_STOPPED",
      reason: "user_requested",
      sessionId: this.sessionId,
    });
  }

  /**
   * Common port connection initialization
   */
  initializePortConnection() {
    try {
      // Disconnect existing port if any
      if (this.port) {
        try {
          this.port.disconnect();
        } catch (e) {
          // Ignore errors when disconnecting
        }
      }

      // Determine port name based on page type and session
      const isApplyPage = this.isApplicationPage(window.location.href);
      const sessionSuffix = this.sessionId
        ? `-${this.sessionId.slice(-6)}`
        : "";
      const timestamp = Date.now();
      const portName = isApplyPage
        ? `${this.platform}-apply-${timestamp}${sessionSuffix}`
        : `${this.platform}-search-${timestamp}${sessionSuffix}`;

      console.log(`🔌 Creating connection with port name: ${portName}`);

      // Create the connection
      this.port = chrome.runtime.connect({ name: portName });

      if (!this.port) {
        throw new Error(
          "Failed to establish connection with background script"
        );
      }

      // Set up message handler
      this.port.onMessage.addListener((message) => {
        this.handlePortMessage(message);
      });

      // Handle port disconnection
      this.port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        if (error) {
          console.log("❌ Port disconnected due to error:", error);
        } else {
          console.log("🔌 Port disconnected");
        }

        this.port = null;

        // Attempt to reconnect
        if (this.connectionRetries < this.maxRetries) {
          this.connectionRetries++;
          console.log(
            `🔄 Attempting to reconnect (${this.connectionRetries}/${this.maxRetries})...`
          );
          setTimeout(() => this.initializePortConnection(), 5000);
        }
      });

      // Start keep-alive interval
      this.startKeepAliveInterval();

      this.connectionRetries = 0;
      console.log("✅ Port connection established successfully");
    } catch (error) {
      console.log("❌ Error initializing port connection:", error);
      if (this.connectionRetries < this.maxRetries) {
        this.connectionRetries++;
        setTimeout(() => this.initializePortConnection(), 5000);
      }
    }
  }

  /**
   * Abstract method to determine if current page is an application page
   */
  isApplicationPage(url) {
    // Default implementation - platforms can override
    return url.includes("/apply") || url.includes("/application");
  }

  /**
   * Start keep-alive interval
   */
  startKeepAliveInterval() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    this.keepAliveInterval = setInterval(() => {
      try {
        if (this.port) {
          this.safeSendPortMessage({ type: "KEEPALIVE" });
        } else {
          console.log(
            "🔄 Port is null during keepalive, attempting to reconnect"
          );
          this.initializePortConnection();
        }
      } catch (error) {
        console.log("❌ Error sending keepalive, reconnecting:", error);
        this.initializePortConnection();
      }
    }, 25000);
  }

  /**
   * Start health monitoring
   */
  startHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => this.checkHealth(), 60000);
  }

  /**
   * Start state verification
   * Note: This method is kept for backward compatibility but no longer performs
   * periodic verification since we now check application eligibility upfront
   * with checkCanApply(). The health check still monitors for stuck applications.
   */
  startStateVerification() {
    if (this.stateVerificationInterval) {
      clearInterval(this.stateVerificationInterval);
    }
    // No longer needed - verification is done upfront before starting application
  }

  /**
   * Health check for stuck applications
   */
  checkHealth() {
    try {
      const now = Date.now();

      // Check for stuck application
      if (
        this.state.isApplicationInProgress &&
        this.state.applicationStartTime
      ) {
        const applicationTime =
          now - this.state.applicationStartTime;

        if (applicationTime > 5 * 60 * 1000) {
          console.log("🚨 Application stuck for over 5 minutes, forcing reset");
          this.state.isApplicationInProgress = false;
          this.state.applicationStartTime = null;
          setTimeout(() => this.searchNext(), 1000);
        }
      }
    } catch (error) {
      console.log("❌ Health check error", error);
    }
  }

  /**
   * Safe port message sending
   */
  safeSendPortMessage(message) {
    try {
      if (!this.port) {
        console.log("⚠️ Port not available, attempting to reconnect");
        this.initializePortConnection();
        return false;
      }

      this.port.postMessage(message);
      return true;
    } catch (error) {
      console.log("❌ Error sending port message:", error);
      this.initializePortConnection();
      return false;
    }
  }

  /**
   * Enhanced port message handling with platform-specific delegation
   */
  handlePortMessage(message) {
    try {
      console.log("📨 Received port message:", message);

      const { type, data } = message || {};
      if (!type) {
        console.log("⚠️ Received message without type, ignoring");
        return;
      }

      // Common message types handled by base class
      switch (type) {
        case "CONNECTION_ESTABLISHED":
          this.handleConnectionEstablished(data);
          break;

        case "APPLICATION_STATUS":
          this.handleApplicationStatus(data);
          break;

        case "SEARCH_NEXT":
          this.handleSearchNext(data);
          break;

        case "DUPLICATE":
          this.handleDuplicateJob(data);
          break;

        case "ERROR":
          this.handleErrorMessage(message);
          break;

        case "KEEPALIVE_RESPONSE":
          // Just acknowledge keepalive
          break;

        default:
          // All other messages go to platform-specific handler
          this.handlePlatformSpecificMessage(type, data);
      }
    } catch (error) {
      console.log("❌ Error handling port message:", error);
    }
  }

  /**
   * Handle connection established message
   */
  handleConnectionEstablished(data) {
    console.log("📡 Connection established with background script");
  }

  /**
   * Handle application status message
   */
  handleApplicationStatus(data) {
    console.log("📊 Application status update:", data);

    if (data.inProgress && !this.state.isApplicationInProgress) {
      this.state.isApplicationInProgress = true;
      this.state.applicationStartTime = Date.now();
    } else if (
      !data.inProgress &&
      this.state.isApplicationInProgress
    ) {
      this.state.isApplicationInProgress = false;
      this.state.applicationStartTime = null;
      // Continue to next job after status update
      setTimeout(() => this.searchNext(), 1000);
    }
  }

  /**
   * Handle application starting message
   */
  handleApplicationStarting(data) {
    console.log("🚀 Application starting:", data);

    // Mark application as in progress
    this.state.isApplicationInProgress = true;
    this.state.applicationStartTime = Date.now();
    this.state.applicationUrl = data?.url;
  }

  /**
   * Abstract method for platform-specific message handling
   */
  handlePlatformSpecificMessage(type, data) {
    console.log(`❓ Unhandled message type: ${type}`);
  }

  /**
   * Common search next handling
   */
  handleSearchNext(data) {
    console.log("🔄 Received search next notification", data);

    // Clear timeout first
    if (this.sendCvPageNotRespondTimeout) {
      clearTimeout(this.sendCvPageNotRespondTimeout);
      this.sendCvPageNotRespondTimeout = null;
    }

    // Reset application state
    this.state.isApplicationInProgress = false;
    this.state.applicationStartTime = null;
    this.state.processedLinksCount++;

    // Notify background we're ready for next job
    this.safeSendPortMessage({ type: "SEARCH_NEXT_READY" });

    if (!data || !data.url) {
      console.log("No URL data in handleSearchNext");
      setTimeout(() => this.searchNext(), 2500);
      return;
    }

    this.updateLinkStatus(data);
    this.recordSubmission(data);
    setTimeout(() => this.searchNext(), 2500);
  }

  /**
   * Enhanced update visual link status with better user feedback
   */
  updateLinkStatus(data) {
    const normalizedUrl = this.normalizeUrlFully(data.url);
    const links = this.findAllLinksElements();

    for (let i = 0; i < links.length; i++) {
      const linkUrl = this.normalizeUrlFully(links[i].href);

      if (this.urlsMatch(linkUrl, normalizedUrl)) {
        if (data.status === "SUCCESS") {
          this.markLinkAsColor(links[i], "orange", "Completed");
        } else if (data.status === "ERROR") {
          this.markLinkAsColor(links[i], "red", "Error");
        } else {
          this.markLinkAsColor(links[i], "orange", "Skipped");
        }
        break;
      }
    }
  }

  /**
   * Record submission in search data
   */
  recordSubmission(data) {
    const normalizedUrl = this.normalizeUrlFully(data.url);

    if (
      !this.searchData.submittedLinks.some((link) => {
        const linkUrl = this.normalizeUrlFully(link.url);
        return this.urlsMatch(linkUrl, normalizedUrl);
      })
    ) {
      this.searchData.submittedLinks.push({ ...data });
    }
  }

  /**
   * Enhanced duplicate job handling
   */
  handleDuplicateJob(data) {
    console.log("⚠️ Duplicate job detected, resetting application state");
    this.state.isApplicationInProgress = false;
    this.state.applicationStartTime = null;

    setTimeout(() => this.searchNext(), 1000);
  }

  /**
   * Enhanced error message handling with user-friendly messages
   */
  handleErrorMessage(errorMessage) {
    const actualMessage =
      errorMessage?.message ||
      errorMessage?.data?.message ||
      "Unknown error from background script";

    console.log("❌ Error from background script:", actualMessage);

    // Reset application state to allow retrying
    this.resetApplicationStateOnError();

    // Auto-recover after showing error
    setTimeout(() => {
      if (!this.isPaused) {
        this.searchNext();
      }
    }, 3000);
  }

  /**
   * Enhanced search logic with action previews and pause support
   */
  async searchNext() {
    try {
      // Check if automation is paused
      if (this.isPaused) {
        console.log("Automation is paused, not searching");
        return;
      }

      console.log("Executing searchNext");

      // Critical: If an application is in progress, do not continue
      if (this.state.isApplicationInProgress) {
        console.log("Application in progress, not searching for next link");
        this.safeSendPortMessage({ type: "CHECK_APPLICATION_STATUS" });
        return;
      }

      // Find all matching links
      let links = this.findAllLinksElements();
      console.log(`Found ${links.length} links`);

      // Process links
      const unprocessedLink = this.findUnprocessedLink(links);

      if (unprocessedLink) {
        await this.processJobLink(unprocessedLink);
      } else {
        await this.handleNoUnprocessedLinks();
      }
    } catch (err) {
      console.log("Error in searchNext:", err);
      this.resetApplicationStateOnError();
      setTimeout(() => {
        if (!this.isPaused) {
          this.searchNext();
        }
      }, 5000);
    }
  }

  /**
   * Find unprocessed link from the list
   */
  findUnprocessedLink(links) {
    for (let i = 0; i < links.length; i++) {
      const url = this.normalizeUrlFully(links[i].href);

      // Check if already processed
      if (this.isLinkProcessed(url)) {
        this.markProcessedLink(links[i]);
        continue;
      }

      // Check if matches pattern
      if (!this.matchesSearchPattern(url)) {
        this.markInvalidLink(links[i], url);
        continue;
      }

      // Found valid unprocessed link
      return { link: links[i], url };
    }

    return null;
  }

  /**
   * Check if link is already processed
   */
  isLinkProcessed(url) {
    const alreadyProcessed = this.searchData.submittedLinks.some((link) => {
      if (!link.url) return false;
      const normalizedLinkUrl = this.normalizeUrlFully(link.url);
      return this.urlsMatch(normalizedLinkUrl, url);
    });

    const inLocalCache =
      this.state.processedUrls &&
      this.state.processedUrls.has(url);

    return alreadyProcessed || inLocalCache;
  }

  /**
   * Check if URL matches search pattern
   */
  matchesSearchPattern(url) {
    if (!this.searchData.searchLinkPattern) return true;

    const pattern =
      typeof this.searchData.searchLinkPattern === "string"
        ? new RegExp(
            this.searchData.searchLinkPattern.replace(/^\/|\/[gimy]*$/g, "")
          )
        : this.searchData.searchLinkPattern;

    return pattern.test(url);
  }

  /**
   * Mark link as already processed
   */
  markProcessedLink(linkElement) {
    this.markLinkAsColor(linkElement, "orange", "Completed");
  }

  /**
   * Mark link as invalid
   */
  markInvalidLink(linkElement, url) {
    this.markLinkAsColor(linkElement, "red", "Invalid");

    if (!this.state.processedUrls) {
      this.state.processedUrls = new Set();
    }
    this.state.processedUrls.add(url);

    this.searchData.submittedLinks.push({
      url,
      status: "SKIP",
      message: "Link does not match pattern",
    });
  }

  /**
   * Enhanced process job link with action preview
   */
  async processJobLink({ link, url }) {
    // Wait briefly before proceeding
    const jobTitle = link.textContent.trim() || "Job Application";
    await this.delay(3000);

    // Check if paused during countdown
    if (this.isPaused) {
      console.log("Automation paused during countdown, aborting");
      return;
    }

    // Now proceed with normal processing
    if (this.state.isApplicationInProgress) {
      console.log("Application became in progress, aborting new task");
      return;
    }

    // Mark as processing
    this.markLinkAsColor(link, "green", "In Progress");

    // Set application state
    this.state.isApplicationInProgress = true;
    this.state.applicationStartTime = Date.now();

    // Add to local cache
    if (!this.state.processedUrls) {
      this.state.processedUrls = new Set();
    }
    this.state.processedUrls.add(url);

    // Set timeout for stuck detection
    this.setStuckDetectionTimeout();

    // Send to background script
    try {
      this.safeSendPortMessage({
        type: this.getJobTaskMessageType(),
        data: {
          url,
          title: jobTitle,
        },
      });
    } catch (err) {
      this.handleJobTaskError(err, url, link);
    }
  }

  /**
   * Abstract method to get job task message type - platforms implement
   */
  getJobTaskMessageType() {
    return "START_APPLICATION"; // Default implementation
  }

  /**
   * Set timeout for stuck application detection
   */
  setStuckDetectionTimeout() {
    if (this.sendCvPageNotRespondTimeout) {
      clearTimeout(this.sendCvPageNotRespondTimeout);
    }

    this.sendCvPageNotRespondTimeout = setTimeout(() => {
      if (this.state.isApplicationInProgress) {
        this.state.isApplicationInProgress = false;
        this.state.applicationStartTime = null;
        setTimeout(() => this.searchNext(), 2000);
      }
    }, 180000);
  }

  /**
   * Handle job task error
   */
  handleJobTaskError(err, url, link) {
    console.log(`Error sending job task for ${url}:`, err);

    // Reset flags on error
    this.resetApplicationStateOnError();

    // Remove from processed URLs since we couldn't process it
    if (this.state.processedUrls) {
      this.state.processedUrls.delete(url);
    }

    // Mark as error
    this.markLinkAsColor(link, "red", "Error");
  }

  /**
   * Enhanced handle no unprocessed links with action preview
   */
  async handleNoUnprocessedLinks() {
    if (this.state.isApplicationInProgress) {
      console.log("Application became in progress, aborting navigation");
      return;
    }

    const loadMoreBtn = this.findLoadMoreElement();

    if (loadMoreBtn) {
      await this.delay(2000);

      // Check if paused during delay
      if (this.isPaused) {
        console.log("Automation paused during load more delay, aborting");
        return;
      }

      if (this.state.isApplicationInProgress) {
        console.log("Application became in progress, aborting navigation");
        return;
      }

      loadMoreBtn.click();

      setTimeout(() => {
        if (!this.state.isApplicationInProgress && !this.isPaused) {
          this.searchNext();
        }
      }, 3000);
    } else {
      console.log("All available jobs processed");
      this.safeSendPortMessage({ type: "SEARCH_COMPLETED" });
    }
  }

  /**
   * Reset application state on error
   */
  resetApplicationStateOnError() {
    this.state.isApplicationInProgress = false;
    this.state.applicationStartTime = null;

    if (this.sendCvPageNotRespondTimeout) {
      clearTimeout(this.sendCvPageNotRespondTimeout);
      this.sendCvPageNotRespondTimeout = null;
    }
  }

  /**
   * Enhanced progress reporting with chatbot updates
   */
  updateProgress(updates) {
    this.progress = { ...this.progress, ...updates };

    if (this.onProgress) {
      this.onProgress(this.progress);
    }

    // Notify content script
    this.notifyContentScript("progress", this.progress);
  }

  /**
   * Common utility methods
   */

  /**
   * Find all job links on the page
   */
  findAllLinksElements() {
    try {
      const domains = Array.isArray(this.searchData.domain)
        ? this.searchData.domain
        : [this.searchData.domain];

      if (!domains || domains.length === 0) {
        console.log("No domains specified for link search");
        return [];
      }

      const selectors = domains.map((domain) => {
        const cleanDomain = domain
          .replace(/^https?:\/\//, "")
          .replace(/\/$/, "");
        return `#rso a[href*="${cleanDomain}"], #botstuff a[href*="${cleanDomain}"]`;
      });

      const selector = selectors.join(",");
      const links = document.querySelectorAll(selector);

      console.log(`Found ${links.length} matching links`);
      return Array.from(links);
    } catch (err) {
      console.log("Error finding links:", err);
      return [];
    }
  }

  /**
   * Find load more button
   */
  findLoadMoreElement() {
    try {
      // Check if we're on the last page
      if (
        document.getElementById("pnprev") &&
        !document.getElementById("pnnext")
      ) {
        return null;
      }

      // Find "More results" button
      const moreResultsBtn = Array.from(document.querySelectorAll("a")).find(
        (a) => a.textContent.includes("More results")
      );

      if (moreResultsBtn) return moreResultsBtn;

      // Look for "Next" button
      const nextBtn = document.getElementById("pnnext");
      if (nextBtn) return nextBtn;

      // Try to find any navigation button at the bottom
      const navLinks = [
        ...document.querySelectorAll(
          "#botstuff table a[href^='/search?q=site:']"
        ),
      ];
      return navLinks[navLinks.length - 1];
    } catch (err) {
      console.log("Error finding load more button:", err);
      return null;
    }
  }

  /**
   * Normalize URL for comparison
   */
  normalizeUrlFully(url) {
    try {
      if (!url) return "";

      if (!url.startsWith("http")) {
        url = "https://" + url;
      }

      // Platform-specific URL normalization can be overridden
      url = this.platformSpecificUrlNormalization(url);

      const urlObj = new URL(url);
      return (urlObj.origin + urlObj.pathname)
        .toLowerCase()
        .trim()
        .replace(/\/+$/, "");
    } catch (e) {
      console.log("Error normalizing URL:", e);
      return url.toLowerCase().trim();
    }
  }

  /**
   * Platform-specific URL normalization - can be overridden
   */
  platformSpecificUrlNormalization(url) {
    return url; // Default: no platform-specific normalization
  }

  /**
   * Check if two URLs match
   */
  urlsMatch(url1, url2) {
    return url1 === url2 || url1.includes(url2) || url2.includes(url1);
  }

  /**
   * Mark link with color - utility function
   */
  markLinkAsColor(element, color, status) {
    try {
      if (!element) return;

      // Create or update status indicator
      let indicator = element.querySelector(".job-status-indicator");
      if (!indicator) {
        indicator = document.createElement("span");
        indicator.className = "job-status-indicator";
        indicator.style.cssText = `
          display: inline-block;
          margin-left: 8px;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: bold;
          color: white;
        `;
        element.appendChild(indicator);
      }

      // Set color and status
      const colors = {
        green: "#4CAF50",
        orange: "#FF9800",
        red: "#F44336",
        blue: "#2196F3",
      };

      indicator.style.backgroundColor = colors[color] || color;
      indicator.textContent = status || color;

      // Also add border to the link
      element.style.borderLeft = `3px solid ${colors[color] || color}`;
      element.style.paddingLeft = "8px";
    } catch (error) {
      console.warn("Error marking link color:", error);
    }
  }

  /**
   * Wait utility
   */
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Delay utility
   */
  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Enhanced cleanup with chatbot state preservation
   */
  cleanup() {
    // Clear timers
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    if (this.stateVerificationInterval)
      clearInterval(this.stateVerificationInterval);
    if (this.sendCvPageNotRespondTimeout)
      clearTimeout(this.sendCvPageNotRespondTimeout);

    // Disconnect port
    if (this.port) {
      try {
        this.port.disconnect();
      } catch (e) {
        // Ignore errors
      }
      this.port = null;
    }

    // Reset state
    this.state.isApplicationInProgress = false;
    this.state.applicationStartTime = null;
    this.state.applicationUrl = null;
    this.isPaused = false;
    this.isRunning = false;

    // Cleanup complete
    console.log("🧹 Platform cleanup completed");
  }

  /**
   * Wait for page load utility
   */
  async waitForPageLoad(timeout = 30000) {
    return new Promise((resolve) => {
      if (document.readyState === "complete") {
        resolve(true);
        return;
      }

      const checkComplete = () => {
        if (document.readyState === "complete") {
          resolve(true);
        } else {
          setTimeout(checkComplete, 100);
        }
      };

      checkComplete();

      setTimeout(() => resolve(false), timeout);
    });
  }

  setupErrorRecovery() {
    this._errorCount = 0;
    this._debounceTimers = new Map();
    this._lastErrorTime = null;
  }

  async handleGenericError(error, context = {}) {
    console.error("❌ Generic error:", error);

    // Platform-specific error handling
    if (this.handlePlatformSpecificError) {
      await this.handlePlatformSpecificError(error, context);
    }
  }
}
