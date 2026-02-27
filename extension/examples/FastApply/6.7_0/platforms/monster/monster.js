// platforms/monster/monster.js
import { MonsterFormHandler } from "./monster-form-handler.js";
import { MonsterFileHandler } from "./monster-file-handler.js";
import { AIService } from "../../services/index.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";

class ApplicationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "ApplicationError";
    this.details = details;
  }
}

class SkipApplicationError extends ApplicationError {
  constructor(message) {
    super(message);
    this.name = "SkipApplicationError";
  }
}

export default class MonsterPlatform {
  constructor(config) {
    // Initialize from BasePlatform
    this.sessionId = config.sessionId;
    this.platform = config.platform || "monster";
    this.userId = config.userId;
    this.contentScript = config.contentScript;
    this.config = config.config || {};

    // Initialize AI Service
    this.aiService = new AIService({
      apiHost:
        config.aiApiHost || config.sessionContext?.sessionConfig?.aiApiHost,
      platform: this.platform,
    });

    // State from BasePlatform
    this.isRunning = false;
    this.isPaused = false;
    this.currentJob = null;
    this.progress = {
      total: this.config.jobsToApply || 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      current: null,
    };

    // Callbacks
    this.onProgress = null;
    this.onError = null;
    this.onComplete = null;
    this.onApplicationSubmitted = null;
    this.onDOMChange = null;
    this.onNavigation = null;
    this.devMode =
      config.devMode ||
      config.config?.devMode ||
      config.sessionContext?.devMode ||
      false;

    // Initialize from BasePlatformAutomation
    this.userProfile =
      this.getInjectedUserProfile() ||
      config.userProfile ||
      config.sessionContext?.userProfile ||
      null;
    this.sessionContext = config.sessionContext || null;
    this.hasSessionContext = !!this.sessionContext;

    // Communication state
    this.port = null;
    this.connectionRetries = 0;
    this.maxRetries = 3;

    // Application state
    this.applicationState = {
      isApplicationInProgress: false,
      applicationStartTime: null,
      applicationUrl: null,
      processedUrls: new Set(),
      processedLinksCount: 0,
    };

    // Search data
    this.searchData = {
      limit: 0,
      current: 0,
      domain: this.getPlatformDomains(),
      submittedLinks: [],
      searchLinkPattern: this.getSearchLinkPattern(),
    };

    // Timers
    this.healthCheckTimer = null;
    this.keepAliveInterval = null;
    this.sendCvPageNotRespondTimeout = null;
    this.stuckStateTimer = null;
    this.stateVerificationInterval = null;

    // Monster-specific initialization
    this.baseUrl = "https://www.monster.com";
    this.LINKS_SELECTOR = '[class^=job-search-results-style] article';
    this.BUTTON_SELECTOR = 'button[data-testid="quick-apply-button"]';

    // Initialize Co-Pilot state
    this.copilotState = new CoPilotState();

    this.fileHandler = null;
    this.formHandler = null;
    this.reason = "";
    this.currentJobId = null;

    // Cached job description (scraped before clicking Apply button)
    this.cachedJobDescription = null;

    // Previous job data for deduplication
    this.previousCompany = '';
    this.previousRole = '';
    this.previousDescription = '';
    this.firstFound = false;

    // Setup error recovery
    this._errorCount = 0;
    this._debounceTimers = new Map();
    this._lastErrorTime = null;
  }

  // ========================================
  // BASE PLATFORM METHODS (from BasePlatform)
  // ========================================

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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

  log(message, data = {}) {
    const logEntry = `🤖 [${this.platform}-${this.sessionId?.slice(
      -6
    )}] ${message}`;
    console.log(logEntry, data);
  }

  getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async getAIAnswer(
    question,
    options = [],
    fieldElement = null,
    additionalContext = {}
  ) {
    const context = {
      platform: this.platform,
      userData: this.userData || this.userProfile,
      jobDescription: this.cachedJobDescription || this.jobDescription || "",
      fieldElement,
      ...additionalContext,
    };

    return await this.aiService.getAnswer(question, options, context);
  }

