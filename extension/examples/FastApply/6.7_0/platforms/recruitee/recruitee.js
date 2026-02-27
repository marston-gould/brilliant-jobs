// platforms/recruitee/recruitee.js
import { RecruiteeFormHandler } from "./recruitee-form-handler.js";
import { RecruiteeFileHandler } from "./recruitee-file-handler.js";
import { UrlUtils, DomUtils } from "../../shared/utilities/index.js";
import { AIService } from "../../services/index.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";
import Utils from "../../utils/utils.js";

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

export default class RecruiteePlatform {
  constructor(config) {
    // Initialize from BasePlatform
    this.sessionId = config.sessionId;
    this.platform = config.platform || "recruitee";
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

    // Recruitee-specific initialization
    this.baseUrl = "https://jobs.recruitee.co";

    // Initialize Co-Pilot state
    this.copilotState = new CoPilotState();

    this.fileHandler = null;
    this.formHandler = null;
    this.reason = "";
    this.currentJobId = null;

    // Cached job description (scraped before clicking Apply button)
    this.cachedJobDescription = null;

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
      const descriptionParts = [];

      // Extract job description section
      const jobDescriptionSelectors = [
        ".sc-1fwbcuw-0", // Main content container from HTML
        ".custom-css-style-job-description + .sc-1fwbcuw-0", // Content after job description heading
        "[data-reach-tab-panel] .sc-1fwbcuw-0", // Content in tab panel
        ".sc-1uwf3m5-2 .sc-1fwbcuw-0", // Nested in job content area
      ];

      for (const selector of jobDescriptionSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const text = element.textContent?.trim();
          if (text && text.length > 50) {
            descriptionParts.push(text);
          }
        }
      }

      // If no specific sections found, try to get all content from the job details tab
      if (descriptionParts.length === 0) {
        const jobDetailsPanel = document.querySelector(
          "[data-reach-tab-panel]:not([hidden])"
        );
        if (jobDetailsPanel) {
          const content = jobDetailsPanel.textContent?.trim();
          if (content) {
            descriptionParts.push(content);
          }
        }
      }

      // Combine and clean up
      let fullDescription = descriptionParts.join("\n\n");

      // Remove excessive whitespace
      fullDescription = fullDescription.replace(/\s+/g, " ").trim();

