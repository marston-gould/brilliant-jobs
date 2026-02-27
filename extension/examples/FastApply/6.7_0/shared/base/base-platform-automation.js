// shared/base/base-platform-automation.js - COMPLETE VERSION WITH ENHANCED CHATBOT
import BasePlatform from "../../platforms/base-platform.js";
import Logger from "../../core/logger.js";

export default class BasePlatformAutomation extends BasePlatform {
  constructor(config) {
    super(config);
    this.devMode =
      config.devMode ||
      config.config?.devMode ||
      config.sessionContext?.devMode;
    // Initialize user profile from multiple sources - check injected context first
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

    // Search data - platform implementations will override domains and patterns
    this.searchData = {
      limit: 0,
      current: 0,
      domain: this.getPlatformDomains(),
      submittedLinks: [],
      searchLinkPattern: this.getSearchLinkPattern(),
    };

    // Automation control state
    this.isPaused = false;
    this.isRunning = false;

    // Timers
    this.healthCheckTimer = null;
    this.keepAliveInterval = null;
    this.sendCvPageNotRespondTimeout = null;
    this.stuckStateTimer = null;
    this.stateVerificationInterval = null;
  }

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

  /**
   * Abstract methods - must be implemented by platform classes
   */
  getPlatformDomains() {
    throw new Error(
      "getPlatformDomains() must be implemented by platform class"
    );
  }

  getSearchLinkPattern() {
    throw new Error(
      "getSearchLinkPattern() must be implemented by platform class"
    );
  }

  isValidJobPage(url) {
    throw new Error("isValidJobPage() must be implemented by platform class");
  }

  getApiHost() {
    throw new Error("getApiHost() must be implemented by platform class");
  }

  /**
   * Initialize platform automation with enhanced chatbot
   */
  async initialize() {
    await super.initialize();

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
      if (!this.applicationState.isApplicationInProgress) {
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

    if (data.inProgress && !this.applicationState.isApplicationInProgress) {
      this.applicationState.isApplicationInProgress = true;
      this.applicationState.applicationStartTime = Date.now();
    } else if (
      !data.inProgress &&
      this.applicationState.isApplicationInProgress
    ) {
      this.applicationState.isApplicationInProgress = false;
      this.applicationState.applicationStartTime = null;
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
    this.applicationState.isApplicationInProgress = true;
    this.applicationState.applicationStartTime = Date.now();
    this.applicationState.applicationUrl = data?.url;
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
    this.applicationState.isApplicationInProgress = false;
    this.applicationState.applicationStartTime = null;
    this.applicationState.processedLinksCount++;

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
    this.applicationState.isApplicationInProgress = false;
    this.applicationState.applicationStartTime = null;

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
      if (this.applicationState.isApplicationInProgress) {
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
      this.applicationState.processedUrls &&
      this.applicationState.processedUrls.has(url);

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

    if (!this.applicationState.processedUrls) {
      this.applicationState.processedUrls = new Set();
    }
    this.applicationState.processedUrls.add(url);

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
    if (this.applicationState.isApplicationInProgress) {
      console.log("Application became in progress, aborting new task");
      return;
    }

    // Mark as processing
    this.markLinkAsColor(link, "green", "In Progress");

    // Set application state
    this.applicationState.isApplicationInProgress = true;
    this.applicationState.applicationStartTime = Date.now();

    // Add to local cache
    if (!this.applicationState.processedUrls) {
      this.applicationState.processedUrls = new Set();
    }
    this.applicationState.processedUrls.add(url);

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
      if (this.applicationState.isApplicationInProgress) {
        this.applicationState.isApplicationInProgress = false;
        this.applicationState.applicationStartTime = null;
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
    if (this.applicationState.processedUrls) {
      this.applicationState.processedUrls.delete(url);
    }

    // Mark as error
    this.markLinkAsColor(link, "red", "Error");
  }

  /**
   * Enhanced handle no unprocessed links with action preview
   */
  async handleNoUnprocessedLinks() {
    if (this.applicationState.isApplicationInProgress) {
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

      if (this.applicationState.isApplicationInProgress) {
        console.log("Application became in progress, aborting navigation");
        return;
      }

      loadMoreBtn.click();

      setTimeout(() => {
        if (!this.applicationState.isApplicationInProgress && !this.isPaused) {
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
    this.applicationState.isApplicationInProgress = false;
    this.applicationState.applicationStartTime = null;

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
    this.applicationState.isApplicationInProgress = false;
    this.applicationState.applicationStartTime = null;
    this.applicationState.applicationUrl = null;
    this.isPaused = false;
    this.isRunning = false;

    super.cleanup();
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
