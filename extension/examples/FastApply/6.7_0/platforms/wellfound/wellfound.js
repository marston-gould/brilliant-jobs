import WellfoundFormHandler from "./wellfound-form-handler.js";
import ApplicationTrackerService from "../../services/application-tracker-service.js";
import AIService from "../../services/ai-service.js";
import { WellfoundFilters } from "./wellfound-filter-handler.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";
import { domObserver } from "../../shared/utilities/dom-observer.js";

/**
 * Standalone Wellfound Platform Automation
 * No dependencies on BasePlatformAutomation
 */
export default class WellfoundPlatform {
  constructor(config) {
    // Initialize configuration
    this.config = config;
    this.devMode =
      config.devMode ||
      config.config?.devMode ||
      config.sessionContext?.devMode;

    // Initialize user profile from multiple sources
    this.userProfile =
      config.userProfile || config.sessionContext?.userProfile || null;
    this.sessionContext = config.sessionContext || null;
    this.hasSessionContext = !!this.sessionContext;
    this.sessionApiHost = config.apiHost || config.sessionContext?.apiHost;

    // Communication state
    this.port = null;
    this.platform = "wellfound";
    this.baseUrl = "https://wellfound.com";

    this.jobQueue = [];
    this.currentJobIndex = 0;
    this.isLoadingMore = false;
    this.queueInitialized = false;
    this.searchProcessStarted = false;
    this.isProcessingNextJob = false;

    // API hosts and services are initialized in setSessionContext when the session is ready.
    this.aiApiHost = null;
    this.HOST = null;
    this.backendApiHost = null;
    this.aiService = null;
    this.applicationTracker = null;

    this.filters = new WellfoundFilters();
    this.formHandler = null;

    // State management (matching SimplyHired pattern)
    this.state = {
      isRunning: false,
      isInitializing: false,
      currentJobIndex: 0,
      processedJobs: new Set(),
      jobQueue: [],
      submittedLinks: [],
    };

    // Port connection properties
    this.isPortConnected = false;
    this.portName = null;
    this.connectionRetries = 0;
    this.maxRetries = 3;
    this.keepAliveInterval = null;
    this.copilotState = new CoPilotState();
    const initialMode = this.sessionContext?.preferences?.copilotMode;
    if (initialMode === "co-pilot") {
      this.copilotState.switchToCoPilot();
    } else {
      this.copilotState.switchToAutoPilot();
    }

    this.searchData = {
      limit: 10,
      current: 0,
      domain: [],
      submittedLinks: [],
      searchLinkPattern: null,
    };

    this.applicationState = {
      isApplicationInProgress: false,
      applicationStartTime: null,
    };

    this.reason = "";

    // Setup message listener
    this.setupMessageListener();
  }

  // ========================================
  // CORE STANDALONE METHODS
  // ========================================

