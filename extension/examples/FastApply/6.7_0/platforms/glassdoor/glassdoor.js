import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import GlassdoorFormHandler from "./glassdoor-form-handler.js";
import { GlassdoorFileHandler } from "./glassdoor-file-handler.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";

export default class GlassdoorPlatform {
  constructor(config) {
    if (window.glassdoorPlatformInstance) {
      return window.glassdoorPlatformInstance;
    }

    // Initialize config and session context
    this.config = config || {};
    this.sessionId = config.sessionId || null;
    this.userId = config.userId || null;
    this.sessionContext = config.sessionContext || null;
    this.hasSessionContext = !!this.sessionContext;

    // Initialize user profile from multiple sources
    this.userProfile =
      this.getInjectedUserProfile() ||
      config.userProfile ||
      config.sessionContext?.userProfile ||
      null;

    this.devMode =
      config.devMode ||
      config.config?.devMode ||
      config.sessionContext?.devMode ||
      false;

    this.platform = "glassdoor";
    this.baseUrl = this.getBaseUrlFromCurrentPage();

    this.state = {
      isRunning: false,
      currentJobIndex: 0,
      processedJobs: new Set(),
      jobQueue: [],
      isProcessingJob: false,
      lastProcessedJobId: null,
    };

    // Initialize Co-Pilot state
    this.copilotState = new CoPilotState();
    this.formHandler = null;
    this.fileHandler = null;

    this.aiApiHost = null;
    this.HOST = null;
    this.backendApiHost = null;
    this.applicationTracker = null;

    // Glassdoor selectors
    this.selectors = {
      jobCards: ".JobsList_jobListItem__wjTHv, li[data-test='jobListing']",
      jobTitle: ".JobCard_jobTitle__GLyJ1, a[data-test='job-title']",
      companyName:
        ".EmployerProfile_compactEmployerName__9MGcV, span.employer-name",
      location: ".JobCard_location__Ds1fM, div[data-test='emp-location']",
      jobDescription:
        ".JobDetails_jobDescription__uW_fK, [class*='jobDescription'], [data-test='description']",
      easyApplyButton:
        'button[data-test="easyApply"], button[data-test="easy-apply-button"], a:contains("Quick Apply"), button:contains("Easy Apply"), .button_Button__MlD2g.button-base_Button__knLaX',
      nextPageButton: "[data-test='pagination-next'], .nextButton",
    };

    // Port communication
    this.port = null;
    this.isPortConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 3;

    // Store this instance globally to prevent duplicates
    window.glassdoorPlatformInstance = this;
    this.reason = "";
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

  /**
   * Get the base URL from the current page to support regional domains
   * @returns {string} The base URL (e.g., https://www.glassdoor.es)
   */
  getBaseUrlFromCurrentPage() {
    try {
      if (typeof window !== "undefined" && window.location) {
        const url = new URL(window.location.href);
        // Check if it's a Glassdoor domain
        if (url.hostname.includes("glassdoor")) {
          return `${url.protocol}//${url.hostname}`;
        }
      }
    } catch (error) {
      console.warn("Error getting base URL from current page:", error);
    }
    // Default fallback
    return "https://www.glassdoor.com";
  }

  // Abstract methods required by base class
  getPlatformDomains() {
    // Support all regional Glassdoor domains
    return [
      "https://www.glassdoor.com/",
      "https://www.glassdoor.es/",
      "https://www.glassdoor.co.uk/",
      "https://www.glassdoor.de/",
      "https://www.glassdoor.fr/",
      "https://www.glassdoor.ca/",
      "https://www.glassdoor.com.au/",
      "https://www.glassdoor.co.in/",
      "https://www.glassdoor.sg/",
      "https://www.glassdoor.ie/",
      "https://www.glassdoor.nl/",
      "https://www.glassdoor.be/",
      "https://www.glassdoor.ch/",
      "https://www.glassdoor.at/",
      "https://www.glassdoor.com.br/",
      "https://www.glassdoor.com.mx/",
      "https://www.glassdoor.com.ar/",
      "https://www.glassdoor.co.nz/",
    ];
  }

  getSearchLinkPattern() {
    // Match any Glassdoor regional domain
    return /^https:\/\/(www\.)?glassdoor\.[a-z.]+\/(job|Job|partner|apply|job-listing).*$/;
  }

  isValidJobPage(url) {
    // Match any Glassdoor regional domain with Job path
    return /glassdoor\.[a-z.]+\/(Job|job)/i.test(url);
  }

  isJobListingPage(url) {
    // Match any Glassdoor regional domain with job listing path
    return /glassdoor\.[a-z.]+\/(partner\/jobListing\.htm|job-listing\/)/i.test(
      url
    );
  }

  async setSessionContext(sessionContext) {
    try {
      this.sessionContext = sessionContext;

      // Extract API hosts from the correct nested path
      this.sessionApiHost =
        sessionContext?.sessionConfig?.backendApiHost ||
        sessionContext?.backendApiHost ||
        sessionContext?.apiHost;
      this.sessionAiApiHost =
        sessionContext?.sessionConfig?.aiApiHost || sessionContext?.aiApiHost;

      // Update basic properties if available
      if (sessionContext.sessionId) this.sessionId = sessionContext.sessionId;
      if (sessionContext.platform) this.platform = sessionContext.platform;
      if (sessionContext.userId) this.userId = sessionContext.userId;
      if (sessionContext.userProfile)
        this.userProfile = sessionContext.userProfile;
      if (sessionContext.devMode !== undefined) {
        this.devMode = sessionContext.devMode;
      }

      // Load co-pilot mode preference from session context
      if (sessionContext.preferences?.hasOwnProperty("copilotMode")) {
        const isCoPilot =
          sessionContext.preferences.copilotMode === true ||
          sessionContext.preferences.copilotMode === "co-pilot";
        if (isCoPilot) {
          this.copilotState.switchToCoPilot();
        } else {
          this.copilotState.switchToAutoPilot();
        }

        if (this.formHandler) {
          this.formHandler.copilotMode = isCoPilot;
        }

        if (true) {
          // Global overlay always available
          updateStatusButtons(isCoPilot ? "co-pilot-search" : "auto-pilot");
        }
      }
    } catch (error) {
      console.error("❌ Error setting session context:", error);
      throw error;
    }
  }

  async initialize() {
    console.log("🚀 Initializing Glassdoor platform automation");

    // Apply session context preferences (including co-pilot mode)
    if (this.sessionContext) {
      await this.setSessionContext(this.sessionContext);
    }

    // Initialize port connection for background communication
    this.initializePortConnection();

    // Set up message listener for message-router communication
    this.setupMessageListeners();

    // Initialize handlers if session context is available
    if (this.sessionContext) {
      this.fileHandler = new GlassdoorFileHandler({
        preferences: this.sessionContext?.preferences,
        backendApiHost: this.getApiHost(),
        aiApiHost: this.getAiApiHost(),
        jwtToken: this.getJwtToken(),
      });

      this.formHandler = new GlassdoorFormHandler({
        preferences: this.sessionContext?.preferences,
        aiApiHost: this.getAiApiHost(),
        userData: this.userProfile || {},
        jobDescription: "",
        platform: this.platform,
        fileHandler: this.fileHandler,
        copilotMode: this.copilotState.isInCoPilotMode(),
        copilotState: this.copilotState,
      });
    }

    console.log("✅ Glassdoor platform initialized");
  }

  initializePortConnection() {
    try {
      const timestamp = Date.now();
      const sessionSuffix = this.sessionId
        ? `-${this.sessionId.slice(-6)}`
        : "";
      const portName = `glassdoor-${timestamp}${sessionSuffix}`;

      console.log(`🔌 Creating connection with port name: ${portName}`);

      this.port = chrome.runtime.connect({ name: portName });

      if (!this.port) {
        throw new Error(
          "Failed to establish connection with background script"
        );
      }

      // Set up message handler for port messages
      this.port.onMessage.addListener((message) => {
        this.handleMessage(message);
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
        this.isPortConnected = false;

        // Attempt to reconnect
        if (this.connectionRetries < this.maxRetries) {
          this.connectionRetries++;
          console.log(
            `🔄 Attempting to reconnect (${this.connectionRetries}/${this.maxRetries})...`
          );
          setTimeout(() => this.initializePortConnection(), 5000);
        }
      });

      this.isPortConnected = true;
      this.connectionRetries = 0;
      console.log("✅ Port connection established");
    } catch (error) {
      console.error("❌ Error initializing port connection:", error);
    }
  }
  async start(params = {}) {
    try {
      this.config = { ...this.config, ...params };

      // Ensure session context preferences are applied (fallback if initialize wasn't called)
      if (this.sessionContext) {
        await this.setSessionContext(this.sessionContext);
      }

      // Determine what to do based on current page
      const url = window.location.href;
      if (this.isApplicationSuccess()) {
        await this.handleApplicationSuccessPage();
      } else if (this.isFormPage(url)) {
        await this.handleFormPage();
      } else if (this.isJobListingPage(url)) {
        await this.handleJobListingPage();
      } else if (this.isSearchPage(url)) {
        await this.startJobProcessing();
      } else {
        console.log("Unknown page type for Glassdoor:", url);
      }
    } catch (error) {
      console.error("❌ Error starting Glassdoor automation:", error);
      throw error;
    }
  }

  isSearchPage(url) {
    // Match any Glassdoor regional domain with Job or Search path
    return /glassdoor\.[a-z.]+\/(Job|Search)/i.test(url);
  }

  isFormPage(url) {
    return url.includes("smartapply.indeed.com");
  }

  isApplicationSuccess() {
    const url = window.location.href;
    if (!url.includes("smart-apply-action=POST_APPLY")) {
      return false;
    }

    const successHeading = document.querySelector(
      "h2.heading_Heading__aomVx.heading_Level2__453q4"
    );
    if (
      successHeading &&
      successHeading.textContent.includes("Your application was sent!")
    ) {
      return true;
    }

    // More specific success indicators - avoid false positives on form pages
    const pageText = document.body.textContent?.toLowerCase() || "";
    const hasSpecificSuccessText =
      pageText.includes("your application was sent") ||
      pageText.includes("application submitted successfully") ||
      pageText.includes("successfully submitted your application");

    if (hasSpecificSuccessText) {
      return true;
    }
    return false;
  }

  setupMessageListeners() {
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
      if (!message) return true;

      if (message.type === "CONTROL_ACTION") {
        this.handleCoPilotAction({ action: message.action });
      } else if (message.type === "SEARCH_NEXT") {
        this.handleSearchNext(message.data);
      } else {
        this.handleMessage(message);
      }

      sendResponse({ success: true });
      return true;
    });
  }

  // ========================================
  // MESSAGE HANDLING
  // ========================================

  handleMessage(message) {
    const { type, data } = message;

    switch (type) {
      case "APPLICATION_STARTING":
        console.log("🚀 Application starting...");
        this.state.isProcessingJob = true;
        break;

      case "ALREADY_APPLIED":
        this.handleAlreadyApplied(data);
        break;

      case "DUPLICATE":
        this.handleDuplicateJob(data);
        break;

      case "LIMIT_REACHED":
        this.handleLimitReached(data);
        break;

      case "COMPANY_BLACKLISTED":
        this.handleCompanyBlacklisted(data);
        break;

      case "ERROR":
        console.error("❌ Error from background:", data);
        break;

      case "SUCCESS":
        if (data && data.submittedLinks !== undefined) {
          this.searchData = data;
        } else if (data && data.profile) {
          this.userProfile = data.profile;
        }
        break;

      case "SEARCH_TASK":
      case "SEARCH_TASK_DATA":
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
        break;

      case "PROFILE_DATA":
        if (data) {
          this.userProfile = data;
          if (this.formHandler) {
            this.formHandler.userData = this.userProfile;
          }
        }
        break;

      case "COPILOT_ACTION":
        this.handleCoPilotAction(data);
        break;

      default:
        break;
    }
  }

  handleSearchNext(data) {
    console.log("➡️ Glassdoor handling SEARCH_NEXT - moving to next job", data);

    // Handle limit reached FIRST - this should always be processed regardless of job state
    if (data?.reason === "Limit reached") {
      this.handleLimitReached(data);
      return; // Stop automation when limit is reached
    }

    // Prevent handling duplicate SEARCH_NEXT messages for normal job flow
    if (this.state.isProcessingJob) {
      console.log("⚠️ SEARCH_NEXT received while processing job, ignoring");
      return;
    }

    // Update job card status based on result from background
    if (data?.status === "SUCCESS") {
      this.markLastJobCard("applied");
    } else if (data?.status === "ERROR" || data?.status === "SKIPPED") {
      this.markLastJobCard("skipped");
    }

    // Display status overlay based on reason
    if (data?.reason === "Already applied") {
      this.handleAlreadyApplied(data);
    } else if (data?.reason === "Company blacklisted") {
      this.handleCompanyBlacklisted(data);
    }

    // Continue to next job only if automation is running
    if (this.state.isRunning && !this.state.isProcessingJob) {
      console.log("🔄 SEARCH_NEXT: Starting next job processing");
      setTimeout(() => this.processNextJob(), 2000);
    } else {
      console.log(
        "⏸️ SEARCH_NEXT: Automation not running or already processing"
      );
    }
  }

  handleAlreadyApplied(data) {
    console.log("⚠️ Already applied to this job:", data);
    notifyStatus({
      type: "ALREADY_APPLIED",
      data: { title: data?.title || "Job" },
    });
    this.state.isProcessingJob = false;
  }

  handleDuplicateJob(data) {
    console.log("🔁 Duplicate job detected:", data);
    notifyStatus({ type: "DUPLICATE_APPLICATION" });
    this.state.isProcessingJob = false;
  }

  handleLimitReached(data) {
    console.log("🛑 Application limit reached:", data);
    notifyStatus({ type: "LIMIT_EXCEEDED" });
    this.state.isRunning = false;
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

  async startJobProcessing() {
    try {
      const authCheck = await this.checkAuthentication();
      if (!authCheck.canProceed) {
        this.handleAuthError(authCheck);
        return false;
      }

      // Check if there are any jobs found on the page
      const noJobsFound = this.checkIfNoJobsFound();
      if (noJobsFound) {
        this.safeSendPortMessage({
          type: "SEARCH_COMPLETED",
          data: { reason: "no_jobs_found" },
        });
        notifyStatus({
          type: "JOB_NOT_FOUND",
          data: {
            message: "No jobs found matching your search criteria",
            jobCount: 0,
          },
        });
        this.state.isRunning = false;
        return false;
      }

      // Register this tab as the search tab with the background
      this.safeSendPortMessage({
        type: "REGISTER_SEARCH_TAB",
        url: window.location.href,
        platform: "glassdoor",
      });

      this.state.isRunning = true;
      notifyStatus({ type: "AUTOMATION_STARTING" });

      // Ensure correct mode buttons are shown after automation starts
      this.restoreModeButtons();

      const jobCards = this.getJobCards();
      if (jobCards.length === 0) {
        this.safeSendPortMessage({
          type: "SEARCH_COMPLETED",
          data: { reason: "no_jobs_found" },
        });
        notifyStatus({
          type: "JOB_NOT_FOUND",
          data: {
            message: "No job cards found on page",
            jobCount: 0,
          },
        });
        this.state.isRunning = false;
        return;
      }

      this.state.jobQueue = Array.from(jobCards);

      notifyStatus({
        type: "JOB_SEARCH_STARTED",
        data: {
          preferences: {
            ...(this.sessionContext?.preferences || this.config?.preferences || {}),
            copilotMode: this.copilotState.isInCoPilotMode()
              ? "co-pilot"
              : "auto-pilot",
          },
        },
      });

      // Start processing first job
      await this.processNextJob();
    } catch (error) {
      console.error("❌ Error starting job processing:", error);
    }
  }

  async processNextJob() {
    try {
      // Prevent concurrent job processing
      if (!this.state.isRunning || this.state.isProcessingJob) {
        console.log("⏸️ Job processing already in progress or stopped");
        return;
      }

      this.state.isProcessingJob = true;

      const unprocessedJobs = this.getUnprocessedJobs();

      if (unprocessedJobs.length === 0) {
        if (await this.goToNextPage()) {
          // Wait for background coordination instead of direct timeout
          this.state.isProcessingJob = false;
          this.safeSendPortMessage({
            type: "PAGE_CHANGED",
            data: { message: "Moved to next page, ready for next job" },
          });
        } else {
          await this.handleSearchCompleted();
          this.state.isProcessingJob = false;
        }
        return;
      }

      const jobCard = unprocessedJobs[0];
      const jobCardId = this.getJobCardId(jobCard);

      // Check for duplicate processing
      if (this.state.lastProcessedJobId === jobCardId) {
        console.log("⚠️ Duplicate job processing detected, skipping");
        this.state.isProcessingJob = false;
        return;
      }

      this.markJobCard(jobCard, "processing");
      this.state.lastProcessedJobId = jobCardId;

      // Step 1: Click job card to expand details
      await this.expandJobDetails(jobCard);

      // Step 2: Wait a bit for job details to fully load
      await this.delay(1500);

      // Step 3: Check if job has Easy Apply button in the expanded details panel
      const hasEasyApply = this.hasEasyApplyInDetailsPanel();

      if (!hasEasyApply) {
        this.markJobCard(jobCard, "skipped");
        this.state.processedJobs.add(jobCardId);
        this.state.isProcessingJob = false;

        console.log(
          "⏭️ No Easy Apply button found, silently skipping to next job"
        );
        setTimeout(() => this.processNextJob(), 1000);
        return;
      }

      const jobInfo = await this.extractJobInfo(jobCard);

      if (
        this.sessionContext?.preferences?.applyOnlyMatching ||
        this.sessionContext?.preferences?.applyOnlyQualified
      ) {
        const isMatch = await this.doesJobMatchPreferences(jobInfo);

        if (!isMatch) {
          this.markJobCard(jobCard, "skipped");
          this.state.processedJobs.add(jobCardId);
          this.state.isProcessingJob = false;

          // Show status message
          if (true) {
            // Global overlay always available
            notifyStatus({
              type: "DOES_NOT_MATCH_PREFERENCES",
              data: {
                title: jobInfo.title,
                reason: this.reason,
              },
            });
          }

          setTimeout(() => this.processNextJob(), 1000);
          return;
        }
      }

      // Step 5: Save job to storage
      await this.saveJobToStorage(jobInfo);

      // Step 6: Extract job link from card
      const jobLink = this.extractJobLink(jobCard);

      if (!jobLink) {
        this.markJobCard(jobCard, "skipped");
        this.state.processedJobs.add(jobCardId);
        this.state.isProcessingJob = false;

        // Send skip message to background
        this.safeSendPortMessage({
          type: "APPLICATION_SKIPPED",
          data: {
            url: window.location.href,
            reason: "No job link found on card",
            skipReason: "no_link",
          },
        });
        return;
      }

      // Step 7: Form complete URL and open in new tab
      notifyStatus({
        type: "APPLYING_TO_JOB",
        data: { title: jobInfo.title },
      });

      await this.openJobListingPage(jobLink, jobInfo);

      // Mark as processed and STOP here - wait for background to signal next job
      this.state.processedJobs.add(jobCardId);
      this.state.isProcessingJob = false;

      // Don't continue automatically - wait for background message
    } catch (error) {
      console.error("❌ Error in processNextJob:", error);
      this.state.isProcessingJob = false;

      // Send error to background instead of direct retry
      this.safeSendPortMessage({
        type: "APPLICATION_ERROR",
        data: {
          url: window.location.href,
          error: error.message,
          context: "processNextJob",
        },
      });
    }
  }

  async handleFormPage() {
    try {
      // Prevent multiple simultaneous executions
      if (this.isHandlingForm) {
        return;
      }
      this.isHandlingForm = true;
      notifyStatus({ type: "FILLING_FORM" });
      console.log("📋 Using global status overlay on form page");

      if (!this.userProfile) {
        this.safeSendPortMessage({
          type: "APPLICATION_ERROR",
          data: {
            url: window.location.href,
            error: "No user profile available",
          },
        });
        this.isHandlingForm = false;
        return;
      }

      // Get stored job data
      const jobData = await chrome.storage.local.get("currentJobData");
      const currentJob = jobData.currentJobData || {};
      const jobId = currentJob.jobId;

      // Initialize file handler first (before form handler)
      if (!this.fileHandler) {
        this.fileHandler = new GlassdoorFileHandler({
          backendApiHost: this.getApiHost(),
          aiApiHost: this.getAiApiHost(),
          jwtToken: this.getJwtToken(),
          preferences: this.sessionContext?.preferences,
        });
      } else {
        // Update preferences if file handler already exists
        if (this.sessionContext?.preferences) {
          this.fileHandler.preferences = this.sessionContext.preferences;
        }
      }

      // Build enriched job description with job metadata for AI context
      const jobDescParts = [];
      if (currentJob.title) jobDescParts.push(`Job Title: ${currentJob.title}`);
      if (currentJob.company) jobDescParts.push(`Company: ${currentJob.company}`);
      if (currentJob.location) jobDescParts.push(`Location: ${currentJob.location}`);
      if (currentJob.salary) jobDescParts.push(`Salary: ${currentJob.salary}`);
      if (currentJob.workplace) jobDescParts.push(`Workplace: ${currentJob.workplace}`);
      if (currentJob.description) jobDescParts.push(`\nJob Description:\n${currentJob.description}`);
      const enrichedJobDescription = jobDescParts.join('\n');

      // Initialize GlassdoorFormHandler with configuration
      this.formHandler = new GlassdoorFormHandler({
        preferences: this.sessionContext?.preferences,
        host: this.getAiApiHost(),
        userData: this.userProfile,
        jobDescription: enrichedJobDescription,
        platform: this.platform,
        fileHandler: this.fileHandler,
        jobId: jobId,
      });

      // Pass co-pilot mode and state to form handler
      const isInCoPilotMode = this.copilotState.isInCoPilotMode();
      this.formHandler.copilotMode = isInCoPilotMode;
      this.formHandler.copilotState = this.copilotState;
      this.formHandler.currentJobTitle = currentJob.title || "this job";

      // Show appropriate buttons based on current mode
      if (true) {
        // Global overlay always available
        if (isInCoPilotMode) {
          updateStatusButtons("co-pilot-filling");
        } else {
          updateStatusButtons("auto-pilot");
        }
      }

      // Notify background that form tab is ready
      this.safeSendPortMessage({
        type: "FORM_TAB_READY",
        url: window.location.href,
      });

      // Use the new fillCompleteForm method that handles multi-step navigation
      const success = await this.formHandler.fillCompleteForm(this.userProfile);

      if (success === "CAPTCHA_PENDING") {
        // Don't send success here - wait for POST_APPLY page detection
      } else if (success === true) {
        // Don't send success here - wait for POST_APPLY page detection
      } else {
        this.safeSendPortMessage({
          type: "APPLICATION_ERROR",
          data: { url: window.location.href },
        });
      }
    } catch (error) {
      this.safeSendPortMessage({
        type: "APPLICATION_ERROR",
        data: { url: window.location.href, error: error.message },
      });
    } finally {
      // Always clear the flag when done
      this.isHandlingForm = false;
    }
  }

  async handleJobListingPage() {
    try {
      // Register this tab as a job listing tab
      this.safeSendPortMessage({
        type: "REGISTER_JOB_LISTING_TAB",
        url: window.location.href,
      });

      // Wait for page to load
      await this.delay(3000);

      // Check if job is already applied to
      const isAlreadyApplied = this.checkIfAlreadyApplied();

      if (isAlreadyApplied) {
        console.log("📝 Job already applied - skipping");
        this.safeSendPortMessage({
          type: "APPLICATION_SKIPPED",
          data: {
            url: window.location.href,
            reason: "Already applied to this job",
            skipReason: "already_applied",
          },
        });

        notifyStatus({
          type: "APPLICATION_SKIPPED",
          data: { reason: "Already applied" },
        });

        // Close this tab after a short delay
        await this.delay(2000);
        window.close();
        return;
      }

      // Find Easy Apply button on job listing page
      const easyApplyButton = this.findEasyApplyButtonOnJobListing();

      if (!easyApplyButton) {
        console.log("❌ Easy Apply button not found on job listing page");
        this.safeSendPortMessage({
          type: "APPLICATION_ERROR",
          data: {
            url: window.location.href,
            error: "Easy Apply button not found",
          },
        });
        return;
      }

      // Get stored job data for display
      const jobData = await chrome.storage.local.get("currentJobData");
      const currentJob = jobData.currentJobData || {};

      // Click Easy Apply button
      notifyStatus({
        type: "APPLYING_TO_JOB",
        data: { title: currentJob.title || "Job" },
      });

      await this.clickEasyApplyOnJobListing(easyApplyButton);
    } catch (error) {
      console.error("❌ Error handling job listing page:", error);
      this.safeSendPortMessage({
        type: "APPLICATION_ERROR",
        data: { url: window.location.href, error: error.message },
      });
    }
  }

  async handleApplicationSuccessPage() {
    // Get stored job data
    const jobData = await chrome.storage.local.get("currentJobData");
    const currentJob = jobData.currentJobData || {};

    const jobDetails = {
      jobId: currentJob.jobId || currentJob.id,
      title: currentJob.title || "Job on Glassdoor",
      company: currentJob.company || "Unknown Company",
      location: currentJob.location || "Unknown Location",
      description: currentJob.description || "",
      jobUrl: currentJob.jobUrl || window.location.href,
      salary: currentJob.salary || "Not specified",
      workplace: currentJob.workplace || "Not specified",
      postedDate: currentJob.postedDate || null,
      applicants: currentJob.applicants || null,
    };

    try {
      // Show success status
      if (true) {
        // Global overlay always available
        notifyStatus({
          type: "APPLICATION_SUBMITTED",
          data: { title: jobDetails.title },
        });
      }
      // Send APPLICATION_COMPLETED to background for centralized tracking
      this.safeSendPortMessage({
        type: "APPLICATION_COMPLETED",
        data: {
          url: jobDetails.jobUrl,
          jobData: {
            ...jobDetails,
            platform: "glassdoor",
            submittedAt: Date.now(),
          },
        },
      });

      // Wait a moment for background processing, then close this tab
      await new Promise((resolve) => setTimeout(resolve, 2500));
      window.close();
    } catch (error) {
      console.error("❌ Error processing application:", error);

      // Still try to close the tab even if there was an error
      setTimeout(() => {
        window.close();
      }, 2000);
    }
  }

  // Note: handleBackgroundMessage removed - using handleMessage() via setupMessageListeners instead

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
          // Global overlay always available
          notifyStatus({
            type: "MODE_SWITCHED",
            data: { mode: "co-pilot" },
          });
          // Show co-pilot search buttons (with "Let AI Take Over" button)
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
          // Global overlay always available
          notifyStatus({
            type: "MODE_SWITCHED",
            data: { mode: "auto-pilot" },
          });
          // Show auto-pilot buttons in overlay
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
        console.log("⏭️ Skip button clicked - processing skip action");

        // If we're on a form page and formHandler exists, resolve the promise first
        if (this.formHandler) {
          this.formHandler.resolveUserAction("SKIP");
        }

        // Show status message that job was skipped
        if (true) {
          // Global overlay always available
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
            skipReason: "user_skip",
            jobTitle: this.formHandler?.currentJobTitle || "Unknown job",
          },
        });

        // Only close window if on form page or job listing page, NOT on search page
        const currentUrl = window.location.href;
        const isOnFormPage = this.isFormPage(currentUrl);
        const isOnJobListingPage = this.isJobListingPage(currentUrl);
        const isOnSearchPage = this.isSearchPage(currentUrl);

        if (isOnFormPage || isOnJobListingPage) {
          // On form or job listing page - close this tab
          setTimeout(() => {
            console.log("⏭️ Closing form/job listing tab after user skip");
            window.close();
          }, 1500);
        } else if (isOnSearchPage) {
          // On search page - don't close, just wait for background to send SEARCH_NEXT
          console.log(
            "⏭️ Skipping current job on search page, waiting for SEARCH_NEXT message"
          );
        } else {
          // Unknown page type - log warning but don't close
          console.warn(
            "⚠️ Skip button clicked on unknown page type, not closing window"
          );
        }
        break;

      case COPILOT_ACTIONS.TAKE_CONTROL:
        console.log("✋ User taking manual control");
        // User wants manual control of the form
        if (this.formHandler) {
          this.formHandler.userHasControl = true;
          this.formHandler.resolveUserAction("TAKE_CONTROL");
        }

        if (true) {
          // Global overlay always available
          notifyStatus({
            type: "COPILOT_USER_HAS_CONTROL",
            data: { title: this.formHandler?.currentJobTitle || "this job" },
          });
          // Show "Let AI Continue" button
          updateStatusButtons("user-control");
        }
        break;

      case COPILOT_ACTIONS.LET_AI_CONTINUE:
        console.log("🤖 AI resuming control");
        // User wants AI to take back control
        if (this.formHandler) {
          this.formHandler.userHasControl = false;
          this.formHandler.resolveUserAction("LET_AI_CONTINUE");
        }

        if (true) {
          // Global overlay always available
          notifyStatus({
            type: "COPILOT_AI_CONTINUING",
            data: { title: this.formHandler?.currentJobTitle || "this job" },
          });
          // Show "Take Control" button
          updateStatusButtons("co-pilot-filling");
        }
        break;

      case COPILOT_ACTIONS.PAUSE:
        this.state.isRunning = false;
        if (true) {
          // Global overlay always available
          notifyStatus({ type: "AUTOMATION_PAUSED" });
        }
        break;

      case COPILOT_ACTIONS.RESUME:
        this.state.isRunning = true;
        this.processNextJob();
        if (true) {
          // Global overlay always available
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

  // Utility methods
  getJobCards() {
    return document.querySelectorAll(this.selectors.jobCards);
  }

  getUnprocessedJobs() {
    const allCards = this.getJobCards();
    return Array.from(allCards).filter((card) => {
      const cardId = this.getJobCardId(card);
      return !this.state.processedJobs.has(cardId);
    });
  }

  async expandJobDetails(jobCard) {
    try {
      const jobLink = jobCard.querySelector(
        "a.JobCard_trackingLink__HMyun, a[data-test='job-link']"
      );
      if (jobLink) {
        jobLink.click();
        await this.delay(2000);
      }
    } catch (error) {
      console.error("❌ Error expanding job details:", error);
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

      // Extract job description from expanded view
      const jobDescription =
        document
          .querySelector(this.selectors.jobDescription)
          ?.textContent?.trim() || "";

      // Extract salary from job card or details panel
      let salary = "";
      const salaryElement =
        jobCard.querySelector(
          ".salary-estimate, [data-test='detailSalary'], .sal-salary"
        ) ||
        document.querySelector(
          ".salary-estimate, [data-test='detailSalary'], .sal-salary, [class*='salary']"
        );
      if (salaryElement) {
        salary = salaryElement.textContent?.trim() || "";
        console.log("💰 Found salary element:", salary);
      }

      // Extract job ID from link
      const jobLink = jobCard.querySelector("a");
      let jobId = "";
      if (jobLink?.href) {
        const match = jobLink.href.match(/(?:jobListingId|jl)=(\d+)/);
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
      // Limit description size to avoid quota exceeded errors
      const MAX_DESCRIPTION_LENGTH = 5000;
      const limitedJobInfo = {
        ...jobInfo,
        description:
          jobInfo.description?.substring(0, MAX_DESCRIPTION_LENGTH) || "",
        timestamp: Date.now(),
      };

      // Clear previous job data before saving new one to avoid quota buildup
      await chrome.storage.local.remove("currentJobData");

      await chrome.storage.local.set({
        currentJobData: limitedJobInfo,
      });
      console.log(
        "💾 Job saved to storage (description truncated to",
        MAX_DESCRIPTION_LENGTH,
        "chars)"
      );

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
      console.error("❌ Error saving job to storage:", error);

      // If still failing, try clearing all storage and retry
      if (error.message?.includes("quota")) {
        console.log("🧹 Clearing storage and retrying...");
        try {
          await chrome.storage.local.clear();
          await chrome.storage.local.set({
            currentJobData: {
              ...jobInfo,
              description: jobInfo.description?.substring(0, 1000) || "",
              timestamp: Date.now(),
            },
          });
          console.log("✅ Job saved after clearing storage");
        } catch (retryError) {
          console.error("❌ Failed even after clearing storage:", retryError);
        }
      }
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
          name: `${this.userProfile?.firstName || ""} ${this.userProfile?.lastName || ""
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

    // Try to extract salary range with K notation (e.g., "$62K - $106K")
    const kRangeMatch = salaryText.match(
      /\$(\d{1,3}(?:\.\d+)?)\s*K\s*-\s*\$(\d{1,3}(?:\.\d+)?)\s*K/i
    );
    if (kRangeMatch) {
      // Return the minimum salary from the range, multiply by 1000
      const minSalary = Math.round(parseFloat(kRangeMatch[1]) * 1000);
      console.log(
        `💰 Extracted salary from K range: $${minSalary} (min of range)`
      );
      return minSalary;
    }

    // Try to extract salary range with commas (e.g., "$77,000 - $143,000 a year")
    const rangeMatch = salaryText.match(
      /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*-\s*\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/
    );
    if (rangeMatch) {
      // Return the minimum salary from the range
      const minSalary = parseInt(rangeMatch[1].replace(/,/g, ""));
      console.log(
        `💰 Extracted salary from range: $${minSalary} (min of range)`
      );
      return minSalary;
    }

    // Try to extract single salary value with K notation (e.g., "$85K")
    const kMatch = salaryText.match(/\$(\d{1,3}(?:\.\d+)?)\s*K/i);
    if (kMatch) {
      const salary = Math.round(parseFloat(kMatch[1]) * 1000);
      console.log(`💰 Extracted salary from K: $${salary}`);
      return salary;
    }

    // Try to extract single salary value with commas
    const singleMatch = salaryText.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
    if (singleMatch) {
      const salary = parseInt(singleMatch[1].replace(/,/g, ""));
      console.log(`💰 Extracted salary: $${salary}`);
      return salary;
    }

    console.log("💰 No salary found in job info");
    return null;
  }

  hasEasyApplyInDetailsPanel() {
    try {
      const easyApplyButton = document.querySelector(
        'button[data-test="easyApply"]'
      );

      if (easyApplyButton && this.isElementVisible(easyApplyButton)) {
        if (easyApplyButton.tagName.toLowerCase() === "button") {
          return true;
        } else {
          return false;
        }
      }

      const specificButton = document.querySelector(
        'button.button_Button__o_a9q[data-test="easyApply"]'
      );
      if (specificButton && this.isElementVisible(specificButton)) {
        return true;
      }

      const buttons = document.querySelectorAll("button");
      for (const button of buttons) {
        if (this.isElementVisible(button)) {
          const buttonText = button.textContent?.trim().toLowerCase();
          if (buttonText === "easy apply") {
            return true;
          }
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  extractJobLink(jobCard) {
    try {
      const jobLinkElement = jobCard.querySelector(
        "a.JobCard_trackingLink__HMyun, a[data-test='job-link']"
      );

      if (jobLinkElement && jobLinkElement.href) {
        return jobLinkElement.href;
      }

      return null;
    } catch (error) {
      console.error("❌ Error extracting job link:", error);
      return null;
    }
  }

  async openJobListingPage(jobLink, jobInfo = {}) {
    try {
      // Form the complete URL using dynamic base URL for regional support
      const completeUrl = jobLink.startsWith("http")
        ? jobLink
        : `${this.baseUrl}${jobLink}`;

      // Send OPEN_APPLICATION_TAB to background to create new tab
      console.log({
        jobId: jobInfo.jobId || this.extractJobIdFromUrl(completeUrl),
        url: completeUrl,
        title: jobInfo.title || "Job on Glassdoor",
        company: jobInfo.company || "Unknown Company",
        platform: this.platform,
      });
      this.safeSendPortMessage({
        type: "OPEN_APPLICATION_TAB",
        data: {
          jobId: jobInfo.jobId || this.extractJobIdFromUrl(completeUrl),
          url: completeUrl,
          title: jobInfo.title || "Job on Glassdoor",
          company: jobInfo.company || "Unknown Company",
          platform: this.platform,
        },
      });

      await this.delay(1000);
    } catch (error) {
      console.error("❌ Error opening job listing page:", error);
      // Fallback to direct window.open if messaging fails
      window.open(
        jobLink.startsWith("http")
          ? jobLink
          : `${this.baseUrl}${jobLink}`,
        "_blank"
      );
    }
  }

  /**
   * Extract job ID from Glassdoor URL
   * @param {string} url - The job URL
   * @returns {string} - The extracted job ID
   */
  extractJobIdFromUrl(url) {
    try {
      // Try to extract job ID from various Glassdoor URL patterns
      // e.g., /partner/jobListing.htm?pos=101&ao=1136043&s=58&guid=...&src=...&t=...&vt=...&uido=...&cs=1...&jobListingId=1009672308111
      const urlObj = new URL(url);
      const jobListingId = urlObj.searchParams.get("jobListingId");
      if (jobListingId) {
        return jobListingId;
      }

      // Try to extract from path (e.g., /job-listing/123456789)
      const pathMatch = url.match(/job-listing\/(\d+)/);
      if (pathMatch) {
        return pathMatch[1];
      }

      // Fallback: generate from URL hash
      return btoa(url).slice(0, 20);
    } catch (error) {
      console.error("Error extracting job ID from URL:", error);
      return "";
    }
  }

  findEasyApplyButton() {
    const buttons = document.querySelectorAll("button, a");

    for (const button of buttons) {
      const buttonText = button.textContent?.trim().toLowerCase();
      if (buttonText === "easy apply" && this.isElementVisible(button)) {
        return button;
      }
    }

    return null;
  }

  findEasyApplyButtonOnJobListing() {
    const selectors = [
      'button[data-test="easyApply"]',
      'button.button_Button__o_a9q[data-test="easyApply"]',
      'button[data-test="easy-apply-button"]',
      'button[data-test="easy-apply"]',
      'button:contains("Easy Apply")',
      'a:contains("Easy Apply")',
      '.button_Button__MlD2g:contains("Easy Apply")',
      'button[class*="apply"]:contains("Easy Apply")',
      'a[class*="apply"]:contains("Easy Apply")',
    ];

    for (const selector of selectors) {
      try {
        if (selector.includes(":contains")) {
          const baseSelector = selector.split(":contains")[0];
          const text = selector.match(/\("([^"]+)"\)/)?.[1];
          const elements = document.querySelectorAll(baseSelector);

          for (const element of elements) {
            if (
              element.textContent
                ?.trim()
                .toLowerCase()
                .includes(text?.toLowerCase())
            ) {
              if (this.isElementVisible(element)) {
                return element;
              }
            }
          }
        } else {
          const element = document.querySelector(selector);
          if (element && this.isElementVisible(element)) {
            return element;
          }
        }
      } catch (error) {
        continue;
      }
    }

    const allButtons = document.querySelectorAll("button, a");
    for (const button of allButtons) {
      const buttonText = button.textContent?.trim().toLowerCase();
      if (buttonText === "easy apply" && this.isElementVisible(button)) {
        return button;
      }
    }

    return null;
  }

  checkIfAlreadyApplied() {
    try {
      // Look for buttons with "Applied" text that are disabled
      const appliedButtons = document.querySelectorAll("button[disabled]");

      for (const button of appliedButtons) {
        const buttonText = button.textContent?.trim().toLowerCase();
        const buttonContent = button.querySelector(
          '.button_ButtonContent___XxkG, [class*="ButtonContent"]'
        );
        const contentText = buttonContent?.textContent?.trim().toLowerCase();

        // Check if button text or content contains "applied"
        if (buttonText === "applied" || contentText === "applied") {
          return true;
        }
      }

      // Also check for any element with "applied" text that might indicate already applied
      const appliedIndicators = document.querySelectorAll(
        '[aria-disabled="true"], .applied, [class*="applied"]'
      );
      for (const indicator of appliedIndicators) {
        const text = indicator.textContent?.trim().toLowerCase();
        if (text === "applied") {
          return true;
        }
      }

      // Check for specific button structure from the example
      const specificButton = document.querySelector(
        "button.button_Button__o_a9q[disabled] .button_ButtonContent___XxkG"
      );
      if (
        specificButton &&
        specificButton.textContent?.trim().toLowerCase() === "applied"
      ) {
        return true;
      }

      return false;
    } catch (error) {
      console.error("❌ Error checking if already applied:", error);
      return false;
    }
  }

  async clickEasyApplyOnJobListing(button) {
    try {
      await this.delay(1000);

      // Try different click methods
      if (button.href) {
        // If it's a link, navigate to it
        window.location.href = button.href;
      } else {
        // If it's a button, click it
        button.click();
      }

      await this.delay(2000);
    } catch (error) {
      console.error("❌ Error clicking Easy Apply on job listing:", error);
    }
  }

  async clickEasyApply(button) {
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
    } catch (error) {
      console.error("❌ Error clicking Easy Apply:", error);
    }
  }

  async goToNextPage() {
    try {
      const nextButton = document.querySelector(this.selectors.nextPageButton);
      if (nextButton && this.isElementVisible(nextButton)) {
        nextButton.click();
        await this.delay(3000);

        // Reset processed jobs for new page
        this.state.processedJobs.clear();
        this.state.currentJobIndex = 0;

        return this.getJobCards().length > 0;
      }
      return false;
    } catch (error) {
      console.error("❌ Error going to next page:", error);
      return false;
    }
  }

  async handleSearchCompleted() {
    notifyStatus({ type: "SEARCH_COMPLETED" });
    this.state.isRunning = false;
    this.state.isProcessingJob = false; // Reset processing flag
    this.state.lastProcessedJobId = null; // Reset last processed job
  }

  getJobCardId(jobCard) {
    const jobId =
      jobCard.getAttribute("data-jobid") || jobCard.getAttribute("data-id");
    if (jobId) return jobId;

    const jobLink = jobCard.querySelector("a");
    if (jobLink?.href) {
      const match = jobLink.href.match(/jobListingId=(\d+)/);
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

  checkIfNoJobsFound() {
    try {
      // Check for "0 jobs" in the search results header
      const searchTitle = document.querySelector(
        'h1[data-test="search-title"], .SearchResultsHeader_jobCount__eHngv'
      );
      if (searchTitle) {
        const titleText = searchTitle.textContent?.trim() || "";
        // Match patterns like "0 Software engineer jobs in Canada"
        const zeroJobsMatch = titleText.match(/^0\s+.*jobs/i);
        if (zeroJobsMatch) {
          console.log(`📋 Detected zero jobs: "${titleText}"`);
          return true;
        }
      }

      // Alternative check: look for "No results found" or similar messages
      const pageText = document.body.textContent?.toLowerCase() || "";
      if (
        pageText.includes("0 jobs") ||
        pageText.includes("no jobs found") ||
        pageText.includes("no results found")
      ) {
        // Double-check by verifying there are actually no job cards
        const jobCards = this.getJobCards();
        if (jobCards.length === 0) {
          console.log("📋 No jobs found (verified by empty job cards)");
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("❌ Error checking if no jobs found:", error);
      return false;
    }
  }

  async checkAuthentication() {
    try {
      // Check for login/sign-in requirements - comprehensive detection

      // 1. Check for specific Glassdoor sign-in button with aria-label
      let signInButton = document.querySelector('button[aria-label="sign in"]');

      if (!signInButton) {
        // 2. Check for "Easy Apply" button that actually says "Sign in to apply"
        const easyApplyButtons = document.querySelectorAll(
          'button[data-test="easyApply"]'
        );
        for (const btn of easyApplyButtons) {
          const text = btn.textContent?.toLowerCase() || "";
          if (text.includes("sign in to apply") && this.isElementVisible(btn)) {
            signInButton = btn;
            break;
          }
        }
      }

      if (!signInButton) {
        // 3. Try specific selectors for common sign-in patterns
        const commonSignInSelectors = [
          'a[href*="login"]',
          'a[href*="signin"]',
          'a[href*="sign-in"]',
          'button[class*="signin"]',
          'button[class*="sign-in"]',
          ".signin-button",
          ".sign-in-button",
        ];

        for (const selector of commonSignInSelectors) {
          try {
            const element = document.querySelector(selector);
            if (element && this.isElementVisible(element)) {
              signInButton = element;
              break;
            }
          } catch (e) {
            // Skip invalid selectors
          }
        }
      }

      if (signInButton && this.isElementVisible(signInButton)) {
        return {
          canProceed: false,
          reason: "login",
          message: "🔐 Please log in to your Glassdoor account first",
        };
      }

      // Check for Glassdoor protection/reCAPTCHA page - STRICT matching
      const pageTitle = document.title?.toLowerCase() || "";

      // ONLY detect protection page if title specifically mentions it
      if (pageTitle.includes("help us protect glassdoor")) {
        return {
          canProceed: false,
          reason: "recaptcha",
          message:
            "🛡️ Glassdoor reCAPTCHA verification required. Please complete the verification manually.",
        };
      }

      // Check for VISIBLE CAPTCHA elements only
      const captchaSelectors = [
        ".g-recaptcha",
        ".h-captcha",
        ".hcaptcha",
        "[data-sitekey]",
        ".cf-turnstile",
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]',
        '[id*="cf-chl-widget"]',
      ];

      for (const selector of captchaSelectors) {
        const element = document.querySelector(selector);
        if (element && this.isElementVisible(element)) {
          console.log(`🛡️ Visible CAPTCHA detected via selector: ${selector}`);
          return {
            canProceed: false,
            reason: "captcha",
            message:
              "🛡️ CAPTCHA verification required. Please complete the verification manually.",
          };
        }
      }

      // Check for Cloudflare challenge page - only if there's a visible challenge widget
      const cfChallenge = document.querySelector('[id*="cf-chl"]');
      if (cfChallenge && this.isElementVisible(cfChallenge)) {
        return {
          canProceed: false,
          reason: "recaptcha",
          message:
            "🛡️ Cloudflare protection detected. Please complete the verification manually.",
        };
      }

      return {
        canProceed: true,
        reason: "authenticated",
        message: "✅ Ready to start",
      };
    } catch (error) {
      console.error("❌ Error in checkAuthentication:", error);
      console.error("❌ Error stack:", error.stack);
      return {
        canProceed: false,
        reason: "error",
        message: "❌ Error checking authentication",
      };
    }
  }

  handleAuthError(authCheck) {
    // Global overlay is always available via notifyStatus()

    if (authCheck.reason === "captcha" || authCheck.reason === "recaptcha") {
      notifyStatus({
        type: "RECAPTCHA_DETECTED",
        data: {
          message: authCheck.message,
          reason: authCheck.reason,
        },
      });
    } else if (authCheck.reason === "login") {
      // Show LOGIN_REQUIRED message in status overlay
      notifyStatus({
        type: "LOGIN_REQUIRED",
        data: {
          message: authCheck.message,
        },
      });
    } else {
      notifyStatus({
        type: "APPLICATION_ERROR",
        data: {
          message: authCheck.message,
        },
      });
    }
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

  // Note: saveAppliedJob is now handled via APPLICATION_COMPLETED message to message-router

  reportApplicationSubmitted(jobDetails, details) {
    this.safeSendPortMessage({
      type: "APPLICATION_SUCCESS",
      data: {
        url: jobDetails.jobUrl || window.location.href,
        jobData: {
          jobId: jobDetails.jobId,
          title: jobDetails.title,
          company: jobDetails.company,
          location: jobDetails.location,
          jobUrl: jobDetails.jobUrl || window.location.href,
          salary: jobDetails.salary || "Not specified",
          workplace: jobDetails.workplace || "Not specified",
          postedDate: jobDetails.postedDate || null,
          applicants: jobDetails.applicants || null,
          platform: this.platform,
          method: details.method,
          userId: this.config.userId,
          matchedPreferences: details.matchedPreferences || true,
          submittedAt: Date.now(),
          status: "Applied",
        },
      },
    });
  }

  safeSendPortMessage(message) {
    try {
      const formattedMessage = {
        ...message,
        platform: "glassdoor",
        action: message.type || message.action,
      };
      chrome.runtime.sendMessage(formattedMessage);
    } catch (error) {
      console.warn("Failed to send message to background:", error);
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  cleanup() {
    // Reset all state flags during cleanup
    this.state.isRunning = false;
    this.state.isProcessingJob = false;
    this.state.lastProcessedJobId = null;

    // Remove message listener to prevent duplicates
    if (this.messageListener) {
      chrome.runtime.onMessage.removeListener(this.messageListener);
      this.messageListener = null;
      this.messageListenerSetup = false;
    }

    // Global overlay cleanup handled by content-status-overlay.js

    // Clear global instance reference
    if (window.glassdoorPlatformInstance === this) {
      window.glassdoorPlatformInstance = null;
    }

    console.log("🧹 Glassdoor platform cleanup completed");
  }

  // ============================================================================
  // Utility methods copied from BasePlatformAutomation
  // ============================================================================

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
}