      console.log("📄 Scraped job description length:", fullDescription.length);
      return fullDescription;
    } catch (error) {
      console.error("Error scraping job description:", error);
      return "";
    }
  }

  // ========================================
  // BASE PLATFORM AUTOMATION METHODS (from BasePlatformAutomation)
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

  handleDuplicateJob(data) {
    console.log("⚠️ Duplicate job detected, resetting application state");
    this.applicationState.isApplicationInProgress = false;
    this.applicationState.applicationStartTime = null;

    setTimeout(() => this.searchNext(), 1000);
  }

  handleErrorMessage(errorMessage) {
    const actualMessage =
      errorMessage?.message ||
      errorMessage?.data?.message ||
      "Unknown error from background script";

    console.log("❌ Error from background script:", actualMessage);

    this.resetApplicationStateOnError();

    setTimeout(() => {
      if (!this.isPaused) {
        this.searchNext();
      }
    }, 3000);
  }

  async searchNext() {
    try {
      if (this.isPaused) {
        console.log("Automation is paused, not searching");
        return;
      }

      console.log("Executing searchNext");

      if (this.applicationState.isApplicationInProgress) {
        console.log("Application in progress, not searching for next link");
        this.sendToBackground({ type: "CHECK_APPLICATION_STATUS" });
        return;
      }

      let links = this.findAllLinksElements();
      console.log(`Found ${links.length} links`);

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

  findUnprocessedLink(links) {
    for (let i = 0; i < links.length; i++) {
      const url = this.normalizeUrlFully(links[i].href);

      if (this.isLinkProcessed(url)) {
        this.markProcessedLink(links[i]);
        continue;
      }

      if (!this.matchesSearchPattern(url)) {
        this.markInvalidLink(links[i], url);
        continue;
      }

      return { link: links[i], url };
    }

    return null;
  }

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

  markProcessedLink(linkElement) {
    this.markLinkAsColor(linkElement, "orange", "Completed");
  }

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

  async processJobLink({ link, url }) {
    const jobTitle = link.textContent.trim() || "Job Application";
    await this.delay(3000);

    console.log("Processing job link:", url);
    if (this.isPaused) {
      console.log("Automation paused during countdown, aborting");
      return;
    }

    if (this.applicationState.isApplicationInProgress) {
      console.log("Application became in progress, aborting new task");
      return;
    }

    this.markLinkAsColor(link, "green", "In Progress");

    this.applicationState.isApplicationInProgress = true;
    this.applicationState.applicationStartTime = Date.now();

    if (!this.applicationState.processedUrls) {
      this.applicationState.processedUrls = new Set();
    }
    this.applicationState.processedUrls.add(url);

    this.setStuckDetectionTimeout();

    try {
      this.sendToBackground({
        type: this.getJobTaskMessageType(),
        data: {
          jobId: this.extractJobIdFromUrl(url),
          url,
          title: jobTitle,
          company: this.extractCompanyFromUrl(url),
        },
      });
    } catch (err) {
      this.handleJobTaskError(err, url, link);
    }
  }

  extractCompanyFromUrl(url) {
    const match = url.match(/\/\/([^.]+)\.recruitee\.com/);
    return match ? match[1] : null;
  }

  getJobTaskMessageType() {
    return "START_APPLICATION";
  }

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

  handleJobTaskError(err, url, link) {
    console.log(`Error sending job task for ${url}:`, err);

    this.resetApplicationStateOnError();

    if (this.applicationState.processedUrls) {
      this.applicationState.processedUrls.delete(url);
    }

    this.markLinkAsColor(link, "red", "Error");
  }

  async handleNoUnprocessedLinks() {
    if (this.applicationState.isApplicationInProgress) {
      console.log("Application became in progress, aborting navigation");
      return;
    }

    const loadMoreBtn = this.findLoadMoreElement();

    if (loadMoreBtn) {
      await this.delay(2000);

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
      this.sendToBackground({ type: "SEARCH_COMPLETED" });
    }
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

  findLoadMoreElement() {
    try {
      if (
        document.getElementById("pnprev") &&
        !document.getElementById("pnnext")
      ) {
        return null;
      }

      const moreResultsBtn = Array.from(document.querySelectorAll("a")).find(
        (a) => a.textContent.includes("More results")
      );

      if (moreResultsBtn) return moreResultsBtn;

      const nextBtn = document.getElementById("pnnext");
      if (nextBtn) return nextBtn;

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

  normalizeUrlFully(url) {
    try {
      if (!url) return "";

      if (!url.startsWith("http")) {
        url = "https://" + url;
      }

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

  platformSpecificUrlNormalization(url) {
    return url;
  }

  urlsMatch(url1, url2) {
    return url1 === url2 || url1.includes(url2) || url2.includes(url1);
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

  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  setupErrorRecovery() {
    this._errorCount = 0;
    this._debounceTimers = new Map();
    this._lastErrorTime = null;
  }

  async handleGenericError(error, context = {}) {
    console.error("❌ Generic error:", error);

    if (this.handlePlatformSpecificError) {
      await this.handlePlatformSpecificError(error, context);
    }
  }

  cleanup() {
    // Recruitee-specific cleanup
    if (true) {
      // Global overlay
      // Global overlay - cleanup handled automatically
      // Global overlay - no local instance needed
    }

    // Base cleanup
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    if (this.stateVerificationInterval)
      clearInterval(this.stateVerificationInterval);
    if (this.sendCvPageNotRespondTimeout)
      clearTimeout(this.sendCvPageNotRespondTimeout);

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

    console.log("🧹 Platform cleanup completed");
  }

  // ========================================
  // PLATFORM-SPECIFIC IMPLEMENTATIONS (Required by base class)
  // ========================================

  getPlatformDomains() {
    return ["recruitee.com"];
  }

  getSearchLinkPattern() {
    return /^https:\/\/.*\.recruitee\.com\/(o|career)\/([^\/]+)\/?.*$/;
  }

  isValidJobPage(url) {
    return /\/(o|career)\//.test(url);
  }

  /**
   * Extract job ID from Recruitee URL using company + job slug
   * @param {string} url - The job URL (e.g., https://company.recruitee.com/o/job-slug)
   * @returns {string} - The extracted job ID (e.g., company_job-slug)
   */
  extractJobIdFromUrl(url) {
    try {
      const urlObj = new URL(url);

      // Extract company from subdomain (e.g., "1x" from "1x.recruitee.com")
      const hostname = urlObj.hostname;
      const company = hostname.split(".")[0];

      // Extract job slug from path (e.g., "software-engineer-cloud-infrastructure" from "/o/software-engineer-cloud-infrastructure")
      const pathParts = urlObj.pathname.split("/").filter((part) => part);
      const jobSlug = pathParts[pathParts.length - 1];

      if (company && jobSlug) {
        return `${company}_${jobSlug}`;
      }

      return "";
    } catch (error) {
      console.error("Error extracting job ID from URL:", error);
      return "";
    }
  }

  async setSessionContext(sessionContext) {
    try {
      this.sessionContext = sessionContext;
      this.hasSessionContext = true;

      // Update basic properties
      if (sessionContext.sessionId) this.sessionId = sessionContext.sessionId;
      if (sessionContext.platform) this.platform = sessionContext.platform;
      if (sessionContext.userId) this.userId = sessionContext.userId;

      // Set user profile with priority handling
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

      // Store API hosts from session context (check both patterns)
      const backendApiHost =
        sessionContext.backendApiHost ||
        sessionContext.sessionConfig?.backendApiHost;
      const aiApiHost =
        sessionContext.aiApiHost || sessionContext.sessionConfig?.aiApiHost;

      if (backendApiHost) {
        this.backendApiHost = backendApiHost;
      }

      // Update AI Service host
      if (this.aiService && aiApiHost) {
        this.aiService.apiHost = aiApiHost;
      }

      // Update File Handler hosts if they exist
      if (this.fileHandler) {
        if (backendApiHost) {
          this.fileHandler.backendApiHost = backendApiHost;
        }
        if (aiApiHost) {
          this.fileHandler.aiApiHost = aiApiHost;
        }

        if (sessionContext.jwtToken) {
          this.fileHandler.jwtToken = sessionContext.jwtToken;
        }
      }

      // Update file handler preferences
      if (this.fileHandler && sessionContext.preferences) {
        this.fileHandler.preferences = sessionContext.preferences;
      }

      // Update form handler if it exists
      if (this.formHandler && this.userProfile) {
        this.formHandler.userData = this.userProfile;
      }

      console.log("SESSION CONTEXT", sessionContext);
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
      console.error("Error setting session context:", error);
      return false;
    }
  }

  async start(params = {}) {
    try {
      this.isRunning = true;
      notifyStatus({ type: "AUTOMATION_STARTING" });

      // Update config with parameters
      this.config = { ...this.config, ...params };

      // Ensure session context preferences are applied (fallback if initialize wasn't called)
      if (this.sessionContext) {
        await this.setSessionContext(this.sessionContext);
      }

      // Ensure correct mode buttons are shown after automation starts
      this.restoreModeButtons();

      // Update progress
      this.updateProgress({
        total: params.jobsToApply || 0,
        completed: 0,
        current: "Starting automation...",
      });

      // Wait for page to be ready
      await this.waitForPageLoad();

      // Detect page type and start appropriate automation
      await this.detectPageTypeAndStart();

      return true;
    } catch (error) {
      notifyStatus({ type: "APPLICATION_ERROR" });
      this.reportError(error, { action: "start" });
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

        case "APPLICATION_TASK_DATA":
          this.handleApplicationTaskData(data);
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
          notifyStatus({ type: "DUPLICATE_APPLICATION" });
          this.handleDuplicateJob(data);
          break;

        case "ALREADY_APPLIED":
          this.handleAlreadyApplied(data);
          break;

        case "LIMIT_REACHED":
          this.handleLimitReached(data);
          break;

        case "COMPANY_BLACKLISTED":
          this.handleCompanyBlacklisted(data);
          break;

        case "ERROR":
          this.handleErrorMessage(data);
          break;

        case "KEEPALIVE_RESPONSE":
          break;

        default:
          break;
      }
    } catch (error) {}
  }

  handleAlreadyApplied(data) {
    try {
      const jobUrl = data.url;
      const jobTitle = Utils.getJobTitle(jobUrl);
      const jobDetails = {
        title: jobTitle,
        company:
          UrlUtils.extractCompanyFromUrl(jobUrl, "recruitee") || "Company",
        location: "Not specified",
      };

      notifyStatus({
        type: "ALREADY_APPLIED",
        data: { title: jobDetails.title },
      });
      this.delay(1000);

      // Reset application state
      this.applicationState.isApplicationInProgress = false;
      this.applicationState.applicationStartTime = null;

      // Send skip message instead of completion to avoid closing tab
      this.sendToBackground({
        type: "SKIPPED",
        data: {
          jobId: data.jobId || this.extractJobIdFromUrl(window.location.href),
          title: jobDetails.title,
          company: jobDetails.company,
          location: jobDetails.location,
          jobUrl: data.url || window.location.href,
          reason: "ALREADY_APPLIED",
        },
      });
    } catch (error) {}
  }

  handleLimitReached(data) {
    try {
      notifyStatus({ type: "LIMIT_EXCEEDED" });

      // Reset application state
      this.applicationState.isApplicationInProgress = false;
      this.applicationState.applicationStartTime = null;

      // Stop automation
      this.isRunning = false;
      this.sendToBackground({
        type: "SEARCH_COMPLETED",
        data: {
          reason: "LIMIT_REACHED",
          message: data?.message || "Application limit reached",
        },
      });
    } catch (error) {}
  }

  handleCompanyBlacklisted(data) {
    try {
      notifyStatus({
        type: "COMPANY_BLACKLISTED",
        data: {
          title: data?.title || "Job",
          company: data?.company || "this company",
        },
      });

      // Reset application state
      this.applicationState.isApplicationInProgress = false;
      this.applicationState.applicationStartTime = null;
    } catch (error) {}
  }

  async findJobs() {
    return this.findAllLinksElements();
  }

  async applyToJob(jobElement) {
    return await this.apply();
  }

  getApiHost() {
    return (
      this.sessionContext?.backendApiHost ||
      this.sessionContext?.sessionConfig?.backendApiHost ||
      this.config.sessionContext?.backendApiHost ||
      this.config.backendApiHost
    );
  }

  getAiApiHost() {
    return (
      this.sessionAiApiHost ||
      this.sessionContext?.aiApiHost ||
      this.sessionContext?.sessionConfig?.aiApiHost ||
      this.config.sessionContext?.aiApiHost ||
      this.config.aiApiHost
    );
  }

  isApplicationPage(url) {
    return this.isValidJobPage(url);
  }

  getJobTaskMessageType() {
    return "START_APPLICATION";
  }

  // ========================================
  // COMMUNICATION HELPERS
  // ========================================

  sendToBackground(message) {
    try {
      chrome.runtime.sendMessage(message);
      return true;
    } catch (error) {
      console.error("Error sending message to background:", error);
      return false;
    }
  }

  // ========================================
  // RECRUITEE-SPECIFIC INITIALIZATION
  // ========================================

  async initialize() {
    console.log("🚀 Initializing platform automation");

    // Wait for session context to be available
    await this.waitForContext();

    // Apply session context preferences (including co-pilot mode)
    if (this.sessionContext) {
      await this.setSessionContext(this.sessionContext);
    }

    // Set up communication and monitoring
    this.startHealthCheck();
    this.startStateVerification();

    // Setup message listener for background communication
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

            case "SEARCH_TASK":
            case "SEARCH_TASK_DATA":
              // Handle search task data from background
              this.handleSearchTaskData(data);
              sendResponse && sendResponse({ success: true });
              break;

            case "SEARCH_NEXT":
              // Handle search next from background
              this.handleSearchNext(data);
              sendResponse && sendResponse({ success: true });
              break;

            case "APPLICATION_STARTING":
              this.handleApplicationStarting(data);
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
              this.handleCompanyBlacklisted(data);
              sendResponse && sendResponse({ success: true });
              break;

            case "APPLICATION_STATUS":
              this.handleApplicationStatus(data);
              sendResponse && sendResponse({ success: true });
              break;

            case "START_AUTOMATION_NOW":
              // Store job ID from search page before starting application
              if (data?.jobId) {
                this.currentJobId = data.jobId;
              }
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
        return true; // Keep message channel open for async response
      });
    } catch (error) {
      console.error("Error setting up message listener:", error);
    }

    this.fileHandler = new RecruiteeFileHandler({
      preferences: this.sessionContext?.preferences,
      backendApiHost: this.getApiHost(),
      aiApiHost: this.getAiApiHost(),
      jwtToken: this.getJwtToken(),
    });

    this.formHandler = new RecruiteeFormHandler(
      this.aiService,
      this.userProfile || {},
      {
        // statusOverlay removed - uses global overlay
        logger: (message) => notifyStatus(message),
        copilotMode: this.copilotState.isInCoPilotMode(),
        copilotState: this.copilotState,
      }
    );

    console.log("✅ Recruitee handlers initialized:", {
      fileHandler: !!this.fileHandler,
      formHandler: !!this.formHandler,
    });
  }

  // ========================================
  // RECRUITEE-SPECIFIC MESSAGE HANDLING
  // ========================================

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
          // Show co-pilot search buttons (with "Let AI Take Over" button)
          updateStatusButtons("co-pilot-search");
        }
        break;

      case COPILOT_ACTIONS.SWITCH_TO_AUTOPILOT:
        this.copilotState.switchToAutoPilot();

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
        // Guard: skip fires twice (DOM event + forwarded CONTROL_ACTION)
        if (this._skipInProgress) break;
        this._skipInProgress = true;

        console.log("⏭️ Skip button clicked - processing skip action");

        // If we're on a form page and formHandler exists, cancel and resolve
        if (this.formHandler) {
          this.formHandler.shouldCancel = true;
          this.formHandler.resolveUserAction("SKIP");
        }

        // Show status message that job was skipped
        if (true) {
          // Global overlay
          notifyStatus({
            type: "JOB_SKIPPED",
            data: { title: this.formHandler?.currentJobTitle || "this job" },
          });
        }

        // Send APPLICATION_SKIPPED to background to close tab and trigger SEARCH_NEXT
        this.sendToBackground({
          type: "APPLICATION_SKIPPED",
          data: {
            url: window.location.href,
            reason: "User clicked skip button",
            skipReason: "user_skip",
            jobTitle: this.formHandler?.currentJobTitle || "Unknown job",
          },
        });

        // Only close window if on application page, NOT on search page
        const currentUrl = window.location.href;
        const isOnApplicationPage = this.isApplicationPage(currentUrl);
        const isOnSearchPage = currentUrl.includes("google.com/search");

        if (isOnApplicationPage) {
          // On application page - close this tab
          setTimeout(() => {
            console.log("⏭️ Closing application tab after user skip");
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

      case COPILOT_ACTIONS.PAUSE:
        this.isRunning = false;
        if (true) {
          // Global overlay
          notifyStatus({ type: "AUTOMATION_PAUSED" });
        }
        break;

      case COPILOT_ACTIONS.RESUME:
        this.isRunning = true;
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

  handlePlatformSpecificMessage(type, data) {
    switch (type) {
      case "COPILOT_ACTION":
        this.handleCoPilotAction(data);
        break;

      case "SEARCH_TASK_DATA":
        this.handleSearchTaskData(data);
        break;

      case "APPLICATION_TASK_DATA":
        this.handleApplicationTaskData(data);
        break;

      case "APPLICATION_STARTING":
        this.handleApplicationStarting(data);
        break;

      case "APPLICATION_STATUS":
        this.handleApplicationStatus(data);
        break;

      default:
        console.log(`❓ Unhandled message type: ${type}`);
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
        submittedLinks: data.submittedLinks
          ? data.submittedLinks.map((link) => ({ ...link, tries: 0 }))
          : [],
        searchLinkPattern: data.searchLinkPattern
          ? new RegExp(data.searchLinkPattern.replace(/^\/|\/[gimy]*$/g, ""))
          : this.getSearchLinkPattern(),
      };

      // Include user profile if available
      if (data.profile && !this.userProfile) {
        this.userProfile = data.profile;
      }

      notifyStatus({ type: "JOB_FOUND" });
      this.delay(1000); // Reduced from 3000ms to 1000ms

      // Start search process
      setTimeout(() => this.searchNext(), 500); // Reduced from 1000ms to 500ms
    } catch (error) {}
  }

  handleApplicationTaskData(data) {
    try {
      if (data?.profile && !this.userProfile) {
        this.userProfile = data.profile;
      }

      // Store job ID from search page
      if (data?.jobId) {
        this.currentJobId = data.jobId;
      }

      // Update form handler
      if (this.formHandler && this.userProfile) {
        this.formHandler.userData = this.userProfile;
      }

      // Start application process
      setTimeout(() => this.startApplicationProcess(), 500); // Reduced from 1000ms to 500ms
    } catch (error) {}
  }

  handleApplicationStarting(data) {
    this.applicationState.isApplicationInProgress = true;
    this.applicationState.applicationStartTime = Date.now();
  }

  handleApplicationStatus(data) {
    if (data.inProgress && !this.applicationState.isApplicationInProgress) {
      this.applicationState.isApplicationInProgress = true;
      this.applicationState.applicationStartTime = Date.now();
    } else if (
      !data.inProgress &&
      this.applicationState.isApplicationInProgress
    ) {
      this.applicationState.isApplicationInProgress = false;
      this.applicationState.applicationStartTime = null;
      setTimeout(() => this.searchNext(), 500); // Reduced from 1000ms to 500ms
    }
  }

  // ========================================
  // RECRUITEE-SPECIFIC PAGE TYPE DETECTION
  // ========================================

  async detectPageTypeAndStart() {
    const url = window.location.href;
    const pathname = new URL(url).pathname;

    if (url.includes("google.com/search")) {
      await this.startSearchProcess();
    } else if (pathname.endsWith("/applied")) {
      // Already on success page (full-page nav after submit) — report success
      console.log("✅ Landed on /applied page — reporting success");
      const jobId = this.extractJobIdFromUrl(url);
      await this.handleSuccessfulApplication(jobId);
    } else if (this.isValidJobPage(url)) {
      await this.startApplicationProcess();
    } else {
      await this.waitForValidPage();
    }
  }

  // ========================================
  // RECRUITEE-SPECIFIC SEARCH LOGIC
  // ========================================

  async startSearchProcess() {
    try {
      const preferences =
        this.sessionContext?.preferences || this.config?.preferences || {};

      notifyStatus({
        type: "JOB_SEARCH_STARTED",
        data: { preferences },
      });
      await this.delay(1000); // Reduced from 3000ms to 1000ms

      // Get search task data from background
      await this.fetchSearchTaskData();
    } catch (error) {
      notifyStatus({ type: "APPLICATION_ERROR" });
      this.reportError(error, { phase: "search" });
    }
  }

  async fetchSearchTaskData() {
    const success = this.sendToBackground({ type: "GET_SEARCH_TASK" });
    if (!success) {
      throw new Error("Failed to request search task data");
    }
  }

  // ========================================
  // RECRUITEE-SPECIFIC APPLICATION LOGIC
  // ========================================

  async startApplicationProcess() {
    try {
      const jobTitle = document.title || "job";
      // Check if user wants us to apply to matching jobs only
      if (
        this.config?.preferences?.applyOnlyMatching ||
        this.config?.preferences?.applyOnlyQualified
      ) {
        // Get comprehensive job details for preference matching
        const comprehensiveJobDetails = await this.getJobProperties();
        const isMatch = await this.doesJobMatchPreferences(
          comprehensiveJobDetails
        );
        if (!isMatch) {
          notifyStatus({
            type: "DOES_NOT_MATCH_PREFERENCES",
            data: {
              title: comprehensiveJobDetails.title,
              reason: this.reason,
            },
          });

          // Wait a moment to let user read the message
          await this.delay(5000);

          // Send skip event to background
          this.sendToBackground({
            type: "APPLICATION_SKIPPED",
            data: {
              url: window.location.href,
              reason: "Job does not match preferences",
              skipReason: "preferences_mismatch",
              jobTitle: comprehensiveJobDetails.title || "Unknown job",
            },
          });

          // Return false to stop form processing
          return false;
        }
      }

      notifyStatus({
        type: "APPLYING_TO_JOB",
        data: { title: jobTitle },
      });
      await this.delay(1000);

      if (!this.userProfile) {
        await this.fetchApplicationTaskData();
      }

      // Start application
      await this.apply();
    } catch (error) {
      notifyStatus({ type: "APPLICATION_ERROR" });
      this.reportError(error, { phase: "application" });
      this.handleApplicationError(error);
    }
  }

  handleApplicationError(error) {
    notifyStatus({ type: "APPLICATION_ERROR" });
    if (error.name === "SkipApplicationError") {
      this.sendToBackground({
        type: "APPLICATION_SKIPPED",
        data: error.message,
      });
    } else {
      this.sendToBackground({
        type: "APPLICATION_ERROR",
        data: this.errorToString(error),
      });
    }
    this.applicationState.isApplicationInProgress = false;
  }

  async fetchApplicationTaskData() {
    const success = this.sendToBackground({ type: "GET_APPLICATION_TASK" });
    if (!success) {
      throw new Error("Failed to request application task data");
    }
  }

  // ========================================
  // RECRUITEE-SPECIFIC FORM HANDLING
  // ========================================

  async apply() {
    try {
      notifyStatus({ type: "COLLECTING_FIELDS" });
      await this.delay(2000);

      // Check if page is valid
      if (this.hasPageErrors()) {
        throw new SkipApplicationError(
          "Cannot start application: Page error or job no longer available"
        );
      }

      // Use job ID passed from search page
      const jobId = this.currentJobId || "";

      // Wait for page to fully load
      await this.wait(1500);

      this.cachedJobDescription = this.scrapeJobDescription();
      // Also extract using the existing method as fallback
      const rawJobDescription =
        this.cachedJobDescription || this.extractJobDescription();

      // Build enriched job description with job metadata for AI context
      const recJobTitle = this.extractJobTitle();
      const recCompany = this.extractCompany();
      const recLocation = this.extractLocation();
      const recDepartment = this.extractDepartment();
      const recWorkMode = this.extractWorkMode({ title: recJobTitle, description: rawJobDescription });
      // Extract raw salary text from DOM for full context (e.g. "$100,000 - $180,000 per year")
      let recSalaryText = "";
      try {
        const metaSpans = document.querySelectorAll(".sc-crgk9f-5 span.sc-crgk9f-7");
        for (const span of metaSpans) {
          const text = span.textContent?.trim() || "";
          if (text.includes("$") || /\d{1,3},\d{3}/.test(text)) {
            recSalaryText = text;
            break;
          }
        }
      } catch (e) { /* ignore */ }
      const jobDescParts = [];
      if (recJobTitle && recJobTitle !== "Job on Recruitee") jobDescParts.push(`Job Title: ${recJobTitle}`);
      if (recCompany && recCompany !== "Company on Recruitee") jobDescParts.push(`Company: ${recCompany}`);
      if (recLocation && recLocation !== "Not specified") jobDescParts.push(`Location: ${recLocation}`);
      if (recDepartment && recDepartment !== "Not specified") jobDescParts.push(`Department: ${recDepartment}`);
      if (recWorkMode) jobDescParts.push(`Workplace: ${recWorkMode}`);
      if (recSalaryText) jobDescParts.push(`Salary: ${recSalaryText}`);
      if (rawJobDescription) jobDescParts.push(`\nJob Description:\n${rawJobDescription}`);
      const jobDescription = jobDescParts.length > 0 ? jobDescParts.join('\n') : rawJobDescription;

      // Check if we're on a job details page or application form page
      const applyButton = document.querySelector(
        'button[data-testid="header-tab-apply-button"], button[data-cy="apply-button-nav"], a.c-button--primary, a.c-button--apply, a.cta-button, button.c-button--apply'
      );
      if (applyButton) {
        applyButton.click();
        await this.wait(1500);
      }

      // Find application form
      const form = this.findApplicationForm();
      if (!form) {
        throw new SkipApplicationError(
          "Cannot find Recruitee application form"
        );
      }

      // IMPORTANT: Set the job description on the form handler before processing
      // This ensures AI has access to job context when answering form questions
      if (this.formHandler) {
        this.formHandler.jobDescription = jobDescription;
        console.log(
          "📄 Set jobDescription on formHandler, length:",
          jobDescription?.length || 0
        );
      }

      // Process the form
      const result = await this.processApplicationForm(
        form,
        this.userProfile,
        jobDescription
      );

      if (result) {
        await this.handleSuccessfulApplication(jobId);
      }

      return result;
    } catch (error) {
      if (error instanceof SkipApplicationError) {
        throw error;
      } else {
        console.error("Error in Recruitee apply:", error);
        throw new ApplicationError(
          "Error during application process: " + this.errorToString(error)
        );
      }
    }
  }

  async handleSuccessfulApplication(jobId) {
    // Get job details from page
    const jobTitle =
      DomUtils.extractText(["h1"]) ||
      document.title.split(" - ")[0] ||
      "Job on Recruitee";
    const companyName =
      UrlUtils.extractCompanyFromUrl(window.location.href, "recruitee") ||
      "Company on Recruitee";
    const location =
      DomUtils.extractText([
        ".job-location",
        ".c-job__info-item",
        '[data-ui="location"]',
      ]) || "Not specified";

    // Send completion message
    this.sendToBackground({
      type: "APPLICATION_COMPLETED",
      data: {
        jobId,
        title: jobTitle,
        company: companyName,
        location,
        jobUrl: window.location.href,
        salary: "Not specified",
        workplace: "Not specified",
        postedDate: "Not specified",
        applicants: "Not specified",
        description:
          this.cachedJobDescription || this.extractJobDescription() || "",
      },
    });
    // Reset application state
    this.applicationState.isApplicationInProgress = false;
    this.applicationState.applicationStartTime = null;
  }

  async processApplicationForm(form, profile, jobDescription) {
    try {
      // Ensure form handler has job description for AI context
      if (this.formHandler && jobDescription) {
        this.formHandler.jobDescription = jobDescription;
      }

      const isMultiStep = form.querySelector(".c-step, .steps-indicator");
      if (isMultiStep) {
        return await this.handleMultiStepForm(form, profile, jobDescription);
      }

      if (this.config?.preferences?.useCustomResume === true) {
        notifyStatus({ type: "TAILORING_RESUME" });
      } else {
        notifyStatus({ type: "UPLOADING_FILES" });
      }
      await this.delay(2000);

      await this.fileHandler.handleFileUploads(
        form,
        profile,
        jobDescription,
        this.currentJobId,
        this.extractJobTitle() || ""
      );

      notifyStatus({ type: "FILLING_FORM" });
      await this.delay(2000);
      const result = await this.formHandler.processApplicationForm();

      if (result.success) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      notifyStatus({ type: "APPLICATION_ERROR" });
      return false;
    }
  }

  async handleMultiStepForm(form, profile, jobDescription) {
    try {
      // Ensure form handler has job description for AI context
      if (this.formHandler && jobDescription) {
        this.formHandler.jobDescription = jobDescription;
      }

      if (this.config?.preferences?.useCustomResume === true) {
        notifyStatus({ type: "TAILORING_RESUME" });
      } else {
        notifyStatus({ type: "UPLOADING_FILES" });
      }
      await this.delay(2000);
      // Handle resume upload - typically on first step
      await this.fileHandler.handleResumeUpload(profile, form);

      // Process each step until we reach the end
      let isComplete = false;
      let stepCount = 0;
      const maxSteps = 10; // Safety limit

      while (!isComplete && stepCount < maxSteps) {
        stepCount++;

        notifyStatus({ type: "FILLING_FORM" });
        await this.delay(2000);
        // Fill out visible form fields
        await this.formHandler.fillFormWithProfile(form, profile);

        // Handle required checkboxes
        await this.formHandler.handleRequiredCheckboxes(form);

        // Find next/submit button
        const nextButton = this.formHandler.findSubmitButton(form);
        if (!nextButton) {
          throw new ApplicationError(
            `Cannot find next/submit button on Recruitee step ${stepCount}`
          );
        }

        notifyStatus({ type: "SUBMITTING_APPLICATION" });
        await this.delay(2000);
        nextButton.click();

        // Wait for page to update
        await this.wait(1500); // Reduced from 3000ms to 1500ms

        // Check if we're done - only trust the real Recruitee success signals
        // 1) URL contains /applied
        if (window.location.pathname.endsWith("/applied")) {
          return true;
        }
        // 2) The "All done!" is pre-rendered in a hidden tab panel.
        //    Only trust it when its parent [role="tabpanel"] is active (no hidden attr).
        const ariaLive = document.querySelector('div[aria-live="assertive"]');
        if (ariaLive) {
          const heading = ariaLive.querySelector("h3");
          if (heading && heading.textContent.trim() === "All done!") {
            const tabPanel = ariaLive.closest('[role="tabpanel"]');
            if (tabPanel && !tabPanel.hasAttribute("hidden")) {
              return true;
            }
          }
        }

        // Find form again (might have changed between steps)
        form = this.findApplicationForm();
        if (!form) {
          // Form disappeared — re-check success signals before giving up
          if (window.location.pathname.endsWith("/applied")) {
            return true;
          }
          const ariaLiveRetry = document.querySelector('div[aria-live="assertive"]');
          if (ariaLiveRetry) {
            const h = ariaLiveRetry.querySelector("h3");
            if (h?.textContent?.trim() === "All done!") {
              const tp = ariaLiveRetry.closest('[role="tabpanel"]');
              if (tp && !tp.hasAttribute("hidden")) {
                return true;
              }
            }
          }
          throw new ApplicationError(
            "Recruitee form disappeared without success confirmation"
          );
        }
      }

      if (stepCount >= maxSteps) {
        throw new ApplicationError(
          "Exceeded maximum number of Recruitee form steps"
        );
      }

      return isComplete;
    } catch (error) {
      console.error("Error in Recruitee multi-step form:", error);
      throw error;
    }
  }

  // ========================================
  // RECRUITEE-SPECIFIC UTILITY METHODS
  // ========================================

  findApplicationForm() {
    // Recruitee-specific form selectors
    const recruiteeSelectors = [
      "form.c-form",
      "form#new_job_application",
      "form.careers-form",
      "form.application-form",
    ];

    return DomUtils.findForm(recruiteeSelectors);
  }

  extractJobDescription() {
    const recruiteeDescriptionSelectors = [
      ".sc-1fwbcuw-0", // New Recruitee design
      ".c-job__description",
      ".job-description",
      ".description",
      '[data-ui="job-description"]',
      ".vacancy-description",
      "#job-details",
    ];

    let description = DomUtils.extractText(recruiteeDescriptionSelectors);

    if (!description) {
      const mainContent = document.querySelector(
        "main, #content, .content, .job-content"
      );
      if (mainContent) {
        description = mainContent.textContent.trim();
      }
    }

    if (!description) {
      const jobTitle = document.title || "";
      const companyName = this.extractCompany() || "";
      description = `Job: ${jobTitle} at ${companyName}`;
    }

    return description;
  }

  /**
   * Extract company name from Recruitee page
   * @returns {string} - Company name
   */
  extractCompany() {
    try {
      // Extract from logo navigation
      const logoSelectors = [
        '.custom-css-style-navigation-logo span[aria-hidden="true"]',
        ".custom-css-style-navigation-logo img[alt]",
        ".sc-pxbyo9-0 span.sc-83wl6d-1",
        '[data-cy="navigation-section-logo-image"]',
      ];

      for (const selector of logoSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          if (element.tagName === "IMG" && element.alt) {
            // Extract from alt text, remove " logo" suffix
            return element.alt.replace(/ logo$/i, "").trim();
          } else if (element.textContent) {
            return element.textContent.trim();
          }
        }
      }

      // Fallback to URL extraction
      return (
        UrlUtils.extractCompanyFromUrl(window.location.href, "recruitee") ||
        "Company on Recruitee"
      );
    } catch (error) {
      console.error("Error extracting company:", error);
      return "Company on Recruitee";
    }
  }

  /**
   * Extract department from Recruitee page
   * @returns {string} - Department name
   */
  extractDepartment() {
    try {
      // Look for department in the list items
      const departmentSelectors = [
        'li[data-cy="department-name"] span.sc-crgk9f-7',
        'li[data-cy="department-name"] .fMHCZe',
        ".sc-crgk9f-7.fMHCZe",
      ];

      for (const selector of departmentSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }

      return "Not specified";
    } catch (error) {
      console.error("Error extracting department:", error);
      return "Not specified";
    }
  }

  hasPageErrors() {
    return (
      document.body.innerText.includes("Cannot GET") ||
      document.body.innerText.includes("404 Not Found") ||
      document.body.innerText.includes("No longer available")
    );
  }

  async waitForValidPage(timeout = 30000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const url = window.location.href;

      if (url.includes("google.com/search") || this.isValidJobPage(url)) {
        await this.detectPageTypeAndStart();
        return;
      }

      await this.delay(1000);

      this.sendToBackground({
        type: "APPLICATION_SKIPPED",
        data: {
          reason:
            "Invalid page - no search, job page, or application elements found",
          url: window.location.href,
        },
      });

      this.applicationState.isApplicationInProgress = false;
      this.applicationState.applicationStartTime = null;
    }

    throw new Error("Timeout waiting for valid Recruitee page");
  }

  errorToString(e) {
    if (e instanceof Error) {
      return e.stack || e.message;
    }
    return String(e);
  }

  // Note: cleanup() method is defined in the base methods section above
  // This comment is here to mark where platform-specific cleanup would go if needed

  // ========================================
  // PREFERENCE MATCHING METHODS
  // ========================================

  /**
   * Get comprehensive job properties for preference matching
   * @returns {Object} - Complete job details
   */
  async getJobProperties() {
    try {
      // Extract description (now returns string)
      const description = this.extractJobDescription();

      // Extract all job details with Recruitee-specific selectors
      const jobDetails = {
        title: this.extractJobTitle() || document.title || "Job on Recruitee",
        company: this.extractCompany() || "Company on Recruitee",
        department: this.extractDepartment() || "Not specified",
        location: this.extractLocation() || "Not specified",
        salary: null,
        description: description || "",
        jobUrl: window.location.href,
      };

      // Add work mode and job type to jobDetails for extraction methods to use
      jobDetails.workMode = this.extractWorkMode(jobDetails);
      jobDetails.jobType = this.extractJobType(jobDetails);

      return jobDetails;
    } catch (error) {
      console.error("Error getting job properties:", error);
      return {
        title: document.title || "Job on Recruitee",
        company: "Company on Recruitee",
        location: "Not specified",
        salary: null,
        description: "",
        jobUrl: window.location.href,
        workMode: "",
        jobType: "",
      };
    }
  }

  /**
   * Extract job title from Recruitee page
   * @returns {string} - Job title
   */
  extractJobTitle() {
    try {
      // Use Recruitee-specific job title selectors based on the HTML structure
      const titleSelectors = [
        "h1.sc-crgk9f-2", // Specific class from the HTML
        "h1", // Fallback to any h1
        ".job-title",
        ".position-title",
        "[data-testid='job-title']",
        "[data-cy='job-title']",
      ];

      for (const selector of titleSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }

      return document.title || "Job on Recruitee";
    } catch (error) {
      console.error("Error extracting job title:", error);
      return "Job on Recruitee";
    }
  }

  /**
   * Extract location from Recruitee page
   * @returns {string} - Job location
   */
  extractLocation() {
    try {
      // Use Recruitee-specific location selectors based on the HTML structure
      const locationSelectors = [
        ".custom-css-style-job-location", // Main location container
        ".sc-qfruxy-6", // Location list item class
        "[data-testid='styled-location-list-item']", // Test ID from HTML
        ".location",
        ".job-location",
        ".position-location",
        "[data-testid='location']",
        "[data-cy='location']",
      ];

      for (const selector of locationSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }

      return "Not specified";
    } catch (error) {
      console.error("Error extracting location:", error);
      return "Not specified";
    }
  }

  /**
   * Check if job matches user preferences
   * @param {Object} jobDetails - Job details object
   * @returns {Promise<boolean>} - True if job matches preferences
   */
  async doesJobMatchPreferences(jobDetails) {
    const preferences = this.config?.preferences || {};
    const backendApiHost =
      this.sessionContext?.backendApiHost || this.config?.backendApiHost;
    const jwtToken = this.sessionContext?.jwtToken || this.config?.jwtToken;

    if (!backendApiHost) {
      console.error("❌ No backendApiHost configured");
      return true;
    }

    try {
      const jobInformation = {
        title: jobDetails.title || "",
        company: jobDetails.company || "",
        location: jobDetails.location || "",
        description: jobDetails.description || "",
        salary: jobDetails.salary || "",
        jobType: jobDetails.type || "",
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
              jobDescription: jobDetails.description || "",
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

  /**
   * Check if two city names match, handling common variations and abbreviations
   * @param {string} jobCity - City name from job listing
   * @param {string} preferredCity - Preferred city name
   * @returns {boolean} - True if cities match
   */
  isCityMatch(jobCity, preferredCity) {
    const cityVariations = {
      "new york": ["nyc", "ny", "new york city"],
      "los angeles": ["la", "l.a.", "los angeles"],
      "san francisco": ["sf", "s.f.", "san francisco"],
      chicago: ["chi"],
      boston: ["bos"],
      washington: ["dc", "d.c.", "washington dc"],
      seattle: ["sea"],
      austin: ["aus"],
      denver: ["den"],
      portland: ["pdx"],
      philadelphia: ["philly", "phl"],
      miami: ["mia"],
      atlanta: ["atl"],
      dallas: ["dfw"],
      houston: ["hou"],
      "las vegas": ["vegas", "lv"],
      "san diego": ["sd"],
    };

    // Check if job city matches any variation of preferred city
    for (const [city, variations] of Object.entries(cityVariations)) {
      if (preferredCity.includes(city) || city.includes(preferredCity)) {
        // Check if job city matches the main city name or any variation
        if (jobCity.includes(city) || city.includes(jobCity)) {
          return true;
        }
        for (const variation of variations) {
          if (jobCity.includes(variation) || variation.includes(jobCity)) {
            return true;
          }
        }
      }
    }

    // Check if preferred city matches any variation of job city
    for (const [city, variations] of Object.entries(cityVariations)) {
      if (jobCity.includes(city) || city.includes(jobCity)) {
        // Check if preferred city matches the main city name or any variation
        if (preferredCity.includes(city) || city.includes(preferredCity)) {
          return true;
        }
        for (const variation of variations) {
          if (
            preferredCity.includes(variation) ||
            variation.includes(preferredCity)
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Extract job type from job details (employment type)
   * @param {Object} jobDetails - Job details object
   * @returns {string} - Normalized job type
   */
  extractJobType(jobDetails) {
    try {
      // Use Recruitee-specific selectors for job type
      const jobTypeSelectors = [
        ".employment-type",
        ".job-type",
        ".position-type",
        "[data-testid='employment-type']",
        "[data-cy='employment-type']",
      ];

      for (const selector of jobTypeSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return this.normalizeJobType(element.textContent.trim());
        }
      }

      // Fallback to searching in job description
      const description = jobDetails.description || "";
      const jobTypePatterns = [
        /full[-\s]?time/i,
        /part[-\s]?time/i,
        /contract/i,
        /temporary/i,
        /internship/i,
        /freelance/i,
      ];

      for (const pattern of jobTypePatterns) {
        const match = description.match(pattern);
        if (match) {
          return this.normalizeJobType(match[0]);
        }
      }

      return "";
    } catch (error) {
      console.error("Error extracting job type:", error);
      return "";
    }
  }

  /**
   * Extract work mode from job details (location type)
   * @param {Object} jobDetails - Job details object
   * @returns {string} - Normalized work mode
   */
  extractWorkMode(jobDetails) {
    try {
      // First try to find work mode in the job details list
      // Based on the HTML structure, work mode appears in the list with "On-site"
      const workModeSelectors = [
        ".sc-crgk9f-5 span.sc-crgk9f-7", // Work mode span from the list
        ".sc-crgk9f-7", // General span for job metadata
        ".workplace-type",
        ".work-mode",
        ".remote-status",
        "[data-testid='workplace-type']",
        "[data-cy='workplace-type']",
      ];

      for (const selector of workModeSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const text = element.textContent.trim();
          if (
            text &&
            (text.includes("On-site") ||
              text.includes("Remote") ||
              text.includes("Hybrid"))
          ) {
            return this.normalizeWorkMode(text);
          }
        }
      }

      // Fallback to searching in job description
      const description = jobDetails.description || "";
      const workModePatterns = [
        /remote/i,
        /hybrid/i,
        /on[-\s]?site/i,
        /in[-\s]?office/i,
      ];

      for (const pattern of workModePatterns) {
        const match = description.match(pattern);
        if (match) {
          return this.normalizeWorkMode(match[0]);
        }
      }

      return "";
    } catch (error) {
      console.error("Error extracting work mode:", error);
      return "";
    }
  }

  /**
   * Normalize job type to consistent format
   * @param {string} jobType - Raw job type text
   * @returns {string} - Normalized job type
   */
  normalizeJobType(jobType) {
    if (!jobType) return "";

    // Remove extra characters like slashes, pipes, etc.
    const cleaned = jobType.replace(/[\/\|]/g, "").trim();
    const normalized = cleaned.toLowerCase().trim();

    // Map various formats to standard ones
    const typeMappings = {
      "full-time": "full time",
      "full time": "full time",
      fulltime: "full time",
      "part-time": "part time",
      "part time": "part time",
      parttime: "part time",
      contract: "contract",
      temporary: "temporary",
      internship: "internship",
      freelance: "freelance",
    };

    return typeMappings[normalized] || normalized;
  }

  /**
   * Normalize work mode to consistent format
   * @param {string} workMode - Raw work mode text
   * @returns {string} - Normalized work mode
   */
  normalizeWorkMode(workMode) {
    if (!workMode) return "";

    const normalized = workMode.toLowerCase().trim();

    // Map various formats to standard ones
    const modeMappings = {
      remote: "remote",
      hybrid: "hybrid",
      "on-site": "on site",
      "on site": "on site",
      onsite: "on site",
      "in-office": "in office",
      "in office": "in office",
      inoffice: "in office",
    };

    return modeMappings[normalized] || normalized;
  }

  /**
   * Extract salary from job details
   * @param {Object} jobDetails - Job details object (optional)
   * @returns {number|null} - Extracted salary as number or null
   */
  extractSalaryFromJobDetails(jobDetails = null) {
    try {
      let salaryText = "";

      // First, try to find salary in the job details list by searching all metadata spans
      const metadataSpans = document.querySelectorAll(
        ".sc-crgk9f-5 span.sc-crgk9f-7"
      );
      for (const span of metadataSpans) {
        const text = span.textContent?.trim() || "";
        // Check if this span contains salary information (has $ or numbers with commas)
        if (text.includes("$") || /\d{1,3},\d{3}/.test(text)) {
          salaryText = text;
          break;
        }
      }

      // Fallback to other selectors
      if (!salaryText) {
        salaryText =
          jobDetails?.salary ||
          DomUtils.extractText([
            ".salary",
            ".compensation",
            ".pay",
            "[data-testid='salary']",
            "[data-cy='salary']",
          ]) ||
          jobDetails?.description ||
          "";
      }

      // Look for salary patterns like $50,000, $50k, etc.
      const salaryPatterns = [
        /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/, // $50,000 or $50,000.00
        /\$(\d+)k/i, // $50k
        /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*-\s*\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/, // 50,000 - 80,000
      ];

      for (const pattern of salaryPatterns) {
        const match = salaryText.match(pattern);
        if (match) {
          // For ranges, use the lower bound
          const salaryStr = match[1] || match[0];
          const salary = parseInt(salaryStr.replace(/[$,k]/g, ""));
          if (!isNaN(salary)) {
            // If it was a "k" format, multiply by 1000
            const finalSalary = salaryText.includes("k")
              ? salary * 1000
              : salary;
            return finalSalary;
          }
        }
      }

      return null;
    } catch (error) {
      console.error("Error extracting salary:", error);
      return null;
    }
  }
}
