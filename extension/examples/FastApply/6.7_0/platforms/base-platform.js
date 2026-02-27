// platforms/base-platform.js
import Logger from "../../core/logger.js";
import AIService from "../../services/ai-service.js";

export default class BasePlatform {
  constructor(config) {
    this.sessionId = config.sessionId;
    this.platform = config.platform;
    this.userId = config.userId;
    this.contentScript = config.contentScript;
    this.config = config.config || {};
    this.aiService = new AIService({
      apiHost: this.apiHost,
      platform: this.platform
    });

    // State
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
    this.devMode = config.devMode || config.config?.devMode || false;
  }

  async initialize() {
    console.log("🚀 Initializing platform automation");
  }

  async start(params = {}) {
    throw new Error("start() method must be implemented by platform class");
  }

  async findJobs() {
    throw new Error("findJobs() method must be implemented by platform class");
  }

  async applyToJob(jobElement) {
    throw new Error(
      "applyToJob() method must be implemented by platform class"
    );
  }

  async setSessionContext(sessionContext) {
    try {
      this.sessionContext = sessionContext;

      // Update basic properties if available
      if (sessionContext.sessionId) this.sessionId = sessionContext.sessionId;
      if (sessionContext.platform) this.platform = sessionContext.platform;
      if (sessionContext.userId) this.userId = sessionContext.userId;
      if (sessionContext.userProfile)
        this.userProfile = sessionContext.userProfile;
      if (sessionContext.devMode !== undefined) {
        this.devMode = sessionContext.devMode;
      }
    } catch (error) {
      throw error;
    }
  }

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
  async getAIAnswer(question, options = [], fieldElement = null, additionalContext = {}) {
    const context = {
      platform: this.platform,
      userData: this.userData || this.userProfile,
      jobDescription: this.jobDescription || this.scrapeJobDescription?.() || "",
      fieldElement,
      ...additionalContext
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
}