  /**
   * Get userProfile from injected automation context
   */
  getInjectedUserProfile() {
    try {
      // Check consolidated context first
      if (window.automationContext?.userProfile) {
        return window.automationContext.userProfile;
      }

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
   * Get userId from userProfile
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

  getInjectedAiApiHost() {
    try {
      if (typeof window !== "undefined" && window.automationAiApiHost) {
        return window.automationAiApiHost;
      }
      if (typeof sessionStorage !== "undefined") {
        const stored = sessionStorage.getItem("automationAiApiHost");
        if (stored) return stored;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  getInjectedBackendApiHost() {
    try {
      if (typeof window !== "undefined" && window.automationBackendApiHost) {
        return window.automationBackendApiHost;
      }
      if (typeof sessionStorage !== "undefined") {
        const stored = sessionStorage.getItem("automationBackendApiHost");
        if (stored) return stored;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Send message to background script
   */
  sendMessage(message) {
    try {
      chrome.runtime.sendMessage(message);
    } catch (error) {
      console.error(`❌ Error sending ${message.type}:`, error);
    }
  }

  /**
   * Setup message listener - aligned with SimplyHired pattern
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
            // Handle legacy platformMessage format
            if (message.action === "platformMessage") {
              this.handlePortMessage(message);
            }
            return true;
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
              if (data) {
                this.searchData = {
                  limit: data.limit || 10,
                  current: data.current || 0,
                  domain: data.domain || this.getPlatformDomains(),
                  submittedLinks: Array.isArray(data.submittedLinks)
                    ? data.submittedLinks.map((link) => ({ ...link, tries: 0 }))
                    : [],
                  searchLinkPattern: data.searchLinkPattern
                    ? new RegExp(
                        data.searchLinkPattern.replace(/^\/|\/[gimy]*$/g, "")
                      )
                    : this.getSearchLinkPattern(),
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
              this.handleApplicationStarting(data);
              sendResponse && sendResponse({ success: true });
              break;

            case "APPLICATION_STATUS":
              this.handleApplicationStatus(data);
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
   * Handle background messages - delegates to port message handler
   */
  handleBackgroundMessage(message) {
    this.handlePortMessage(message);
  }

  /**
   * Get API host
   */
  getApiHost() {
    return (
      this.sessionApiHost ||
      this.sessionContext?.apiHost ||
      this.config.sessionContext?.apiHost ||
      this.config.apiHost
    );
  }

  getAiApiHost() {
    return (
      this.sessionAiApiHost ||
      this.sessionContext?.aiApiHost ||
      this.config.sessionContext?.aiApiHost ||
      this.config.aiApiHost
    );
  }

  getPlatformDomains() {
    return ["wellfound.com"];
  }

  getSearchLinkPattern() {
    return /^https:\/\/wellfound\.com\/jobs\/(\d+)/;
  }

  isValidJobPage(url) {
    return (
      url && url.includes("wellfound.com/jobs/") && /\/jobs\/\d+/.test(url)
    );
  }

  async setSessionContext(sessionContext) {
    try {
      if (!sessionContext) {
        return;
      }

      this.sessionContext = sessionContext;
      this.hasSessionContext = true;

      if (sessionContext.sessionId) this.sessionId = sessionContext.sessionId;
      if (sessionContext.platform) this.platform = sessionContext.platform;
      if (sessionContext.userId) this.userId = sessionContext.userId;

      if (sessionContext.userProfile) {
        if (!this.userProfile || Object.keys(this.userProfile).length === 0) {
          this.userProfile = sessionContext.userProfile;
        } else {
          this.userProfile = {
            ...this.userProfile,
            ...sessionContext.userProfile,
          };
        }
      }

      if (!this.userProfile) {
        this.userProfile = this.getInjectedUserProfile();
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

      this.applicationTracker = new ApplicationTrackerService({
        backendApiHost: this.backendApiHost,
        userId: this.config.userId || this.sessionContext?.userId,
        jobProfileId:
          this.config.sessionContext?.userProfile?.id ||
          this.config.userProfile?.id ||
          this.userProfile?.id,
        jwtToken: this.getJwtToken(),
      });

      this.aiService = new AIService({
        aiApiHost: this.aiApiHost,
        platform: this.platform,
      });

      if (sessionContext.apiHost) {
        this.sessionApiHost = sessionContext.apiHost;
      }

      if (this.formHandler && this.userProfile) {
        this.formHandler.userData = this.userProfile;
      }

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
      console.error("❌ Error setting Wellfound session context:", error);
    }
  }

  async checkIfAlreadyApplied(jobId) {
    try {
      const alreadyApplied =
        await this.applicationTracker.checkIfAlreadyApplied(jobId);

      if (alreadyApplied) {
        notifyStatus({ type: "ALREADY_APPLIED" });
        return true;
      } else {
        return false;
      }
    } catch (error) {
      // Return false to be safe and allow application attempt
      return false;
    }
  }

  async saveAppliedJob(jobDetails) {
    try {
      await this.applicationTracker.saveAppliedJob({
        jobId: jobDetails.jobId,
        title: jobDetails.title,
        company: jobDetails.company,
        location: jobDetails.location,
        jobUrl: window.location.href,
        salary: jobDetails.salary || "Not specified",
        workplace: jobDetails.workplace || jobDetails.location,
        postedDate: jobDetails.postedDate || "Not specified",
        applicants: jobDetails.applications || "Not specified",
        platform: this.platform,
        userId: this.userProfile?.userId || this.userId,
      });
    } catch (error) {
      console.error("Error saving applied job:", error);
      return false;
    }
  }

  async updateApplicationCount() {
    try {
      await this.userService.updateApplicationCount();

      return true;
    } catch (error) {
      console.error("Error updating application count:", error);
      return false;
    }
  }

  async start(params = {}) {
    try {
      if (this.isRunning || this.state.isInitializing) {
        console.log("🔄 Already running or initializing, skipping start()");
        return true;
      }

      this.state.isInitializing = true;

      // Authentication check (matches SimplyHired pattern)
      const authCheck = await this.checkAuthentication();
      if (!authCheck.canProceed) {
        this.state.isInitializing = false;
        this.handleAuthError(authCheck);
        return false;
      }

      this.isRunning = true;
      this.state.isRunning = true;
      this.state.isInitializing = false;

      // Only register as search tab if we're on the jobs listing page, not individual job pages
      const currentUrl = window.location.href;
      const isSearchPage =
        currentUrl.includes("/jobs") && !currentUrl.match(/\/jobs\/\d+/);

      if (isSearchPage) {
        this.sendMessage({
          type: "REGISTER_SEARCH_TAB",
          data: {
            url: currentUrl,
            platform: this.platform,
          },
        });
      }

      // Show starting automation message
      notifyStatus({ type: "AUTOMATION_STARTING" });

      // Ensure correct mode buttons are shown after automation starts
      this.restoreModeButtons();

      await this.delay(200);

      if (!this.userProfile) {
        this.userProfile = this.getInjectedUserProfile();
      }

      if (!this.userProfile) {
        console.error("❌ No user profile available");
      }
      this.config = { ...this.config, ...params };

      if (this.updateProgress) {
        this.updateProgress({
          total: params.jobsToApply || 0,
          completed: 0,
          current: "Starting automation...",
        });
      }

      await this.waitForPageLoad();
      await this.detectPageTypeAndStart();

      return true;
    } catch (error) {
      this.reportError(error, { action: "start" });
      this.isRunning = false;
      this.state.isRunning = false;
      this.state.isInitializing = false;
      return false;
    }
  }

  handlePortMessage(message) {
    try {
      const { type, data } = message || {};
      if (!type) {
        return;
      }

      switch (type) {
        case "CONNECTION_ESTABLISHED":
          break;

        case "SEARCH_TASK_DATA":
          this.handleSearchTaskData(data);
          break;

        case "APPLICATION_STARTING":
          this.handleApplicationStarting(data);
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
          this.handleErrorMessage(data);
          break;

        case "KEEPALIVE_RESPONSE":
          break;

        case "SUCCESS":
          this.handleSuccessMessage(data);
          break;

        default:
          break;
      }
    } catch (error) {
      console.error("Error handling port message:", error);
    }
  }

  async findJobs() {
    return this.jobQueue.slice(this.currentJobIndex);
  }

  isApplicationPage(url) {
    return this.isValidJobPage(url);
  }

  getJobTaskMessageType() {
    return "START_APPLICATION";
  }

  async initialize() {
    // Initialize port connection (matches SimplyHired pattern)
    this.initializePortConnection();

    // Wait for session context
    await this.waitForContext();

    // Initialize form handler
    this.formHandler = new WellfoundFormHandler({
      aiService: this.aiService,
      userProfile: this.userProfile,
      logger: this,
      // statusOverlay removed - uses global overlay
      copilotMode: this.copilotState?.isInCoPilotMode(),
      copilotState: this.copilotState,
    });
  }

  // ========================================
  // PORT CONNECTION METHODS (SimplyHired Pattern)
  // ========================================

  /**
   * Initialize port connection with background script
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

      const isApplyPage = this.isValidJobPage(window.location.href);
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
   * Safe wrapper for sending port messages
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
   * Start keepalive interval to maintain port connection
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

  // ========================================
  // AUTHENTICATION METHODS (SimplyHired Pattern)
  // ========================================

  /**
   * Check authentication status before starting automation
   */
  async checkAuthentication() {
    try {
      console.log("🔍 Starting authentication check...");

      // Check for login requirements (Wellfound-specific selectors)
      const loginButton = document.querySelector(
        'button[onclick*="/login"], a[href*="/login"], a[href*="/jobs/signup"]'
      );
      if (loginButton && this.isElementVisible(loginButton)) {
        return {
          canProceed: false,
          reason: "login",
          message: "🔐 Please log in to your Wellfound account first",
        };
      }

      // Additional login button check
      const signupButton = document.querySelector(
        'button[onclick*="/jobs/signup"]'
      );
      if (signupButton && this.isElementVisible(signupButton)) {
        return {
          canProceed: false,
          reason: "login",
          message: "🔐 Please log in to your Wellfound account first",
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
        'p[data-dd-captcha-human-title*="Verification"]',
        'p[data-dd-captcha-human-title=""]',
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
      const pageText = document.body.textContent?.toLowerCase() || "";
      const captchaTexts = [
        "access blocked",
        "verification required",
        "complete the captcha",
        "verify you are human",
      ];

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

      return {
        canProceed: true,
        reason: "authenticated",
        message: "✅ Ready to start",
      };
    } catch (error) {
      console.error("❌ Error in checkAuthentication:", error);
      return {
        canProceed: false,
        reason: "error",
        message: "❌ Error checking authentication",
      };
    }
  }

  /**
   * Handle authentication errors
   */
  handleAuthError(authCheck) {
    console.log("Auth check result:", authCheck);
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

  /**
   * Restore appropriate mode buttons based on current copilot state
   */
  restoreModeButtons() {
    if (this.copilotState.isInCoPilotMode()) {
      updateStatusButtons("co-pilot-search");
    } else {
      updateStatusButtons("auto-pilot");
    }
  }

  /**
   * Check if element is visible on page
   */
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

  /**
   * Wait for automation context to be available
   */
  async waitForContext(timeout = 5000) {
    return new Promise((resolve) => {
      // 1. Check if context is already available
      if (window.automationContext) {
        this.setSessionContext(window.automationContext);
        resolve(window.automationContext);
        return;
      }

      // 2. Check sessionStorage
      try {
        const stored = sessionStorage.getItem("automationContext");
        if (stored) {
          const context = JSON.parse(stored);
          this.setSessionContext(context);
          window.automationContext = context; // Sync back
          resolve(context);
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
        resolve(null);
      }, timeout);

      window.addEventListener(
        "AUTOMATION_CONTEXT_READY",
        (event) => {
          clearTimeout(timeoutId);
          this.setSessionContext(event.detail);
          resolve(event.detail);
        },
        { once: true, signal: controller.signal }
      );
    });
  }

  checkIfNoJobsFound() {
    try {
      const searchHeader = document.querySelector("h4.styles_header__ilUL3");
      if (searchHeader) {
        const headerText = searchHeader.textContent?.trim() || "";
        const zeroJobsMatch = headerText.match(/^0\s+results?/i);
        if (zeroJobsMatch) {
          console.log(`📋 Detected zero jobs: "${headerText}"`);
          return true;
        }
      }

      const pageText = document.body.textContent?.toLowerCase() || "";
      if (
        pageText.includes("0 results") ||
        pageText.includes("no jobs found") ||
        pageText.includes("no results found")
      ) {
        const companyCards = document.querySelectorAll(
          ".styles_component__uTjje"
        );
        if (companyCards.length === 0) {
          console.log("📋 No jobs found (verified by empty company cards)");
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("❌ Error checking if no jobs found:", error);
      return false;
    }
  }

  async buildJobQueue() {
    try {
      this.jobQueue = [];
      this.currentJobIndex = 0;

      await this.waitForPageLoad();
      await this.delay(1000);

      // Check if there are any jobs found on the page
      const noJobsFound = this.checkIfNoJobsFound();
      if (noJobsFound) {
        notifyStatus({
          type: "JOB_NOT_FOUND",
          data: {
            message: "No jobs found matching your search criteria",
            jobCount: 0,
          },
        });
        return false;
      }

      const companyCards = document.querySelectorAll(
        ".styles_component__uTjje"
      );

      if (companyCards.length === 0) {
        notifyStatus({
          type: "JOB_NOT_FOUND",
          data: {
            message: "No company cards found on page",
            jobCount: 0,
          },
        });
        return false;
      }

      for (const companyCard of companyCards) {
        try {
          const jobs = this.extractJobsFromCompanyCard(companyCard);

          const newJobs = jobs.filter((job) => {
            const normalizedUrl = this.normalizeUrl(job.url);
            return !this.searchData.submittedLinks.some(
              (link) => this.normalizeUrl(link.url) === normalizedUrl
            );
          });

          this.jobQueue.push(...newJobs);

          if (newJobs.length > 0) {
          }
        } catch (error) {
          console.error(`Error processing company card:`, error);
          continue;
        }
      }

      this.queueInitialized = true;
      return this.jobQueue.length > 0;
    } catch (error) {
      return false;
    }
  }

  extractJobsFromCompanyCard(companyCard) {
    const jobs = [];

    try {
      const jobListingsSection = companyCard.querySelector(
        ".styles_jobListingList__YGDNO"
      );

      if (jobListingsSection) {
        const jobLinksInCompany = jobListingsSection.querySelectorAll(
          "a.styles_component__UCLp3.styles_defaultLink__eZMqw.styles_jobLink__US40J"
        );

        for (const jobLink of jobLinksInCompany) {
          if (jobLink && jobLink.href) {
            const href = jobLink.href;

            if (this.getSearchLinkPattern().test(href)) {
              const jobInfo = this.createJobInfoFromLink(jobLink, companyCard);
              jobs.push(jobInfo);
            }
          }
        }
      } else {
        const directJobLink = companyCard.querySelector(
          "a.styles_component__UCLp3.styles_defaultLink__eZMqw.styles_jobLink__US40J"
        );
        if (
          directJobLink &&
          directJobLink.href &&
          this.getSearchLinkPattern().test(directJobLink.href)
        ) {
          const jobInfo = this.createJobInfoFromLink(
            directJobLink,
            companyCard
          );
          jobs.push(jobInfo);
        }
      }
    } catch (error) {
      console.error(`Error extracting jobs from company card:`, error);
    }

    return jobs;
  }

  createJobInfoFromLink(jobLink, companyCard) {
    const jobContainer = jobLink.closest(".styles_component__Ey28k") || jobLink;
    const titleElement = jobContainer.querySelector(".styles_title__xpQDw");
    const locationElement = jobContainer.querySelector(
      ".styles_location__O9Z62"
    );
    const compensationElement = jobContainer.querySelector(
      ".styles_compensation__3JnvU"
    );

    const companyNameElement = companyCard.querySelector(
      "h2.inline.text-md.font-semibold"
    );

    // Check if job has already been applied to by looking for "Applied" button
    const alreadyApplied = this.checkIfJobCardShowsApplied(jobContainer);

    return {
      url: jobLink.href,
      title: titleElement?.textContent?.trim() || "Unknown Title",
      location: locationElement?.textContent?.trim() || "Unknown Location",
      compensation: compensationElement?.textContent?.trim() || "Not specified",
      company: companyNameElement?.textContent?.trim() || "Unknown Company",
      element: jobLink,
      originalElement: jobContainer,
      companyCard: companyCard,
      queueIndex: this.jobQueue.length,
      extractedAt: Date.now(),
      alreadyApplied: alreadyApplied,
    };
  }

  // Check if a job card shows it has already been applied to
  checkIfJobCardShowsApplied(jobContainer) {
    try {
      // Look for "Applied" button or indicator in the job card
      const applyButton = jobContainer.querySelector(
        'button.styles_applyButton__7gnpI, button[data-test="Button"]'
      );

      if (applyButton) {
        const buttonText = applyButton.textContent?.toLowerCase() || "";
        if (
          buttonText.includes("applied") ||
          buttonText.includes("application sent")
        ) {
          return true;
        }

        if (
          applyButton.disabled ||
          applyButton.classList.contains("disabled")
        ) {
          return true;
        }
      }

      const appliedIndicators = jobContainer.querySelectorAll("*");
      for (const element of appliedIndicators) {
        const text = element.textContent?.toLowerCase() || "";
        if (text.includes("you applied") || text === "applied") {
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  // Check if the job page shows we've already applied
  checkIfPageShowsAlreadyApplied() {
    try {
      // Check for "Applied" button on the page
      const applyButton = document.querySelector(
        'button.styles_applyButton__7gnpI, button[data-test="Button"]'
      );
      if (applyButton) {
        const buttonText = applyButton.textContent?.toLowerCase() || "";
        if (
          buttonText.includes("applied") ||
          buttonText.includes("application sent")
        ) {
          return true;
        }

        if (
          applyButton.disabled ||
          applyButton.classList.contains("disabled")
        ) {
          const disabledAndApplied = buttonText.includes("apply");
          if (disabledAndApplied) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.error("Error checking if page shows already applied:", error);
      return false;
    }
  }

  async processNextJobFromQueue() {
    try {
      if (this.isProcessingNextJob) {
        return;
      }

      if (this.applicationState.isApplicationInProgress) {
        const applicationDuration =
          Date.now() - (this.applicationState.applicationStartTime || 0);
        const maxApplicationDuration = 10 * 60 * 1000;
        if (applicationDuration > maxApplicationDuration) {
          this.applicationState.isApplicationInProgress = false;
          this.applicationState.applicationStartTime = null;
        } else {
          setTimeout(() => this.processNextJobFromQueue(), 5000);
          return;
        }
      }

      this.isProcessingNextJob = true;

      if (
        this.jobQueue.length - this.currentJobIndex <= 3 &&
        !this.isLoadingMore
      ) {
        await this.loadMoreJobsIntoQueue();
      }

      if (this.searchData.current >= this.searchData.limit) {
        notifyStatus({ type: "SEARCH_COMPLETED" });
        this.sendMessage({ type: "SEARCH_COMPLETED" });
        this.isProcessingNextJob = false;
        return;
      }

      if (this.currentJobIndex >= this.jobQueue.length) {
        notifyStatus({ type: "SEARCH_COMPLETED" });
        this.sendMessage({ type: "SEARCH_COMPLETED" });
        this.isProcessingNextJob = false;
        return;
      }

      const nextJob = this.jobQueue[this.currentJobIndex];

      await this.delay(1000);

      const success = await this.processJobLink(nextJob);

      this.isProcessingNextJob = false;

      if (success) {
        this.currentJobIndex++;
      } else {
        this.searchData.submittedLinks.push({
          url: nextJob.url,
          status: "FAILED",
          message: "Failed to process job link",
          timestamp: Date.now(),
        });

        setTimeout(() => this.processNextJobFromQueue(), 1000);
      }
    } catch (error) {
      this.isProcessingNextJob = false;
      this.reportError(error, { action: "processNextJobFromQueue" });
    }
  }

  async loadMoreJobsIntoQueue() {
    if (this.isLoadingMore) {
      return false;
    }

    this.isLoadingMore = true;

    try {
      const initialJobCount = this.jobQueue.length;
      const loadedMore = await this.loadMoreJobs();

      if (loadedMore) {
        await this.delay(3000);

        const newCompanyCards = document.querySelectorAll(
          ".styles_component__uTjje"
        );

        const unseenCards = Array.from(newCompanyCards).slice(initialJobCount);

        for (const companyCard of unseenCards) {
          try {
            const jobs = this.extractJobsFromCompanyCard(companyCard);

            const newJobs = jobs.filter((job) => {
              const normalizedUrl = this.normalizeUrl(job.url);
              return !this.searchData.submittedLinks.some(
                (link) => this.normalizeUrl(link.url) === normalizedUrl
              );
            });

            this.jobQueue.push(...newJobs);
          } catch (error) {
            console.error(`Error processing new company card:`, error);
          }
        }

        const newJobCount = this.jobQueue.length - initialJobCount;
        return newJobCount > 0;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    } finally {
      this.isLoadingMore = false;
    }
  }

  handlePlatformSpecificMessage(type, data) {
    if (!type) {
      return;
    }

    try {
      switch (type) {
        case "SEARCH_TASK_DATA":
          this.handleSearchTaskData(data);
          break;

        case "APPLICATION_STARTING":
          this.handleApplicationStarting(data);
          break;

        case "APPLICATION_STATUS":
          this.handleApplicationStatus(data);
          break;

        case "APPLICATION_SUCCESS":
          this.handleApplicationSuccess(data);
          break;

        case "APPLICATION_ERROR":
          this.handleApplicationError(data);
          break;

        case "APPLICATION_ALREADY_APPLIED":
          this.handleApplicationAlreadyApplied(data);
          break;

        case "SUCCESS":
          this.handleSuccessMessage(data);
          break;

        case "APPLICATION_STATUS_RESPONSE":
          this.handleApplicationStatusResponse(data);
          break;

        case "JOB_TAB_STATUS":
          this.handleJobTabStatus(data);
          break;

        default:
          if (super.handlePlatformSpecificMessage) {
            super.handlePlatformSpecificMessage(type, data);
          }
      }
    } catch (error) {
      console.error(`Error handling platform message ${type}:`, error);
    }
  }

  handleApplicationSuccess(data) {
    try {
      console.log(
        "✅ Application completed successfully, moving to next job..."
      );

      // Mark application as no longer in progress
      this.applicationState.isApplicationInProgress = false;
      this.applicationState.applicationStartTime = null;

      // Update search data if provided
      if (data && data.submittedLinks) {
        this.searchData.submittedLinks = data.submittedLinks;
      }
      if (data && data.current !== undefined) {
        this.searchData.current = data.current;
      }

      // Increment job index and reset processing flag
      this.currentJobIndex++;
      this.isProcessingNextJob = false;

      // Move to next job after a short delay
      setTimeout(() => this.processNextJobFromQueue(), 1000);
    } catch (error) {
      console.error("Error handling application success:", error);
    }
  }

  handleApplicationAlreadyApplied(data) {
    try {
      console.log("📋 Handling already applied job, moving to next...");

      // Mark application as no longer in progress
      this.applicationState.isApplicationInProgress = false;
      this.applicationState.applicationStartTime = null;

      // Increment job index and reset processing flag
      this.currentJobIndex++;
      this.isProcessingNextJob = false;

      // Move to next job after a short delay
      setTimeout(() => this.processNextJobFromQueue(), 1000);
    } catch (error) {
      console.error("Error handling already applied:", error);
    }
  }

  handleApplicationStatusResponse(data) {
    try {
      if (!data) {
        return;
      }

      if (data.status) {
        this.applicationState = {
          ...this.applicationState,
          ...data.status,
        };
      }
    } catch (error) {
      console.error(`Error handling application status response:`, error);
    }
  }

  handleJobTabStatus(data) {
    try {
      if (!data) {
        return;
      }

      if (data.tabId && data.status) {
      }
    } catch (error) {
      console.error(`Error handling job tab status:`, error);
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
        domain: data.domain || this.getPlatformDomains(),
        submittedLinks: Array.isArray(data.submittedLinks)
          ? data.submittedLinks.map((link) => ({ ...link, tries: 0 }))
          : [],
        searchLinkPattern: data.searchLinkPattern
          ? new RegExp(data.searchLinkPattern.replace(/^\/|\/[gimy]*$/g, ""))
          : this.getSearchLinkPattern(),
      };

      if (data.profile && !this.userProfile) {
        this.userProfile = data.profile;
      }

      setTimeout(() => this.startQueueBasedSearch(), 1000);
    } catch (error) {
      console.error(`Error processing search task data:`, error);

      this.searchData = {
        limit: 10,
        current: 0,
        domain: this.getPlatformDomains(),
        submittedLinks: [],
        searchLinkPattern: this.getSearchLinkPattern(),
      };
    }
  }

  async startQueueBasedSearch() {
    try {
      const queueBuilt = await this.buildJobQueue();

      if (!queueBuilt || this.jobQueue.length === 0) {
        notifyStatus({ type: "SEARCH_COMPLETED" });
        this.sendMessage({ type: "SEARCH_COMPLETED" });
        return;
      }

      // Show job found message
      notifyStatus({ type: "JOB_FOUND" });
      await this.delay(3000);

      await this.processNextJobFromQueue();
    } catch (error) {
      console.error(`Error starting queue-based search:`, error);
    }
  }

  handleSuccessMessage(data) {
    if (data && Object.keys(data).length === 0) {
      return;
    }

    // Only handle initial search task data if queue hasn't been initialized yet
    if (data && data.submittedLinks !== undefined && !this.queueInitialized) {
      console.log("🆕 Initializing search with task data");
      this.handleSearchTaskData(data);
    } else if (
      data &&
      data.submittedLinks !== undefined &&
      this.queueInitialized
    ) {
      this.searchData.submittedLinks = data.submittedLinks;
      if (data.current !== undefined) {
        this.searchData.current = data.current;
      }
    }
  }

  handleApplicationStarting(data) {
    this.applicationState.isApplicationInProgress = true;
    this.applicationState.applicationStartTime = Date.now();
  }

  handleApplicationStatus(data) {
    if (
      data &&
      data.inProgress &&
      !this.applicationState.isApplicationInProgress
    ) {
      this.applicationState.isApplicationInProgress = true;
      this.applicationState.applicationStartTime = Date.now();
    } else if (
      data &&
      !data.inProgress &&
      this.applicationState.isApplicationInProgress
    ) {
      this.applicationState.isApplicationInProgress = false;
      this.applicationState.applicationStartTime = null;
      setTimeout(() => this.processNextJobFromQueue(), 1000);
    }
  }

  handleSearchNext(data) {
    try {
      this.applicationState.isApplicationInProgress = false;
      this.applicationState.applicationStartTime = null;

      if (data && data.submittedLinks) {
        this.searchData.submittedLinks = data.submittedLinks;
      }
      if (data && data.current !== undefined) {
        this.searchData.current = data.current;
      }

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
        notifyStatus({ type: "LIMIT_EXCEEDED" });
      }

      setTimeout(() => {
        this.processNextJobFromQueue();
      }, 1000);
    } catch (error) {
      console.error("❌ Error in handleSearchNext:", error);
      return;
    }
  }

  handleDuplicateJob(data) {
    try {
      this.applicationState.isApplicationInProgress = false;
      this.applicationState.applicationStartTime = null;

      if (data && data.url) {
        const jobTitle = data.title || "this job";
        notifyStatus({
          type: "DUPLICATE_APPLICATION",
          data: { title: jobTitle },
        });
      }
      setTimeout(() => this.processNextJobFromQueue(), 1000);
    } catch (error) {
      return;
    }
  }

  handleErrorMessage(data) {
    try {
      this.applicationState.isApplicationInProgress = false;
      this.applicationState.applicationStartTime = null;

      if (data && data.error) {
        // Could show error notification here if needed
        console.error("Application error received:", data.error);
      }

      // Continue to next job after error
      setTimeout(() => this.processNextJobFromQueue(), 1000);
    } catch (error) {
      return;
    }
  }

  async detectPageTypeAndStart() {
    const url = window.location.href;

    if (url.includes("wellfound.com/jobs") && !this.isValidJobPage(url)) {
      await this.startSearchProcess();
    } else if (this.isValidJobPage(url)) {
      await this.startApplicationProcess();
    } else {
      await this.waitForValidPage();
    }
  }

  async checkCaptchaStatus() {
    try {
      const captchaSelectors = [
        'p[data-dd-captcha-human-title=""]',
        "p.captcha__human__title",
        'p[data-dd-captcha-human-title*="Verification Required"]',
      ];

      const captchaFound = captchaSelectors.some((selector) => {
        const element = document.querySelector(selector);
        return (
          element &&
          (element.textContent.includes("Access blocked") ||
            element.textContent.includes("Verification Required"))
        );
      });

      if (captchaFound) {
        notifyStatus({ type: "RECAPTCHA_DETECTED" });
        await this.waitForCaptchaResolution();
      }
    } catch (error) {
      return;
    }
  }

  async waitForCaptchaResolution() {
    const maxWaitTime = 10 * 60 * 1000;
    const checkInterval = 10000;
    let waitTime = 0;

    while (waitTime < maxWaitTime) {
      await this.delay(checkInterval);
      waitTime += checkInterval;

      const captchaSelectors = [
        'p[data-dd-captcha-human-title=""]',
        "p.captcha__human__title",
        'p[data-dd-captcha-human-title*="Verification Required"]',
      ];

      const captchaStillPresent = captchaSelectors.some((selector) => {
        const element = document.querySelector(selector);
        return (
          element &&
          (element.textContent.includes("Access blocked") ||
            element.textContent.includes("Verification Required"))
        );
      });

      if (!captchaStillPresent) {
        return;
      }
    }

    throw new Error(
      "Captcha resolution timeout - please refresh and try again"
    );
  }

  async checkLoginStatus() {
    try {
      const loginButton = document.querySelector(
        "button[onclick=\"window.location.href='/login'\"]"
      );
      const signupButton = document.querySelector(
        'button[onclick*="/jobs/signup"]'
      );

      if (loginButton || signupButton) {
        notifyStatus({ type: "LOGIN_REQUIRED" });
        await this.waitForUserLogin();
      }
    } catch (error) {
      throw error;
    }
  }

  async waitForUserLogin() {
    const maxWaitTime = 15 * 60 * 1000;
    const checkInterval = 10000;
    let waitTime = 0;

    while (waitTime < maxWaitTime) {
      await this.delay(checkInterval);
      waitTime += checkInterval;

      const loginButton = document.querySelector(
        "button[onclick=\"window.location.href='/login'\"]"
      );
      const signupButton = document.querySelector(
        'button[onclick*="/jobs/signup"]'
      );

      if (!loginButton && !signupButton) {
        return;
      }
    }

    throw new Error("Login timeout - please refresh and try again");
  }

  /**
   * Click the Filters toggle button to open filter panel
   */
  async clickFiltersButton() {
    try {
      console.log("🔘 Looking for Filters button...");

      // Wait for the Filters button to appear
      const filtersButton = await domObserver.waitForElement(
        'button[data-test="SearchBar-ToggleFilterControlPanelButton"]',
        10000
      );

      if (!filtersButton) {
        return false;
      }

      const isExpanded = filtersButton.getAttribute("aria-expanded") === "true";
      if (isExpanded) {
        return true;
      }

      filtersButton.click();

      await this.delay(1000);

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Click the "View results" button to apply filters and show results
   */
  async clickViewResultsButton() {
    try {
      // Wait for the View results button to appear
      const viewResultsButton = await domObserver.waitForElement(
        'button[data-test="SearchBar-ViewResultsButton"]',
        10000
      );

      if (!viewResultsButton) {
        console.warn("⚠️ View results button not found");
        return false;
      }

      // Click the button
      viewResultsButton.click();

      // Wait for results to load
      await this.delay(2000);

      return true;
    } catch (error) {
      console.error("❌ Error clicking View results button:", error);
      return false;
    }
  }

  async startSearchProcess() {
    try {
      if (this.searchProcessStarted) {
        return;
      }

      try {
        await this.checkLoginStatus();
      } catch (error) {
        notifyStatus({ type: "LOGIN_REQUIRED" });
        throw error;
      }

      await this.delay(1000);

      try {
        await this.checkCaptchaStatus();
      } catch (error) {
        notifyStatus({ type: "RECAPTCHA_DETECTED" });
        throw error;
      }

      this.searchProcessStarted = true;

      const preferences =
        this.sessionContext?.preferences || this.config?.preferences || {};

      // Show job search started message with preferences
      notifyStatus({
        type: "JOB_SEARCH_STARTED",
        data: { preferences },
      });

      await this.delay(3000);

      // Show applying filters message
      notifyStatus({
        type: "APPLYING_FILTERS",
        data: { preferences },
      });

      // Click Filters button to open filter panel
      await this.clickFiltersButton();
      await this.delay(1000);

      // Get job titles from preferences
      const jobTitles = preferences.positions || ["Software Engineer"];

      // Add job titles
      await this.delay(2000);
      await this.filters.addJobTitles(jobTitles);

      // Get locations from preferences
      const city = Array.isArray(preferences.city)
        ? preferences.city[0]
        : preferences.city;
      const country = Array.isArray(preferences.location)
        ? preferences.location[0]
        : preferences.location;

      const locationsToAdd = [];
      if (city) {
        locationsToAdd.push(city);
      }
      if (country && country !== city) {
        locationsToAdd.push(country);
      }

      // Add locations
      if (locationsToAdd.length > 0) {
        await this.filters.addLocations(locationsToAdd);
        await this.delay(2000);
      }

      // Get salary range from preferences (array format: [min, max])
      let minSalary = null;
      let maxSalary = null;

      if (Array.isArray(preferences.salary) && preferences.salary.length >= 2) {
        minSalary = preferences.salary[0];
        maxSalary = preferences.salary[1];
      }

      if (minSalary || maxSalary) {
        await this.filters.setSalaryRange(minSalary, maxSalary);
        await this.delay(2000);
      }

      // Get markets/industries from preferences
      const markets =
        preferences.industry ||
        preferences.industries ||
        preferences.markets ||
        [];
      if (Array.isArray(markets) && markets.length > 0) {
        console.log("🏢 Markets from preferences:", markets);
        await this.filters.addMarkets(markets);
        await this.delay(2000);
      }

      // Get job types from preferences
      const jobTypes = preferences.jobType || preferences.jobTypes || [];
      const jobTypeArray = Array.isArray(jobTypes) ? jobTypes : [jobTypes];

      if (jobTypeArray.length > 0) {
        await this.filters.setJobTypes(jobTypeArray);
        await this.delay(2000);
      }

      // Set remote only filter from preferences
      if (preferences.remoteOnly !== undefined) {
        await this.filters.setRemoteOnly(preferences.remoteOnly);
        await this.delay(1000);
      }

      // Set willing to sponsor filter from preferences
      if (preferences.willingToSponsor !== undefined) {
        await this.filters.setWillingToSponsor(preferences.willingToSponsor);
        await this.delay(1000);
      }

      // Click "View results" to apply all filters
      await this.clickViewResultsButton();

      // Wait for job cards to load
      await this.delay(3000);

      // Collect and process job cards
      await this.collectAndProcessJobCards();
    } catch (error) {
      this.searchProcessStarted = false;
      this.reportError(error, { phase: "search" });
    }
  }

  /**
   * Collect job cards from the page and intelligently select jobs
   * - If company has 1 job: apply to it
   * - If company has multiple jobs: select the one that best matches user's position preferences
   */
  async collectAndProcessJobCards() {
    try {
      // Find all company cards
      const companyCards = document.querySelectorAll(
        '.styles_component__uTjje[data-test="StartupResult"]'
      );

      if (companyCards.length === 0) {
        console.log("No job cards found");
        notifyStatus({ type: "JOB_NOT_FOUND" });
        return;
      }

      const preferences =
        this.sessionContext?.preferences || this.config?.preferences || {};
      const userPositions = preferences.positions || ["Software Engineer"];
      const jobsToApply = [];

      // Process each company card
      for (const companyCard of companyCards) {
        try {
          // Get company name
          const companyNameEl = companyCard.querySelector(
            'a[href^="/company/"] h2'
          );
          const companyName =
            companyNameEl?.textContent?.trim() || "Unknown Company";

          // Find all job listings within this company card
          const jobListings = companyCard.querySelectorAll(
            ".styles_component__Ey28k"
          );
          console.log(
            `Company "${companyName}" has ${jobListings.length} job(s)`
          );

          if (jobListings.length === 0) {
            continue;
          }

          let selectedJob = null;

          if (jobListings.length === 1) {
            // Only one job, select it
            selectedJob = this.extractJobInfo(jobListings[0], companyName);
          } else {
            // Multiple jobs, find the best match
            const jobsInfo = Array.from(jobListings).map((listing) =>
              this.extractJobInfo(listing, companyName)
            );

            // Score each job based on position match
            let bestMatch = null;
            let bestScore = -1;

            for (const job of jobsInfo) {
              const score = this.calculateJobMatchScore(
                job.title,
                userPositions
              );

              if (score > bestScore) {
                bestScore = score;
                bestMatch = job;
              }
            }

            selectedJob = bestMatch;
            console.log(
              `✓ Selected best match: "${selectedJob.title}" at ${companyName} (score: ${bestScore})`
            );
          }

          if (selectedJob) {
            jobsToApply.push(selectedJob);
          }
        } catch (error) {
          console.error("Error processing company card:", error);
          continue;
        }
      }

      if (jobsToApply.length === 0) {
        notifyStatus({ type: "JOB_NOT_FOUND" });
        return;
      }

      // Add jobs to queue
      this.jobQueue = jobsToApply;
      this.currentJobIndex = 0;

      notifyStatus({ type: "JOB_FOUND" });
      await this.delay(1000);

      // Start processing jobs
      await this.processNextJobFromQueue();
    } catch (error) {
      console.error("❌ Error collecting job cards:", error);
      notifyStatus({ type: "APPLICATION_ERROR" });
    }
  }

  /**
   * Extract job information from a job listing element
   */
  extractJobInfo(jobListing, companyName) {
    const titleEl = jobListing.querySelector(".styles_title__xpQDw");
    const linkEl = jobListing.querySelector("a.styles_jobLink__US40J");
    const locationEls = jobListing.querySelectorAll(".styles_location__O9Z62");
    const compensationEl = jobListing.querySelector(
      ".styles_compensation__3JnvU"
    );

    const title = titleEl?.textContent?.trim() || "Unknown Position";
    const relativeUrl = linkEl?.getAttribute("href") || "";
    const url = relativeUrl ? `https://wellfound.com${relativeUrl}` : "";
    const locations = Array.from(locationEls)
      .map((el) => el.textContent?.trim())
      .filter(Boolean);
    const compensation = compensationEl?.textContent?.trim() || "Not specified";

    return {
      title,
      url,
      company: companyName,
      location: locations.join(", ") || "Not specified",
      compensation,
      alreadyApplied: false,
    };
  }

  /**
   * Calculate how well a job title matches user's position preferences
   * Returns a score (higher is better)
   */
  calculateJobMatchScore(jobTitle, userPositions) {
    const normalizedJobTitle = jobTitle.toLowerCase();
    let score = 0;

    for (const position of userPositions) {
      const normalizedPosition = position.toLowerCase();
      const positionWords = normalizedPosition.split(/\s+/);

      // Exact match
      if (normalizedJobTitle === normalizedPosition) {
        score += 100;
        continue;
      }

      // Contains full position
      if (normalizedJobTitle.includes(normalizedPosition)) {
        score += 50;
      }

      // Check individual words
      for (const word of positionWords) {
        if (word.length > 2 && normalizedJobTitle.includes(word)) {
          score += 10;
        }
      }
    }

    return score;
  }

  async processJobLink(jobInfo) {
    try {
      // Check if job is already applied (from job card detection)
      if (jobInfo.alreadyApplied) {
        console.log(
          `⏭️ Skipping job "${jobInfo.title}" - already applied (detected from job card)`
        );
        notifyStatus({
          type: "ALREADY_APPLIED",
          data: { title: jobInfo.title },
        });
        await this.delay(1000);

        // Increment currentJobIndex to move to next job
        this.currentJobIndex++;
        this.isProcessingNextJob = false;

        // Move to next job
        setTimeout(() => this.processNextJobFromQueue(), 1000);
        return false;
      }

      // Extract job ID from job URL and check with backend
      const jobId = this.extractJobIdFromUrl(jobInfo.url);
      if (jobId) {
        try {
          const { canApply, alreadyApplied, credits } =
            await this.applicationTracker.checkCanApply(jobId);

          // Check if already applied (backend check)
          if (alreadyApplied) {
            console.log(
              `⏭️ Skipping job "${jobInfo.title}" - already applied (backend confirmed)`
            );
            notifyStatus({
              type: "ALREADY_APPLIED",
              data: { title: jobInfo.title },
            });
            await this.delay(1000);

            // Increment currentJobIndex to move to next job
            this.currentJobIndex++;
            this.isProcessingNextJob = false;

            // Move to next job
            setTimeout(() => this.processNextJobFromQueue(), 1000);
            return false;
          }

          // Check if can apply (credit limits)
          if (!canApply) {
            console.log(
              `⏭️ Skipping job "${jobInfo.title}" - application limit reached`
            );
            notifyStatus({
              type: "LIMIT_EXCEEDED",
              data: { planType: this.userProfile?.plan, credits },
            });
            await this.delay(1000);

            // Increment currentJobIndex to move to next job
            this.currentJobIndex++;
            this.isProcessingNextJob = false;

            // Move to next job
            setTimeout(() => this.processNextJobFromQueue(), 1000);
            return false;
          }
        } catch (error) {
          console.warn("⚠️ Error checking if can apply, continuing:", error);
          // Continue with application even if check fails
        }
      }

      // Show applying to job message
      notifyStatus({
        type: "APPLYING_TO_JOB",
        data: { title: jobInfo.title },
      });
      await this.delay(2000);

      // Mark application as in progress before sending message
      this.applicationState.isApplicationInProgress = true;
      this.applicationState.applicationStartTime = Date.now();

      // Send job to background for processing
      this.sendMessage({
        type: "START_APPLICATION",
        data: {
          url: jobInfo.url,
          jobId: this.extractJobIdFromUrl(jobInfo.url),
          title: jobInfo.title,
          location: jobInfo.location,
          company: jobInfo.company,
          compensation: jobInfo.compensation,
        },
      });

      return true;
    } catch (error) {
      // Reset application state on error
      this.applicationState.isApplicationInProgress = false;
      this.applicationState.applicationStartTime = null;
      this.currentJobIndex++;
      this.isProcessingNextJob = false;
      console.error("❌ Error in processJobLink, resetting application state");

      notifyStatus({ type: "APPLICATION_ERROR" });
      setTimeout(() => this.processNextJobFromQueue(), 2000);
      return false;
    }
  }

  async waitForPageLoad() {
    try {
      if (document.readyState !== "complete") {
        await new Promise((resolve) => {
          if (document.readyState === "complete") {
            resolve();
          } else {
            window.addEventListener("load", resolve, { once: true });
          }
        });
      }

      await this.waitForElementWithTimeout(".styles_component__uTjje", 15000);
    } catch (error) {
      return false;
    }
  }

  async waitForElementWithTimeout(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver((mutations) => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  }

  async startApplicationProcess() {
    try {
      // User profile comes from session context
      if (!this.userProfile) {
        console.error("❌ No user profile in session context");
        return;
      }
      if (
        this.config.config?.preferences?.applyOnlyMatching ||
        this.config.config?.preferences?.applyOnlyQualified
      ) {
        const jobInfo = {
          title: this.extractJobTitle() || "Unknown Title",
          company: this.extractCompanyName() || "Unknown Company",
          location: this.extractJobLocation() || "Unknown Location",
          salary: this.extractSalary() || "Not specified",
          compensation: this.extractSalary() || "Not specified",
          description: this.extractJobDescription() || "",
          requirements: this.extractRequirements() || "",
          type: this.extractJobType() || "",
          work_mode: this.extractWorkMode() || "",
          experience: this.extractExperience() || "",
          industry: this.extractIndustry() || "",
          url: window.location.href,
        };

        // Check if job matches using AI
        const isMatch = await this.doesJobMatchPreferences(jobInfo);
        console.log(isMatch);
        if (!isMatch) {
          notifyStatus({
            type: "DOES_NOT_MATCH_PREFERENCES",
            data: {
              title: jobInfo.title,
              reason: this.reason,
            },
          });
          await this.delay(4000);

          this.sendMessage({
            type: "APPLICATION_SKIPPED",
            data: {
              url: jobInfo.url,
              jobUrl: jobInfo.url,
              reason: "Job does not match preferences",
              skipReason: "preferences_mismatch",
              jobTitle: jobInfo.title,
            },
          });

          return false;
        }
      }

      console.log("Applying to job...");
      await this.apply();
    } catch (error) {
      this.reportError(error, { phase: "application" });
      this.handleApplicationError(error);
    }
  }

  handleApplicationError(errorOrData) {
    try {
      // Reset application state
      this.applicationState.isApplicationInProgress = false;
      this.applicationState.applicationStartTime = null;

      // Increment job index and reset processing flag
      this.currentJobIndex++;
      this.isProcessingNextJob = false;

      if (errorOrData instanceof Error) {
        console.error("❌ Application error occurred:", errorOrData);
        this.sendMessage({
          type: "APPLICATION_ERROR",
          data: this.errorToString(errorOrData),
        });

        // Move to next job after error
        setTimeout(() => this.processNextJobFromQueue(), 1000);
      } else {
        console.log(
          "❌ Application failed in other tab, moving to next job..."
        );

        setTimeout(() => this.processNextJobFromQueue(), 1000);
      }
    } catch (error) {
      console.error("Error in handleApplicationError:", error);
    }
  }

  // Removed fetchApplicationTaskData - user profile comes from session context

  async apply() {
    try {
      const jobId = this.extractJobIdFromUrl(window.location.href);
      const jobTitle = this.extractJobTitle() || "this job";

      console.log(this.config.config?.preferences?.applyOnlyMatching);
      // Check if already applied using the database check
      const alreadyApplied = await this.checkIfAlreadyApplied(jobId);
      if (alreadyApplied) {
        notifyStatus({
          type: "ALREADY_APPLIED",
          data: { title: jobTitle },
        });
        await this.delay(3000);

        // Send message to background to move to next job
        this.sendMessage({
          type: "APPLICATION_ALREADY_APPLIED",
          data: {
            jobId,
            title: jobTitle,
            jobUrl: window.location.href,
          },
        });

        return false;
      }

      const applyButton = await this.findApplyButton();
      console.log(applyButton);
      if (!applyButton) {
        throw new Error("Cannot find Wellfound apply button");
      }

      const buttonText = applyButton.textContent?.toLowerCase() || "";
      if (
        buttonText.includes("applied") ||
        buttonText.includes("application sent")
      ) {
        notifyStatus({
          type: "ALREADY_APPLIED",
          data: { title: jobTitle },
        });
        await this.delay(3000);

        // Send message to background to move to next job
        this.sendMessage({
          type: "APPLICATION_ALREADY_APPLIED",
          data: {
            jobId,
            title: jobTitle,
            jobUrl: window.location.href,
          },
        });

        return false;
      }

      await this.clickApplyButton(applyButton);
      await this.delay(2000);

      const hasLocationRestriction = document
        .querySelector(".text-dark-warning")
        ?.textContent?.includes(
          "This job does not support the locations on your profile"
        );
      if (hasLocationRestriction) {
        notifyStatus({
          type: "APPLICATION_SKIPPED",
          data: { title: jobTitle, reason: "Location restriction" },
        });
        await this.delay(2000);

        // Send skip message to background
        this.sendMessage({
          type: "APPLICATION_SKIPPED",
          data: {
            jobId,
            title: jobTitle,
            jobUrl: window.location.href,
            reason: "Location restriction",
          },
        });

        return false;
      }

      notifyStatus({ type: "SENDING_TO_SERVER" });
      await this.delay(800);

      // Initialize formHandler if not already initialized
      if (!this.formHandler) {
        this.formHandler = new WellfoundFormHandler(
          this.aiService,
          this.userService,
          this
        );
      }

      // Pass co-pilot mode/state to form handler and set current job title
      if (this.formHandler) {
        this.formHandler.copilotMode = this.copilotState.isInCoPilotMode();
        this.formHandler.copilotState = this.copilotState;
        this.formHandler.currentJobTitle = jobTitle;
        // statusOverlay removed - uses global overlay
      }

      // Initialize appropriate buttons on form page
      if (true) {
        // Global overlay
        if (this.copilotState.isInCoPilotMode()) {
          updateStatusButtons("co-pilot-filling");
        } else {
          updateStatusButtons("auto-pilot");
        }
      }
      const result = await this.formHandler.processApplicationForm();

      if (result.success) {
        if (result.clicked || result.manualSubmit) {
          // Show submitting application message
          notifyStatus({ type: "SUBMITTING_APPLICATION" });

          // Wait for success message to appear in the modal
          const success = await this.verifySubmissionSuccess();

          if (success) {
            await this.handleSuccessfulApplication(jobId);
            return true;
          } else {
            throw new Error("Application submission could not be verified");
          }
        }

        return true;
      } else {
        // Check if it's a location restriction
        if (result.reason === "location_restricted") {
          notifyStatus({
            type: "APPLICATION_SKIPPED",
            data: { title: jobTitle, reason: "Location restriction" },
          });
          await this.delay(2000);

          // Send skip message to background
          this.sendMessage({
            type: "APPLICATION_SKIPPED",
            data: {
              jobId,
              title: jobTitle,
              jobUrl: window.location.href,
              reason: "Location restriction",
            },
          });

          return false;
        }

        throw new Error(result.error || "Application form processing failed");
      }
    } catch (error) {
      console.error("Error in Wellfound apply:", error);
      notifyStatus({ type: "APPLICATION_ERROR" });
      throw error;
    }
  }

  async findApplyButton() {
    try {
      const applyButton = await this.waitForElementWithTimeout(
        'button.styles_applyButton__7gnpI, button[data-test="Button"]:contains("Apply")',
        10000
      ).catch(() => null);

      if (applyButton) {
        return applyButton;
      }

      const allButtons = document.querySelectorAll("button");
      for (const button of allButtons) {
        if (
          button.textContent?.toLowerCase().includes("apply") &&
          !button.textContent?.toLowerCase().includes("applied")
        ) {
          return button;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  async clickApplyButton(button) {
    try {
      this.scrollToElement(button);
      await this.delay(500);

      if (button.disabled || button.classList.contains("disabled")) {
        throw new Error("Apply button is disabled");
      }

      const clickStrategies = [
        () => button.click(),
        () =>
          button.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true })
          ),
        () => {
          button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        },
      ];

      for (const strategy of clickStrategies) {
        try {
          strategy();
          await this.delay(1000);

          const modal = document.querySelector(
            'div[data-test="JobApplication-Modal"]'
          );
          if (modal) {
            return true;
          }
        } catch (error) {
          continue;
        }
      }

      throw new Error("All click strategies failed");
    } catch (error) {
      throw error;
    }
  }

  async handleSuccessfulApplication(jobId) {
    const jobTitle =
      this.extractJobTitle() ||
      document.title.split(" - ")[0] ||
      "Job on Wellfound";
    const companyName = this.extractCompanyName() || "Company on Wellfound";
    const location = this.extractJobLocation() || "Not specified";
    const salary = this.extractSalary() || "Not specified";
    const description = this.extractJobDescription() || "";

    // Send success message to background script
    this.sendMessage({
      type: "APPLICATION_COMPLETED",
      data: {
        jobId,
        title: jobTitle,
        company: companyName,
        location,
        description,
        jobUrl: window.location.href,
        salary: salary,
        workplace: location,
        postedDate: "Not specified",
        applicants: "Not specified",
      },
    });

    this.applicationState.isApplicationInProgress = false;
    this.applicationState.applicationStartTime = null;
  }

  extractJobDescription() {
    const descriptionSelectors = [
      ".styles_description__36q7q",
      ".styles_description__xjvTf",
      '[data-test*="job-description"]',
      ".job-description",
      ".description",
      '[class*="description"]',
    ];

    let description = this.extractTextFromSelectors(descriptionSelectors);

    if (!description) {
      const mainContent = document.querySelector(
        "main, .content, [role='main']"
      );
      if (mainContent) {
        description = mainContent.textContent.trim();
      }
    }

    return description || "No description available";
  }

  extractJobTitle() {
    // First try to extract from the header
    const titleSelectors = [
      "h1.styles_header__ZlR7s",
      ".styles_title__eBz1c h1",
      "h1.text-4xl.font-medium",
      "h1.inline.text-xl.font-semibold.text-black",
      "h1",
      ".job-title",
      ".styles_title__xpQDw",
    ];

    let title = this.extractTextFromSelectors(titleSelectors);

    // If we got the full string with company, extract just the title part
    if (title && title.includes(" at ")) {
      title = title.split(" at ")[0].trim();
    }

    return title || "";
  }

  extractCompanyName() {
    // First check if title contains company name
    const titleElement = document.querySelector(
      "h1.styles_header__ZlR7s, .styles_title__eBz1c h1"
    );
    if (titleElement) {
      const titleText = titleElement.textContent || "";
      if (titleText.includes(" at ")) {
        const parts = titleText.split(" at ");
        if (parts.length > 1) {
          return parts[parts.length - 1].trim();
        }
      }
    }

    // Otherwise use standard selectors
    return this.extractTextFromSelectors([
      'a[rel="noopener noreferrer"] span.text-sm.font-semibold.text-black',
      ".company-name",
      ".text-sm.font-semibold.text-black",
      "h2.inline.text-md.font-semibold",
    ]);
  }

  extractJobLocation() {
    // First check for location-display spans anywhere on the page
    const locationDisplay = document.querySelector(
      '[data-testid="location-display"]'
    );
    if (locationDisplay) {
      return locationDisplay.textContent.trim();
    }

    // Check for "Hires remotely in" section
    const dtElements = document.querySelectorAll(
      ".styles_characteristic__nbbma dt"
    );
    for (const dt of dtElements) {
      if (dt.textContent && dt.textContent.includes("Hires remotely")) {
        const dd = dt.nextElementSibling;
        if (dd) {
          const locationText = dd.textContent.trim();
          if (locationText) {
            return locationText;
          }
        }
      }

      // Also check for "Company Location" field
      if (dt.textContent && dt.textContent.trim() === "Company Location") {
        const dd = dt.nextElementSibling;
        if (dd) {
          return dd.textContent.trim();
        }
      }
    }

    // Check styles_component__Jnlux spans
    const componentLocations = document.querySelectorAll(
      ".styles_component__Jnlux span"
    );
    for (const span of componentLocations) {
      const text = span.textContent?.trim();
      if (text && text.length > 0 && !text.includes("•")) {
        return text;
      }
    }

    // Fallback to standard location selectors
    return this.extractTextFromSelectors([
      ".styles_location__O9Z62",
      ".location",
      "[data-testid='location']",
    ]);
  }

  extractSalary() {
    // Check for salary in the subheader first
    const subheaderSelectors = [".styles_subheader__DfKjh"];

    let salary = this.extractTextFromSelectors(subheaderSelectors);

    if (!salary) {
      // Fallback to standard selectors
      salary = this.extractTextFromSelectors([
        ".styles_compensation__3JnvU",
        ".compensation",
        ".salary",
      ]);
    }

    return salary || "";
  }

  extractJobType() {
    // Check for job type in characteristics
    const dtElements = document.querySelectorAll(
      ".styles_characteristic__nbbma dt"
    );
    for (const dt of dtElements) {
      if (dt.textContent && dt.textContent.trim() === "Job type") {
        const dd = dt.nextElementSibling;
        if (dd) {
          return dd.textContent.trim();
        }
      }
    }

    return "";
  }

  extractWorkMode() {
    // Check for remote work policy
    const dtElements = document.querySelectorAll(
      ".styles_characteristic__nbbma dt"
    );
    for (const dt of dtElements) {
      if (dt.textContent && dt.textContent.trim() === "Remote work policy") {
        const dd = dt.nextElementSibling;
        if (dd) {
          return dd.textContent.trim();
        }
      }
    }

    return "";
  }

  extractExperience() {
    // Check for experience in characteristics
    const dtElements = document.querySelectorAll(
      ".styles_characteristic__nbbma dt"
    );
    for (const dt of dtElements) {
      if (dt.textContent && dt.textContent.trim() === "Experience") {
        const dd = dt.nextElementSibling;
        if (dd) {
          return dd.textContent.trim();
        }
      }
    }

    return "";
  }

  extractIndustry() {
    // Wellfound doesn't typically show industry on job pages, but we can try to infer from company info
    // This might need to be extracted from company profile if available
    return "";
  }

  extractRequirements() {
    // Extract requirements from job description
    const descriptionElement = document.querySelector(
      ".styles_description__36q7q"
    );
    if (descriptionElement) {
      const allText = descriptionElement.textContent || "";

      // Look for common requirement section headers
      const requirementKeywords = [
        "Required",
        "Requirements",
        "Qualifications",
        "Must have",
        "Skills",
      ];

      for (const keyword of requirementKeywords) {
        if (allText.includes(keyword)) {
          // Try to extract the section after the keyword
          const sections = allText.split(keyword);
          if (sections.length > 1) {
            // Get the section after the keyword and before the next major section
            const requirementSection = sections[1].split(
              /Main responsibilities|Responsibilities|Benefits|About/i
            )[0];
            return requirementSection.trim();
          }
        }
      }
    }

    return "";
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
        jobType: jobInfo.type || this.extractJobType() || "",
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
    const salaryText = jobInfo.compensation || jobInfo.salary || "";

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

  extractTextFromSelectors(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent) {
        return element.textContent.trim();
      }
    }
    return "";
  }

  extractJobIdFromUrl(url) {
    try {
      const match = url.match(/\/jobs\/(\d+)/);
      return match ? match[1] : null;
    } catch (error) {
      return null;
    }
  }

  async loadMoreJobs() {
    try {
      const initialJobCount = document.querySelectorAll(
        ".styles_component__uTjje"
      ).length;

      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "smooth",
      });

      await this.delay(3000);

      const newJobCount = document.querySelectorAll(
        ".styles_component__uTjje"
      ).length;

      if (newJobCount > initialJobCount) {
        return true;
      }

      const loadMoreSelectors = [
        'button[data-test*="load-more"]',
        'button[data-test*="show-more"]',
        'button:contains("Load More")',
        'button:contains("Show More")',
        'button:contains("See More")',
        ".load-more-button",
        ".show-more-button",
      ];

      for (const selector of loadMoreSelectors) {
        const buttons = document.querySelectorAll(selector);
        for (const button of buttons) {
          if (button && !button.disabled && this.isElementVisible(button)) {
            await this.clickElementReliably(button);
            await this.delay(3000);

            const finalJobCount = document.querySelectorAll(
              ".styles_component__uTjje"
            ).length;
            if (finalJobCount > newJobCount) {
              return true;
            }
          }
        }
      }

      const nextPageSelectors = [
        'a[aria-label="Next"]',
        'a[data-test*="next"]',
        'button[aria-label="Next"]',
        ".pagination .next:not(.disabled)",
        'a[rel="next"]',
      ];

      for (const selector of nextPageSelectors) {
        const nextButton = document.querySelector(selector);
        if (
          nextButton &&
          !nextButton.disabled &&
          !nextButton.classList.contains("disabled")
        ) {
          await this.clickElementReliably(nextButton);
          await this.delay(4000);

          const pageJobCount = document.querySelectorAll(
            ".styles_component__uTjje"
          ).length;
          if (pageJobCount > 0) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      return false;
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

  async clickElementReliably(element) {
    const strategies = [
      () => element.click(),
      () =>
        element.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true })
        ),
      () => {
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      },
      () => {
        element.focus();
        element.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        );
      },
    ];

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    await this.delay(500);

    for (const strategy of strategies) {
      try {
        strategy();
        await this.delay(1000);
        return true;
      } catch (error) {
        continue;
      }
    }

    throw new Error("All click strategies failed");
  }

  normalizeUrl(url) {
    try {
      if (!url) return "";

      return url
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "")
        .trim();
    } catch (error) {
      return url;
    }
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async wait(ms) {
    return this.delay(ms);
  }

  /**
   * Verify if the application was submitted successfully
   * Watches for DOM changes and detects the success message in the modal
   */
  async verifySubmissionSuccess() {
    try {
      console.log("🔍 Waiting for submission success message...");

      // Wait for success message to appear (with timeout)
      const success = await this.waitForSuccessMessage(15000); // 15 second timeout

      if (success) {
        console.log("✅ Success message detected!");
        return true;
      } else {
        console.log("❌ Success message not detected within timeout");
        return false;
      }
    } catch (error) {
      console.error("❌ Error verifying submission:", error);
      return false;
    }
  }

  /**
   * Wait for success message to appear in the DOM
   * Uses MutationObserver to watch for changes in the modal
   */
  async waitForSuccessMessage(timeout = 15000) {
    return new Promise((resolve) => {
      // Check if success message already exists
      const checkSuccess = () => {
        // Look for the success message in the modal
        const modal = document.querySelector(".styles_modal__MFCOh");
        if (modal) {
          const modalText = modal.textContent || "";

          // Check for success text
          if (
            modalText.includes("Success! Your application has been sent") ||
            (modalText.includes("Success!") &&
              modalText.includes("application has been sent"))
          ) {
            console.log("✅ Found success message in modal");
            return true;
          }
        }

        // Also check for the specific success text element
        const successElements = document.querySelectorAll(
          ".styles_successText__gph6A, .styles_infoHeader__1bFjL"
        );
        for (const element of successElements) {
          const text = element.textContent || "";
          if (
            text.includes("Success! Your application has been sent") ||
            text.includes("application has been sent")
          ) {
            console.log(
              "✅ Found success message in element:",
              text.substring(0, 50)
            );
            return true;
          }
        }

        return false;
      };

      // Check immediately
      if (checkSuccess()) {
        resolve(true);
        return;
      }

      // Set up mutation observer to watch for DOM changes
      const observer = new MutationObserver(() => {
        if (checkSuccess()) {
          observer.disconnect();
          clearTimeout(timeoutId);
          resolve(true);
        }
      });

      // Start observing the document for changes
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        observer.disconnect();
        console.log("⏱️ Timeout waiting for success message");
        resolve(false);
      }, timeout);
    });
  }

  scrollToElement(element) {
    if (!element) return;

    try {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    } catch (error) {
      element.scrollIntoView();
    }
  }

  async waitForValidPage(timeout = 30000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const url = window.location.href;

      if (url.includes("wellfound.com/jobs")) {
        await this.detectPageTypeAndStart();
        return;
      }

      await this.delay(1000);
    }

    throw new Error("Timeout waiting for valid Wellfound page");
  }

  errorToString(e) {
    if (e instanceof Error) {
      return e.stack || e.message;
    }
    return String(e);
  }

  platformSpecificUrlNormalization(url) {
    try {
      const urlObj = new URL(url);
      const essentialParams = ["utm_source"];
      const newSearchParams = new URLSearchParams();

      for (const param of essentialParams) {
        if (urlObj.searchParams.has(param)) {
          newSearchParams.set(param, urlObj.searchParams.get(param));
        }
      }

      urlObj.search = newSearchParams.toString();
      return urlObj.toString();
    } catch (error) {
      return url;
    }
  }

  reportError(error, context = {}) {
    try {
      const errorData = {
        error: this.errorToString(error),
        context,
        timestamp: Date.now(),
        url: window.location.href,
        platform: this.platform,
      };

      this.sendMessage({
        type: "ERROR",
        data: errorData,
      });
    } catch (reportingError) {
      return;
    }
  }

  cleanup() {
    if (super.cleanup) {
      super.cleanup();
    }

    // Clean up chatbot overlay
    if (true) {
      // Global overlay
      // Global overlay - cleanup handled automatically
      // Global overlay - no local instance needed
    }

    this.jobQueue = [];
    this.currentJobIndex = 0;
    this.isLoadingMore = false;
    this.queueInitialized = false;
    this.searchProcessStarted = false;
  }

  log(message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [WellfoundPlatform] ${message}`;

    if (data) {
      console.log(logMessage, data);
    } else {
      console.log(logMessage);
    }
  }

  /**
   * Close the application modal (Wellfound uses modals instead of separate tabs)
   */
  closeApplicationModal() {
    try {
      // Strategy 1: Look for close button in modal
      const closeButtonSelectors = [
        'button[aria-label="Close"]',
        'button[aria-label="close"]',
        'button[data-test*="close"]',
        'button[data-test*="Close"]',
        '.ReactModal__Content button[aria-label*="close"]',
        '.ReactModal__Content button[aria-label*="Close"]',
      ];

      for (const selector of closeButtonSelectors) {
        const closeButton = document.querySelector(selector);
        if (closeButton) {
          console.log(`✅ Found close button with selector: ${selector}`);
          closeButton.click();
          return true;
        }
      }

      // Strategy 2: Press Escape key to close modal
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          keyCode: 27,
          bubbles: true,
        })
      );
      document.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "Escape",
          keyCode: 27,
          bubbles: true,
        })
      );
      console.log("✅ Sent Escape key to close modal");
      return true;
    } catch (error) {
      console.error("❌ Error closing application modal:", error);
      return false;
    }
  }

  handleCoPilotAction(data) {
    try {
      const { action } = data || {};
      if (!action) return;

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

        case COPILOT_ACTIONS.SKIP:
          // Only handle skip when in an application modal, not on search page
          const isInApplicationModal =
            document.querySelector(".ReactModal__Content") ||
            document.querySelector('[role="dialog"]') ||
            this.formHandler?.isActive;

          if (isInApplicationModal) {
            if (this.formHandler) {
              this.formHandler.resolveUserAction("SKIP");
            }
            if (true) {
              // Global overlay
              notifyStatus({
                type: "JOB_SKIPPED",
                data: {
                  title: this.formHandler?.currentJobTitle || "this job",
                },
              });
            }

            // Get current job data
            const currentJob = this.jobQueue?.[this.currentJobIndex] || {};

            // Send skip message but tell background NOT to close tab (Wellfound uses modals)
            this.sendMessage({
              type: "APPLICATION_SKIPPED",
              data: {
                url: currentJob.url || window.location.href,
                jobUrl: currentJob.url,
                reason: "User clicked skip button",
                skipReason: "user_skip",
                jobTitle:
                  this.formHandler?.currentJobTitle ||
                  currentJob.title ||
                  "Unknown job",
                platform: "wellfound",
                useModal: true, // Tell background this uses modals, don't close tab
              },
            });

            // Close only the modal, not the entire tab
            setTimeout(() => {
              this.closeApplicationModal();
            }, 500);
          } else {
            console.log(
              "⚠️ Skip button clicked outside application modal, ignoring"
            );
          }
          break;

        case COPILOT_ACTIONS.TAKE_CONTROL:
          if (this.formHandler) {
            this.formHandler.userHasControl = true;
            this.formHandler.resolveUserAction("TAKE_CONTROL");
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
          if (this.formHandler) {
            this.formHandler.userHasControl = false;
            this.formHandler.resolveUserAction("LET_AI_CONTINUE");
          }
          if (true) {
            // Global overlay
            notifyStatus({
              type: "COPILOT_AI_CONTINUING",
              data: { title: this.formHandler?.currentJobTitle || "this job" },
            });
            updateStatusButtons("co-pilot-filling");
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
          break;
      }
    } catch (e) {
      console.error("Error in handleCoPilotAction:", e);
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
}
