import AIService from "../../services/ai-service.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { SimplyHiredFileHandler } from "./simplyhired-file-handler.js";
import { FormFingerprinter } from "./simplyhired-form-fingerprint.js";
import { EnhancedFormDetector } from "./simplyhired-form-detector.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";
import { AIResponseUtils } from "../../shared/utilities/index.js";

export default class SimplyHiredPlatform {
  constructor(config) {
    if (window.simplyHiredPlatformInstance) {
      console.log(
        "🔄 SimplyHired platform instance already exists, returning existing instance"
      );
      return window.simplyHiredPlatformInstance;
    }

    console.log("🚀 Creating new SimplyHired platform instance");

    // Initialize base properties (was previously handled by super(config))
    this.sessionId = config?.sessionId || null;
    this.platform = "simplyhired";
    this.userId = config?.userId || null;
    this.baseUrl = "https://www.simplyhired.com";
    this.config = config || {};
    this.contentScript = config?.contentScript || null;
    this.userProfile = config?.userProfile || null;
    this.sessionContext = config?.sessionContext || null;
    this.sessionApiHost = null;
    this.sessionAiApiHost = null;

    // Port communication (from BasePlatformAutomation)
    this.port = null;
    this.isPortConnected = false;
    this.portName = null;
    this.messageQueue = [];
    this.healthCheckInterval = null;
    this.keepAliveInterval = null;
    this.stateVerificationInterval = null;
    this.lastHealthCheck = Date.now();

    // Progress and search data (from BasePlatformAutomation)
    this.progress = {
      total: 0,
      processed: 0,
      applied: 0,
      skipped: 0,
      errors: 0,
    };

    this.searchData = {
      processedLinks: [],
      invalidLinks: [],
      submittedLinks: [],
      totalJobs: 0,
    };

    this.state = {
      isRunning: false,
      currentJobIndex: 0,
      processedJobs: new Set(),
      jobQueue: [],
      submittedLinks: [],
      cancelFileUploads: false,
      isProcessingJob: false,
      isInitializing: false,
    };

    // Initialize intelligent form handling
    this.formFingerprinter = new FormFingerprinter();
    this.formDetector = new EnhancedFormDetector();

    // Initialize co-pilot state
    this.copilotState = new CoPilotState();

    // Set initial mode from session context preferences
    const copilotMode = this.config.config.preferences.copilotMode;
    if (copilotMode === "co-pilot") {
      this.copilotState.switchToCoPilot();
    } else {
      this.copilotState.switchToAutoPilot();
    }

    // Co-pilot mode properties
    this.copilotMode = false;
    this.currentJobTitle = null;
    this.userHasControl = false;

    // User action promise for co-pilot mode
    this.userActionResolver = null;
    this.userActionPromise = null;

    this.aiApiHost = null;
    this.HOST = null;
    this.backendApiHost = null;
    this.applicationTracker = null;
    this.aiService = null;
    this.fileHandler = null;
    this.selectors = {
      jobCards:
        "[data-testid='searchSerpJob'], .SerpJob-jobCard, [data-testid='job-listing'], .job-item, .job-result",
      jobTitle:
        "[data-testid='searchSerpJobTitle'] a, .SerpJob-jobTitle a, .jobposting-title a, .job-title a, .job-link",
      companyName:
        "[data-testid='companyName'], .SerpJob-company a, .company-name, .job-company, .company",
      location:
        "[data-testid='searchSerpJobLocation'], .SerpJob-location, .job-location, .location",
      salary:
        "[data-testid='searchSerpJobSalaryConfirmed'], .salary, .job-salary",
      jobDescription:
        "[data-testid='viewJobBodyContainer'], [data-testid='viewJobDescriptionContainer'], [data-testid='searchSerpJobSnippet'], .jobposting-description, .job-description, [data-testid='job-description'], .job-snippet",
      jobQualifications: "[data-testid='viewJobQualificationsContainer']",
      applyButton:
        "[data-testid='viewJobHeaderFooterApplyButton'], [data-testid='searchSerpJobQuickApply'], button[data-testid='apply-button'], .apply-button",
      nextPageButton:
        "[data-testid='pageNumberBlockNext'], .np:last-child, .next-page, [aria-label='Next'], .pn",
      paginationContainer: "[role='navigation'][aria-label='pagination']",
      currentPage: "[aria-current='true']",

      // Form selectors
      formContainer:
        "form, .application-form, .job-form, #mosaic-provider-module-apply-contact-info",
      textInputs:
        'input[type="text"], input[type="email"], input[type="tel"], input[type="number"]',
      textareas: "textarea",
      selectInputs: "select",
      checkboxes: 'input[type="checkbox"]',
      radioButtons: 'input[type="radio"]',
      fileInputs: 'input[type="file"]',

      // Submit button
      submitButton:
        'button[type="submit"], .submit-btn, button:contains("Submit"), button:contains("Apply")',
    };

    // Set global instance
    window.simplyHiredPlatformInstance = this;
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

  getJwtToken() {
    return (
      this.sessionContext?.jwtToken ||
      this.sessionContext?.sessionConfig?.jwtToken ||
      this.config.jwtToken
    );
  }

  async setSessionContext(sessionContext) {
    // Store session context (was previously handled by super.setSessionContext())
    this.sessionContext = sessionContext;

    // Extract API hosts from the correct nested path
    this.sessionApiHost =
      sessionContext?.sessionConfig?.backendApiHost ||
      sessionContext?.backendApiHost ||
      sessionContext?.apiHost;
    this.sessionAiApiHost =
      sessionContext?.sessionConfig?.aiApiHost || sessionContext?.aiApiHost;

    this.config = { ...this.config, sessionContext };
    this.userProfile =
      sessionContext?.userProfile ||
      sessionContext?.sessionConfig?.userProfile ||
      this.userProfile;

    // Load co-pilot mode preference from session context
    if (sessionContext.preferences?.hasOwnProperty("copilotMode")) {
      console.log(
        `🎯 SimplyHired setSessionContext: preference copilotMode=${sessionContext.preferences.copilotMode}`
      );
      if (sessionContext.preferences.copilotMode === true) {
        this.copilotState.switchToCoPilot();
        this.copilotMode = true; // Update the copilotMode flag
        console.log(
          `🎯 SimplyHired: Switched to co-pilot mode, copilotMode=${this.copilotMode}`
        );
        if (true) {
          // Global overlay always available
          updateStatusButtons("co-pilot-search");
        }
      } else {
        this.copilotState.switchToAutoPilot();
        this.copilotMode = false; // Update the copilotMode flag
        console.log(
          `🎯 SimplyHired: Switched to auto-pilot mode, copilotMode=${this.copilotMode}`
        );
        if (true) {
          // Global overlay always available
          updateStatusButtons("auto-pilot");
        }
      }
    } else {
      console.log(
        `🎯 SimplyHired setSessionContext: No copilotMode preference found`
      );
    }
  }

  getPlatformDomains() {
    return ["https://www.simplyhired.com/"];
  }

  getSearchLinkPattern() {
    return /^https:\/\/(www\.)?simplyhired\.com\/(search|job).*$/;
  }

  isValidJobPage(url) {
    return /simplyhired\.com\/(job|search)/i.test(url);
  }

  async initialize() {
    // Initialize port connection (was previously handled by super.initialize())
    this.initializePortConnection();

    // Also set up chrome.runtime.onMessage listener for message-router communication
    this.setupMessageListener();
  }

  /**
   * Set up chrome.runtime.onMessage listener for message-router
   * This supplements the port-based communication
   */
  setupMessageListener() {
    try {
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
            return;
          }

          const { type, data } = message;

          switch (type) {
            case "CONTROL_ACTION":
              this.handleCoPilotAction({ action: message.action });
              sendResponse && sendResponse({ success: true });
              break;

            case "SEARCH_NEXT":
              this.handleSearchNext(data);
              sendResponse && sendResponse({ success: true });
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
              sendResponse && sendResponse({ success: true });
              break;

            case "ALREADY_APPLIED":
            case "DUPLICATE":
              this.handleDuplicateJob(data);
              sendResponse && sendResponse({ success: true });
              break;

            case "LIMIT_REACHED":
              notifyStatus({ type: "LIMIT_REACHED" });
              sendResponse && sendResponse({ success: true });
              break;

            case "COMPANY_BLACKLISTED":
              notifyStatus({
                type: "COMPANY_BLACKLISTED",
                data: {
                  title: data?.title || "Job",
                  company: data?.company || "this company",
                },
              });
              sendResponse && sendResponse({ success: true });
              break;

            case "APPLICATION_STARTING":
              // Handle application starting
              sendResponse && sendResponse({ success: true });
              break;

            default:
              // Let other handlers process
              break;
          }
        } catch (error) {
          console.error("Error handling message:", error);
          sendResponse &&
            sendResponse({ success: false, error: error.message });
        }
        return true;
      });
    } catch (error) {
      console.error("Error setting up message listener:", error);
    }
  }

  /**
   * Common port connection initialization (from BasePlatformAutomation)
   */
  initializePortConnection() {
    try {
      if (this.port) {
        try {
          this.port.disconnect();
        } catch (e) {
          // Ignore errors when disconnecting
        }
      }

      const isApplyPage = this.isApplicationPage(window.location.href);
      const sessionSuffix = this.sessionId
        ? `-${this.sessionId.slice(-6)}`
        : "";
      const timestamp = Date.now();
      const portName = isApplyPage
        ? `${this.platform}-apply-${timestamp}${sessionSuffix}`
        : `${this.platform}-search-${timestamp}${sessionSuffix}`;

      console.log(`🔌 Creating connection with port name: ${portName}`);

      this.port = chrome.runtime.connect({ name: portName });

      if (!this.port) {
        throw new Error(
          "Failed to establish connection with background script"
        );
      }

      this.port.onMessage.addListener((message) => {
        this.handlePortMessage(message);
      });

      this.port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        if (error) {
          console.log("❌ Port disconnected due to error:", error);
        } else {
          console.log("🔌 Port disconnected");
        }

        this.port = null;

        if (!this.connectionRetries) this.connectionRetries = 0;
        if (!this.maxRetries) this.maxRetries = 3;

        if (this.connectionRetries < this.maxRetries) {
          this.connectionRetries++;
          console.log(
            `🔄 Attempting to reconnect (${this.connectionRetries}/${this.maxRetries})...`
          );
          setTimeout(() => this.initializePortConnection(), 5000);
        }
      });

      this.startKeepAliveInterval();

      this.connectionRetries = 0;
    } catch (error) {
      console.log("❌ Error initializing port connection:", error);
      if (!this.connectionRetries) this.connectionRetries = 0;
      if (!this.maxRetries) this.maxRetries = 3;

      if (this.connectionRetries < this.maxRetries) {
        this.connectionRetries++;
        setTimeout(() => this.initializePortConnection(), 5000);
      }
    }
  }

  isApplicationPage(url) {
    return url.includes("/apply") || url.includes("/application");
  }

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

  startHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => this.checkHealth(), 60000);
  }

  startStateVerification() {
    if (this.stateVerificationInterval) {
      clearInterval(this.stateVerificationInterval);
    }
  }

  checkHealth() {
    try {
      const now = Date.now();

      if (
        this.applicationState?.isApplicationInProgress &&
        this.applicationState?.applicationStartTime
      ) {
        const applicationTime =
          now - this.applicationState.applicationStartTime;

        if (applicationTime > 5 * 60 * 1000) {
          console.log("🚨 Application stuck for over 5 minutes, forcing reset");
          this.applicationState.isApplicationInProgress = false;
          this.applicationState.applicationStartTime = null;
          if (this.searchNext) setTimeout(() => this.searchNext(), 1000);
        }
      }
    } catch (error) {
      console.log("❌ Health check error", error);
    }
  }

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

  handlePortMessage(message) {
    try {
      // Special check for untyped limit reached message
      if (
        message?.canProceed === false &&
        message?.message === "Application limit reached"
      ) {
        console.log("🛑 SimplyHired: Untyped limit reached message received");
        notifyStatus({ type: "LIMIT_EXCEEDED" });
        if (this.state) this.state.isRunning = false;
        return;
      }

      const { type, data } = message || {};
      if (!type) {
        console.log("⚠️ Received message without type, ignoring");
        return;
      }

      switch (type) {
        case "CONNECTION_ESTABLISHED":
          this.handleConnectionEstablished(data);
          break;

        case "ALREADY_APPLIED":
          this.handleDuplicateJob(data);
          break;

        case "APPLICATION_STATUS":
          this.handleApplicationStatus(data);
          break;

        case "SEARCH_NEXT":
          if (this.sendCvPageNotRespondTimeout) {
            clearTimeout(this.sendCvPageNotRespondTimeout);
            this.sendCvPageNotRespondTimeout = null;
          }

          if (!this.applicationState) this.applicationState = {};

          this.applicationState.isApplicationInProgress = false;
          this.applicationState.applicationStartTime = null;
          if (!this.applicationState.processedLinksCount)
            this.applicationState.processedLinksCount = 0;
          this.applicationState.processedLinksCount++;

          this.safeSendPortMessage({ type: "SEARCH_NEXT_READY" });

          // Display status overlay based on reason
          if (data?.reason === "Already applied") {
            notifyStatus({
              type: "ALREADY_APPLIED",
              data: { title: data?.title || "Job" },
            });
          } else if (data?.reason === "Company blacklisted") {
            notifyStatus({
              type: "COMPANY_BLACKLISTED",
              data: {
                title: data?.title || "Job",
                company: data?.company || "this company",
              },
            });
          } else if (data?.reason === "Limit reached") {
            console.log("🛑 SimplyHired: Limit reached in handlePortMessage", {
              overlayReady: !!window.StatusOverlay?.isReady?.(),
            });
            notifyStatus({ type: "LIMIT_EXCEEDED" });
            return; // Stop automation when limit is reached
          }

          if (!data || !data.url) {
            console.log("No URL data in handleSearchNext");
            if (this.searchNext) setTimeout(() => this.searchNext(), 2500);
            return;
          }

          if (this.updateLinkStatus) this.updateLinkStatus(data);
          if (this.recordSubmission) this.recordSubmission(data);
          if (this.searchNext) setTimeout(() => this.searchNext(), 2500);
          break;

        case "DUPLICATE":
          this.handleDuplicateJob(data);
          break;

        case "ERROR":
          this.handleErrorMessage(message);
          break;

        case "APPLICATION_SKIPPED":
          this.handleApplicationSkipped(data);
          break;

        case "APPLICATION_ERROR":
          this.handleApplicationError(data);
          break;

        case "APPLICATION_SUCCESS":
          this.handleApplicationSuccess(data);
          break;

        case "KEEPALIVE_RESPONSE":
          break;

        default:
          this.handlePlatformSpecificMessage(type, data);
      }
    } catch (error) {
      console.log("❌ Error handling port message:", error);
    }
  }

  findJobCard(data) {
    if (data.jobKey) {
      return this.findJobCardByJobKey(data.jobKey);
    }
    if (data.url) {
      return this.state.jobQueue.find((card) => {
        const link = card.querySelector("a");
        return (
          link && (data.url.includes(link.href) || link.href.includes(data.url))
        );
      });
    }
    return null;
  }

  handleConnectionEstablished(data) {}

  handleApplicationStatus(data) {
    console.log("📊 Application status update:", data);

    if (!this.applicationState) this.applicationState = {};

    if (data.inProgress && !this.applicationState.isApplicationInProgress) {
      this.applicationState.isApplicationInProgress = true;
      this.applicationState.applicationStartTime = Date.now();
    } else if (
      !data.inProgress &&
      this.applicationState.isApplicationInProgress
    ) {
      this.applicationState.isApplicationInProgress = false;
      this.applicationState.applicationStartTime = null;
      if (this.searchNext) setTimeout(() => this.searchNext(), 1000);
    }
  }

  handlePlatformSpecificMessage(type, data) {
    console.log(`❓ Unhandled message type: ${type}`);
  }

  searchNext() {
    this.state.isProcessingJob = false;
    setTimeout(() => this.processNextJob(), 1000);
  }

  handleDuplicateJob(data) {
    console.log("Duplicate job detected:", data);
    notifyStatus({
      type: "ALREADY_APPLIED",
      data: { title: data?.title || this.currentJobTitle || "Job" },
    });

    // Mark card as skipped/duplicate
    if (data?.url || data?.jobKey) {
      const jobCard = this.findJobCard(data);
      console.log("Job card found:", jobCard);
      if (jobCard) {
        this.markJobCard(jobCard, "skipped");
      }
    }

    this.searchNext();
  }

  handleSearchNext(data) {
    console.log("🔄 Received search next notification", data);

    // Update visual status
    if (data && data.url) {
      // Try to find card by URL if jobKey missing from response
      const jobCard = this.state.jobQueue.find((card) => {
        const link = card.querySelector("a");
        return link && data.url.includes(link.href);
      });

      if (jobCard) {
        const status = data.status === "SUCCESS" ? "applied" : "skipped";
        this.markJobCard(jobCard, status);
      }
    }

    // Also try via jobKey if available (more reliable)
    if (data.jobData?.jobKey) {
      const targetJobCard = this.findJobCardByJobKey(data.jobData.jobKey);
      if (targetJobCard) {
        const visualStatus = data.status === "SUCCESS" ? "applied" : "skipped";
        this.markJobCard(targetJobCard, visualStatus);
      }
    }

    if (this.sendCvPageNotRespondTimeout) {
      clearTimeout(this.sendCvPageNotRespondTimeout);
      this.sendCvPageNotRespondTimeout = null;
    }

    if (!this.applicationState) this.applicationState = {};

    this.applicationState.isApplicationInProgress = false;
    this.applicationState.applicationStartTime = null;
    if (!this.applicationState.processedLinksCount)
      this.applicationState.processedLinksCount = 0;
    this.applicationState.processedLinksCount++;

    this.safeSendPortMessage({ type: "SEARCH_NEXT_READY" });

    // Display status overlay based on reason
    if (data?.reason === "Already applied") {
      notifyStatus({
        type: "ALREADY_APPLIED",
        data: { title: data?.title || "Job" },
      });
    } else if (data?.reason === "Company blacklisted") {
      notifyStatus({
        type: "COMPANY_BLACKLISTED",
        data: {
          title: data?.title || "Job",
          company: data?.company || "this company",
        },
      });
    } else if (data?.reason === "Limit reached") {
      console.log("🛑 SimplyHired: Limit reached in handleSearchNext", {
        overlayReady: !!window.StatusOverlay?.isReady?.(),
      });
      notifyStatus({ type: "LIMIT_EXCEEDED" });
      return; // Stop automation when limit is reached
    }

    if (!data || !data.url) {
      console.log("No URL data in handleSearchNext");
      if (this.searchNext) setTimeout(() => this.searchNext(), 2500);
      return;
    }

    if (this.updateLinkStatus) this.updateLinkStatus(data);
    if (this.recordSubmission) this.recordSubmission(data);
    if (this.searchNext) setTimeout(() => this.searchNext(), 2500);
  }

  async initializeWithPageDetection() {
    const url = window.location.href;
    if (this.isApplicationSuccess()) {
      await this.handleApplicationSuccessPage();
    } else if (this.isFormPage(url)) {
      await this.handleFormPage();
    } else if (this.isSearchPage(url)) {
      await this.startJobProcessing();
    }
  }

  async checkForCaptcha() {
    try {
      console.log("🛡️ Checking for SimplyHired/Cloudflare CAPTCHA...");

      // Check 1: Document Title
      const title = document.title.toLowerCase();
      if (
        title.includes("just a moment") ||
        title.includes("security challenge")
      ) {
        return this.handleCaptchaDetected("Title match");
      }

      // Check 2: Text content (more robust than innerText)
      const textContent = document.body.textContent.toLowerCase();
      if (
        textContent.includes("verify you are human") ||
        textContent.includes("verify you are a human") ||
        textContent.includes("review the security of your connection") ||
        (textContent.includes("cloudflare") && textContent.includes("ray id"))
      ) {
        return this.handleCaptchaDetected("Text content match");
      }

      // Check 3: Raw HTML (for shadow DOM content or hidden inputs)
      const innerHTML = document.body.innerHTML; // Case sensitive check specifically for ID/Names
      if (
        innerHTML.includes("cf-turnstile-response") ||
        innerHTML.includes("challenges.cloudflare.com") ||
        innerHTML.includes("cf-chl-widget")
      ) {
        return this.handleCaptchaDetected("HTML source match");
      }

      // Check 4: Specific Elements (if light DOM)
      const captchaSelectors = [
        'iframe[src*="cloudflare"]',
        'iframe[title*="Cloudflare"]',
        'input[name="cf-turnstile-response"]',
        "#challenge-error-text",
        "#cf-chl-widget-container",
      ];

      const hasCaptchaElements = captchaSelectors.some((selector) =>
        document.querySelector(selector)
      );

      if (hasCaptchaElements) {
        return this.handleCaptchaDetected("Element selector match");
      }

      return false;
    } catch (error) {
      console.error("Error checking for CAPTCHA:", error);
      return false;
    }
  }

  handleCaptchaDetected(reason) {
    console.log(`🛑 CAPTCHA detected (${reason})! Pausing automation.`);
    notifyStatus({ type: "CAPTCHA_DETECTED" });
    this.state.isRunning = false;
    return true;
  }

  isSearchPage(url) {
    return /simplyhired\.com\/(search|job)/i.test(url);
  }

  isFormPage(url) {
    return (
      url.includes("smartapply.indeed.com") ||
      url.includes("apply") ||
      url.includes("application")
    );
  }

  /**
   * Find Continue/Next button in form
   * Used to detect button-only steps (steps without any form fields)
   */
  findContinueButton(questionsForm) {
    let continueButton = questionsForm.querySelector(
      '[data-testid="continue-button"]'
    );

    if (!continueButton) {
      const buttons = questionsForm.querySelectorAll("button");
      continueButton = Array.from(buttons).find((button) => {
        const span = button.querySelector("span");
        const text = span?.textContent || button.textContent;
        return (
          text &&
          (text.toLowerCase().includes("review") ||
            text.toLowerCase().includes("continue") ||
            text.toLowerCase().includes("next"))
        );
      });
    }

    return continueButton;
  }

  async start() {
    try {
      if (this.state.isRunning || this.state.isInitializing) {
        console.log("🔄 Already running or initializing, skipping start()");
        return true;
      }

      this.state.isInitializing = true;

      const authCheck = await this.checkAuthentication();
      if (!authCheck.canProceed) {
        this.state.isInitializing = false;
        this.handleAuthError(authCheck);
        return false;
      }

      this.state.isRunning = true;
      this.state.isInitializing = false;
      notifyStatus({ type: "AUTOMATION_STARTING" });

      // Ensure correct mode buttons are shown after automation starts
      this.restoreModeButtons();

      if (!this.userProfile) {
        this.userProfile = this.getInjectedUserProfile();
      }

      // Register search tab using port connection (only for valid search pages)
      if (this.isSearchPage(window.location.href)) {
        try {
          this.safeSendPortMessage({
            type: "REGISTER_SEARCH_TAB",
            data: {
              url: window.location.href,
            },
          });
        } catch (error) {
          console.warn("Failed to register search tab:", error);
        }
      }

      await this.initializeWithPageDetection();
      return true;
    } catch (error) {
      console.error("❌ Failed to start SimplyHired automation:", error);
      this.state.isRunning = false;
      this.state.isInitializing = false;
      return false;
    }
  }

  async startJobProcessing() {
    try {
      // Check for CAPTCHA before processing anything
      if (await this.checkForCaptcha()) {
        return;
      }

      // Check if there are no jobs found on the page
      const noJobsFoundMessage = document.querySelector(
        ".chakra-text.css-1viecv6"
      );
      if (
        noJobsFoundMessage &&
        noJobsFoundMessage.textContent
          .toLowerCase()
          .includes("we could not find any")
      ) {
        console.log("❌ No jobs found on search page");
        notifyStatus({
          type: "JOB_NOT_FOUND",
          data: {
            message: noJobsFoundMessage.textContent.trim(),
            jobCount: 0,
          },
        });
        await this.handleNoJobsFound();
        return;
      }

      const jobCards = this.getJobCards();
      console.log(jobCards);

      if (jobCards.length === 0) {
        await this.handleNoJobsFound();
        return;
      }

      this.state.jobQueue = Array.from(jobCards);

      notifyStatus({
        type: "JOB_SEARCH_STARTED",
        data: {
          preferences: {
            ...(this.sessionContext?.preferences || this.config?.config?.preferences || {}),
            copilotMode: this.copilotState.isInCoPilotMode()
              ? "co-pilot"
              : "auto-pilot",
          },
        },
      });

      await this.processNextJob();
    } catch (error) {
      notifyStatus({
        type: "APPLICATION_ERROR",
        data: {
          message: error.message,
          jobCount: this.state.jobQueue.length,
        },
      });
    }
  }

  async processNextJob() {
    try {
      console.log("📋 processNextJob called");

      if (!this.state.isRunning) {
        console.log("⏹️ processNextJob: not running, returning");
        return;
      }

      // Check if automation was stopped
      if (this.state.automationStopped) {
        console.log("⏹️ processNextJob: automation stopped, returning");
        return;
      }

      // Prevent duplicate job processing
      if (this.state.isProcessingJob) {
        console.log("⏸️ processNextJob: already processing a job, returning");
        return;
      }

      this.state.isProcessingJob = true;
      console.log("✅ processNextJob: set isProcessingJob = true");

      const unprocessedJobs = this.getUnprocessedJobs();
      console.log(`📊 processNextJob: found ${unprocessedJobs.length} unprocessed jobs`);

      if (unprocessedJobs.length === 0) {
        this.state.isProcessingJob = false; // Reset guard
        if (await this.goToNextPage()) {
          setTimeout(() => this.processNextJob(), 3000);
        } else {
          notifyStatus({
            type: "JOB_NOT_FOUND",
            data: {
              message: "No more jobs found on this page",
              jobCount: this.state.jobQueue.length,
            },
          });
          await this.handleSearchCompleted();
        }
        return;
      }

      const jobCard = unprocessedJobs[0];
      this.markJobCard(jobCard, "processing");

      await this.expandJobDetails(jobCard);

      const jobInfo = await this.extractJobInfo(jobCard);
      this.currentJobId = jobInfo.jobId;

      // Note: applicationTracker is initialized in handleInitializeAutomation()

      this.state.isRunning = true;

      // Check if user wants to apply to matching jobs only
      if (
        this.config.config.preferences.applyOnlyMatching ||
        this.config.config.preferences.applyOnlyQualified
      ) {
        const isMatch = await this.doesJobMatchPreferences(jobInfo);

        if (!isMatch) {
          console.log(
            `⏭️ Skipping job "${jobInfo.title}" - does not match user preferences`
          );
          notifyStatus({
            type: "DOES_NOT_MATCH_PREFERENCES",
            data: {
              title: jobInfo.title,
              reason: this.reason,
            },
          });
          await this.delay(2000);

          this.markJobCard(jobCard, "skipped");
          this.state.processedJobs.add(this.getJobCardId(jobCard));

          // Update submitted links
          this.updateSubmittedLinks(jobInfo.jobUrl, "PREFERENCE_MISMATCH", {
            reason: "Job does not match user preferences",
          });

          this.state.isProcessingJob = false;
          setTimeout(() => this.processNextJob(), 1000);
          return;
        }
      }

      await this.saveJobToStorage(jobInfo);

      // Set current job title for co-pilot mode
      this.currentJobTitle = jobInfo.title || "this job";

      // Update copilotMode from copilotState
      this.copilotMode = this.copilotState.isInCoPilotMode();
      console.log(
        `🎯 SimplyHired processJob: copilotMode=${
          this.copilotMode
        }, copilotState=${this.copilotState.isInCoPilotMode()}`
      );

      const applyButton = this.findApplyButton(jobCard);

      if (!applyButton) {
        this.markJobCard(jobCard, "skipped");
        this.state.processedJobs.add(this.getJobCardId(jobCard));

        // Update submitted links
        this.updateSubmittedLinks(jobInfo.jobUrl, "SKIPPED", {
          reason: "NO_APPLY_BUTTON",
        });

        this.state.isProcessingJob = false; // Reset guard
        setTimeout(() => this.processNextJob(), 1000);
        return;
      }

      notifyStatus({
        type: "APPLYING_TO_JOB",
        data: { title: jobInfo.title },
      });

      await this.clickApply(applyButton, jobInfo);

      this.state.processedJobs.add(this.getJobCardId(jobCard));
      // Keep isProcessingJob = true - wait for SEARCH_NEXT from background to continue
      // The background will send SEARCH_NEXT after the job tab completes/closes

      // Set a fallback timeout as a safety net (2 minutes) in case message flow fails
      if (this.applicationFallbackTimeout) {
        clearTimeout(this.applicationFallbackTimeout);
      }
      this.applicationFallbackTimeout = setTimeout(() => {
        if (this.state?.isRunning && !this.state?.automationStopped && this.state?.isProcessingJob) {
          console.log("⏱️ Fallback timeout - no SEARCH_NEXT received, forcing continue");
          this.state.isProcessingJob = false;
          this.processNextJob();
        }
      }, 120000); // 2 minute fallback (safety net only)
    } catch (error) {
      this.state.isProcessingJob = false; // Reset guard on error
      setTimeout(() => this.processNextJob(), 2000);
    }
  }

  getJobCards() {
    // Get job cards and filter for Quick Apply only (like ZipRecruiter)
    const allCards = document.querySelectorAll(this.selectors.jobCards);
    const eligibleCards = Array.from(allCards)
      .filter((card) => this.isElementVisible(card))
      .filter((card) => this.hasQuickApply(card));

    return eligibleCards;
  }

  getUnprocessedJobs() {
    const allCards = this.getJobCards();
    return Array.from(allCards).filter((card) => {
      const cardId = this.getJobCardId(card);
      return !this.state.processedJobs.has(cardId);
    });
  }

  hasQuickApply(jobCard) {
    // Check for Quick Apply badge text (similar to ZipRecruiter implementation)
    const quickApplyTexts = [
      "quick apply",
      "1-click apply",
      "easy apply",
      "instant apply",
    ];

    // Method 1: Check text content of the entire job card
    const allText = jobCard.textContent?.toLowerCase() || "";
    for (const text of quickApplyTexts) {
      if (allText.includes(text)) {
        return true;
      }
    }

    // Method 2: Check specific badge elements and buttons
    const badgeElements = jobCard.querySelectorAll(
      "span, p, div, button, .badge, .tag, .apply-badge"
    );
    for (const element of badgeElements) {
      const text = element.textContent?.toLowerCase() || "";
      if (quickApplyTexts.some((badge) => text.includes(badge))) {
        return true;
      }
    }

    // Method 3: Check for SimplyHired specific Quick Apply selectors
    const quickApplySelectors = [
      "[data-testid='searchSerpJobQuickApply']",
      ".quick-apply",
      ".easy-apply",
      ".one-click-apply",
      "button[aria-label*='Quick Apply']",
      "button[aria-label*='Easy Apply']",
    ];

    for (const selector of quickApplySelectors) {
      const element = jobCard.querySelector(selector);
      if (element && this.isElementVisible(element)) {
        return true;
      }
    }

    return false;
  }

  async expandJobDetails(jobCard) {
    try {
      // Click on job card to expand details
      const jobLink =
        jobCard.querySelector(this.selectors.jobTitle) ||
        jobCard.querySelector("a");
      if (jobLink && !jobLink.href?.includes("apply")) {
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
      const salary =
        jobCard.querySelector(this.selectors.salary)?.textContent?.trim() ||
        "Not specified";

      // Try to get expanded job description from the page
      let jobDescription = "";
      const descriptionElement = document.querySelector(
        this.selectors.jobDescription
      );
      if (descriptionElement) {
        jobDescription = descriptionElement.textContent?.trim() || "";
      }

      // Also extract qualifications if available
      const qualificationsElement = document.querySelector(
        this.selectors.jobQualifications
      );
      if (qualificationsElement) {
        const qualificationsText =
          qualificationsElement.textContent?.trim() || "";
        if (qualificationsText) {
          jobDescription = jobDescription
            ? `${jobDescription}\n\nQualifications:\n${qualificationsText}`
            : `Qualifications:\n${qualificationsText}`;
        }
      }

      // If we still don't have a description, try to get it from the job card itself
      if (!jobDescription && jobCard) {
        const cardSnippet = jobCard.querySelector(
          "[data-testid='searchSerpJobSnippet'], .job-snippet"
        );
        if (cardSnippet) {
          jobDescription = cardSnippet.textContent?.trim() || "";
        }
      }

      const jobKey =
        jobCard.getAttribute("data-jobkey") ||
        jobCard.getAttribute("data-job-key");

      const jobLink = jobCard.querySelector("a");
      let jobUrl = "";
      let jobId = "";

      if (jobLink?.href) {
        jobUrl = jobLink.href;
        const match = jobUrl.match(/\/job\/([^\/\?]+)/);
        jobId = match ? match[1] : this.generateJobId(title, company);
      } else {
        jobUrl = window.location.href;
        jobId = this.generateJobId(title, company);
      }

      // Use jobKey if available, otherwise use jobId as fallback for jobKey
      const finalJobKey = jobKey || jobId;
      const primaryJobId = finalJobKey;

      const jobInfo = {
        jobId: primaryJobId,
        jobKey: finalJobKey,
        cardId: this.getJobCardId(jobCard),
        title,
        company,
        location,
        description: jobDescription,
        jobUrl,
        platform: this.platform,
        timestamp: Date.now(),
        salary,
        workplace: "",
        postedDate: null,
        applicants: null,
      };

      return jobInfo;
    } catch (error) {
      return {
        jobId: "unknown",
        title: "Unknown Position",
        company: "Unknown Company",
        location: "Unknown Location",
        description: "",
        jobUrl: window.location.href,
        platform: this.platform,
        timestamp: Date.now(),
      };
    }
  }

  generateJobId(title, company) {
    const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const cleanCompany = company.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    return `${cleanTitle}_${cleanCompany}_${Date.now()}`;
  }

  async saveJobToStorage(jobInfo) {
    try {
      await chrome.storage.local.set({
        currentJobData: {
          ...jobInfo,
          timestamp: Date.now(),
        },
      });

      try {
        chrome.runtime.sendMessage({
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
    }
  }

  findApplyButton(jobCard) {
    const quickApplyTexts = [
      "quick apply",
      "1-click apply",
      "easy apply",
      "instant apply",
    ];

    // Priority 1: Find button with specific test ID (most reliable for Quick Apply)
    const testIdButton = document.querySelector(
      '[data-testid="viewJobHeaderFooterApplyButton"]'
    );
    if (testIdButton && this.isElementVisible(testIdButton)) {
      const mdref = testIdButton.getAttribute("data-mdref");
      const href = testIdButton.getAttribute("href");
      // Verify it's an outbound apply link (/out?r=...), not a job details link (/job/...)
      if ((mdref && mdref.includes("/out")) || (href && href.includes("/out"))) {
        console.log("✅ Found Quick Apply button with data-testid and /out URL");
        return testIdButton;
      }
    }

    // Priority 2: Find any link with data-mdref pointing to /out (apply redirect)
    const allMdrefLinks = document.querySelectorAll('a[data-mdref*="/out"]');
    for (const link of allMdrefLinks) {
      if (this.isElementVisible(link)) {
        const buttonText = link.textContent?.trim().toLowerCase() || "";
        if (buttonText.includes("apply")) {
          console.log("✅ Found apply button with /out data-mdref");
          return link;
        }
      }
    }

    // Priority 3: Search within job card
    if (jobCard) {
      const quickApplyButtons = jobCard.querySelectorAll("button, a");
      for (const button of quickApplyButtons) {
        const buttonText = button.textContent?.trim().toLowerCase();
        const ariaLabel =
          button.getAttribute("aria-label")?.toLowerCase() || "";
        const hasMdref = button.getAttribute("data-mdref");
        const hasHref = button.href && !button.href.includes("#");

        if (
          quickApplyTexts.some(
            (text) => buttonText.includes(text) || ariaLabel.includes(text)
          ) &&
          this.isElementVisible(button) &&
          !button.disabled &&
          (hasMdref || hasHref)
        ) {
          console.log("✅ Found apply button in job card");
          return button;
        }
      }
    }

    // Priority 4: Search entire document for quick apply buttons with valid URLs
    const allQuickApplyButtons = document.querySelectorAll("button, a");
    for (const button of allQuickApplyButtons) {
      const buttonText = button.textContent?.trim().toLowerCase();
      const ariaLabel = button.getAttribute("aria-label")?.toLowerCase() || "";
      const hasMdref = button.getAttribute("data-mdref");
      const hasHref = button.href && !button.href.includes("#");

      if (
        quickApplyTexts.some(
          (text) => buttonText.includes(text) || ariaLabel.includes(text)
        ) &&
        this.isElementVisible(button) &&
        !button.disabled &&
        (hasMdref || hasHref)
      ) {
        console.log("✅ Found apply button in document");
        return button;
      }
    }

    // Priority 5: Use selector from config, but verify /out URL
    if (jobCard) {
      let applyButton = jobCard.querySelector(this.selectors.applyButton);
      if (applyButton && this.isElementVisible(applyButton) && !applyButton.disabled) {
        const mdref = applyButton.getAttribute("data-mdref");
        const href = applyButton.getAttribute("href");
        if ((mdref && mdref.includes("/out")) || (href && href.includes("/out"))) {
          console.log("✅ Found apply button via selector in job card with /out URL");
          return applyButton;
        }
      }
    }

    // Priority 6: Document-wide selector search with /out URL check
    let applyButton = document.querySelector(this.selectors.applyButton);
    if (applyButton && this.isElementVisible(applyButton) && !applyButton.disabled) {
      const mdref = applyButton.getAttribute("data-mdref");
      const href = applyButton.getAttribute("href");
      if ((mdref && mdref.includes("/out")) || (href && href.includes("/out"))) {
        console.log("✅ Found apply button via selector in document with /out URL");
        return applyButton;
      }
    }

    // No valid Quick Apply button found - job may not support Quick Apply
    console.log("⚠️ No Quick Apply button with /out URL found for this job");
    return null;
  }

  async clickApply(button, jobInfo) {
    try {
      console.log("🖱️ clickApply called for:", jobInfo.title);

      // Get URL for tracking purposes
      const dataMdref = button.getAttribute("data-mdref");
      let targetUrl = null;
      if (dataMdref) {
        targetUrl = `https://www.simplyhired.com${dataMdref}`;
      } else if (button.href && !button.href.includes("#")) {
        targetUrl = button.href;
      }

      if (!targetUrl) {
        console.error("❌ No valid URL found for Quick Apply button");
        this.updateSubmittedLinks(jobInfo.jobUrl, "ERROR", {
          error: "No valid URL found for Quick Apply button",
        });
        return;
      }

      console.log("🖱️ Opening apply link in new tab:", targetUrl);

      // Use background script to open the tab - this is the most reliable method
      // as it bypasses popup blockers and doesn't get intercepted by page JS
      this.safeSendPortMessage({
        type: "OPEN_APPLICATION_TAB",
        data: {
          jobId: jobInfo.jobId,
          url: targetUrl,
          title: jobInfo.title,
          company: jobInfo.company,
          platform: this.platform,
        },
      });

      this.updateSubmittedLinks(jobInfo.jobUrl, "IN_PROGRESS", jobInfo);

      await this.delay(1000);
    } catch (error) {
      console.error("❌ Error in clickApply:", error);
      this.updateSubmittedLinks(jobInfo.jobUrl, "ERROR", {
        error: error.message,
      });
    }
  }

  async handleFormPage() {
    try {
      const url = window.location.href;
      if (
        url.includes("smartapply.indeed.com/beta/indeedapply/form") &&
        !url.includes("/questions") &&
        !url.includes("/review")
      ) {
        await this.waitForFormElementsToLoad();
      } else {
        await this.delay(3000);
        await this.delay(3000); // Increased from 2s to 3s
        await this.waitForFormElementsToLoad();
      }

      if (this.isAlreadyAppliedPage()) {
        await this.handleAlreadyAppliedPage();
        return;
      }

      // Get current job data
      const jobData = await chrome.storage.local.get("currentJobData");
      const currentJob = jobData.currentJobData || {};

      // Get user details
      if (!this.userProfile) {
        this.userProfile = this.getInjectedUserProfile();
      }

      if (!this.userProfile) {
        this.sendApplicationError(new Error("No user profile available"));
        return;
      }

      // Send form tab ready message
      try {
        chrome.runtime.sendMessage({
          type: "FORM_TAB_READY",
          url: window.location.href,
        });
      } catch (error) {
        console.warn("Failed to send FORM_TAB_READY:", error);
      }

      notifyStatus({ type: "FILLING_FORM" });

      // Initialize button state based on co-pilot mode
      if (true) {
        // Global overlay always available
        if (this.copilotState.isInCoPilotMode()) {
          // In co-pilot mode, show "⚡ Let AI Take Over" + "Skip Job"
          // User already has control by choosing co-pilot mode
          updateStatusButtons("co-pilot-search");
        } else {
          // In auto-pilot mode, show "Switch to Co-Pilot" + "Skip Job"
          updateStatusButtons("auto-pilot");
        }
      }
      // Process the form in steps
      const formResult = await this.processApplicationForm(currentJob);

      if (formResult === "step_completed") {
        this.monitorApplicationCompletion(currentJob);
      } else if (formResult === "submitted") {
        this.monitorApplicationCompletion(currentJob);
      } else if (formResult === "captcha") {
        this.monitorApplicationCompletion(currentJob);
      } else {
        this.sendApplicationError(new Error("Form processing failed"));
      }
    } catch (error) {
      this.sendApplicationError(error);
    }
  }

  isAlreadyAppliedPage() {
    const hasAppliedText =
      document.body.textContent
        ?.toLowerCase()
        .includes("you've applied to this job") ||
      document.body.textContent
        ?.toLowerCase()
        .includes("you have already applied") ||
      document.querySelector(".ia-HasApplied-bodyTop--text");

    const hasAppliedElements =
      document.querySelector(".ia-HasApplied-bodyTop") ||
      document.querySelector('[class*="HasApplied"]') ||
      document.querySelector('[class*="already-applied"]');

    const isAlreadyApplied = hasAppliedText || hasAppliedElements;

    return isAlreadyApplied;
  }

  async processApplicationForm(jobDescription) {
    try {
      this.aiService = new AIService({
        aiApiHost: this.getAiApiHost(),
        platform: this.platform,
      });

      // Clean up old form fingerprints
      this.formFingerprinter.cleanup();

      if (this.isReviewPage()) {
        return await this.handleReviewPage();
      }

      const resumeSelectionForm = document.querySelector(
        '[data-testid="resume-selection-form"], [data-testid="resume-selection-file-resume-upload-button"]'
      );
      if (resumeSelectionForm) {
        return await this.handleResumeSelectionForm(jobDescription);
      }

      const formMatch = await this.formDetector.detectForm(15000);
      if (formMatch && formMatch.form) {
        return await this.handleIntelligentQuestionsForm(
          formMatch.form,
          jobDescription
        );
      }

      // Fallback to original detection
      const questionsForm = document.querySelector(
        '.ia-Questions, [class*="apply-questions"]'
      );
      if (questionsForm) {
        return await this.handleIntelligentQuestionsForm(
          questionsForm,
          jobDescription
        );
      }

      if (this.isCoverLetterForm()) {
        return await this.handleCoverLetterForm(jobDescription);
      }

      const continueButton = document.querySelector(
        '[data-testid="continue-button"]'
      );
      if (continueButton) {
        return await this.handleGenericFormWithContinue(jobDescription);
      }

      const form = document.querySelector(this.selectors.formContainer);
      if (form) {
        return await this.handleGenericForm(form, jobDescription);
      }

      return false;
    } catch (error) {
      console.error("❌ Error in processApplicationForm:", error);
      return false;
    }
  }

  async handleResumeSelectionForm(jobDescription = null) {
    try {
      const structuredResumeCard = document.querySelector(
        '[data-testid="resume-selection-structured-resume-radio-card"]'
      );
      const fileResumeCard = document.querySelector(
        '[data-testid="resume-selection-file-resume-radio-card"]'
      );

      if (fileResumeCard) {
        const fileResumeRadio = fileResumeCard.querySelector(
          '[data-testid="resume-selection-file-resume-radio-card-input"]'
        );
        if (fileResumeRadio) {
          fileResumeRadio.focus();
          fileResumeRadio.checked = true;
          fileResumeRadio.dispatchEvent(new Event("change", { bubbles: true }));
          fileResumeRadio.dispatchEvent(new Event("input", { bubbles: true }));
          fileResumeRadio.dispatchEvent(new Event("click", { bubbles: true }));

          fileResumeCard.setAttribute("data-checked", "true");

          await this.delay(1000);
        }
      } else {
        if (structuredResumeCard) {
          const structuredResumeRadio = structuredResumeCard.querySelector(
            '[data-testid="resume-selection-structured-resume-radio-card-input"]'
          );
          if (structuredResumeRadio) {
            structuredResumeRadio.focus();
            structuredResumeRadio.checked = true;
            structuredResumeRadio.dispatchEvent(
              new Event("change", { bubbles: true })
            );
            structuredResumeRadio.dispatchEvent(
              new Event("input", { bubbles: true })
            );

            await this.delay(500);
          }
        }
      }

      // Check for upload button and file input (works with or without radio card)
      const uploadButton = document.querySelector(
        '[data-testid="resume-selection-file-resume-upload-button"]'
      );

      // Find file input with multiple fallback selectors
      let fileInput = document.querySelector(
        '[data-testid="resume-selection-file-resume-upload-button-file-input"]'
      );
      if (!fileInput) {
        fileInput = document.querySelector(
          '[data-testid="FileResumeCard-file-input"]'
        );
      }
      if (!fileInput) {
        fileInput = document.querySelector('input[type="file"][accept*="pdf"]');
      }
      if (!fileInput) {
        fileInput = document.querySelector('input[type="file"][accept*=".doc"]');
      }
      if (!fileInput) {
        const form = document.querySelector(
          '[data-testid="resume-selection-form"]'
        );
        fileInput = form?.querySelector('input[type="file"]');
      }
      if (!fileInput) {
        // Last resort - find any file input on the page
        fileInput = document.querySelector('input[type="file"]');
      }

      if (!fileInput) {
        console.warn("⚠️ No file input found for resume upload");
        // Check if there's an existing resume that can be selected
        const existingResumeRadio = document.querySelector(
          '[data-testid="resume-selection-file-resume-radio-card-input"]'
        );
        if (existingResumeRadio && !existingResumeRadio.checked) {
          console.log("📌 Selecting existing resume...");
          existingResumeRadio.click();
          await this.delay(500);
        }
      }

      if (fileInput) {
        console.log("📁 File input found, attempting resume upload...");
        // If there's already a resume uploaded (radio card checked), skip upload
        const isResumeAlreadyUploaded =
          fileResumeCard &&
          fileResumeCard.getAttribute("data-checked") === "true";
        // if (!isResumeAlreadyUploaded) {
        let uploadSuccess = false; // Initialize to false
        try {
          uploadSuccess = await this.performResumeUpload(
            fileInput,
            jobDescription
          );

          if (uploadSuccess) {
            await this.delay(2000); // Only delay if successful
          }
        } catch (uploadError) {
          console.error("❌ Error during performResumeUpload:", uploadError);
          // uploadSuccess remains false, which is correct
        }

        if (!uploadSuccess) {
          // If upload failed, return false immediately
          console.error("❌ Resume upload failed, cannot proceed with form.");
          return false;
        }
        // }
      }

      // Check for reCAPTCHA before clicking continue
      if (this.hasCaptcha()) {
        console.log("🔐 reCAPTCHA detected - notifying user");
        notifyStatus({ type: "RECAPTCHA_DETECTED" });
        const solved = await this.waitForCaptchaSolved();
        if (!solved) {
          return false;
        }
      }

      const continueButton = document.querySelector(
        '[data-testid="continue-button"]'
      );
      if (continueButton && !continueButton.disabled) {
        // CO-PILOT MODE: Pause for user approval
        if (this.copilotMode) {
          if (true) {
            // Global overlay always available
            notifyStatus({
              type: "COPILOT_WAITING_FOR_NEXT",
              data: {
                buttonText: continueButton.textContent?.trim(),
                jobTitle: this.currentJobTitle,
                title: this.currentJobTitle,
              },
            });
          }

          const userAction = await this.waitForUserAction();
          if (userAction === "NEXT" || userAction === "SUBMIT") {
            // User approved - continue
            continueButton.focus();
            continueButton.click();
            continueButton.blur();
            await this.delay(2000);
            return "step_completed";
          } else if (userAction === "SKIP") {
            return "skip_requested";
          }
        } else {
          // AUTO-PILOT MODE: Click automatically
          continueButton.focus();
          continueButton.click();
          continueButton.blur();
          await this.delay(2000);
          return "step_completed";
        }
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  async handleIntelligentQuestionsForm(questionsForm, jobDescription) {
    try {
      console.log("🧠 Starting intelligent questions form handling...");

      // Create form fingerprint
      const formHash =
        this.formFingerprinter.createFormFingerprint(questionsForm);
      if (!formHash) {
        return await this.handleQuestionsForm(questionsForm, jobDescription);
      }

      // Check if form was already processed successfully
      if (this.formFingerprinter.isFormAlreadyProcessed(formHash)) {
        return "step_completed";
      }

      // Check if we should skip this form due to too many failures
      if (this.formFingerprinter.shouldSkipForm(formHash)) {
        this.formFingerprinter.markFormProcessed(formHash, false);
        return false;
      }

      const retryCount = this.formFingerprinter.getRetryCount(formHash);

      // Process the form with enhanced error handling
      const result = await this.handleQuestionsFormWithRetry(
        questionsForm,
        jobDescription,
        formHash,
        retryCount
      );

      // Mark form as processed
      this.formFingerprinter.markFormProcessed(
        formHash,
        result === "step_completed",
        {
          retryCount: retryCount,
          timestamp: Date.now(),
        }
      );

      return result;
    } catch (error) {
      console.error("❌ Error in intelligent questions form handling:", error);
      return await this.handleQuestionsForm(questionsForm, jobDescription);
    }
  }

  async handleQuestionsFormWithRetry(
    questionsForm,
    jobDescription,
    formHash,
    retryCount
  ) {
    try {
      if (retryCount > 0) {
        await this.delay(2000 + retryCount * 1000);
      }

      const userDetails = await this.getUserDetails();
      const storedJobData = await this.getStoredJobData();

      if (!userDetails) {
        console.error("❌ No user details available");
        return false;
      }

      // Enhanced question detection with multiple strategies
      const allQuestions = await this.detectAllQuestionTypes(
        questionsForm,
        retryCount
      );

      if (allQuestions.total === 0) {
        console.warn("⚠️ No questions detected in form");

        // Check if there's a Continue/Next button - some steps only have a button without fields
        const continueButton = this.findContinueButton(questionsForm);
        if (continueButton && !continueButton.disabled) {
          console.log(
            "✅ Found Continue button without questions - this is a button-only step"
          );
          // Skip to button clicking logic below
        } else {
          return false;
        }
      } else {
        console.log(`📊 Detected ${allQuestions.total} total questions:`, {
          radio: allQuestions.radio.length,
          checkbox: allQuestions.checkbox.length,
          select: allQuestions.select.length,
          date: allQuestions.date.length,
          textarea: allQuestions.textarea.length,
          fileUpload: allQuestions.fileUpload.length,
        });

        // Process each question type
        await this.processAllQuestionTypes(
          allQuestions,
          userDetails,
          storedJobData
        );

        // Enhanced validation
        const validationResult = this.validateFormCompletionEnhanced(
          questionsForm,
          allQuestions
        );

        if (!validationResult.isValid) {
          console.warn(
            "⚠️ Form validation failed:",
            validationResult.missingFields
          );

          // On retries, try to be more lenient
          if (retryCount > 0 && validationResult.missingFields.length <= 2) {
            console.log(
              "🔄 Proceeding despite minor validation issues on retry"
            );
          } else {
            return false;
          }
        }
      }

      // Enhanced submit button detection
      const submitResult = await this.findAndClickSubmitButtonEnhanced(
        questionsForm,
        retryCount
      );

      if (submitResult) {
        await this.delay(2000);
        return "step_completed";
      } else {
        return false;
      }
    } catch (error) {
      console.error("❌ Error in handleQuestionsFormWithRetry:", error);
      return false;
    }
  }

  async handleQuestionsForm(questionsForm, jobDescription) {
    try {
      const userDetails = await this.getUserDetails();
      const storedJobData = await this.getStoredJobData();

      if (!userDetails) {
        return false;
      }

      const radioQuestions = this.getIndeedRadioQuestions(questionsForm);
      for (const radioQuestion of radioQuestions) {
        await this.fillIndeedRadioQuestion(
          radioQuestion,
          userDetails,
          storedJobData
        );
        await this.delay(300 + Math.random() * 500);
      }

      const checkboxQuestions = this.getIndeedCheckboxQuestions(questionsForm);
      for (const checkboxQuestion of checkboxQuestions) {
        await this.fillIndeedCheckboxQuestion(
          checkboxQuestion,
          userDetails,
          storedJobData
        );
        await this.delay(300 + Math.random() * 500);
      }

      // Process select questions
      const selectQuestions = this.getIndeedSelectQuestions(questionsForm);
      for (const selectQuestion of selectQuestions) {
        await this.fillIndeedSelectQuestion(
          selectQuestion,
          userDetails,
          storedJobData
        );
        await this.delay(300 + Math.random() * 500);
      }

      // Process date questions
      const dateQuestions = this.getIndeedDateQuestions(questionsForm);
      for (let i = 0; i < dateQuestions.length; i++) {
        const dateQuestion = dateQuestions[i];

        try {
          await this.fillIndeedDateQuestion(
            dateQuestion,
            userDetails,
            storedJobData
          );
        } catch (error) {
          console.error(`❌ Error processing date question ${i + 1}:`, error);
        }
        await this.delay(300 + Math.random() * 500);
      }

      // Process textarea questions
      const textareaQuestions = this.getIndeedTextareaQuestions(questionsForm);
      for (const textareaQuestion of textareaQuestions) {
        await this.fillIndeedTextareaQuestion(
          textareaQuestion,
          userDetails,
          storedJobData
        );
        await this.delay(500 + Math.random() * 1000);
      }

      // Process file upload questions
      const fileUploadQuestions =
        this.getIndeedFileUploadQuestions(questionsForm);

      for (const fileUploadQuestion of fileUploadQuestions) {
        await this.fillIndeedFileUploadQuestion(
          fileUploadQuestion,
          userDetails,
          storedJobData
        );
        await this.delay(1000 + Math.random() * 1000);
      }

      const validationResult = this.validateFormCompletion(questionsForm);

      if (!validationResult.isValid) {
        return false;
      }

      // Look for continue button or review application button
      let continueButton = questionsForm.querySelector(
        '[data-testid="continue-button"]'
      );

      // If no continue button, look for "Review your application" button
      if (!continueButton) {
        const buttons = questionsForm.querySelectorAll("button");
        continueButton = Array.from(buttons).find((button) => {
          const span = button.querySelector("span");
          return (
            span &&
            (span.textContent.toLowerCase().includes("review") ||
              span.textContent.toLowerCase().includes("continue") ||
              span.textContent.toLowerCase().includes("next"))
          );
        });
      }

      // Check for reCAPTCHA before proceeding
      if (this.hasCaptcha()) {
        console.log("🔐 reCAPTCHA detected in questions form - notifying user");
        notifyStatus({ type: "RECAPTCHA_DETECTED" });
        const solved = await this.waitForCaptchaSolved();
        if (!solved) {
          return false;
        }
      }

      if (continueButton && !continueButton.disabled) {
        // Determine if this is a final submit or a next/continue button
        const buttonText = continueButton.textContent?.trim().toLowerCase();
        const isFinalSubmit =
          buttonText.includes("submit") ||
          buttonText.includes("submit your application");
        const isNextOrContinue =
          buttonText.includes("continue") ||
          buttonText.includes("next") ||
          buttonText.includes("review");

        // CO-PILOT MODE: Pause at Continue/Next/Submit buttons
        console.log(
          `🎯 SimplyHired form check: copilotMode=${this.copilotMode}, isFinalSubmit=${isFinalSubmit}, isNextOrContinue=${isNextOrContinue}`
        );
        if (this.copilotMode && (isFinalSubmit || isNextOrContinue)) {
          // Determine message type
          const messageType = isFinalSubmit
            ? "COPILOT_SUBMIT_READY"
            : "COPILOT_WAITING_FOR_NEXT";

          // Show status message to user
          if (true) {
            // Global overlay always available
            notifyStatus({
              type: messageType,
              data: {
                buttonText: continueButton.textContent?.trim(),
                jobTitle: this.currentJobTitle,
                title: this.currentJobTitle,
              },
            });
          }

          // Store button reference in state (optional)
          if (this.copilotState) {
            if (isFinalSubmit) {
              this.copilotState.setPendingSubmission(
                { title: this.currentJobTitle },
                continueButton
              );
            } else {
              this.copilotState.setPendingNext(
                { title: this.currentJobTitle },
                continueButton
              );
            }
          }

          // PAUSE - Wait for user action
          const userAction = await this.waitForUserAction();

          // Handle user action
          if (userAction === "SUBMIT" || userAction === "NEXT") {
            // User approved - click button and continue
            continueButton.focus();
            continueButton.click();
            continueButton.blur();

            await this.delay(2000);

            // Clear pending state
            if (this.copilotState) {
              if (isFinalSubmit) {
                this.copilotState.clearPendingSubmission();
              } else {
                this.copilotState.clearPendingNext();
              }
            }

            return "step_completed";
          } else if (userAction === "SKIP") {
            // User skipped job
            return false;
          } else if (userAction === "TAKE_CONTROL") {
            // User wants manual control
            this.userHasControl = true;

            if (true) {
              // Global overlay always available
              updateStatusButtons("user-control");
            }

            // Wait for user to return control
            const resumeAction = await this.waitForUserAction();

            if (resumeAction === "LET_AI_CONTINUE") {
              this.userHasControl = false;
              // Resume AI control - click the button
              continueButton.focus();
              continueButton.click();
              continueButton.blur();

              await this.delay(2000);

              return "step_completed";
            } else if (resumeAction === "SKIP") {
              return false;
            }
          }
        }

        // AUTO-PILOT MODE: Just click button
        if (!this.copilotMode) {
          continueButton.focus();
          continueButton.click();
          continueButton.blur();

          await this.delay(2000);

          return "step_completed";
        }
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  validateFormCompletion(questionsForm) {
    const missingFields = [];
    let isValid = true;

    try {
      // Check all required radio button groups
      const radioQuestions = this.getIndeedRadioQuestions(questionsForm);

      for (const radioQuestion of radioQuestions) {
        if (radioQuestion.required) {
          const checkedOption = radioQuestion.options.find(
            (opt) => opt.element.checked
          );
          if (!checkedOption) {
            missingFields.push(`Radio: ${radioQuestion.question}`);
            isValid = false;
          }
        }
      }

      // Check all required checkbox fields
      const checkboxQuestions = this.getIndeedCheckboxQuestions(questionsForm);

      for (const checkboxQuestion of checkboxQuestions) {
        if (checkboxQuestion.required) {
          const checkedOptions = checkboxQuestion.options.filter(
            (opt) => opt.element.checked
          );
          if (checkedOptions.length === 0) {
            missingFields.push(`Checkbox: ${checkboxQuestion.question}`);
            isValid = false;
          } else {
            const checkedTexts = checkedOptions
              .map((opt) => opt.text)
              .join(", ");
          }
        }
      }

      // Check all required select fields
      const selectQuestions = this.getIndeedSelectQuestions(questionsForm);

      for (const selectQuestion of selectQuestions) {
        if (selectQuestion.required) {
          const value = selectQuestion.selectElement.value?.trim();
          if (!value || value === "") {
            missingFields.push(`Select: ${selectQuestion.question}`);
            isValid = false;
          } else {
            const selectedOption = selectQuestion.options.find(
              (opt) => opt.value === value
            );
            const selectedText = selectedOption ? selectedOption.text : value;
          }
        }
      }

      // Check all required date fields
      const dateQuestions = this.getIndeedDateQuestions(questionsForm);

      for (const dateQuestion of dateQuestions) {
        if (dateQuestion.required) {
          const value = dateQuestion.element.value?.trim();
          if (!value) {
            missingFields.push(`Date: ${dateQuestion.question}`);
            isValid = false;
          }
        }
      }

      // Check all required textarea fields
      const textareaQuestions = this.getIndeedTextareaQuestions(questionsForm);

      for (const textareaQuestion of textareaQuestions) {
        if (textareaQuestion.required) {
          const value = textareaQuestion.element.value?.trim();
          if (!value) {
            missingFields.push(`Textarea: ${textareaQuestion.question}`);
            isValid = false;
          }
        }
      }

      // Check all required file upload fields
      const fileUploadQuestions =
        this.getIndeedFileUploadQuestions(questionsForm);

      for (const fileUploadQuestion of fileUploadQuestions) {
        if (fileUploadQuestion.required) {
          // Check if file was uploaded (look for success indicators)
          const hasUploadedFile = fileUploadQuestion.questionItem.querySelector(
            '[data-testid*="file-name"], .file-uploaded, .uploaded-file'
          );
          const fileInput = fileUploadQuestion.fileInput;
          const hasFileInInput =
            fileInput && fileInput.files && fileInput.files.length > 0;

          if (!hasUploadedFile && !hasFileInInput) {
            missingFields.push(`File Upload: ${fileUploadQuestion.question}`);
            isValid = false;
          } else {
            const fileName = hasFileInInput
              ? fileInput.files[0].name
              : "File uploaded";
          }
        }
      }

      return {
        isValid,
        reason: isValid
          ? "All required fields completed"
          : "Missing required fields",
        missingFields,
      };
    } catch (error) {
      return {
        isValid: false,
        reason: "Validation error",
        missingFields: ["Validation failed due to error"],
      };
    }
  }

  isReviewPage() {
    // Check URL pattern for review page
    const url = window.location.href;
    const isReviewUrl = url.includes("/form/review") || url.includes("/review");

    // Check for submit application button
    const submitButton =
      document.querySelector("button span") &&
      Array.from(document.querySelectorAll("button span")).find(
        (span) =>
          span.textContent?.toLowerCase().includes("submit your application") ||
          span.textContent?.toLowerCase().includes("submit application")
      );

    return isReviewUrl || !!submitButton;
  }

  async handleReviewPage() {
    try {
      // Check for reCAPTCHA before proceeding
      if (this.hasCaptcha()) {
        console.log("🔐 reCAPTCHA detected on review page - notifying user");
        notifyStatus({ type: "RECAPTCHA_DETECTED" });
        const solved = await this.waitForCaptchaSolved();
        if (!solved) {
          return false;
        }
      }

      // Look for the submit application button
      const submitButton =
        document.querySelector("button span") &&
        Array.from(document.querySelectorAll("button")).find((button) => {
          const span = button.querySelector("span");
          return (
            span &&
            (span.textContent
              ?.toLowerCase()
              .includes("submit your application") ||
              span.textContent?.toLowerCase().includes("submit application"))
          );
        });

      if (!submitButton) {
        return false;
      }

      // Check if button is enabled
      if (submitButton.disabled) {
        return false;
      }

      // CO-PILOT MODE: Pause at Submit button
      console.log(
        `🎯 SimplyHired submit check: copilotMode=${this.copilotMode}`
      );
      if (this.copilotMode) {
        // Show status message to user
        if (true) {
          // Global overlay always available
          notifyStatus({
            type: "COPILOT_SUBMIT_READY",
            data: {
              buttonText: submitButton.textContent?.trim(),
              jobTitle: this.currentJobTitle,
              title: this.currentJobTitle,
            },
          });
        }

        // Store button reference in state
        if (this.copilotState) {
          this.copilotState.setPendingSubmission(
            { title: this.currentJobTitle },
            submitButton
          );
        }

        // PAUSE - Wait for user action
        const userAction = await this.waitForUserAction();

        // Handle user action
        if (userAction === "SUBMIT") {
          // User approved - click button
          submitButton.focus();
          submitButton.click();
          submitButton.blur();

          await this.delay(2000);

          // Clear pending state
          if (this.copilotState) {
            this.copilotState.clearPendingSubmission();
          }

          return "submitted";
        } else if (userAction === "SKIP") {
          // User skipped job
          return false;
        } else if (userAction === "TAKE_CONTROL") {
          // User wants manual control
          this.userHasControl = true;

          if (true) {
            // Global overlay always available
            updateStatusButtons("user-control");
          }

          // Wait for user to return control
          const resumeAction = await this.waitForUserAction();

          if (resumeAction === "LET_AI_CONTINUE") {
            this.userHasControl = false;
            // Resume AI control - click the button
            submitButton.focus();
            submitButton.click();
            submitButton.blur();

            await this.delay(2000);

            return "submitted";
          } else if (resumeAction === "SKIP") {
            return false;
          }
        }
      }

      // AUTO-PILOT MODE: Just click button
      if (!this.copilotMode) {
        submitButton.focus();
        submitButton.click();
        submitButton.blur();

        await this.delay(2000);

        return "submitted";
      }
    } catch (error) {
      return false;
    }
  }

  isCoverLetterForm() {
    // Check for cover letter specific elements
    const coverLetterHeading = document.querySelector(
      '[data-testid="additional-documents-page-heading"]'
    );
    const coverLetterTextArea = document.querySelector(
      '[data-testid="cover-letter-radio-card-text-area"]'
    );
    const coverLetterRadioCard = document.querySelector(
      '[data-testid="cover-letter-radio-card"]'
    );

    const isCoverLetterPage =
      coverLetterHeading &&
      coverLetterHeading.textContent?.toLowerCase().includes("cover letter");

    return isCoverLetterPage && (coverLetterTextArea || coverLetterRadioCard);
  }

  async handleCoverLetterForm(jobDescription) {
    try {
      // Get user details and job data
      const userDetails = await this.getUserDetails();
      const storedJobData = await this.getStoredJobData();

      if (!userDetails) {
        return false;
      }

      // Find the cover letter textarea
      const coverLetterTextArea = document.querySelector(
        '[data-testid="cover-letter-radio-card-text-area"]'
      );

      if (!coverLetterTextArea) {
        return false;
      }

      // Check if already filled
      if (coverLetterTextArea.value && coverLetterTextArea.value.trim()) {
      } else {
        // Use longform AI to generate cover letter
        const coverLetterPrompt = `Write a professional cover letter for this job application. Make it personalized and compelling.`;

        const context = {
          fieldType: "cover_letter",
          platform: this.platform,
          userData: userDetails,
          jobDescription:
            storedJobData?.description || jobDescription?.description || "",
          longform: true, // Enable longform generation
        };

        let coverLetter;
        try {
          coverLetter = await this.aiService.getLongformAnswer(
            coverLetterPrompt,
            [],
            context
          );
        } catch (error) {
          coverLetter = `Dear Hiring Manager,

I am excited to apply for this position at your company. With my background and experience, I believe I would be a valuable addition to your team.

I am particularly interested in this role because it aligns with my career goals and offers opportunities to contribute meaningfully to your organization's success.

Thank you for considering my application. I look forward to the opportunity to discuss how my skills and enthusiasm can benefit your team.

Sincerely,
${userDetails.firstName || userDetails.name || "Job Applicant"}`;
        }

        if (coverLetter) {
          await this.slowPasteText(coverLetterTextArea, coverLetter);

          await this.delay(1000);
        }
      }

      // Check for reCAPTCHA before clicking continue
      if (this.hasCaptcha()) {
        console.log("🔐 reCAPTCHA detected - notifying user");
        notifyStatus({ type: "RECAPTCHA_DETECTED" });
        const solved = await this.waitForCaptchaSolved();
        if (!solved) {
          return false;
        }
      }

      const continueButton = document.querySelector(
        '[data-testid="continue-button"]'
      );

      if (continueButton && !continueButton.disabled) {
        continueButton.focus();
        continueButton.click();
        continueButton.blur();

        await this.delay(2000);

        return "step_completed";
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  async handleGenericFormWithContinue(jobDescription) {
    try {
      const userDetails = await this.getUserDetails();
      const storedJobData = await this.getStoredJobData();

      if (!userDetails) {
        return false;
      }

      // Enhanced form container detection - prioritize actual forms and mosaic containers
      const formContainer =
        document.querySelector("form") ||
        document.querySelector("#mosaic-provider-module-apply-contact-info") ||
        document.querySelector('[class*="mosaic-provider"]') ||
        document.querySelector('[data-testid*="page"]') ||
        document.querySelector("main") ||
        document.querySelector('[class*="form-container"]') ||
        document.querySelector('[class*="Form"]') ||
        document.body;

      const radioGroups = this.getRadioGroups();

      for (const radioGroup of radioGroups) {
        await this.fillRadioGroupWithAI(radioGroup, userDetails, storedJobData);
        await this.delay(300 + Math.random() * 500);
      }

      const textareas = formContainer.querySelectorAll("textarea");

      for (const textarea of textareas) {
        if (!textarea.value || !textarea.value.trim()) {
          await this.fillTextareaWithAI(textarea, userDetails, storedJobData);
          await this.delay(500 + Math.random() * 1000);
        }
      }

      // Enhanced selector to catch all text-like inputs including those without explicit type
      const textInputs = formContainer.querySelectorAll(
        'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input:not([type]), input[autocomplete*="postal"], input[autocomplete*="address"], input[autocomplete*="city"], input[autocomplete*="locality"]'
      );

      for (const input of textInputs) {
        const inputType = input.type?.toLowerCase() || "text";

        // Skip hidden, file, radio, checkbox, and button inputs
        if (
          ["hidden", "file", "radio", "checkbox", "submit", "button"].includes(
            inputType
          )
        ) {
          continue;
        }

        // Skip invisible inputs
        if (!this.isElementVisible(input)) {
          continue;
        }

        // Skip aria-hidden inputs
        if (input.getAttribute("aria-hidden") === "true") {
          continue;
        }

        if (!input.value || !input.value.trim()) {
          await this.fillBasicInputField(input, userDetails);
          await this.delay(200 + Math.random() * 300);
        }
      }

      const fileInputs = formContainer.querySelectorAll('input[type="file"]');
      if (fileInputs.length > 0) {
        await this.handleFileUploads(
          formContainer,
          userDetails,
          jobDescription?.description || "",
          this.currentJobId,
          this.currentJobTitle || storedJobData?.title || ""
        );
      }

      // Check for reCAPTCHA before clicking continue
      if (this.hasCaptcha()) {
        console.log("🔐 reCAPTCHA detected in generic form - notifying user");
        notifyStatus({ type: "RECAPTCHA_DETECTED" });
        const solved = await this.waitForCaptchaSolved();
        if (!solved) {
          return false;
        }
      }

      const continueButton = document.querySelector(
        '[data-testid="continue-button"]'
      );

      if (continueButton && !continueButton.disabled) {
        continueButton.focus();
        continueButton.click();
        continueButton.blur();

        await this.delay(2000);

        return "step_completed";
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  async handleGenericForm(form, jobDescription) {
    try {
      const userDetails = await this.getUserDetails();
      const storedJobData = await this.getStoredJobData();
      if (!userDetails) {
        return false;
      }

      await this.handleFileUploads(
        form,
        userDetails,
        jobDescription?.description || "",
        this.currentJobId,
        this.currentJobTitle || storedJobData?.title || ""
      );

      await this.fillFormFieldsWithAI();

      const submitResult = await this.handleFormSubmission();

      return submitResult;
    } catch (error) {
      return false;
    }
  }

  async performResumeUpload(fileInput, jobDescription = null) {
    try {
      console.log("📤 performResumeUpload called");
      const resumeUrls = this.userProfile?.resumes;

      if (!resumeUrls || resumeUrls.length === 0) {
        console.error("❌ No resume URL found for upload.");
        console.log("User profile resumes:", this.userProfile?.resumes);
        return false;
      }
      console.log(`📁 Found ${resumeUrls.length} resume(s) for upload`);
      if (!this.fileHandler) {
        this.fileHandler = new SimplyHiredFileHandler({
          backendApiHost: this.getApiHost(),
          aiApiHost: this.getAiApiHost(),
          jwtToken: this.getJwtToken(),
          preferences: this.sessionContext?.preferences,
        });
      }
      if (
        this.fileHandler &&
        typeof this.fileHandler.handleSingleFileUpload === "function"
      ) {
        // Get jobId with fallback from storage
        const jobData = await chrome.storage.local.get("currentJobData");
        let jobId = this.currentJobId;
        if (!jobId) {
          jobId =
            jobData.currentJobData?.jobId || jobData.currentJobData?.jobKey;
        }
        if (!jobId) {
          // Try to extract from URL
          const urlMatch = window.location.href.match(/\/job\/([^\/\?]+)/);
          jobId = urlMatch ? urlMatch[1] : null;
        }

        const uploadResult = await this.fileHandler.handleSingleFileUpload(
          fileInput,
          this.userProfile,
          jobDescription?.description || jobDescription,
          jobId,
          this.currentJobTitle || jobData.currentJobData?.title || ""
        );
        return uploadResult;
      }
    } catch (error) {
      console.error("❌ Error in performResumeUpload:", error);
      return false;
    }
  }

  extractFileNameFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const fileName = pathname.split("/").pop();
      return fileName || "resume.pdf";
    } catch (error) {
      return "resume.pdf";
    }
  }

  async detectAllQuestionTypes(questionsForm, retryCount = 0) {
    console.log("🔍 Detecting all question types with enhanced methods...");

    const questions = {
      radio: [],
      checkbox: [],
      select: [],
      date: [],
      textarea: [],
      fileUpload: [],
      profileFields: [],
      total: 0,
    };

    try {
      // Enhanced radio question detection
      questions.radio = this.getIndeedRadioQuestionsEnhanced(
        questionsForm,
        retryCount
      );

      // Enhanced checkbox detection
      questions.checkbox = this.getIndeedCheckboxQuestionsEnhanced(
        questionsForm,
        retryCount
      );

      // Enhanced select detection
      questions.select = this.getIndeedSelectQuestionsEnhanced(
        questionsForm,
        retryCount
      );

      // Enhanced date detection
      questions.date = this.getIndeedDateQuestionsEnhanced(
        questionsForm,
        retryCount
      );

      // Enhanced textarea detection
      questions.textarea = this.getIndeedTextareaQuestionsEnhanced(
        questionsForm,
        retryCount
      );

      // Enhanced file upload detection
      questions.fileUpload = this.getIndeedFileUploadQuestionsEnhanced(
        questionsForm,
        retryCount
      );

      // NEW: Profile/Contact form detection
      questions.profileFields = this.getProfileFieldsEnhanced(
        questionsForm,
        retryCount
      );

      questions.total =
        questions.radio.length +
        questions.checkbox.length +
        questions.select.length +
        questions.date.length +
        questions.textarea.length +
        questions.fileUpload.length +
        questions.profileFields.length;
    } catch (error) {
      console.error("❌ Error detecting question types:", error);
    }

    return questions;
  }

  async processAllQuestionTypes(allQuestions, userDetails, storedJobData) {
    console.log("🔄 Processing all question types...");

    try {
      // Process radio questions
      for (const radioQuestion of allQuestions.radio) {
        await this.fillIndeedRadioQuestion(
          radioQuestion,
          userDetails,
          storedJobData
        );
        await this.delay(300 + Math.random() * 500);
      }

      // Process checkbox questions
      for (const checkboxQuestion of allQuestions.checkbox) {
        await this.fillIndeedCheckboxQuestion(
          checkboxQuestion,
          userDetails,
          storedJobData
        );
        await this.delay(300 + Math.random() * 500);
      }

      // Process select questions
      for (const selectQuestion of allQuestions.select) {
        await this.fillIndeedSelectQuestion(
          selectQuestion,
          userDetails,
          storedJobData
        );
        await this.delay(300 + Math.random() * 500);
      }

      // Process date questions
      for (const dateQuestion of allQuestions.date) {
        await this.fillIndeedDateQuestion(
          dateQuestion,
          userDetails,
          storedJobData
        );
        await this.delay(300 + Math.random() * 500);
      }

      // Process textarea questions
      for (const textareaQuestion of allQuestions.textarea) {
        await this.fillIndeedTextareaQuestion(
          textareaQuestion,
          userDetails,
          storedJobData
        );
        await this.delay(300 + Math.random() * 500);
      }

      // Process file upload questions
      for (const fileUploadQuestion of allQuestions.fileUpload) {
        await this.fillIndeedFileUploadQuestion(
          fileUploadQuestion,
          userDetails,
          storedJobData
        );
        await this.delay(300 + Math.random() * 500);
      }

      // Process profile fields
      for (const profileField of allQuestions.profileFields || []) {
        await this.fillProfileField(profileField, userDetails, storedJobData);
        await this.delay(300 + Math.random() * 500);
      }
    } catch (error) {
      console.error("❌ Error processing question types:", error);
    }
  }

  validateFormCompletionEnhanced(questionsForm, allQuestions) {
    const missingFields = [];
    let isValid = true;

    try {
      // Validate radio questions
      for (const radioQuestion of allQuestions.radio) {
        if (radioQuestion.required) {
          const checkedOption = radioQuestion.options.find(
            (opt) => opt.element.checked
          );
          if (!checkedOption) {
            missingFields.push(`Radio: ${radioQuestion.question}`);
            isValid = false;
          }
        }
      }

      // Validate checkbox questions
      for (const checkboxQuestion of allQuestions.checkbox) {
        if (checkboxQuestion.required) {
          const checkedOptions = checkboxQuestion.options.filter(
            (opt) => opt.element.checked
          );
          if (checkedOptions.length === 0) {
            missingFields.push(`Checkbox: ${checkboxQuestion.question}`);
            isValid = false;
          }
        }
      }

      // Validate select questions
      for (const selectQuestion of allQuestions.select) {
        if (selectQuestion.required) {
          const value = selectQuestion.selectElement.value?.trim();
          if (!value || value === "") {
            missingFields.push(`Select: ${selectQuestion.question}`);
            isValid = false;
          }
        }
      }

      // Validate profile fields
      for (const profileField of allQuestions.profileFields || []) {
        if (profileField.required) {
          const value = profileField.element.value?.trim();
          if (!value || value === "") {
            missingFields.push(`Profile: ${profileField.question}`);
            isValid = false;
          }
        }
      }

      // Additional validation for dynamic content
      const dynamicRequiredFields = questionsForm.querySelectorAll(
        '[required], [aria-required="true"], .required, [class*="required"]'
      );

      for (const field of dynamicRequiredFields) {
        if (
          field.type === "text" ||
          field.type === "email" ||
          field.tagName === "TEXTAREA"
        ) {
          if (!field.value?.trim()) {
            missingFields.push(
              `Required field: ${field.name || field.id || "unknown"}`
            );
            isValid = false;
          }
        }
      }
    } catch (error) {
      console.error("❌ Error in form validation:", error);
      isValid = false;
    }

    return { isValid, missingFields };
  }

  async findAndClickSubmitButtonEnhanced(questionsForm, retryCount = 0) {
    console.log("🔍 Enhanced submit button detection...");

    try {
      const strategies = [
        // Strategy 1: Standard continue button
        () => questionsForm.querySelector('[data-testid="continue-button"]'),

        // Strategy 2: Review/continue buttons in spans
        () => {
          const buttons = questionsForm.querySelectorAll("button");
          return Array.from(buttons).find((button) => {
            const span = button.querySelector("span");
            return (
              span &&
              (span.textContent.toLowerCase().includes("review") ||
                span.textContent.toLowerCase().includes("continue") ||
                span.textContent.toLowerCase().includes("next") ||
                span.textContent.toLowerCase().includes("submit"))
            );
          });
        },

        // Strategy 3: Direct button text
        () => {
          const buttons = questionsForm.querySelectorAll("button");
          return Array.from(buttons).find((button) => {
            const text = button.textContent.toLowerCase().trim();
            return (
              text.includes("continue") ||
              text.includes("review") ||
              text.includes("next") ||
              text.includes("submit")
            );
          });
        },

        // Strategy 4: Form submit buttons
        () =>
          questionsForm.querySelector(
            'button[type="submit"], input[type="submit"]'
          ),

        // Strategy 5: Any button at the bottom
        () => {
          const buttons = questionsForm.querySelectorAll("button");
          return buttons[buttons.length - 1]; // Last button
        },
      ];

      for (let i = 0; i < strategies.length; i++) {
        const button = strategies[i]();

        if (button && !button.disabled && this.isElementVisible(button)) {
          console.log(`✅ Found submit button using strategy ${i + 1}`);

          // Determine if this is a final submit or a next/continue button
          const buttonText = button.textContent?.trim().toLowerCase();
          const isFinalSubmit =
            buttonText.includes("submit") ||
            buttonText.includes("submit your application");
          const isNextOrContinue =
            buttonText.includes("continue") ||
            buttonText.includes("next") ||
            buttonText.includes("review");

          // CO-PILOT MODE: Pause at Continue/Next/Submit buttons
          console.log(
            `🎯 SimplyHired form check 2: copilotMode=${this.copilotMode}, isFinalSubmit=${isFinalSubmit}, isNextOrContinue=${isNextOrContinue}`
          );
          if (this.copilotMode && (isFinalSubmit || isNextOrContinue)) {
            // Determine message type
            const messageType = isFinalSubmit
              ? "COPILOT_SUBMIT_READY"
              : "COPILOT_WAITING_FOR_NEXT";

            // Show status message to user
            if (true) {
              // Global overlay always available
              notifyStatus({
                type: messageType,
                data: {
                  buttonText: button.textContent?.trim(),
                  jobTitle: this.currentJobTitle,
                  title: this.currentJobTitle,
                },
              });
            }

            // Store button reference in state
            if (this.copilotState) {
              if (isFinalSubmit) {
                this.copilotState.setPendingSubmission(
                  { title: this.currentJobTitle },
                  button
                );
              } else {
                this.copilotState.setPendingNext(
                  { title: this.currentJobTitle },
                  button
                );
              }
            }

            // PAUSE - Wait for user action
            const userAction = await this.waitForUserAction();

            // Handle user action
            if (userAction === "SUBMIT" || userAction === "NEXT") {
              // User approved - click button
              button.focus();
              button.click();
              button.blur();

              // Clear pending state
              if (this.copilotState) {
                if (isFinalSubmit) {
                  this.copilotState.clearPendingSubmission();
                } else {
                  this.copilotState.clearPendingNext();
                }
              }

              return true;
            } else if (userAction === "SKIP") {
              // User skipped job
              return false;
            } else if (userAction === "TAKE_CONTROL") {
              // User wants manual control
              this.userHasControl = true;

              if (true) {
                // Global overlay always available
                updateStatusButtons("user-control");
              }

              // Wait for user to return control
              const resumeAction = await this.waitForUserAction();

              if (resumeAction === "LET_AI_CONTINUE") {
                this.userHasControl = false;
                // Resume AI control - click the button
                button.focus();
                button.click();
                button.blur();

                return true;
              } else if (resumeAction === "SKIP") {
                return false;
              }
            }
          }

          // AUTO-PILOT MODE: Just click button
          if (!this.copilotMode) {
            button.focus();
            button.click();
            button.blur();

            return true;
          }
        }
      }

      console.warn("⚠️ No submit button found with any strategy");
      return false;
    } catch (error) {
      console.error("❌ Error finding submit button:", error);
      return false;
    }
  }

  getIndeedRadioQuestionsEnhanced(questionsForm, retryCount = 0) {
    const radioQuestions = [];

    // Multiple detection strategies
    const strategies = [
      // Strategy 1: Standard Indeed structure
      () =>
        questionsForm.querySelectorAll(
          '.ia-Questions-item, [class*="Questions-item"]'
        ),

      // Strategy 2: Fieldset-based structure
      () => questionsForm.querySelectorAll('fieldset:has(input[type="radio"])'),

      // Strategy 3: Generic containers with radio inputs
      () => {
        const containers = questionsForm.querySelectorAll("div, section");
        return Array.from(containers).filter(
          (container) =>
            container.querySelectorAll('input[type="radio"]').length > 0
        );
      },

      // Strategy 4: Direct radio group detection
      () => {
        const radioInputs = questionsForm.querySelectorAll(
          'input[type="radio"]'
        );
        const groups = new Map();

        radioInputs.forEach((radio) => {
          if (radio.name) {
            if (!groups.has(radio.name)) {
              groups.set(
                radio.name,
                radio.closest("div, fieldset, section") || radio.parentElement
              );
            }
          }
        });

        return Array.from(groups.values()).filter(Boolean);
      },
    ];

    for (
      let strategyIndex = 0;
      strategyIndex < strategies.length;
      strategyIndex++
    ) {
      try {
        const questionItems = strategies[strategyIndex]();

        for (const questionItem of questionItems) {
          const radioInputs = questionItem.querySelectorAll(
            'input[type="radio"]'
          );

          if (radioInputs.length > 0) {
            const questionData = this.extractRadioQuestionData(
              questionItem,
              radioInputs
            );

            if (questionData && questionData.name) {
              // Avoid duplicates
              if (!radioQuestions.find((q) => q.name === questionData.name)) {
                radioQuestions.push(questionData);
              }
            }
          }
        }

        // If we found questions with first strategy, don't try others unless it's a retry
        if (radioQuestions.length > 0 && retryCount === 0) {
          break;
        }
      } catch (error) {
        console.warn(`Strategy ${strategyIndex + 1} failed:`, error);
      }
    }

    console.log(
      `🔍 Enhanced radio detection found ${radioQuestions.length} questions`
    );
    return radioQuestions;
  }

  extractRadioQuestionData(questionItem, radioInputs) {
    try {
      // Extract question text with multiple fallbacks
      let questionText = "";

      const textSources = [
        () =>
          questionItem
            .querySelector('[data-testid*="label"]')
            ?.textContent?.trim(),
        () => questionItem.querySelector("legend")?.textContent?.trim(),
        () => questionItem.querySelector("label")?.textContent?.trim(),
        () =>
          questionItem
            .querySelector('.question, [class*="question"]')
            ?.textContent?.trim(),
        () =>
          questionItem
            .querySelector("h1, h2, h3, h4, h5, h6")
            ?.textContent?.trim(),
      ];

      for (const getSource of textSources) {
        const text = getSource();
        if (text && text.length > 0) {
          questionText = text;
          break;
        }
      }

      if (!questionText) {
        console.warn("Could not extract question text for radio group");
        return null;
      }

      const radioName = radioInputs[0].name;
      if (!radioName) {
        console.warn("Radio inputs missing name attribute");
        return null;
      }

      const options = Array.from(radioInputs).map((radio) => {
        const optionLabel =
          radio.closest("label") ||
          radio.parentElement.querySelector("label") ||
          radio.nextElementSibling;

        const optionText = optionLabel
          ? optionLabel.textContent.trim()
          : radio.value;

        return {
          element: radio,
          value: radio.value,
          text: optionText,
        };
      });

      // Enhanced required field detection
      const isRequired = this.detectRequiredField(
        questionItem,
        questionText,
        radioInputs[0]
      );

      return {
        name: radioName,
        question: questionText.replace(/\(Required\)/gi, "").trim(),
        options: options,
        required: isRequired,
        questionItem: questionItem,
      };
    } catch (error) {
      console.error("Error extracting radio question data:", error);
      return null;
    }
  }

  detectRequiredField(questionItem, questionText, firstInput) {
    try {
      // Multiple required detection methods
      const checks = [
        () =>
          questionText.includes("(Required)") ||
          questionText.includes("(required)"),
        () => questionText.includes("*") && questionText.includes("required"),
        () => {
          const fieldset = questionItem.querySelector("fieldset");
          return fieldset && fieldset.getAttribute("aria-required") === "true";
        },
        () => firstInput.hasAttribute("required"),
        () => firstInput.getAttribute("aria-required") === "true",
        () =>
          questionItem.querySelector('.required, [class*="required"]') !== null,
        () => questionItem.querySelector('[aria-required="true"]') !== null,
        () => {
          const labels = questionItem.querySelectorAll("label");
          return Array.from(labels).some(
            (label) =>
              label.textContent.includes("*") ||
              label.classList.contains("required")
          );
        },
      ];

      return checks.some((check) => {
        try {
          return check();
        } catch (e) {
          return false;
        }
      });
    } catch (error) {
      return false;
    }
  }

  // Enhanced versions of other question detection methods
  getIndeedCheckboxQuestionsEnhanced(questionsForm, retryCount = 0) {
    const checkboxQuestions = [];

    try {
      // Strategy 1: Standard checkbox detection
      const standardCheckboxes = this.getIndeedCheckboxQuestions(questionsForm);
      checkboxQuestions.push(...standardCheckboxes);

      // Strategy 2: Enhanced detection for disability forms with fieldset structure
      const fieldsets = questionsForm.querySelectorAll(
        "fieldset[aria-labelledby]"
      );

      for (const fieldset of fieldsets) {
        const checkboxInputs = fieldset.querySelectorAll(
          'input[type="checkbox"]'
        );
        if (checkboxInputs.length === 0) continue;

        // Get question text from aria-labelledby
        const labelId = fieldset.getAttribute("aria-labelledby");
        const questionLabel = labelId ? document.getElementById(labelId) : null;

        let questionText = "";
        if (questionLabel) {
          questionText = questionLabel.textContent.trim();
        } else {
          // Fallback: look for label in parent questionItem
          const questionItem = fieldset.closest(".ia-Questions-item");
          if (questionItem) {
            const label = questionItem.querySelector("label");
            if (label) {
              questionText = label.textContent.trim();
            }
          }
        }

        if (!questionText) continue;

        // Check if already found in standard detection
        const checkboxName = checkboxInputs[0].name;
        if (checkboxQuestions.find((q) => q.name === checkboxName)) continue;

        const options = Array.from(checkboxInputs).map((checkbox) => {
          const optionLabel = checkbox.closest("label");
          const optionText = optionLabel
            ? optionLabel.textContent.trim()
            : checkbox.value;

          return {
            element: checkbox,
            value: checkbox.value,
            text: optionText,
          };
        });

        // Detect if required (fieldset level or individual checkboxes)
        const isRequired =
          fieldset.hasAttribute("required") ||
          fieldset.getAttribute("aria-required") === "true" ||
          checkboxInputs[0].hasAttribute("required") ||
          questionText.includes("(Required)") ||
          questionText.includes("*");

        checkboxQuestions.push({
          name: checkboxName,
          question: questionText
            .replace(/\(Required\)/gi, "")
            .replace(/\(optional\)/gi, "")
            .trim(),
          options: options,
          required: isRequired,
          questionItem: fieldset.closest(".ia-Questions-item") || fieldset,
          fieldset: fieldset,
        });
      }

      // Strategy 3: Direct checkbox detection in questionItems for edge cases
      const questionItems =
        questionsForm.querySelectorAll(".ia-Questions-item");

      for (const questionItem of questionItems) {
        const checkboxInputs = questionItem.querySelectorAll(
          'input[type="checkbox"]'
        );
        if (checkboxInputs.length === 0) continue;

        const checkboxName = checkboxInputs[0].name;
        if (
          !checkboxName ||
          checkboxQuestions.find((q) => q.name === checkboxName)
        )
          continue;

        // Extract question text
        let questionText = "";
        const label = questionItem.querySelector("label");
        if (label) {
          questionText = label.textContent.trim();
        }

        if (!questionText) continue;

        const options = Array.from(checkboxInputs).map((checkbox) => {
          const optionLabel =
            checkbox.closest("label") ||
            checkbox.parentElement.querySelector("label") ||
            checkbox.nextElementSibling;

          const optionText = optionLabel
            ? optionLabel.textContent.trim()
            : checkbox.value;

          return {
            element: checkbox,
            value: checkbox.value,
            text: optionText,
          };
        });

        const isRequired =
          checkboxInputs[0].hasAttribute("required") ||
          questionText.includes("(Required)");

        checkboxQuestions.push({
          name: checkboxName,
          question: questionText
            .replace(/\(Required\)/gi, "")
            .replace(/\(optional\)/gi, "")
            .trim(),
          options: options,
          required: isRequired,
          questionItem: questionItem,
        });
      }

      console.log(
        `🔍 Enhanced checkbox detection found ${checkboxQuestions.length} questions`
      );
    } catch (error) {
      console.error("❌ Error in enhanced checkbox detection:", error);
    }

    return checkboxQuestions;
  }

  getIndeedSelectQuestionsEnhanced(questionsForm, retryCount = 0) {
    // Enhanced version with multiple detection strategies
    return this.getIndeedSelectQuestions(questionsForm);
  }

  getIndeedDateQuestionsEnhanced(questionsForm, retryCount = 0) {
    // Enhanced version with multiple detection strategies
    return this.getIndeedDateQuestions(questionsForm);
  }

  getIndeedTextareaQuestionsEnhanced(questionsForm, retryCount = 0) {
    // Enhanced version with multiple detection strategies
    const questions = [];

    try {
      // Strategy 1: Standard textarea detection
      const standardTextareas = this.getIndeedTextareaQuestions(questionsForm);
      questions.push(...standardTextareas);

      // Strategy 2: Enhanced text input detection for disability forms
      const textInputs = questionsForm.querySelectorAll('input[type="text"]');

      for (const input of textInputs) {
        const questionItem = input.closest(".ia-Questions-item");
        if (!questionItem) continue;

        const label = questionItem.querySelector(
          'label[for="' + input.id + '"]'
        );
        if (!label) continue;

        const questionText = label.textContent.trim();
        const isRequired =
          input.hasAttribute("required") ||
          input.getAttribute("aria-required") === "true";

        // Skip if already found in standard detection
        if (!questions.find((q) => q.element === input)) {
          questions.push({
            element: input,
            question: questionText,
            required: isRequired,
            questionItem: questionItem,
            isTextarea: false,
          });
        }
      }

      console.log(
        `🔍 Enhanced textarea/text detection found ${questions.length} questions`
      );
    } catch (error) {
      console.error("❌ Error in enhanced textarea detection:", error);
    }

    return questions;
  }

  getIndeedFileUploadQuestionsEnhanced(questionsForm, retryCount = 0) {
    // Enhanced version with multiple detection strategies
    return this.getIndeedFileUploadQuestions(questionsForm);
  }

  getProfileFieldsEnhanced(questionsForm, retryCount = 0) {
    console.log("🔍 Detecting profile/contact fields...");
    const profileFields = [];

    try {
      // Strategy 1: Target mosaic contact info module
      const contactModule = document.querySelector(
        "#mosaic-provider-module-apply-contact-info"
      );
      if (contactModule) {
        const moduleInputs = contactModule.querySelectorAll(
          'input[type="text"], input:not([type]):not([readonly]), input[type="email"], input[type="tel"]'
        );

        for (const input of moduleInputs) {
          if (!this.isElementVisible(input) || input.value !== "") continue;

          const label = this.findProfileFieldLabel(input);
          if (label) {
            profileFields.push({
              element: input,
              question: label,
              required:
                input.hasAttribute("required") ||
                input.getAttribute("aria-required") === "true",
              fieldType: "profile",
              isProfile: true,
            });
          }
        }
      }

      // Strategy 2: Target data-testid location fields
      const locationFields = document.querySelectorAll(
        '[data-testid*="location-fields"], [data-testid*="contact-"], [data-testid*="profile-"]'
      );
      for (const field of locationFields) {
        const input =
          field.tagName === "INPUT" ? field : field.querySelector("input");
        if (!input || !this.isElementVisible(input) || input.value !== "")
          continue;

        // Skip if already found in strategy 1
        if (profileFields.find((pf) => pf.element === input)) continue;

        const label = this.findProfileFieldLabel(input);
        if (label) {
          profileFields.push({
            element: input,
            question: label,
            required:
              input.hasAttribute("required") ||
              input.getAttribute("aria-required") === "true",
            fieldType: "profile",
            isProfile: true,
          });
        }
      }

      // Strategy 3: Generic profile field patterns
      const profileSelectors = [
        'input[name*="location"]',
        'input[name*="address"]',
        'input[name*="postal"]',
        'input[name*="zip"]',
        'input[name*="city"]',
        'input[name*="state"]',
        'input[name*="country"]',
        'input[name*="phone"]',
        'input[name*="email"]',
        'input[autocomplete*="address"]',
        'input[autocomplete*="postal"]',
      ];

      for (const selector of profileSelectors) {
        const inputs = document.querySelectorAll(selector);
        for (const input of inputs) {
          if (!this.isElementVisible(input) || input.value !== "") continue;

          // Skip if already found
          if (profileFields.find((pf) => pf.element === input)) continue;

          const label = this.findProfileFieldLabel(input);
          if (label) {
            profileFields.push({
              element: input,
              question: label,
              required:
                input.hasAttribute("required") ||
                input.getAttribute("aria-required") === "true",
              fieldType: "profile",
              isProfile: true,
            });
          }
        }
      }

      console.log(
        `🔍 Profile field detection found ${profileFields.length} fields`
      );
    } catch (error) {
      console.error("❌ Error in profile field detection:", error);
    }

    return profileFields;
  }

  findProfileFieldLabel(input) {
    // Strategy 1: Associated label element
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) return label.textContent.trim();
    }

    // Strategy 2: aria-labelledby
    const labelledBy = input.getAttribute("aria-labelledby");
    if (labelledBy) {
      const labelElement = document.getElementById(labelledBy);
      if (labelElement) return labelElement.textContent.trim();
    }

    // Strategy 3: data-testid label pattern
    const testId = input.getAttribute("data-testid");
    if (testId) {
      const labelTestId = testId.replace("-input", "-label");
      const labelElement = document.querySelector(
        `[data-testid="${labelTestId}"]`
      );
      if (labelElement) return labelElement.textContent.trim();
    }

    // Strategy 4: placeholder as fallback
    const placeholder = input.getAttribute("placeholder");
    if (placeholder && placeholder.trim().length > 0) {
      return placeholder.trim();
    }

    // Strategy 5: name attribute as fallback
    const name = input.getAttribute("name");
    if (name) {
      return name
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
    }

    return null;
  }

  isElementVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      element.offsetWidth > 0 &&
      element.offsetHeight > 0
    );
  }

  getIndeedRadioQuestions(questionsForm) {
    const radioQuestions = [];

    // Look for question items with radio buttons using Indeed's structure
    const questionItems = questionsForm.querySelectorAll(
      '.ia-Questions-item, [class*="Questions-item"]'
    );

    for (const questionItem of questionItems) {
      const radioInputs = questionItem.querySelectorAll('input[type="radio"]');

      if (radioInputs.length > 0) {
        // Extract question text from various possible locations
        let questionText = "";

        // First try data-testid label
        const questionLabel = questionItem.querySelector(
          '[data-testid*="label"]'
        );
        if (questionLabel) {
          questionText = questionLabel.textContent.trim();
        }

        // If not found, try legend element
        if (!questionText) {
          const legend = questionItem.querySelector("legend");
          if (legend) {
            questionText = legend.textContent.trim();
          }
        }

        // If still not found, try any label
        if (!questionText) {
          const label = questionItem.querySelector("label");
          if (label) {
            questionText = label.textContent.trim();
          }
        }

        // Get the radio button name for grouping
        const radioName = radioInputs[0].name;

        if (radioName) {
          const options = Array.from(radioInputs).map((radio) => {
            const optionLabel = radio.closest("label");
            const optionText = optionLabel
              ? optionLabel.textContent.trim()
              : radio.value;

            return {
              element: radio,
              value: radio.value,
              text: optionText,
            };
          });

          // Check if required using multiple methods
          const fieldset = questionItem.querySelector("fieldset");
          const isRequired =
            questionText.includes("(Required)") ||
            questionText.includes("(required)") ||
            (fieldset && fieldset.getAttribute("aria-required") === "true") ||
            radioInputs[0].hasAttribute("required");

          radioQuestions.push({
            name: radioName,
            question: questionText.replace(/\(Required\)/gi, "").trim(),
            options: options,
            required: isRequired,
            questionItem: questionItem,
          });
        }
      }
    }

    return radioQuestions;
  }

  getIndeedCheckboxQuestions(questionsForm) {
    const checkboxQuestions = [];

    // Look for question items with checkbox inputs using Indeed's fieldset structure
    const questionItems = questionsForm.querySelectorAll(
      '.ia-Questions-item, [class*="Questions-item"]'
    );

    for (const questionItem of questionItems) {
      // Look for fieldsets with checkbox inputs (Indeed's checkbox structure)
      const fieldset = questionItem.querySelector("fieldset[name]");

      if (fieldset) {
        const checkboxInputs = fieldset.querySelectorAll(
          'input[type="checkbox"]'
        );

        if (checkboxInputs.length > 0) {
          // Extract question text from the legend
          const legend = fieldset.querySelector("legend");
          const questionText = legend ? legend.textContent.trim() : "";

          // Get the fieldset name for grouping (all checkboxes in the same fieldset share the same name)
          const fieldsetName = fieldset.getAttribute("name");

          if (fieldsetName && questionText) {
            const options = Array.from(checkboxInputs).map((checkbox) => {
              const optionLabel = checkbox.closest("label");
              const optionText = optionLabel
                ? optionLabel.textContent.trim()
                : checkbox.value;

              return {
                element: checkbox,
                value: checkbox.value,
                text: optionText,
              };
            });

            checkboxQuestions.push({
              name: fieldsetName,
              question: questionText.replace("(Required)", "").trim(),
              options: options,
              required: questionText.includes("(Required)"),
              questionItem: questionItem,
              fieldset: fieldset,
            });
          }
        }
      }
    }

    return checkboxQuestions;
  }

  getIndeedSelectQuestions(questionsForm) {
    const selectQuestions = [];

    // Look for question items with select inputs using Indeed's structure
    const questionItems = questionsForm.querySelectorAll(
      '.ia-Questions-item, [class*="Questions-item"]'
    );

    console.log(
      `🔍 Found ${questionItems.length} question items to check for select fields`
    );

    for (const questionItem of questionItems) {
      const selectInput = questionItem.querySelector("select");

      if (selectInput) {
        console.log(
          `🔍 Found select input with id: ${selectInput.id}, name: ${selectInput.name}`
        );

        // Extract question text from the label - try multiple strategies
        let label = questionItem.querySelector('label[id*="label"]');
        if (!label) {
          // Try generic label selector
          label = questionItem.querySelector("label");
        }
        if (!label) {
          // Try legend for fieldset-based questions
          label = questionItem.querySelector("legend");
        }

        let questionText = "";
        if (label) {
          questionText = label.textContent.trim();
          console.log(`🔍 Found question text from label: "${questionText}"`);
        } else {
          // Fallback: try to find any text that might be the question
          const possibleText = questionItem.querySelector(
            '.css-vcedu5, [class*="label"], [class*="question"]'
          );
          if (possibleText) {
            questionText = possibleText.textContent.trim();
            console.log(
              `🔍 Found question text from fallback: "${questionText}"`
            );
          } else {
            console.log(`⚠️ No question text found for select field`);
          }
        }

        // Get the select name for identification
        const selectName =
          selectInput.getAttribute("name") || selectInput.getAttribute("id");

        console.log(
          `🔍 Select name: ${selectName}, Question text: "${questionText}"`
        );

        if (
          selectName &&
          (questionText || selectInput.getAttribute("aria-label"))
        ) {
          // Use aria-label as fallback for question text
          if (!questionText && selectInput.getAttribute("aria-label")) {
            questionText = selectInput.getAttribute("aria-label");
          }
          // Get all options (excluding the first placeholder option)
          const optionElements = selectInput.querySelectorAll(
            'option:not([value=""])'
          );
          const options = Array.from(optionElements).map((option) => ({
            element: option,
            value: option.value,
            text: option.textContent.trim(),
          }));

          selectQuestions.push({
            name: selectName,
            question: questionText.replace("(Required)", "").trim(),
            options: options,
            required:
              questionText.includes("(Required)") ||
              selectInput.hasAttribute("aria-required"),
            questionItem: questionItem,
            selectElement: selectInput,
          });

          console.log(
            `✅ Added select question: "${questionText}" with ${options.length} options`
          );
        }
      }
    }

    console.log(`🔍 Total select questions found: ${selectQuestions.length}`);
    return selectQuestions;
  }

  getIndeedTextareaQuestions(questionsForm) {
    const textQuestions = [];

    // Look for question items with textareas and text inputs using Indeed's structure
    const questionItems = questionsForm.querySelectorAll(
      '.ia-Questions-item, [class*="Questions-item"]'
    );

    for (const questionItem of questionItems) {
      // Check for textarea
      const textarea = questionItem.querySelector("textarea");
      // Check for text input
      const textInput = questionItem.querySelector(
        'input[type="text"], input[data-testid*="input"]'
      );

      const inputElement = textarea || textInput;

      if (inputElement) {
        // Extract question text from the label
        const questionLabel = questionItem.querySelector(
          '[data-testid*="label"]'
        );
        const questionText = questionLabel
          ? questionLabel.textContent.trim()
          : "";

        if (questionText && inputElement.name) {
          textQuestions.push({
            element: inputElement,
            name: inputElement.name,
            question: questionText.replace("(Required)", "").trim(),
            required:
              questionText.includes("(Required)") ||
              inputElement.hasAttribute("required"),
            questionItem: questionItem,
            isTextarea: inputElement.tagName.toLowerCase() === "textarea",
            isTextInput: inputElement.tagName.toLowerCase() === "input",
          });
        }
      }
    }

    return textQuestions;
  }

  getIndeedFileUploadQuestions(questionsForm) {
    const fileUploadQuestions = [];

    // Look for question items with file upload buttons using Indeed's structure
    const questionItems = questionsForm.querySelectorAll(
      '.ia-Questions-item, [class*="Questions-item"]'
    );

    for (const questionItem of questionItems) {
      // Look for upload button with data-testid ending in "-upload-button"
      const uploadButton = questionItem.querySelector(
        '[data-testid*="upload-button"]:not([data-testid*="file-input"])'
      );
      // Look for hidden file input with data-testid ending in "file-input"
      const fileInput = questionItem.querySelector(
        'input[type="file"][data-testid*="file-input"]'
      );

      if (uploadButton && fileInput) {
        // Extract question text from the legend
        const legend = questionItem.querySelector("legend");
        const questionText = legend ? legend.textContent.trim() : "";

        // Get the data-testid from either element to use as identifier
        const uploadButtonTestId = uploadButton.getAttribute("data-testid");
        const fileInputTestId = fileInput.getAttribute("data-testid");

        if (questionText && (uploadButtonTestId || fileInputTestId)) {
          fileUploadQuestions.push({
            question: questionText.replace("(Required)", "").trim(),
            required: questionText.includes("(Required)"),
            questionItem: questionItem,
            uploadButton: uploadButton,
            fileInput: fileInput,
            uploadButtonTestId: uploadButtonTestId,
            fileInputTestId: fileInputTestId,
            accept: fileInput.getAttribute("accept") || "",
          });
        }
      }
    }

    return fileUploadQuestions;
  }

  async fillIndeedRadioQuestion(radioQuestion, userDetails, jobData) {
    try {
      // Check if already answered
      const checkedRadio = radioQuestion.options.find(
        (opt) => opt.element.checked
      );
      if (checkedRadio) {
        return;
      }

      const questionLower = radioQuestion.question.toLowerCase();

      // Special handling for Terms and Conditions - ALWAYS accept
      const isTermsQuestion =
        questionLower.includes("terms and conditions") ||
        questionLower.includes("privacy notice") ||
        questionLower.includes("privacy policy") ||
        questionLower.includes("willingly accept") ||
        questionLower.includes("consent") ||
        questionLower.includes("agree to") ||
        (questionLower.includes("accept") && questionLower.includes("terms"));

      if (isTermsQuestion) {
        // Find the acceptance option
        const acceptOption = radioQuestion.options.find((opt) => {
          const optionText = opt.text.toLowerCase().trim();
          return (
            optionText.includes("accept") ||
            optionText.includes("agree") ||
            optionText.includes("yes") ||
            optionText.includes("consent") ||
            optionText.includes("willingly")
          );
        });

        if (acceptOption) {
          acceptOption.element.focus();
          acceptOption.element.checked = true;
          acceptOption.element.dispatchEvent(
            new Event("change", { bubbles: true })
          );
          acceptOption.element.dispatchEvent(
            new Event("input", { bubbles: true })
          );
          acceptOption.element.dispatchEvent(
            new Event("click", { bubbles: true })
          );
          acceptOption.element.blur();
          await this.delay(500);
          return;
        }
      }

      // Special handling for "add response" questions - ALWAYS select "No"
      const isAddResponseQuestion =
        questionLower.includes("do you want to add another response") ||
        questionLower.includes("add another response for education") ||
        questionLower.includes("add another response for experience") ||
        questionLower.includes("add another response for") ||
        questionLower.includes("do you want to add a response for education") ||
        questionLower.includes(
          "do you want to add a response for work experience"
        ) ||
        questionLower.includes("do you want to add a response for") ||
        (questionLower.includes("do you want to add") &&
          (questionLower.includes("education") ||
            questionLower.includes("work experience") ||
            questionLower.includes("experience")));

      if (isAddResponseQuestion) {
        // Find the "No" option with comprehensive patterns
        const noOption = radioQuestion.options.find((opt) => {
          const optionText = opt.text.toLowerCase().trim();
          const optionValue = opt.value.toLowerCase().trim();
          return (
            optionText === "no" ||
            optionText === "no, continue" ||
            optionText === "no thanks" ||
            optionText === "skip" ||
            optionValue === "no" ||
            optionValue === "false"
          );
        });

        if (noOption) {
          noOption.element.focus();
          noOption.element.checked = true;

          // Dispatch multiple events to ensure form validation triggers
          noOption.element.dispatchEvent(
            new Event("change", { bubbles: true })
          );
          noOption.element.dispatchEvent(new Event("input", { bubbles: true }));
          noOption.element.dispatchEvent(new Event("click", { bubbles: true }));

          noOption.element.blur();

          await this.delay(500);
          return;
        }
      }

      const context = {
        fieldType: "radio",
        platform: this.platform,
        userData: userDetails,
        jobDescription: jobData?.description || "",
        required: radioQuestion.required,
      };

      const options = radioQuestion.options.map((opt) => opt.text);

      let answer;
      try {
        answer = await this.aiService.getOptionAnswer(
          radioQuestion.question,
          options,
          context
        );
      } catch (error) {
        return;
      }

      if (answer) {
        // Find the best matching option
        const selectedOption = this.findBestMatchingOption(
          answer,
          radioQuestion.options
        );

        if (selectedOption) {
          // Enhanced radio button selection with more comprehensive event dispatching
          selectedOption.element.focus();
          selectedOption.element.checked = true;

          // Dispatch multiple events to ensure form validation triggers
          selectedOption.element.dispatchEvent(
            new Event("change", { bubbles: true })
          );
          selectedOption.element.dispatchEvent(
            new Event("input", { bubbles: true })
          );
          selectedOption.element.dispatchEvent(
            new Event("click", { bubbles: true })
          );

          selectedOption.element.blur();

          await this.delay(500);
        }
      }
    } catch (error) {
      console.error("❌ Error filling Indeed radio question:", error);
    }
  }

  async fillIndeedCheckboxQuestion(checkboxQuestion, userDetails, jobData) {
    try {
      // Check if already answered (any checkbox is checked)
      const checkedBoxes = checkboxQuestion.options.filter(
        (opt) => opt.element.checked
      );
      if (checkedBoxes.length > 0) {
        return;
      }

      const questionLower = checkboxQuestion.question.toLowerCase();
      let selectedOption = null;

      // Special handling for disability questions
      if (
        questionLower.includes("disability") &&
        questionLower.includes("selection")
      ) {
        console.log("🔘 Processing disability form question");

        // First, try to find "I do not want to answer"
        selectedOption = checkboxQuestion.options.find((opt) => {
          const optionText = opt.text.toLowerCase();
          return (
            optionText.includes("do not want to answer") ||
            optionText.includes("prefer not to answer") ||
            optionText.includes("decline to answer")
          );
        });

        // Fallback: select "No" option
        if (!selectedOption) {
          selectedOption = checkboxQuestion.options.find((opt) => {
            const optionText = opt.text.toLowerCase();
            return (
              (optionText.includes("no") &&
                optionText.includes("disability")) ||
              optionText.includes("no, i do not have")
            );
          });
        }

        if (selectedOption) {
          console.log(`🔘 Selecting disability option: ${selectedOption.text}`);
          selectedOption.element.focus();
          selectedOption.element.checked = true;

          selectedOption.element.dispatchEvent(
            new Event("change", { bubbles: true })
          );
          selectedOption.element.dispatchEvent(
            new Event("input", { bubbles: true })
          );
          selectedOption.element.dispatchEvent(
            new Event("click", { bubbles: true })
          );

          selectedOption.element.blur();
          await this.delay(500);
          return;
        }
      }

      // If not a disability question or no special handling applied, use AI
      const context = {
        fieldType: "checkbox",
        platform: this.platform,
        userData: userDetails,
        jobDescription: jobData?.description || "",
        required: checkboxQuestion.required,
      };

      const options = checkboxQuestion.options.map((opt) => opt.text);

      let selectedValues;
      try {
        selectedValues = await this.aiService.getMultiSelectAnswer(
          checkboxQuestion.question,
          options,
          context
        );
      } catch (error) {
        console.log(`❌ AI service failed for checkbox: ${error.message}`);

        // Fallback: select safe option
        const safeOption = checkboxQuestion.options.find((opt) => {
          const optionText = opt.text.toLowerCase();
          return (
            optionText.includes("no") ||
            optionText.includes("decline") ||
            optionText.includes("prefer not")
          );
        });

        if (safeOption) {
          selectedValues = [safeOption.text.toLowerCase()];
        } else {
          return;
        }
      }

      if (selectedValues && selectedValues.length > 0) {
        for (const option of checkboxQuestion.options) {
          const optionLower = option.text.toLowerCase();
          const shouldCheck = selectedValues.some(
            (sel) =>
              optionLower === sel ||
              optionLower.includes(sel) ||
              sel.includes(optionLower)
          );
          if (shouldCheck && !option.element.checked) {
            option.element.focus();
            option.element.checked = true;

            option.element.dispatchEvent(new Event("change", { bubbles: true }));
            option.element.dispatchEvent(new Event("input", { bubbles: true }));
            option.element.dispatchEvent(new Event("click", { bubbles: true }));

            option.element.blur();

            await this.delay(300);
          }
        }
      }
    } catch (error) {
      console.error("❌ Error filling Indeed checkbox question:", error);
    }
  }

  async fillIndeedSelectQuestion(selectQuestion, userDetails, jobData) {
    try {
      // Check if already selected
      if (
        selectQuestion.selectElement.value &&
        selectQuestion.selectElement.value !== ""
      ) {
        return;
      }

      const context = {
        fieldType: "select",
        platform: this.platform,
        userData: userDetails,
        jobDescription: jobData?.description || "",
        required: selectQuestion.required,
      };

      const options = selectQuestion.options.map((opt) => opt.text);

      let answer;
      try {
        answer = await this.aiService.getOptionAnswer(
          selectQuestion.question,
          options,
          context
        );
      } catch (error) {
        console.log(`❌ AI service failed for select: ${error.message}`);
        return;
      }

      if (answer) {
        // Find the best matching option
        const selectedOption = this.findBestMatchingOption(
          answer,
          selectQuestion.options
        );

        if (selectedOption) {
          // Enhanced select option selection with comprehensive event dispatching
          selectQuestion.selectElement.focus();
          selectQuestion.selectElement.value = selectedOption.value;

          // Dispatch multiple events to ensure form validation triggers
          selectQuestion.selectElement.dispatchEvent(
            new Event("change", { bubbles: true })
          );
          selectQuestion.selectElement.dispatchEvent(
            new Event("input", { bubbles: true })
          );

          selectQuestion.selectElement.blur();

          await this.delay(500);
        }
      }
    } catch (error) {
      console.error("❌ Error filling Indeed select question:", error);
    }
  }

  async fillIndeedFileUploadQuestion(fileUploadQuestion, userDetails, jobData) {
    try {
      // Check if file already uploaded (look for success indicators)
      const questionItem = fileUploadQuestion.questionItem;
      const hasUploadedFile = questionItem.querySelector(
        '[data-testid*="file-name"], .file-uploaded, .uploaded-file'
      );

      if (hasUploadedFile) {
        return;
      }

      // Determine if this is asking for a resume/writing sample
      const questionLower = fileUploadQuestion.question.toLowerCase();
      const isResumeLike =
        questionLower.includes("resume") ||
        questionLower.includes("cv") ||
        questionLower.includes("writing sample") ||
        questionLower.includes("writing") ||
        questionLower.includes("portfolio") ||
        questionLower.includes("work sample");

      if (isResumeLike) {
        const fileHandler = await this.getFileHandler(userDetails);
        if (!fileHandler) {
          return;
        }

        await fileHandler.handleSingleFileUpload(
          fileUploadQuestion.fileInput,
          userDetails,
          jobData,
          undefined,
          this.currentJobTitle || jobData?.title || ""
        );
        await this.delay(1000);
      }
    } catch (error) {
      console.error("❌ Error filling Indeed file upload question:", error);
    }
  }

  async fillIndeedTextareaQuestion(textQuestion, userDetails, jobData) {
    try {
      if (textQuestion.element.value && textQuestion.element.value.trim()) {
        return;
      }

      const questionLower = textQuestion.question.toLowerCase();
      let answer = null;

      // Special handling for specific disability form fields
      if (questionLower.includes("candidate name")) {
        answer = `${userDetails.firstName || ""} ${
          userDetails.lastName || ""
        }`.trim();
      } else if (
        questionLower.includes("disability questionnaire answered date") ||
        questionLower.includes("answered date")
      ) {
        // Use current date
        const today = new Date();
        answer = today.toLocaleDateString("en-US"); // MM/DD/YYYY format
      } else if (
        questionLower.includes("employee id") &&
        questionLower.includes("internal")
      ) {
        // Skip internal employee ID for external candidates
        answer = "";
      } else {
        // Use AI for other questions
        const context = {
          fieldType: textQuestion.isTextarea ? "textarea" : "text_input",
          platform: this.platform,
          userData: userDetails,
          jobDescription: jobData?.description || "",
          required: textQuestion.required,
          specialInstructions:
            "Keep your answer short, relevant, and direct. Provide a concise response without unnecessary details or explanations. IMPORTANT: Keep response under 1300 characters maximum.",
        };

        try {
          if (textQuestion.isTextarea) {
            // Use longform-question for textarea
            answer = await this.aiService.getLongformAnswer(
              textQuestion.question,
              [],
              context
            );
          } else if (AIResponseUtils.isSalaryField(textQuestion.question)) {
            answer = await this.aiService.getSalaryAnswer(
              textQuestion.question,
              [],
              context
            );
          } else {
            // Use normal-question for text inputs
            answer = await this.aiService.getNormalAnswer(
              textQuestion.question,
              [],
              context
            );
          }
        } catch (error) {
          console.warn("❌ AI service failed for text question:", error);
          return;
        }
      }

      if (answer) {
        if (textQuestion.isTextarea) {
          await this.slowPasteText(textQuestion.element, answer);
        } else {
          await this.typeTextHumanLike(textQuestion.element, answer);
        }
        await this.delay(500);
      }
    } catch (error) {
      console.error("❌ Error filling Indeed text question:", error);
    }
  }

  getIndeedDateQuestions(questionsForm) {
    const dateQuestions = [];

    try {
      // Look for date input fields with Indeed's structure
      const questionItems = questionsForm.querySelectorAll(
        '.ia-Questions-item, [class*="Questions-item"]'
      );

      for (const questionItem of questionItems) {
        // Look for date inputs within the question item
        const dateInputs = questionItem.querySelectorAll(
          'input[type="date"], input[placeholder*="MM/DD/YYYY"], input[placeholder*="mm/dd/yyyy"], input[id*="date"], input[name*="date"]'
        );

        if (dateInputs.length > 0) {
          const dateInput = dateInputs[0]; // Take the first date input

          // Extract question text
          const questionText = this.extractQuestionTextFromItem(questionItem);
          const isRequired = this.isQuestionRequired(questionItem);

          if (questionText && dateInput) {
            dateQuestions.push({
              element: dateInput,
              question: questionText,
              required: isRequired,
              placeholder: dateInput.placeholder || "MM/DD/YYYY",
              questionItem: questionItem,
            });
          }
        }
      }
    } catch (error) {
      console.error("❌ Error detecting date questions:", error);
    }

    return dateQuestions;
  }

  async fillIndeedDateQuestion(dateQuestion, userDetails, jobData) {
    try {
      if (!dateQuestion?.element) {
        return;
      }

      const questionLower = dateQuestion.question.toLowerCase();

      const currentValue = dateQuestion.element.value;

      if (currentValue && currentValue.trim()) {
        return;
      }

      let dateValue = "";

      if (
        questionLower.includes("available") ||
        questionLower.includes("start")
      ) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 14);
        dateValue = this.formatDateForInput(futureDate);
      } else if (
        questionLower.includes("birth") ||
        questionLower.includes("born")
      ) {
        const birthDate = new Date();
        birthDate.setFullYear(birthDate.getFullYear() - 30);
        dateValue = this.formatDateForInput(birthDate);
      } else {
        const context = {
          fieldType: "date",
          question: dateQuestion.question,
          placeholder: dateQuestion.placeholder,
          userProfile: userDetails,
          jobDescription: jobData?.description || "",
          instructions:
            "Please provide a date response in MM/DD/YYYY format only. Do not include any explanation, just the date in the exact format MM/DD/YYYY. Examples: 01/15/2024, 12/31/2023",
        };

        try {
          const aiResponse = await this.aiService.getResponse(
            context,
            "normal"
          );

          if (aiResponse?.response) {
            const aiDateValue = aiResponse.response.trim();

            // First try to convert relative time answers (Immediate, 2 weeks, etc.)
            const convertedDate = this.convertAvailabilityToDate(aiDateValue);
            if (convertedDate) {
              dateValue = convertedDate;
            } else if (this.isValidDateFormat(aiDateValue)) {
              // If not a relative answer, check if it's already in MM/DD/YYYY
              dateValue = aiDateValue;
            } else {
              dateValue = this.formatDateForInput(new Date());
            }
          } else {
            dateValue = this.formatDateForInput(new Date());
          }
        } catch (aiError) {
          dateValue = this.formatDateForInput(new Date());
        }
      }

      if (dateValue) {
        // Fill the date input
        dateQuestion.element.value = dateValue;
        dateQuestion.element.setAttribute("value", dateValue);

        await this.dispatchDateInputEvents(dateQuestion.element);

        await this.delay(300);
      }
    } catch (error) {
      console.error("❌ Error filling Indeed date question:", error);
    }
  }

  formatDateForInput(date) {
    // Format date as MM/DD/YYYY (Indeed's expected format)
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  }

  /**
   * Convert AI relative time answer to actual date in MM/DD/YYYY format
   * AI may return: Immediate, 2 weeks, 1 month, 2 months, 3 months, More than 3 months
   */
  convertAvailabilityToDate(answer) {
    if (!answer) return null;

    const today = new Date();
    let targetDate = new Date(today);
    const lowerAnswer = answer.toLowerCase().trim();

    // Map relative time to days offset
    if (
      lowerAnswer === "immediate" ||
      lowerAnswer === "immediately" ||
      lowerAnswer === "asap"
    ) {
      // Already today
    } else if (lowerAnswer.includes("1 week") || lowerAnswer === "one week") {
      targetDate.setDate(today.getDate() + 7);
    } else if (lowerAnswer.includes("2 week") || lowerAnswer === "two weeks") {
      targetDate.setDate(today.getDate() + 14);
    } else if (
      lowerAnswer.includes("3 week") ||
      lowerAnswer === "three weeks"
    ) {
      targetDate.setDate(today.getDate() + 21);
    } else if (lowerAnswer.includes("1 month") || lowerAnswer === "one month") {
      targetDate.setDate(today.getDate() + 30);
    } else if (
      lowerAnswer.includes("2 month") ||
      lowerAnswer === "two months"
    ) {
      targetDate.setDate(today.getDate() + 60);
    } else if (
      lowerAnswer.includes("3 month") ||
      lowerAnswer === "three months"
    ) {
      targetDate.setDate(today.getDate() + 90);
    } else if (
      lowerAnswer.includes("more than 3") ||
      lowerAnswer.includes("more than three")
    ) {
      targetDate.setDate(today.getDate() + 120);
    } else {
      // Not a relative time answer
      return null;
    }

    // Format as MM/DD/YYYY
    const month = String(targetDate.getMonth() + 1).padStart(2, "0");
    const day = String(targetDate.getDate()).padStart(2, "0");
    const year = targetDate.getFullYear();

    console.log(`📅 Converted "${answer}" to date: ${month}/${day}/${year}`);
    return `${month}/${day}/${year}`;
  }

  isValidDateFormat(dateString) {
    // Check if the date string matches MM/DD/YYYY format
    const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
    return dateRegex.test(dateString);
  }

  async dispatchDateInputEvents(dateInput) {
    try {
      // Focus the input
      dateInput.focus();
      await this.delay(100);

      // Dispatch input event
      const inputEvent = new Event("input", { bubbles: true });
      dateInput.dispatchEvent(inputEvent);
      await this.delay(50);

      // Dispatch change event
      const changeEvent = new Event("change", { bubbles: true });
      dateInput.dispatchEvent(changeEvent);
      await this.delay(50);

      // Dispatch blur event
      const blurEvent = new Event("blur", { bubbles: true });
      dateInput.dispatchEvent(blurEvent);
      await this.delay(100);
    } catch (error) {
      console.error("❌ Error dispatching date input events:", error);
    }
  }

  async handleFileUploads(form, userDetails, jobDescription, jobId, jobTitle) {
    try {
      if (this.state.cancelFileUploads) {
        return false;
      }

      const success = await this.fileHandler.handleFileUploads(
        form,
        userDetails,
        jobDescription,
        jobId,
        jobTitle
      );
      return success;
    } catch (error) {
      return false;
    }
  }

  async fillFormFieldsWithAI() {
    try {
      // Get user details and job data
      const userDetails = await this.getUserDetails();
      const storedJobData = await this.getStoredJobData();

      if (!userDetails) {
        return;
      }

      // Find all form elements
      const textareas = document.querySelectorAll(this.selectors.textareas);
      const radioGroups = this.getRadioGroups();
      const checkboxGroups = this.getCheckboxGroups();
      const textInputs = document.querySelectorAll(this.selectors.textInputs);
      const selectInputs = document.querySelectorAll(
        this.selectors.selectInputs
      );

      // Process each textarea with AI
      for (const textarea of textareas) {
        await this.fillTextareaWithAI(textarea, userDetails, storedJobData);
        await this.delay(500 + Math.random() * 1000);
      }

      // Process each radio group with AI
      for (const radioGroup of radioGroups) {
        await this.fillRadioGroupWithAI(radioGroup, userDetails, storedJobData);
        await this.delay(300 + Math.random() * 500);
      }

      // Process each checkbox group with AI
      for (const checkboxGroup of checkboxGroups) {
        await this.fillCheckboxGroupWithAI(
          checkboxGroup,
          userDetails,
          storedJobData
        );
        await this.delay(300 + Math.random() * 500);
      }

      // Process text inputs with AI
      for (const input of textInputs) {
        await this.fillBasicInputField(input, userDetails);
        await this.delay(200 + Math.random() * 300);
      }

      // Process select inputs with AI
      for (const select of selectInputs) {
        await this.fillBasicSelectField(select, userDetails);
        await this.delay(200 + Math.random() * 300);
      }
    } catch (error) {
      console.error("❌ Error in AI form filling:", error);
    }
  }

  getRadioGroups() {
    const radioGroups = [];
    const processedNames = new Set();

    document.querySelectorAll('input[type="radio"]').forEach((radio) => {
      if (!processedNames.has(radio.name) && radio.name) {
        processedNames.add(radio.name);

        const allRadios = document.querySelectorAll(
          `input[type="radio"][name="${radio.name}"]`
        );
        const question = this.getQuestionText(radio);
        const options = Array.from(allRadios).map((r) => ({
          element: r,
          value: r.value,
          text: this.getOptionText(r),
        }));

        radioGroups.push({
          name: radio.name,
          question: question,
          options: options,
          required: this.isRequired(radio),
        });
      }
    });

    return radioGroups;
  }

  getCheckboxGroups() {
    const checkboxGroups = [];

    const checkboxContainers = document.querySelectorAll(
      ".checkbox-group, .form-group, .field-group"
    );

    checkboxContainers.forEach((container, index) => {
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      if (checkboxes.length > 1) {
        const question = this.getQuestionTextFromContainer(container);
        const options = Array.from(checkboxes).map((checkbox) => ({
          element: checkbox,
          value: checkbox.value,
          text: this.getOptionText(checkbox),
        }));

        checkboxGroups.push({
          name: `checkbox-group-${index}`,
          question: question,
          options: options,
          required: this.isRequiredFromContainer(container),
        });
      }
    });

    return checkboxGroups;
  }

  async fillTextareaWithAI(textarea, userDetails, jobData) {
    try {
      if (textarea.value && textarea.value.trim()) {
        return;
      }

      const question = this.getQuestionText(textarea);
      if (!question) {
        return;
      }

      const context = {
        fieldType: "textarea",
        platform: this.platform,
        userData: userDetails,
        jobDescription: jobData?.description || "",
        required: this.isRequired(textarea),
        specialInstructions:
          "Answer the question directly and concisely. Do not ask for clarification. Do not add any introductory or concluding remarks. Provide only the answer to the question. The response must be under 1300 characters.",
      };

      let answer;
      try {
        answer = await this.aiService.getNormalAnswer(question, [], context);
      } catch (error) {
        return;
      }

      if (answer) {
        await this.typeTextHumanLike(textarea, answer);
        await this.delay(500);
      }
    } catch (error) {
      console.error("❌ Error filling textarea with AI:", error);
    }
  }

  async fillRadioGroupWithAI(radioGroup, userDetails, jobData) {
    try {
      // Check if already answered
      const checkedRadio = radioGroup.options.find(
        (opt) => opt.element.checked
      );
      if (checkedRadio) {
        return;
      }

      const context = {
        fieldType: "radio",
        platform: this.platform,
        userData: userDetails,
        jobDescription: jobData?.description || "",
        required: radioGroup.required,
      };

      const options = radioGroup.options.map((opt) => opt.text);
      let answer;
      try {
        answer = await this.aiService.getOptionAnswer(
          radioGroup.question,
          options,
          context
        );
      } catch (error) {
        return;
      }

      if (answer) {
        const selectedOption = this.findBestMatchingOption(
          answer,
          radioGroup.options
        );
        if (selectedOption) {
          selectedOption.element.focus();
          selectedOption.element.checked = true;
          selectedOption.element.dispatchEvent(
            new Event("change", { bubbles: true })
          );
          selectedOption.element.blur();

          await this.delay(500);
        }
      }
    } catch (error) {
      console.error("❌ Error filling radio group with AI:", error);
    }
  }

  async fillCheckboxGroupWithAI(checkboxGroup, userDetails, jobData) {
    try {
      // Check if already answered
      const checkedBoxes = checkboxGroup.options.filter(
        (opt) => opt.element.checked
      );
      if (checkedBoxes.length > 0) {
        return;
      }
      const context = {
        fieldType: "checkbox",
        platform: this.platform,
        userData: userDetails,
        jobDescription: jobData?.description || "",
        required: checkboxGroup.required,
      };

      const options = checkboxGroup.options.map((opt) => opt.text);

      let selectedValues;
      try {
        selectedValues = await this.aiService.getMultiSelectAnswer(
          checkboxGroup.question,
          options,
          context
        );
      } catch (error) {
        return;
      }

      if (selectedValues && selectedValues.length > 0) {
        for (const option of checkboxGroup.options) {
          const optionLower = option.text.toLowerCase();
          const shouldCheck = selectedValues.some(
            (sel) =>
              optionLower === sel ||
              optionLower.includes(sel) ||
              sel.includes(optionLower)
          );
          if (shouldCheck && !option.element.checked) {
            option.element.focus();
            option.element.checked = true;
            option.element.dispatchEvent(new Event("change", { bubbles: true }));
            option.element.blur();
            await this.delay(300);
          }
        }
      }
    } catch (error) {
      console.error("❌ Error filling checkbox group with AI:", error);
    }
  }

  async fillProfileField(profileField, userDetails, storedJobData) {
    console.log(`📝 Filling profile field: ${profileField.question}`);

    try {
      const input = profileField.element;
      if (input.value && input.value.trim()) {
        console.log(
          `✅ Profile field already filled: ${profileField.question}`
        );
        return;
      }

      const fieldName = input.name?.toLowerCase() || "";
      const fieldId = input.id?.toLowerCase() || "";
      const label = profileField.question?.toLowerCase() || "";

      let fillValue = null;

      // Direct mapping for common profile fields
      if (
        fieldName.includes("postal") ||
        fieldName.includes("zip") ||
        label.includes("zip")
      ) {
        fillValue =
          userDetails.address?.zipCode || userDetails.address?.postalCode;
      } else if (fieldName.includes("city") || label.includes("city")) {
        fillValue = userDetails.address?.city;
      } else if (fieldName.includes("state") || label.includes("state")) {
        fillValue = userDetails.address?.state;
      } else if (
        fieldName.includes("address") ||
        label.includes("address") ||
        label.includes("street")
      ) {
        fillValue = userDetails.address?.street;
      } else if (fieldName.includes("phone") || label.includes("phone")) {
        fillValue = userDetails.personalInfo?.phone;
      } else if (fieldName.includes("email") || fieldId.includes("email")) {
        fillValue = userDetails.personalInfo?.email;
      } else if (
        fieldName.includes("locality") ||
        label.includes("locality") ||
        (label.includes("city") && label.includes("state"))
      ) {
        // For combined city, state fields
        const city = userDetails.address?.city || "";
        const state = userDetails.address?.state || "";
        fillValue = city && state ? `${city}, ${state}` : city || state;
      }

      // If no direct mapping, use AI for the field
      if (!fillValue) {
        console.log(`🤖 Using AI for profile field: ${profileField.question}`);
        const aiResponse = await this.aiService.getAnswerByQuestion({
          question: profileField.question,
          fieldType: "text_input",
          userDetails: userDetails,
          jobDetails: storedJobData,
        });
        fillValue = aiResponse?.answer;
      }

      if (fillValue) {
        // Focus the field first
        input.focus();
        await this.delay(100);

        // Clear any existing value
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await this.delay(50);

        // Type the value
        input.value = fillValue;

        // Dispatch comprehensive events for modern frameworks
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("focus", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));

        // Additional events for React/modern frameworks
        const inputEvent = new Event("input", { bubbles: true });
        inputEvent.simulated = true;
        input.dispatchEvent(inputEvent);

        console.log(
          `✅ Profile field filled: ${profileField.question} = ${fillValue}`
        );
        await this.delay(200);
      } else {
        console.log(
          `⚠️ No value found for profile field: ${profileField.question}`
        );
      }
    } catch (error) {
      console.error(
        `❌ Error filling profile field ${profileField.question}:`,
        error
      );
    }
  }

  _getFutureAvailability() {
    const getNextBusinessDay = (date) => {
      let newDate = new Date(date);
      const day = newDate.getDay();
      if (day === 6) {
        // Saturday
        newDate.setDate(newDate.getDate() + 2);
      } else if (day === 0) {
        // Sunday
        newDate.setDate(newDate.getDate() + 1);
      }
      return newDate;
    };

    const formatDate = (date) => {
      const options = {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      };
      return date.toLocaleDateString("en-US", options);
    };

    let availabilityDates = [];
    let currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + 3);

    while (availabilityDates.length < 3) {
      currentDate = getNextBusinessDay(currentDate);
      availabilityDates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const timeZone = new Date()
      .toLocaleTimeString("en-us", {
        timeZoneName: "short",
      })
      .split(" ")[2];
    const timeRanges = [
      `9:00 AM to 11:00 AM (${timeZone})`,
      `1:00 PM to 3:00 PM (${timeZone})`,
      `10:00 AM to 12:00 PM (${timeZone})`,
    ];

    return availabilityDates
      .map((date, index) => {
        return `- ${formatDate(date)} – ${
          timeRanges[index % timeRanges.length]
        }`;
      })
      .join("\\n");
  }

  async fillBasicInputField(input, userDetails) {
    try {
      if (input.value && input.value.trim()) {
        return; // Already filled
      }

      const name = input.name?.toLowerCase() || "";
      const id = input.id?.toLowerCase() || "";
      const placeholder = input.placeholder?.toLowerCase() || "";
      const label = this.getFieldLabel(input)?.toLowerCase() || "";

      const fieldContext = `${name} ${id} ${placeholder} ${label}`;

      // Create a question for the AI based on the field context
      let question = `What should I enter for this field: ${fieldContext}`;
      if (label) {
        question = label;
      } else if (placeholder) {
        question = `What should I enter for: ${placeholder}`;
      }

      // Check for interview time questions and provide specific context to AI
      const normalizedQuestion = question.toLowerCase().trim();
      if (
        normalizedQuestion.includes("interview") &&
        (normalizedQuestion.includes("time") ||
          normalizedQuestion.includes("date") ||
          normalizedQuestion.includes("schedule") ||
          normalizedQuestion.includes("availability") ||
          normalizedQuestion.includes("when") ||
          normalizedQuestion.includes("ranges"))
      ) {
        const availabilityExamples = this._getFutureAvailability();
        const interviewContext = {
          fieldType: "text_input",
          platform: this.platform,
          userData: userDetails,
          required: input.hasAttribute("required"),
          specialInstructions: `Interview availability question. IMPORTANT: You must respond with exactly 2-3 time ranges in this format: '${availabilityExamples}'. Use realistic future dates and reasonable business hours. Do not add any other text or explanation.`,
        };

        const interviewAnswer = await this.aiService.getNormalAnswer(
          question,
          [],
          interviewContext
        );
        await this.typeTextHumanLike(input, interviewAnswer);
        await this.delay(100);
        return;
      }

      const context = {
        fieldType: "text_input",
        platform: this.platform,
        userData: userDetails,
        required: input.hasAttribute("required"),
        specialInstructions:
          "Keep your answer short, relevant, and direct. Provide a concise response without unnecessary details or explanations. IMPORTANT: Keep response under 1300 characters maximum.",
      };

      let answer;
      try {
        answer = await this.aiService.getNormalAnswer(question, [], context);
      } catch (error) {
        return;
      }

      if (answer && input.value !== answer) {
        await this.typeTextHumanLike(input, answer);

        await this.delay(100);
      }
    } catch (error) {
      console.error("❌ Error filling basic input field:", error);
    }
  }

  async fillBasicSelectField(select, userDetails) {
    try {
      if (
        select.value &&
        select.value.trim() &&
        select.value !== "" &&
        select.selectedIndex > 0
      ) {
        return;
      }

      const name = select.name?.toLowerCase() || "";
      const id = select.id?.toLowerCase() || "";
      const label = this.getFieldLabel(select)?.toLowerCase() || "";
      const placeholder =
        select.getAttribute("placeholder")?.toLowerCase() || "";

      const fieldContext = `${name} ${id} ${label} ${placeholder}`;
      const options = Array.from(select.options)
        .slice(1)
        .map((option) => option.textContent.trim())
        .filter((text) => text);

      if (options.length === 0) {
        return;
      }

      const context = {
        fieldType: "select",
        platform: this.platform,
        userData: userDetails,
        required: select.hasAttribute("required"),
      };

      // Create question from field context
      let question = this.getFieldLabel(select) || "Please select an option";
      if (
        fieldContext.includes("status") ||
        fieldContext.includes("citizen") ||
        fieldContext.includes("visa") ||
        fieldContext.includes("authorization")
      ) {
        question = "What is your work authorization status?";
      } else if (fieldContext.includes("country")) {
        question = "What country should I select?";
      } else if (
        fieldContext.includes("state") ||
        fieldContext.includes("province")
      ) {
        question = "What state or province should I select?";
      }

      let answer;
      try {
        answer = await this.aiService.getOptionAnswer(
          question,
          options,
          context
        );
      } catch (error) {
        return;
      }

      if (answer) {
        const success = await this.selectOptionByText(select, answer);
      }
    } catch (error) {
      console.error("❌ Error filling basic select field:", error);
    }
  }

  async selectOptionByText(select, text) {
    try {
      if (!text) return false;

      const options = select.querySelectorAll("option");
      for (const option of options) {
        if (option.textContent?.toLowerCase().includes(text.toLowerCase())) {
          select.value = option.value;
          select.focus();
          select.dispatchEvent(new Event("change", { bubbles: true }));
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.blur();
          await this.delay(500);
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  getFieldLabel(input) {
    try {
      // Try to find associated label via 'for' attribute
      if (input.id) {
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (label) {
          return label.textContent.trim();
        }
      }

      // Check aria-labelledby
      const ariaLabelledBy = input.getAttribute("aria-labelledby");
      if (ariaLabelledBy) {
        const labelElement = document.getElementById(ariaLabelledBy);
        if (labelElement) {
          return labelElement.textContent.trim();
        }
      }

      // Check aria-label
      const ariaLabel = input.getAttribute("aria-label");
      if (ariaLabel) {
        return ariaLabel.trim();
      }

      // Check if input is inside a label
      const parentLabel = input.closest("label");
      if (parentLabel) {
        return parentLabel.textContent.trim();
      }

      // Look for nearby labels in common container patterns
      const container = input.closest(
        ".form-group, .field-group, .input-group, [class*='field'], [data-testid*='field']"
      );
      if (container) {
        const label = container.querySelector(
          "label, .form-label, .field-label, [class*='label']"
        );
        if (label) {
          return label.textContent.trim();
        }
      }

      // Check for data-testid label pattern (SimplyHired/Indeed specific)
      const testId = input.getAttribute("data-testid") || input.id;
      if (testId) {
        const labelTestId = testId.replace("-input", "-label");
        const testIdLabel = document.querySelector(
          `[data-testid="${labelTestId}"]`
        );
        if (testIdLabel) {
          return testIdLabel.textContent.trim();
        }
      }

      return "";
    } catch (error) {
      return "";
    }
  }

  findBestMatchingOption(answer, options) {
    const answerLower = answer.toLowerCase();

    // First try exact match
    for (const option of options) {
      if (option.text.toLowerCase() === answerLower) {
        return option;
      }
    }

    // Then try partial match
    for (const option of options) {
      if (
        option.text.toLowerCase().includes(answerLower) ||
        answerLower.includes(option.text.toLowerCase())
      ) {
        return option;
      }
    }
    return null;
  }

  findMatchingCheckboxOptions(answer, options) {
    const selectedOptions = [];
    const answerLower = answer.toLowerCase();

    for (const option of options) {
      const optionLower = option.text.toLowerCase();
      if (
        answerLower.includes(optionLower) ||
        optionLower.includes(answerLower)
      ) {
        selectedOptions.push(option);
      }
    }

    return selectedOptions;
  }

  async handleFormSubmission() {
    try {
      const submitButton = document.querySelector(this.selectors.submitButton);

      if (!submitButton) {
        return false;
      }

      if (!this.isElementVisible(submitButton) || submitButton.disabled) {
        return false;
      }

      console.log(
        `🎯 SimplyHired handleFormSubmission: copilotMode=${this.copilotMode}`
      );

      // CO-PILOT MODE: Pause for user approval
      if (this.copilotMode) {
        if (true) {
          // Global overlay always available
          notifyStatus({
            type: "COPILOT_SUBMIT_READY",
            data: {
              buttonText: submitButton.textContent?.trim(),
              jobTitle: this.currentJobTitle,
              title: this.currentJobTitle,
            },
          });
        }

        const userAction = await this.waitForUserAction();
        if (userAction === "SUBMIT") {
          // User approved - submit
          submitButton.click();
          await this.delay(2000);
        } else if (userAction === "SKIP") {
          return "skip_requested";
        } else {
          return false;
        }
      } else {
        // AUTO-PILOT MODE: Submit automatically
        submitButton.click();
        await this.delay(2000);
      }

      // Check for CAPTCHA
      if (this.hasCaptcha()) {
        return "captcha";
      }

      return "submitted";
    } catch (error) {
      return false;
    }
  }

  async waitForCaptchaSolved(maxWaitMs = 120000) {
    const startTime = Date.now();
    const pollInterval = 1000; // Check every second

    while (Date.now() - startTime < maxWaitMs) {
      if (!this.hasCaptcha()) {
        console.log("✅ Captcha solved, continuing...");
        return true;
      }
      await this.delay(pollInterval);
    }

    console.log("⏱️ Captcha wait timeout");
    return false;
  }

  hasCaptcha() {
    // First check if there's a reCAPTCHA that's already solved
    const recaptchaAnchor = document.querySelector("#recaptcha-anchor");
    if (recaptchaAnchor) {
      // Check if it's already checked/solved
      const isChecked = recaptchaAnchor.getAttribute("aria-checked") === "true";
      const hasCheckedClass = recaptchaAnchor.classList.contains(
        "recaptcha-checkbox-checked"
      );
      if (isChecked || hasCheckedClass) {
        console.log("✅ reCAPTCHA already solved");
        return false;
      }
      // reCAPTCHA present but not solved
      console.log("🔐 reCAPTCHA detected and needs solving");
      return true;
    }

    // Check for accessible status text
    const accessibleStatus = document.querySelector(
      "#recaptcha-accessible-status"
    );
    if (accessibleStatus) {
      const statusText = accessibleStatus.textContent?.toLowerCase() || "";
      if (statusText.includes("verified")) {
        console.log("✅ reCAPTCHA verified (status text)");
        return false;
      }
      if (
        statusText.includes("requires verification") ||
        statusText.includes("not a robot")
      ) {
        console.log("🔐 reCAPTCHA needs verification (status text)");
        return true;
      }
    }

    // Check for other captcha types
    const captchaSelectors = [
      ".g-recaptcha",
      "[data-sitekey]",
      ".captcha",
      ".hcaptcha",
      'iframe[src*="recaptcha"]',
      'iframe[title*="reCAPTCHA"]',
    ];

    for (const selector of captchaSelectors) {
      const captcha = document.querySelector(selector);
      if (captcha && this.isElementVisible(captcha)) {
        console.log(`🔐 Captcha detected: ${selector}`);
        return true;
      }
    }

    return false;
  }

  monitorApplicationCompletion(jobInfo) {
    const checkCompletion = () => {
      if (this.isApplicationSuccess()) {
        this.handleApplicationSuccessPage();
        return;
      }

      if (this.isApplicationError()) {
        this.sendApplicationError(new Error("Application error detected"));
        return;
      }

      // Check if new form step appeared
      if (this.hasNewFormStep()) {
        this.handleFormPage();
        return;
      }

      // Continue monitoring
      setTimeout(checkCompletion, 2000);
    };

    setTimeout(checkCompletion, 3000);
  }

  hasNewFormStep() {
    // Priority 1: Check for review/preview page (final step)
    if (this.isReviewPage()) {
      console.log("📋 Detected review/preview page");
      return true;
    }

    // Priority 2: Check for resume selection form
    if (document.querySelector('[data-testid="resume-selection-form"]')) {
      console.log("📤 Detected resume selection form");
      return true;
    }

    // Priority 3: Intelligent questions form detection
    const questionsForm = document.querySelector(
      '.ia-Questions, [class*="apply-questions"]'
    );
    if (questionsForm) {
      // Create fingerprint to check if this is a new form
      const formHash =
        this.formFingerprinter.createFormFingerprint(questionsForm);

      if (formHash) {
        const isAlreadyProcessed =
          this.formFingerprinter.isFormAlreadyProcessed(formHash);
        const shouldSkip = this.formFingerprinter.shouldSkipForm(formHash);

        if (!isAlreadyProcessed && !shouldSkip) {
          console.log(`❓ Detected NEW questions form (hash: ${formHash})`);
          return true;
        } else {
          console.log(
            `⏭️ Skipping already processed/failed form (hash: ${formHash})`
          );
          return false;
        }
      } else {
        console.log("❓ Detected questions form (fallback detection)");
        return true;
      }
    }

    // Priority 4: Enhanced form detection for edge cases
    const hasFormElements = document.querySelector(
      'input[type="radio"], input[type="checkbox"], select, textarea'
    );
    if (hasFormElements) {
      // Use enhanced detector to check for missed forms
      setTimeout(async () => {
        const formMatch = await this.formDetector.detectForm(5000);
        if (formMatch && formMatch.form) {
          console.log("🔍 Enhanced detector found missed form");
          this.handleFormPage(); // Restart form processing
        }
      }, 1000);
    }

    // Priority 5: Check for cover letter form
    if (this.isCoverLetterForm()) {
      console.log("📝 Detected cover letter form");
      return true;
    }

    // Priority 6: Check for any form with continue button (catches dynamic forms)
    if (document.querySelector('[data-testid="continue-button"]')) {
      console.log("📋 Detected form with Continue button");
      return true;
    }

    // Priority 5: Check for any submit buttons (other than review page)
    const submitButtons = document.querySelectorAll(
      'button[type="submit"], input[type="submit"]'
    );
    if (submitButtons.length > 0) {
      console.log("🚀 Detected form with submit button");
      return true;
    }

    // Priority 6: Check for generic form containers with form elements
    const formContainers = document.querySelectorAll(
      'form, [class*="form"], [class*="Form"]'
    );
    for (const container of formContainers) {
      const hasFormElements = container.querySelector(
        "input, textarea, select, button"
      );
      if (hasFormElements) {
        console.log("📋 Detected generic form container with elements");
        return true;
      }
    }

    console.log("❌ No form step detected");
    return false;
  }

  async handleAlreadyAppliedPage() {
    console.log("⚠️ Job already applied - sending SKIPPED to background");

    const jobData = await chrome.storage.local.get("currentJobData");
    const currentJob = jobData.currentJobData || {};

    try {
      // Send APPLICATION_SKIPPED message to background
      this.safeSendPortMessage({
        type: "APPLICATION_SKIPPED",
        data: {
          jobData: currentJob, // Include jobData inside data field
          url: window.location.href,
          reason: "ALREADY_APPLIED",
          skippedAt: Date.now(),
          platform: this.platform,
        },
      });

      console.log("✅ APPLICATION_SKIPPED message sent to background");
    } catch (error) {
      console.error("❌ Failed to send APPLICATION_SKIPPED:", error);
    }

    // Status overlay will be updated via handleApplicationSkipped

    await this.delay(1000);

    console.log("🗙 Closing already applied tab");
    window.close();
  }

  async handleApplicationSuccessPage() {
    console.log(
      "🎉 handleApplicationSuccessPage() called - Application submitted successfully"
    );

    const jobData = await chrome.storage.local.get("currentJobData");
    const currentJob = jobData.currentJobData || {};

    // Ensure required fields are present for background script
    const jobDetails = {
      jobId: currentJob.jobId || currentJob.id,
      jobKey: currentJob.jobKey || currentJob.jobId || "unknown", // Ensure jobKey is always present
      title: currentJob.title || "Job Application",
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
        // Global overlay always available
        notifyStatus({
          type: "APPLICATION_SUBMITTED",
          data: { title: jobDetails.title },
        });
      }

      // Send application completion message to background script
      this.safeSendPortMessage({
        type: "APPLICATION_COMPLETED",
        data: {
          url: window.location.href,
          jobData: {
            ...jobDetails,
            platform: "simplyhired",
            submittedAt: Date.now(),
          },
        },
      });

      // Wait a moment for background processing, then close this tab
      await new Promise((resolve) => setTimeout(resolve, 2000));
      window.close();
    } catch (error) {
      console.error("❌ Error processing application:", error);

      // Still try to close the tab even if there was an error
      setTimeout(() => {
        window.close();
      }, 2000);
    }
  }

  sendApplicationError(error) {
    try {
      this.safeSendPortMessage({
        type: "APPLICATION_ERROR",
        data: {
          url: window.location.href,
          error: error.message,
          timestamp: Date.now(),
        },
      });
    } catch (e) {
      console.error("Failed to send APPLICATION_ERROR:", e);
    }

    if (true) {
      // Global overlay always available
      notifyStatus({ type: "APPLICATION_ERROR" });
    }
  }

  isApplicationSuccess() {
    const url = window.location.href;
    const pageText = document.body.textContent?.toLowerCase() || "";

    // Check for Indeed SmartApply post-apply URL
    if (
      url.includes(
        "https://smartapply.indeed.com/beta/indeedapply/form/post-apply"
      )
    ) {
      console.log(
        "✅ Post-apply URL detected, sending APPLICATION_SUCCESS event"
      );
      return true;
    }

    return (
      pageText.includes("application submitted") ||
      pageText.includes("successfully applied") ||
      pageText.includes("application complete") ||
      pageText.includes("thank you for applying") ||
      pageText.includes("application received") ||
      url.includes("success") ||
      url.includes("confirmation") ||
      url.includes("thank-you")
    );
  }

  isApplicationError() {
    const pageText = document.body.textContent?.toLowerCase() || "";

    return (
      pageText.includes("error occurred") ||
      pageText.includes("application failed") ||
      pageText.includes("try again") ||
      pageText.includes("something went wrong") ||
      document.querySelector(".error, .alert-error, .error-message")
    );
  }

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

        // Update file handler with preferences after session context is set
        if (this.fileHandler && message.sessionContext.preferences) {
          this.fileHandler.preferences = message.sessionContext.preferences;
          console.log(
            "✅ Updated fileHandler.preferences:",
            this.fileHandler.preferences
          );
        }

        // Get user profile from session context
        if (message.sessionContext.userProfile) {
          this.userProfile = message.sessionContext.userProfile;
        }
      }

      if (message.sessionId) {
        this.sessionId = message.sessionId;
      }

      if (message.config) {
        this.config = { ...this.config, ...message.config };
      }

      // Initialize/update hosts and services now that session context is guaranteed to be available
      this.aiApiHost =
        this.getInjectedAiApiHost() ||
        this.config.aiApiHost ||
        this.sessionContext?.aiApiHost ||
        this.sessionContext?.sessionConfig?.aiApiHost;
      this.HOST = this.aiApiHost;
      this.backendApiHost =
        this.getInjectedBackendApiHost() ||
        this.config.backendApiHost ||
        this.sessionContext?.backendApiHost ||
        this.sessionContext?.sessionConfig?.backendApiHost;

      // ApplicationTrackerService handled by message-router (START_APPLICATION/APPLICATION_COMPLETED)

      this.aiService = new AIService({
        aiApiHost: this.getAiApiHost(),
        platform: this.platform,
      });

      if (!this.fileHandler) {
        this.fileHandler = new SimplyHiredFileHandler({
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

      await this.start();
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
      case "AUTOMATION_STOPPED":
        this.handleAutomationStopped(data);
        break;
    }
  }

  handleSearchNext(data) {
    console.log("📬 SEARCH_NEXT received from background:", data?.status);

    // Clear fallback timeout since we received the message from background
    if (this.applicationFallbackTimeout) {
      clearTimeout(this.applicationFallbackTimeout);
      this.applicationFallbackTimeout = null;
    }

    // Mark job card based on status
    if (data.jobData?.jobKey && data.status) {
      const targetJobCard = this.findJobCardByJobKey(data.jobData.jobKey);
      if (targetJobCard) {
        const visualStatus = data.status === "SUCCESS" ? "applied" : "skipped";
        this.markJobCard(targetJobCard, visualStatus);
      }
    }

    // Reset processing flag - the background has confirmed the job is done
    this.state.isProcessingJob = false;

    // Continue to next job if automation is still running
    if (this.state.isRunning && !this.state.automationStopped) {
      console.log("➡️ Continuing to next job after SEARCH_NEXT");
      setTimeout(() => this.processNextJob(), 2000);
    }
  }

  handleApplicationSuccess(data) {
    // Note: The background sends SEARCH_NEXT, not APPLICATION_SUCCESS
    // This handler is for UI notifications only - processNextJob is handled by handleSearchNext
    console.log("📩 APPLICATION_SUCCESS received (UI notification)");

    notifyStatus({
      type: "APPLICATION_SUBMITTED",
      data: { title: data.title || "Job" },
    });

    // Mark the job card as applied if we have job data
    if (data?.jobData?.jobKey) {
      const targetJobCard = this.findJobCardByJobKey(data.jobData.jobKey);
      if (targetJobCard) {
        this.markJobCard(targetJobCard, "applied");
      }
    }
  }

  handleApplicationError(data) {
    // Note: The background sends SEARCH_NEXT, not APPLICATION_ERROR
    // This handler is for UI notifications only - processNextJob is handled by handleSearchNext
    console.log("📩 APPLICATION_ERROR received (UI notification)");

    notifyStatus({ type: "APPLICATION_ERROR" });

    // Mark the job card as skipped/error if we have job data
    if (data?.jobData?.jobKey) {
      const targetJobCard = this.findJobCardByJobKey(data.jobData.jobKey);
      if (targetJobCard) {
        this.markJobCard(targetJobCard, "skipped");
      }
    }
  }

  handleApplicationSkipped(data) {
    // Note: The background sends SEARCH_NEXT, not APPLICATION_SKIPPED
    // This handler is for UI notifications only - processNextJob is handled by handleSearchNext
    console.log("📩 APPLICATION_SKIPPED received (UI notification)");

    notifyStatus({ type: "APPLICATION_SKIPPED" });

    // Mark the job card as skipped if we have job data
    if (data?.jobData?.jobKey) {
      const targetJobCard = this.findJobCardByJobKey(data.jobData.jobKey);
      if (targetJobCard) {
        this.markJobCard(targetJobCard, "skipped");
      }
    }
  }

  handleAutomationStopped(data) {
    this.state.isRunning = false;
    this.state.automationStopped = true;
    this.state.cancelFileUploads = true;

    if (true) {
      // Global overlay always available
      notifyStatus({
        type: "AUTOMATION_STOPPED",
        data: { reason: data?.reason || "stopped" },
      });
    }
  }

  /**
   * Handle co-pilot button actions from status overlay
   */
  handleCoPilotAction(data) {
    const { action } = data;
    console.log("🎮 Co-pilot action received:", action);

    switch (action) {
      case COPILOT_ACTIONS.SWITCH_TO_COPILOT:
        this.copilotState.switchToCoPilot();
        this.copilotMode = true;

        if (true) {
          // Global overlay always available
          notifyStatus({
            type: "MODE_SWITCHED",
            data: { mode: "co-pilot" },
          });
          updateStatusButtons("co-pilot-search");
        }
        break;

      case COPILOT_ACTIONS.SWITCH_TO_AUTOPILOT:
        this.copilotState.switchToAutoPilot();
        this.copilotMode = false;

        if (true) {
          // Global overlay always available
          notifyStatus({
            type: "MODE_SWITCHED",
            data: { mode: "auto-pilot" },
          });
          updateStatusButtons("auto-pilot");
        }
        break;

      case COPILOT_ACTIONS.SUBMIT:
      case "NEXT":
        // Resolve the promise to resume form filling
        this.resolveUserAction(action === "NEXT" ? "NEXT" : "SUBMIT");
        break;

      case COPILOT_ACTIONS.SKIP:
        // Resolve promise
        this.resolveUserAction("SKIP");

        // Show skip message
        if (true) {
          // Global overlay always available
          notifyStatus({
            type: "JOB_SKIPPED",
            data: { title: this.currentJobTitle || "this job" },
          });
        }

        // Check if we're on a form page or search page
        const currentUrl = window.location.href;
        const isOnFormPage = this.isFormPage(currentUrl);

        // Get current job data to send to background (using promise without await)
        chrome.storage.local.get("currentJobData").then((skipJobData) => {
          const currentSkipJob = skipJobData.currentJobData || {};

          // Send skip to background
          this.safeSendPortMessage({
            type: "APPLICATION_SKIPPED",
            data: {
              jobData: currentSkipJob,
              url: window.location.href,
              reason: "User clicked skip button",
              skipReason: "user_skip",
              jobTitle: this.currentJobTitle || "Unknown job",
              platform: this.platform,
            },
          });

          // Only close window if on form page, NOT on search page
          if (isOnFormPage) {
            // On form page - close this tab
            setTimeout(() => {
              console.log(
                "⏭️ Closing form tab after user skip, moving to next job"
              );
              window.close();
            }, 1000);
          } else {
            console.log(
              "⏭️ Skipping current job on search page, waiting for SEARCH_NEXT message"
            );
          }
        });
        break;

      case COPILOT_ACTIONS.TAKE_CONTROL:
        this.userHasControl = true;
        this.resolveUserAction("TAKE_CONTROL");

        if (true) {
          // Global overlay always available
          notifyStatus({
            type: "COPILOT_USER_HAS_CONTROL",
            data: { title: this.currentJobTitle || "this job" },
          });
          updateStatusButtons("user-control");
        }
        break;

      case COPILOT_ACTIONS.LET_AI_CONTINUE:
        this.userHasControl = false;
        this.resolveUserAction("LET_AI_CONTINUE");

        if (true) {
          // Global overlay always available
          notifyStatus({
            type: "COPILOT_AI_CONTINUING",
            data: { title: this.currentJobTitle || "this job" },
          });
          // Show "⚡ Let AI Take Over" button so user can take control again
          updateStatusButtons("co-pilot-search");
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

  async goToNextPage() {
    try {
      // Check if we're on the last page first
      if (this.isOnLastPage()) {
        return false;
      }

      const nextButton = document.querySelector(this.selectors.nextPageButton);
      if (
        nextButton &&
        this.isElementVisible(nextButton) &&
        !nextButton.disabled
      ) {
        nextButton.click();
        await this.delay(3000);

        // Reset processed jobs for new page
        this.state.processedJobs.clear();
        this.state.currentJobIndex = 0;

        return this.getJobCards().length > 0;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  isOnLastPage() {
    try {
      // Check if next button exists and is disabled
      const nextButton = document.querySelector(this.selectors.nextPageButton);
      if (
        !nextButton ||
        nextButton.disabled ||
        !this.isElementVisible(nextButton)
      ) {
        return true;
      }

      // Check pagination container for last page indicators
      const paginationContainer = document.querySelector(
        this.selectors.paginationContainer
      );
      if (paginationContainer) {
        // Look for next page button within pagination
        const nextPageLink = paginationContainer.querySelector(
          '[data-testid="pageNumberBlockNext"]'
        );
        if (
          !nextPageLink ||
          nextPageLink.getAttribute("aria-disabled") === "true"
        ) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("❌ Error checking if on last page:", error);
      return false;
    }
  }

  async handleNoJobsFound() {
    // Send search completed message to background
    try {
      this.safeSendPortMessage({
        type: "SEARCH_COMPLETED",
        data: { reason: "no_jobs_found" },
      });
    } catch (error) {
      console.warn("Failed to send SEARCH_COMPLETED:", error);
    }

    notifyStatus({ type: "SEARCH_COMPLETED" });
    this.state.isRunning = false;
  }

  async handleSearchCompleted() {
    console.log("🏁 No more Easy Apply jobs found");

    // Send search completed message to background
    try {
      this.safeSendPortMessage({
        type: "SEARCH_COMPLETED",
        data: {
          reason: "no_more_easy_apply_jobs",
          submittedLinks: this.state.submittedLinks,
        },
      });
    } catch (error) {
      console.warn("Failed to send SEARCH_COMPLETED:", error);
    }

    // Show status overlay message
    notifyStatus({
      type: "SEARCH_COMPLETED",
      data: {
        message: "No more Easy Apply jobs found on this page",
      },
    });

    this.state.isRunning = false;
  }

  updateSubmittedLinks(url, status, data = {}) {
    if (!this.state.submittedLinks) {
      this.state.submittedLinks = [];
    }

    const existing = this.state.submittedLinks.find((link) => link.url === url);
    if (existing) {
      existing.status = status;
      existing.data = data;
      existing.updatedAt = Date.now();
    } else {
      this.state.submittedLinks.push({
        url,
        status,
        data,
        timestamp: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  getJobCardId(jobCard) {
    // Try to get ID from data attributes
    const jobId =
      jobCard.getAttribute("data-jobid") ||
      jobCard.getAttribute("data-id") ||
      jobCard.getAttribute("data-job-id");
    if (jobId) return jobId;

    // Try to extract from job link
    const jobLink = jobCard.querySelector("a");
    if (jobLink?.href) {
      const match = jobLink.href.match(/\/job\/([^\/\?]+)/);
      if (match) return match[1];
    }

    // Generate ID from title and company
    const title =
      jobCard.querySelector(this.selectors.jobTitle)?.textContent?.trim() || "";
    const company =
      jobCard.querySelector(this.selectors.companyName)?.textContent?.trim() ||
      "";
    return `${title}-${company}`.replace(/\s+/g, "").toLowerCase();
  }

  markJobCard(jobCard, status) {
    try {
      // Remove existing highlight
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

  // Method to find a specific job card by its data-jobkey attribute
  findJobCardByJobKey(jobKey) {
    try {
      if (!jobKey) {
        return null;
      }

      // First try to find by exact data-jobkey match
      let jobCard = document.querySelector(`[data-jobkey="${jobKey}"]`);

      if (jobCard && this.isElementVisible(jobCard)) {
        return jobCard;
      }

      // If not found and jobKey looks like a generated ID, try to find by matching URL or title
      const jobCards = this.getJobCards();
      for (const card of jobCards) {
        const cardJobKey =
          card.getAttribute("data-jobkey") || card.getAttribute("data-job-key");

        // If card has no data-jobkey, extract its info and check if it matches
        if (!cardJobKey) {
          const cardTitle =
            card.querySelector(this.selectors.jobTitle)?.textContent?.trim() ||
            "";
          const cardCompany =
            card
              .querySelector(this.selectors.companyName)
              ?.textContent?.trim() || "";
          const generatedKey = this.generateJobId(cardTitle, cardCompany);

          // Check if this card's generated key matches the jobKey we're looking for
          if (
            jobKey.includes(
              cardTitle.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
            ) &&
            jobKey.includes(
              cardCompany.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
            )
          ) {
            return card;
          }
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  async checkAuthentication() {
    try {
      // Check for login/sign-in requirements

      // More efficient sign-in detection
      let signInButton = document.querySelector('a[href*="login"]');

      if (!signInButton) {
        // Try specific selectors first before doing expensive operations
        const commonSignInSelectors = [
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

        // Only do expensive text search as last resort
        if (!signInButton) {
          const buttons = document.querySelectorAll("a[href], button");
          for (const btn of buttons) {
            const text = btn.textContent?.toLowerCase() || "";
            if (
              (text.includes("sign in") || text.includes("log in")) &&
              this.isElementVisible(btn)
            ) {
              signInButton = btn;
              break;
            }
          }
        }
      }

      if (signInButton && this.isElementVisible(signInButton)) {
        return {
          canProceed: false,
          reason: "login",
          message: "🔐 Please log in to your SimplyHired account first",
        };
      }

      // Check for CAPTCHA - comprehensive detection
      const captchaSelectors = [
        ".g-recaptcha",
        ".h-captcha",
        ".hcaptcha",
        "[data-sitekey]",
        ".cf-turnstile",
        ".captcha",
        '[id*="captcha"]',
        '[class*="captcha"]',
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]',
        'iframe[title*="captcha"]',
        'iframe[title*="verification"]',
        '[id*="cf-chl-widget"]',
      ];

      for (const selector of captchaSelectors) {
        const element = document.querySelector(selector);
        if (element && this.isElementVisible(element)) {
          return {
            canProceed: false,
            reason: "captcha",
            message:
              "🛡️ CAPTCHA verification required. Please complete the verification manually.",
          };
        }
      }

      // Check for CAPTCHA-related text content
      const captchaTexts = [
        "complete the captcha",
        "verify you are human",
        "prove you are not a robot",
        "i'm not a robot",
        "help us protect",
        "security check",
        "cf-103",
      ];

      const pageText = document.body.textContent.toLowerCase();
      for (const text of captchaTexts) {
        if (pageText.includes(text)) {
          return {
            canProceed: false,
            reason: "recaptcha",
            message:
              "🛡️ Security verification required. Please complete the verification manually.",
          };
        }
      }

      // Check for Cloudflare challenge indicators
      if (
        pageText.includes("cf-103") ||
        document.querySelector('[id*="cf-chl"]') ||
        (pageText.includes("waiting for") && pageText.includes("to respond"))
      ) {
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

  // Utility methods
  async getUserDetails() {
    return this.userProfile || this.getInjectedUserProfile();
  }

  async getStoredJobData() {
    try {
      const result = await chrome.storage.local.get("currentJobData");
      return result.currentJobData;
    } catch (error) {
      console.error("Error getting stored job data:", error);
      return null;
    }
  }

  getQuestionText(element) {
    // Try to find question from label
    const label = this.findLabelForElement(element);
    if (label) {
      return this.cleanText(label.textContent);
    }

    // Try container approach
    const container = element.closest(
      ".form-group, .field-group, .input-group"
    );
    if (container) {
      const questionElement = container.querySelector(
        "label, .form-label, .field-label"
      );
      if (questionElement) {
        return this.cleanText(questionElement.textContent);
      }
    }

    return element.placeholder || element.name || "";
  }

  getQuestionTextFromContainer(container) {
    const questionElement = container.querySelector(
      "label, .form-label, .field-label, h3, h4"
    );
    if (questionElement) {
      return this.cleanText(questionElement.textContent);
    }
    return "";
  }

  extractQuestionTextFromItem(questionItem) {
    try {
      // Try Indeed's specific structure first - look for label with data-testid
      const questionLabel = questionItem.querySelector(
        '[data-testid="single-select-question-label"], [data-testid*="label"]'
      );
      if (questionLabel) {
        const fullText = questionLabel.textContent
          .trim()
          .replace("(Required)", "")
          .trim();

        // Handle EEOC verbose labels - extract actual question from end
        if (fullText.length > 200) {
          // Look for the last question-like text (ends with ?)
          const questionMatch = fullText.match(/([A-Z][^.?!]*\?)\s*$/);
          if (questionMatch) {
            console.log(`📋 EEOC question extracted: "${questionMatch[1]}"`);
            return questionMatch[1];
          }
          // Or look for common EEOC question patterns
          const eeocPatterns = [
            /Disability Status/i,
            /Veteran Status/i,
            /Race.*Ethnicity/i,
            /Gender/i,
            /Hispanic.*Latino/i,
          ];
          for (const pattern of eeocPatterns) {
            if (pattern.test(fullText)) {
              const match = fullText.match(pattern);
              if (match) {
                console.log(`📋 EEOC question pattern matched: "${match[0]}"`);
                return match[0] + "?";
              }
            }
          }
        }
        return fullText;
      }

      // Try standard label structure
      const label = questionItem.querySelector("label");
      if (label) {
        const fullText = this.cleanText(label.textContent);
        // Handle EEOC verbose labels
        if (fullText.length > 200) {
          const questionMatch = fullText.match(/([A-Z][^.?!]*\?)\s*$/);
          if (questionMatch) {
            return questionMatch[1];
          }
        }
        return fullText;
      }

      // Try rich text spans within labels
      const richTextSpan = questionItem.querySelector(
        '[data-testid="rich-text"]'
      );
      if (richTextSpan) {
        return richTextSpan.textContent.trim();
      }

      // Try any text content in label-like elements
      const labelLike = questionItem.querySelector(
        '.form-label, .field-label, .question-text, [class*="label"]'
      );
      if (labelLike) {
        return this.cleanText(labelLike.textContent);
      }

      // Fallback to any meaningful text in the question item
      const textElement = questionItem.querySelector("span, div, p");
      if (textElement && textElement.textContent.trim().length > 3) {
        return this.cleanText(textElement.textContent);
      }

      return "";
    } catch (error) {
      console.error("Error extracting question text:", error);
      return "";
    }
  }

  isQuestionRequired(questionItem) {
    try {
      // Check for "(Required)" text in the question item
      const textContent = questionItem.textContent || "";
      if (
        textContent.includes("(Required)") ||
        textContent.includes("required")
      ) {
        return true;
      }

      // Check for required attribute on input elements
      const inputs = questionItem.querySelectorAll("input, select, textarea");
      for (const input of inputs) {
        if (
          input.hasAttribute("required") ||
          input.getAttribute("aria-required") === "true"
        ) {
          return true;
        }
      }

      // Check for required indicator elements
      const requiredIndicator = questionItem.querySelector(
        '[data-testid*="required"], .required, [class*="required"]'
      );
      if (requiredIndicator) {
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  async waitForFormElementsToLoad(maxWaitTime = 15000) {
    const startTime = Date.now();
    let retryCount = 0;
    const maxRetries = 3;

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Check for basic form structure
        const hasBasicForm =
          document.querySelector("form") ||
          document.querySelector('[class*="form"]') ||
          document.querySelector(".ia-Questions-item") ||
          document.querySelector('[class*="Questions-item"]');

        if (hasBasicForm) {
          // Wait a bit more for all dynamic content to load
          await this.delay(2000);

          // Try to detect all field types
          const formContainer = document.body;
          let totalFields = 0;
          let previousFieldCount = -1;
          let stableCount = 0;

          // Wait for field count to stabilize (no new fields appearing)
          while (stableCount < 3 && Date.now() - startTime < maxWaitTime) {
            const radioFields = formContainer.querySelectorAll(
              'input[type="radio"]'
            ).length;
            const checkboxFields = formContainer.querySelectorAll(
              'input[type="checkbox"]'
            ).length;
            const selectFields =
              formContainer.querySelectorAll("select").length;
            const textareaFields =
              formContainer.querySelectorAll("textarea").length;
            const dateFields = formContainer.querySelectorAll(
              'input[type="date"], input[placeholder*="MM/DD/YYYY"], input[placeholder*="mm/dd/yyyy"], input[id*="date"], input[name*="date"]'
            ).length;
            const fileFields =
              formContainer.querySelectorAll('input[type="file"]').length;

            totalFields =
              radioFields +
              checkboxFields +
              selectFields +
              textareaFields +
              dateFields +
              fileFields;

            if (totalFields === previousFieldCount) {
              stableCount++;
            } else {
              stableCount = 0;
            }

            previousFieldCount = totalFields;
            await this.delay(1000);
          }

          if (totalFields > 0) {
            return true;
          }
        }

        retryCount++;
        await this.delay(1500);
      } catch (error) {
        retryCount++;
        await this.delay(1000);
      }

      if (
        retryCount >= maxRetries &&
        Date.now() - startTime < maxWaitTime - 5000
      ) {
        await this.delay(5000);
        retryCount = 0;
      }
    }
    return false;
  }

  findLabelForElement(element) {
    if (element.id) {
      return document.querySelector(`label[for="${element.id}"]`);
    }
    return element.closest("label");
  }

  getOptionText(element) {
    const label = this.findLabelForElement(element);
    if (label) {
      return this.cleanText(label.textContent);
    }

    if (element.nextSibling && element.nextSibling.textContent) {
      return this.cleanText(element.nextSibling.textContent);
    }

    const parent = element.parentElement;
    if (parent) {
      return this.cleanText(parent.textContent);
    }

    return element.value || "";
  }

  isRequired(element) {
    return (
      element.hasAttribute("required") ||
      element.getAttribute("aria-required") === "true" ||
      element.closest("[required]") !== null
    );
  }

  isRequiredFromContainer(container) {
    return (
      container.querySelector("[required]") !== null ||
      container.textContent.includes("*") ||
      container.textContent.toLowerCase().includes("required")
    );
  }

  cleanText(text) {
    return text?.trim().replace(/\s+/g, " ").replace(/[*:]/g, "") || "";
  }

  async typeTextHumanLike(element, text) {
    try {
      element.focus();
      element.value = "";

      for (let i = 0; i < text.length; i++) {
        element.value += text[i];
        element.dispatchEvent(new Event("input", { bubbles: true }));
        await this.delay(50 + Math.random() * 50); // 50-100ms per character
      }

      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.blur();
    } catch (error) {
      console.error("Error typing text:", error);
      element.value = text;
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  async slowPasteText(element, text) {
    try {
      element.focus();
      element.value = "";

      // Simulate slow paste by setting chunks of text with delays
      const chunkSize = 20; // Paste 20 characters at a time
      const chunks = [];

      for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.substring(i, i + chunkSize));
      }

      let currentText = "";
      for (const chunk of chunks) {
        currentText += chunk;
        element.value = currentText;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        await this.delay(100 + Math.random() * 100); // 100-200ms per chunk
      }

      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("paste", { bubbles: true }));
      element.blur();

      console.log("✅ Slow paste completed");
    } catch (error) {
      element.value = text;
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("input", { bubbles: true }));
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

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Wait for user action - creates a promise that pauses execution
   * Used in co-pilot mode to wait for user approval
   */
  waitForUserAction() {
    if (this.userActionPromise) {
      return this.userActionPromise;
    }

    this.userActionPromise = new Promise((resolve) => {
      this.userActionResolver = resolve;
    });

    return this.userActionPromise;
  }

  /**
   * Resolve user action - resumes execution
   * Called when user clicks a button in co-pilot mode
   */
  resolveUserAction(action) {
    if (this.userActionResolver) {
      this.userActionResolver(action);
      this.userActionResolver = null;
      this.userActionPromise = null;
    }
  }

  async getFileHandler(userDetails) {
    try {
      if (this.fileHandler) {
        return this.fileHandler;
      }

      this.fileHandler = new SimplyHiredFileHandler({
        preferences: this.sessionContext?.preferences,
        // statusService removed - uses global overlay
        apiHost: this.getApiHost(),
      });

      return this.fileHandler;
    } catch (error) {
      return null;
    }
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
    const salaryText = jobInfo.salary || "";
    const kRangeMatch = salaryText.match(
      /\$(\d{1,3}(?:\.\d+)?)\s*K\s*-\s*\$(\d{1,3}(?:\.\d+)?)\s*K/i
    );
    if (kRangeMatch) {
      const minSalary = Math.round(parseFloat(kRangeMatch[1]) * 1000);
      return minSalary;
    }

    const rangeMatch = salaryText.match(
      /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*-\s*\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/
    );
    if (rangeMatch) {
      const minSalary = parseInt(rangeMatch[1].replace(/,/g, ""));
      return minSalary;
    }

    const kMatch = salaryText.match(/\$(\d{1,3}(?:\.\d+)?)\s*K/i);
    if (kMatch) {
      const salary = Math.round(parseFloat(kMatch[1]) * 1000);
      return salary;
    }

    const singleMatch = salaryText.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
    if (singleMatch) {
      const salary = parseInt(singleMatch[1].replace(/,/g, ""));
      return salary;
    }

    return null;
  }

  cleanup() {
    if (true) {
      // Global overlay always available
      // Global overlay cleanup handled automatically
    }
    // Cleanup (base cleanup logic is now handled inline if needed)
  }
}