  scrapeJobDescription() {
    try {
      // Monster job description selectors
      const descriptionSelectors = [
        '[data-testid="svx-description-container-inner"]',
        '[data-testid="jobDescription"]',
        '.job-description',
        '[class*="description"]',
      ];

      for (const selector of descriptionSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const text = element.textContent?.trim();
          if (text && text.length > 50) {
            console.log("📄 Scraped job description length:", text.length);
            return text;
          }
        }
      }

      return "";
    } catch (error) {
      console.error("Error scraping job description:", error);
      return "";
    }
  }

  // ========================================
  // BASE PLATFORM AUTOMATION METHODS
  // ========================================

  getInjectedUserProfile() {
    try {
      if (window.automationContext?.userProfile) {
        return window.automationContext.userProfile;
      }

      if (typeof window !== "undefined" && window.automationUserProfile) {
        return window.automationUserProfile;
      }

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

  getInjectedApiHost() {
    return this.getInjectedAiApiHost();
  }

  getUserId() {
    return this.userProfile?.userId || null;
  }

  getJwtToken() {
    try {
      if (typeof window !== "undefined" && window.automationJwtToken) {
        return window.automationJwtToken;
      }

      if (typeof sessionStorage !== "undefined") {
        const stored = sessionStorage.getItem("automationJwtToken");
        if (stored) {
          return stored;
        }
      }

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

  async waitForContext(timeout = 5000) {
    return new Promise((resolve) => {
      if (window.automationContext) {
        this.sessionContext = window.automationContext;
        this.hasSessionContext = true;
        resolve(this.sessionContext);
        return;
      }

      try {
        const stored = sessionStorage.getItem("automationContext");
        if (stored) {
          this.sessionContext = JSON.parse(stored);
          this.hasSessionContext = true;
          window.automationContext = this.sessionContext;
          resolve(this.sessionContext);
          return;
        }
      } catch (e) {
        console.warn("Error reading context from sessionStorage:", e);
      }

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
          this.sessionContext = event.detail;
          this.hasSessionContext = true;
          resolve(this.sessionContext);
        },
        { once: true, signal: controller.signal }
      );
    });
  }

  async pauseAutomation() {
    this.isRunning = false;
    this.isPaused = true;

    if (this.sendCvPageNotRespondTimeout) {
      clearTimeout(this.sendCvPageNotRespondTimeout);
      this.sendCvPageNotRespondTimeout = null;
    }

    this.sendToBackground({
      type: "AUTOMATION_PAUSED",
      sessionId: this.sessionId,
    });
  }

  async resumeAutomation() {
    this.isRunning = true;
    this.isPaused = false;

    console.log("▶️ Automation resumed by user");

    this.sendToBackground({
      type: "AUTOMATION_RESUMED",
      sessionId: this.sessionId,
    });

    setTimeout(() => {
      if (!this.applicationState.isApplicationInProgress) {
        this.searchNext();
      }
    }, 1000);
  }

  async stopAutomation() {
    this.isRunning = false;
    this.isPaused = false;

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

    this.sendToBackground({
      type: "AUTOMATION_STOPPED",
      reason: "user_requested",
      sessionId: this.sessionId,
    });
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
        this.applicationState.isApplicationInProgress &&
        this.applicationState.applicationStartTime
      ) {
        const applicationTime =
          now - this.applicationState.applicationStartTime;

        if (applicationTime > 5 * 60 * 1000) {
          console.log("🚨 Application stuck for over 5 minutes, forcing reset");
          this.applicationState.isApplicationInProgress = false;
          this.applicationState.applicationStartTime = null;
          setTimeout(() => this.searchNext(), 1000);
        }
      }
    } catch (error) {
      console.log("❌ Health check error", error);
    }
  }

  // ========================================
  // MESSAGE HANDLING
  // ========================================

  sendToBackground(message) {
    try {
      return chrome.runtime.sendMessage({
        ...message,
        sessionId: this.sessionId,
        platform: this.platform,
      });
    } catch (error) {
      console.error("Error sending to background:", error);
    }
  }

  async handleMessage(request, sendResponse) {
    const { type, action, data } = request;
    const messageType = type || action;

    console.log(`🔔 Monster received message: ${messageType}`);

    switch (messageType) {
      case "SEARCH_NEXT":
        this.handleSearchNext(data);
        sendResponse({ success: true });
        break;

      case "START_AUTOMATION_NOW":
        await this.startApplication(data);
        sendResponse({ success: true });
        break;

      case "CONTROL_ACTION":
        await this.handleControlAction(request.action);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: `Unknown message type: ${messageType}` });
    }
  }

  async handleControlAction(action) {
    console.log(`🎮 Control action: ${action}`);

    switch (action) {
      case COPILOT_ACTIONS.SWITCH_TO_COPILOT:
        this.copilotState.switchToCoPilot();
        if (this.formHandler) {
          this.formHandler.copilotMode = true;
        }
        break;

      case COPILOT_ACTIONS.SWITCH_TO_AUTOPILOT:
        this.copilotState.switchToAutoPilot();
        if (this.formHandler) {
          this.formHandler.copilotMode = false;
        }
        break;

      case COPILOT_ACTIONS.SUBMIT:
        if (this.formHandler) {
          this.formHandler.resolveUserAction("SUBMIT");
        }
        break;

      case COPILOT_ACTIONS.SKIP:
        if (this.formHandler) {
          this.formHandler.resolveUserAction("SKIP");
        }
        break;

      case COPILOT_ACTIONS.PAUSE:
        await this.pauseAutomation();
        break;

      case COPILOT_ACTIONS.RESUME:
        await this.resumeAutomation();
        break;
    }
  }

  handleApplicationStarting(data) {
    console.log("🚀 Application starting:", data);

    this.applicationState.isApplicationInProgress = true;
    this.applicationState.applicationStartTime = Date.now();
    this.applicationState.applicationUrl = data?.url;
  }

  handleSearchNext(data) {
    console.log("🔄 Received search next notification", data);

    if (this.sendCvPageNotRespondTimeout) {
      clearTimeout(this.sendCvPageNotRespondTimeout);
      this.sendCvPageNotRespondTimeout = null;
    }

    this.applicationState.isApplicationInProgress = false;
    this.applicationState.applicationStartTime = null;
    this.applicationState.processedLinksCount++;

    this.sendToBackground({ type: "SEARCH_NEXT_READY" });

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

    if (!data || !data.url) {
      console.log("No URL data in handleSearchNext");
      setTimeout(() => this.searchNext(), 2500);
      return;
    }

    this.updateLinkStatus(data);
    this.recordSubmission(data);
    setTimeout(() => this.searchNext(), 2500);
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  async initialize() {
    console.log("🔧 Initializing Monster platform...");

    // Wait for page load
    await this.waitForPageLoad();

    // Get session context
    if (!this.hasSessionContext) {
      await this.waitForContext();
    }

    // Initialize handlers
    const aiApiHost = this.getInjectedAiApiHost() || this.sessionContext?.aiApiHost;
    const backendApiHost = this.getInjectedBackendApiHost() || this.sessionContext?.backendApiHost;
    const jwtToken = this.getJwtToken();

    this.fileHandler = new MonsterFileHandler({
      preferences: this.sessionContext?.preferences || this.config?.preferences,
      backendApiHost,
      aiApiHost,
      jwtToken,
    });

    const copilotMode = this.sessionContext?.preferences?.copilotMode ||
                        this.config?.preferences?.copilotMode || false;
    if (copilotMode) {
      this.copilotState.switchToCoPilot();
    }

    this.formHandler = new MonsterFormHandler(
      this.aiService,
      this.userProfile,
      {
        copilotMode,
        copilotState: this.copilotState,
        logger: (msg) => this.log(msg.type || msg),
      }
    );

    // Start health check
    this.startHealthCheck();

    console.log("✅ Monster platform initialized");
  }

  async start() {
    console.log("🚀 Starting Monster automation...");
    console.log("📍 Current URL:", window.location.href);

    this.isRunning = true;

    // Set up message listeners for control actions
    this.setupMessageListeners();

    // Check if on search page or apply page
    const currentUrl = window.location.href;

    if (currentUrl.includes('/jobs/search') || currentUrl.includes('monster.com/jobs?')) {
      // On search page - start search flow
      console.log("📋 Detected Monster search page");
      await this.startSearchFlow();
    } else if (currentUrl.includes('/jobs/apply') || currentUrl.includes('/apply/')) {
      // On apply page - start application flow
      console.log("📝 Detected Monster apply page");
      await this.startApplication({ url: currentUrl });
    } else if (currentUrl.includes('/jobs/apply-complete') || currentUrl.includes('/apply-complete')) {
      // On success page
      console.log("✅ Detected Monster success page");
      this.handleApplicationSuccess({ url: currentUrl });
    } else {
      // Try to detect page type from DOM
      console.log("📍 Checking DOM for page type detection...");
      await this.detectPageTypeAndStart();
    }
  }

  setupMessageListeners() {
    // Listen for DOM events from the overlay
    document.addEventListener("copilot-control-action", (event) => {
      const { action } = event.detail || {};
      if (action) {
        console.log("🎮 Received copilot-control-action DOM event:", action);
        this.handleControlAction(action);
      }
    });

    // Listen for chrome.runtime messages
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message) return true;

      const messageType = message.type || message.action;
      console.log(`🔔 Monster received message: ${messageType}`);

      if (messageType === "CONTROL_ACTION") {
        this.handleControlAction(message.action);
      } else if (messageType === "SEARCH_NEXT") {
        this.handleSearchNext(message.data);
      } else if (messageType === "START_AUTOMATION_NOW") {
        this.startApplication(message.data);
      }

      sendResponse({ success: true });
      return true;
    });
  }

  async detectPageTypeAndStart() {
    // Check for job cards on page
    const jobCards = document.querySelectorAll('[data-testid="JobCardButton"], [class*="job-search-results"] article, [data-testid="svx-job-view-wrapper"]');
    if (jobCards.length > 0) {
      console.log(`📋 Found ${jobCards.length} job cards - treating as search page`);
      await this.startSearchFlow();
      return;
    }

    // Check for application form
    const applicationForm = document.querySelector('#loading-container, [class*="apply-form"], form[data-testid]');
    if (applicationForm) {
      console.log("📝 Found application form - treating as apply page");
      await this.startApplication({ url: window.location.href });
      return;
    }

    console.log("📍 Could not detect page type from DOM");
  }

  async startSearchFlow() {
    console.log("🔍 Starting search flow...");

    // Give page time to render
    await this.delay(2000);

    // Try multiple selectors for job card CONTAINERS (not just buttons)
    // We need containers that include both job info AND the Quick Apply button
    const jobCardSelectors = [
      '[data-testid="JobCardComponent"]',  // The actual card component container
      '[class*="JobCardComponent"]',
      'article[class*="job"]',
      '[data-testid="svx-search-results-list"] > div > div',
      '#card-scroll-container > div > div',
      '[class*="job-search-results"] > div > div',
      '[data-testid="JobCardButton"]',  // Fallback to button itself
    ];

    let foundElement = null;
    for (const selector of jobCardSelectors) {
      const elements = document.querySelectorAll(selector);
      console.log(`🔍 Checking selector "${selector}": found ${elements.length} elements`);
      if (elements.length > 0) {
        foundElement = elements[0];
        // Update the LINKS_SELECTOR to use the working selector
        this.LINKS_SELECTOR = selector;
        break;
      }
    }

    if (!foundElement) {
      // Check for empty results message
      const emptyMessage = document.querySelector('[data-test-id="message-empty"], [class*="no-results"], [class*="empty"]');
      if (emptyMessage) {
        console.log("📭 No jobs found on this search");
        notifyStatus({ type: "NO_JOBS_FOUND" });
        this.sendToBackground({ type: "SEARCH_COMPLETED" });
        return;
      }

      console.log("⚠️ Could not find job cards with any known selector");
      console.log("📋 Page HTML structure sample:", document.body.innerHTML.substring(0, 2000));
      return;
    }

    console.log(`✅ Found job cards using selector: ${this.LINKS_SELECTOR}`);

    // Check if user is logged in
    const isLoggedIn = await this.checkLoginStatus();
    if (!isLoggedIn) {
      notifyStatus({
        type: "LOGIN_REQUIRED",
        data: { platform: "Monster" },
      });
      console.log("⚠️ User not logged in to Monster");
      return;
    }

    // Show automation starting status
    notifyStatus({
      type: "JOB_SEARCH_STARTED",
      data: { preferences: this.config?.preferences || {} },
    });

    // Start searching for jobs
    await this.searchNext();
  }

  async checkLoginStatus() {
    try {
      const header = document.querySelector('header');
      if (!header) return true;
      return !header.innerHTML.includes('mode=Login"');
    } catch (error) {
      return true;
    }
  }

  // ========================================
  // SEARCH FUNCTIONALITY
  // ========================================

  async searchNext() {
    try {
      if (this.isPaused) {
        console.log("Automation is paused, not searching");
        return;
      }

      console.log("Executing searchNext");

      if (this.applicationState.isApplicationInProgress) {
        console.log("Application in progress, not searching for next link");
        return;
      }

      // Check for empty results
      const emptyMessage = document.querySelector('[class^=search-results-tab-] [data-test-id="message-empty"]');
      if (emptyMessage) {
        console.log("No jobs found");
        this.sendToBackground({ type: "SEARCH_COMPLETED" });
        return;
      }

      let links = this.findAllLinksElements();
      console.log(`Found ${links.length} job cards`);

      const unprocessedLink = await this.findUnprocessedLink(links);

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

  findAllLinksElements() {
    try {
      return [...document.querySelectorAll(this.LINKS_SELECTOR)];
    } catch (err) {
      console.log("Error finding links:", err);
      return [];
    }
  }

  /**
   * Alternative approach: Find all Quick Apply buttons first, then get job info
   * This works better for Monster's DOM structure where job cards and apply buttons
   * may not be in the same container
   */
  findAllQuickApplyJobs() {
    const jobs = [];

    // Find all Quick Apply buttons
    const quickApplyButtons = document.querySelectorAll(
      'button[data-testid="quick-apply-button"], ' +
      'a[data-testid="quick-apply-button"], ' +
      'button[aria-label*="Quick Apply"], ' +
      'button[aria-label*="quick apply"]'
    );

    console.log(`🔍 Found ${quickApplyButtons.length} Quick Apply buttons on page`);

    for (const btn of quickApplyButtons) {
      // Find the job container by going up the DOM tree
      let container = btn.parentElement;
      let jobTitleLink = null;
      let foundContainer = null;

      // Go up to find a container that has the job title link
      for (let level = 0; level < 10 && container; level++) {
        // Look for job title link in this container
        const titleSelectors = [
          'a[data-testid="jobTitle"]',
          'a[href*="/job-openings/"]',
          'a[class*="job-title"]',
        ];

        for (const selector of titleSelectors) {
          jobTitleLink = container.querySelector(selector);
          if (jobTitleLink?.href) {
            foundContainer = container;
            break;
          }
        }

        if (jobTitleLink?.href) break;
        container = container.parentElement;
      }

      if (jobTitleLink?.href && foundContainer) {
        jobs.push({
          quickApplyBtn: btn,
          container: foundContainer,
          url: jobTitleLink.href,
          titleElement: jobTitleLink,
        });
      }
    }

    return jobs;
  }

  async findUnprocessedLink(links) {
    // Use the new approach: find Quick Apply jobs directly
    const quickApplyJobs = this.findAllQuickApplyJobs();

    console.log(`🔍 Finding unprocessed link from ${quickApplyJobs.length} Quick Apply jobs, starting at index ${this.applicationState.processedLinksCount}`);

    for (let i = this.applicationState.processedLinksCount; i < quickApplyJobs.length; i++) {
      const job = quickApplyJobs[i];
      const { quickApplyBtn, container, url, titleElement } = job;

      // Skip if already processed
      if (quickApplyBtn.classList.contains('fastapply-processed')) {
        continue;
      }

      // Check if already processed by URL
      if (this.isLinkProcessed(url)) {
        console.log(`⏭️ Job ${url} already processed, skipping`);
        quickApplyBtn.classList.add('fastapply-processed');
        this.applicationState.processedLinksCount = i + 1;
        continue;
      }

      console.log(`✅ Found unprocessed Quick Apply job at index ${i}: ${url}`);
      return {
        element: container,
        url,
        index: i,
        quickApplyBtn,
        titleElement
      };
    }

    return null;
  }

  isLinkProcessed(url) {
    const alreadyProcessed = this.searchData.submittedLinks.some((link) => {
      if (!link.url) return false;
      return this.urlsMatch(link.url, url);
    });

    const inLocalCache =
      this.applicationState.processedUrls &&
      this.applicationState.processedUrls.has(url);

    return alreadyProcessed || inLocalCache;
  }

  async processJobLink({ element, url, index, quickApplyBtn }) {
    console.log("🔄 Processing job link:", url);

    if (this.isPaused) {
      console.log("⏸️ Automation paused, aborting");
      return;
    }

    // Scroll to the job card
    this.scrollToElement(element);
    await this.delay(2000);

    // Click on the job card to load details - try multiple selectors
    const cardClickSelectors = [
      'button[data-testid="JobCardButton"]',
      '[data-testid="job-card"]',
      'a[data-testid="jobTitle"]',
      '.job-card',
      'article',
    ];

    let clicked = false;
    for (const selector of cardClickSelectors) {
      const clickTarget = selector === 'article' ? element : element.querySelector(selector);
      if (clickTarget) {
        try {
          clickTarget.click();
          clicked = true;
          console.log(`✅ Clicked job card using selector: ${selector}`);
          break;
        } catch (e) {
          console.log(`❌ Failed to click with selector ${selector}:`, e.message);
        }
      }
    }

    if (!clicked) {
      // Try clicking the element itself
      try {
        element.click();
        console.log("✅ Clicked job card element directly");
      } catch (e) {
        console.log("❌ Could not click job card");
      }
    }

    // Wait for job details to load
    await this.delay(3000);

    // Store the Quick Apply button reference for later use
    this.currentQuickApplyBtn = quickApplyBtn;

    // Extract job details with multiple selector fallbacks
    const companySelectors = [
      '[data-testid="svx-job-view-wrapper"] [data-testid="company"]',
      '[data-testid="company"]',
      '[class*="company-name"]',
      '.company-name',
      'a[href*="/company/"]',
    ];

    const titleSelectors = [
      '[data-testid="svx-job-view-wrapper"] [data-testid="jobTitle"]',
      '[data-testid="jobTitle"]',
      '[class*="job-title"]',
      '.job-title',
      'h1',
      'h2',
    ];

    const descriptionSelectors = [
      '[data-testid="svx-job-view-wrapper"] [data-testid="svx-description-container-inner"]',
      '[data-testid="svx-description-container-inner"]',
      '[data-testid="jobDescription"]',
      '[class*="job-description"]',
      '.job-description',
      '[class*="description"]',
    ];

    let company = null;
    for (const selector of companySelectors) {
      const el = document.querySelector(selector);
      if (el?.innerText?.trim()) {
        company = el.innerText.trim();
        break;
      }
    }

    let role = null;
    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el?.innerText?.trim()) {
        role = el.innerText.trim();
        break;
      }
    }

    let description = null;
    for (const selector of descriptionSelectors) {
      const el = document.querySelector(selector);
      if (el?.innerText?.trim()) {
        description = el.innerText.trim();
        break;
      }
    }

    console.log(`📋 Job details - Company: ${company}, Role: ${role}, Description length: ${description?.length || 0}`);

    // Skip if same as previous (deduplication)
    if (company === this.previousCompany && role === this.previousRole) {
      console.log("Duplicate job, skipping");
      this.applicationState.processedLinksCount = index + 1;
      setTimeout(() => this.searchNext(), 1000);
      return;
    }

    this.previousCompany = company;
    this.previousRole = role;
    this.previousDescription = description;

    // Cache job description for form filling
    this.cachedJobDescription = description;

    // Mark as in progress
    this.markLinkAsColor(element, "green", "In Progress");

    this.applicationState.isApplicationInProgress = true;
    this.applicationState.applicationStartTime = Date.now();
    this.applicationState.processedUrls.add(url);
    this.applicationState.processedLinksCount = index + 1;

    this.setStuckDetectionTimeout();

    if (!this.firstFound) {
      notifyStatus({
        type: "SEARCHING",
        data: { message: "Found relevant job openings. Starting auto-apply..." },
      });
      this.firstFound = true;
      await this.delay(2000);
    }

    // Random delay before applying (25-35 seconds)
    const delaySeconds = Math.round(25 + (Math.random() * 11));
    console.log(`⏳ Waiting ${delaySeconds} seconds before applying...`);
    await this.delay(delaySeconds * 1000);

    if (this.isPaused) {
      console.log("Automation paused during delay, aborting");
      return;
    }

    // Send to background to open application tab
    try {
      this.sendToBackground({
        type: "START_APPLICATION",
        data: {
          jobId: this.extractJobIdFromUrl(url),
          url,
          title: role,
          company,
        },
      });
    } catch (err) {
      this.handleJobTaskError(err, url, element);
    }
  }

  scrollToElement(element) {
    try {
      const container = document.getElementById('card-scroll-container');
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const offset = elementRect.top - containerRect.top;
        container.scrollTop += offset;

        const scrollEvent = new Event('scroll', {
          bubbles: true,
          cancelable: true,
        });
        container.dispatchEvent(scrollEvent);
      } else {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (e) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  async handleNoUnprocessedLinks() {
    if (this.applicationState.isApplicationInProgress) {
      console.log("Application in progress, aborting navigation");
      return;
    }

    // Check for "no more results" button
    const noMoreResults = document.querySelector('button[data-testid="svx-no-more-results-disabled-button"]');
    if (noMoreResults) {
      console.log("All available jobs processed");
      this.sendToBackground({ type: "SEARCH_COMPLETED" });
      return;
    }

    // Try to scroll for more results (infinite scroll)
    try {
      const container = document.getElementById('card-scroll-container');
      if (container) {
        const scrollEvent = new Event('scroll', {
          bubbles: true,
          cancelable: true,
        });
        container.dispatchEvent(scrollEvent);
        console.log("Triggered scroll for more results");
        await this.delay(3000);
        setTimeout(() => this.searchNext(), 2000);
        return;
      }
    } catch (e) {
      console.error("Error scrolling for more results:", e);
    }

    console.log("All available jobs processed");
    this.sendToBackground({ type: "SEARCH_COMPLETED" });
  }

  // ========================================
  // APPLICATION FUNCTIONALITY
  // ========================================

  async startApplication(data) {
    console.log("📝 Starting application process...", data);

    // Wait for page load
    await this.waitForPageLoad();

    // Check if already on success page
    if (window.location.pathname.startsWith('/jobs/apply-complete')) {
      console.log("✅ Already on success page");
      this.handleApplicationSuccess(data);
      return;
    }

    // Initialize form handler if needed
    if (!this.formHandler) {
      this.formHandler = new MonsterFormHandler(
        this.aiService,
        this.userProfile,
        {
          copilotMode: this.copilotState.isInCoPilotMode(),
          copilotState: this.copilotState,
          logger: (msg) => this.log(msg.type || msg),
        }
      );
    }

    // Set job description for form handler
    if (!this.cachedJobDescription) {
      this.cachedJobDescription = this.scrapeJobDescription();
    }
    this.formHandler.jobDescription = this.cachedJobDescription;

    // Handle file uploads first
    await this.handleFileUploads(data);

    // Process the application form
    const result = await this.formHandler.processApplicationForm(data);

    if (result.success) {
      this.handleApplicationSuccess(data);
    } else {
      this.handleApplicationFailure(result, data);
    }
  }

  async handleFileUploads(data) {
    if (!this.fileHandler) return;

    const form = document.querySelector('#loading-container');
    if (!form) return;

    try {
      await this.fileHandler.handleFileUploads(
        form,
        this.userProfile,
        this.cachedJobDescription,
        data?.jobId,
        data?.title || ""
      );
    } catch (error) {
      console.error("Error handling file uploads:", error);
    }
  }

  handleApplicationSuccess(data) {
    console.log("✅ Application submitted successfully");

    notifyStatus({
      type: "APPLICATION_SUCCESS",
      data: {
        title: data?.title || "Job",
        company: data?.company,
      },
    });

    this.sendToBackground({
      type: "JOB_SUCCESS",
      jobData: {
        url: data?.url || window.location.href,
        title: data?.title,
        company: data?.company,
        platform: this.platform,
      },
    });
  }

  handleApplicationFailure(result, data) {
    console.log("❌ Application failed:", result.reason);

    this.sendToBackground({
      type: "JOB_FAILURE",
      jobData: {
        url: data?.url || window.location.href,
        title: data?.title,
        company: data?.company,
        platform: this.platform,
      },
      error: result.reason,
      message: result.error,
    });
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  updateLinkStatus(data) {
    const links = this.findAllLinksElements();
    for (let i = 0; i < links.length; i++) {
      const linkEl = links[i].querySelector('a[data-testid=jobTitle]');
      if (linkEl && this.urlsMatch(linkEl.href, data.url)) {
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

  recordSubmission(data) {
    const url = data.url;
    if (!this.searchData.submittedLinks.some((link) => this.urlsMatch(link.url, url))) {
      this.searchData.submittedLinks.push({ ...data });
    }
  }

  markProcessedLink(element) {
    this.markLinkAsColor(element, "orange", "Completed");
  }

  markLinkAsColor(element, color, status) {
    try {
      if (!element) return;

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

      const colors = {
        green: "#4CAF50",
        orange: "#FF9800",
        red: "#F44336",
        blue: "#2196F3",
      };

      indicator.style.backgroundColor = colors[color] || color;
      indicator.textContent = status || color;

      element.style.borderLeft = `3px solid ${colors[color] || color}`;
      element.style.paddingLeft = "8px";
    } catch (error) {
      console.warn("Error marking link color:", error);
    }
  }

  setStuckDetectionTimeout() {
    if (this.sendCvPageNotRespondTimeout) {
      clearTimeout(this.sendCvPageNotRespondTimeout);
    }

    this.sendCvPageNotRespondTimeout = setTimeout(() => {
      if (this.applicationState.isApplicationInProgress) {
        console.log("🚨 Application stuck, forcing reset");
        this.applicationState.isApplicationInProgress = false;
        this.applicationState.applicationStartTime = null;
        setTimeout(() => this.searchNext(), 2000);
      }
    }, 180000); // 3 minutes
  }

  handleJobTaskError(err, url, element) {
    console.log(`Error sending job task for ${url}:`, err);

    this.resetApplicationStateOnError();

    if (this.applicationState.processedUrls) {
      this.applicationState.processedUrls.delete(url);
    }

    this.markLinkAsColor(element, "red", "Error");
  }

  resetApplicationStateOnError() {
    this.applicationState.isApplicationInProgress = false;
    this.applicationState.applicationStartTime = null;

    if (this.sendCvPageNotRespondTimeout) {
      clearTimeout(this.sendCvPageNotRespondTimeout);
      this.sendCvPageNotRespondTimeout = null;
    }
  }

  updateProgress(updates) {
    this.progress = { ...this.progress, ...updates };

    if (this.onProgress) {
      this.onProgress(this.progress);
    }

    this.notifyContentScript("progress", this.progress);
  }

  urlsMatch(url1, url2) {
    if (!url1 || !url2) return false;
    return url1 === url2 || url1.includes(url2) || url2.includes(url1);
  }

  async waitForElement(selector, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const check = () => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
          return;
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for element: ${selector}`));
          return;
        }

        setTimeout(check, 500);
      };

      check();
    });
  }

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

  // ========================================
  // PLATFORM-SPECIFIC IMPLEMENTATIONS
  // ========================================

  getPlatformDomains() {
    return ["monster.com", "www.monster.com"];
  }

  getSearchLinkPattern() {
    return /^https:\/\/(www\.)?monster\.com\/job-openings\/.*$/;
  }

  isValidJobPage(url) {
    return /\/job-openings\/|\/jobs\/apply/.test(url);
  }

  extractJobIdFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);

      // Monster URLs: /job-openings/job-title-company-location-jobid
      // Extract the last part which typically contains the job ID
      if (pathParts.length > 0) {
        return pathParts[pathParts.length - 1];
      }

      return `monster_${Date.now()}`;
    } catch (e) {
      return `monster_${Date.now()}`;
    }
  }

  // ========================================
  // CLEANUP
  // ========================================

  cleanup() {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    if (this.stateVerificationInterval) clearInterval(this.stateVerificationInterval);
    if (this.sendCvPageNotRespondTimeout) clearTimeout(this.sendCvPageNotRespondTimeout);

    if (this.port) {
      try {
        this.port.disconnect();
      } catch (e) {
        // Ignore errors
      }
      this.port = null;
    }

    this.applicationState.isApplicationInProgress = false;
    this.applicationState.applicationStartTime = null;
    this.applicationState.applicationUrl = null;
    this.isPaused = false;
    this.isRunning = false;

    console.log("🧹 Monster platform cleanup completed");
  }
}
