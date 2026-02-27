// content/content-bridge.js
// Simplified content script - thin bridge to background
// Replaces 1522-line content-main.js with ~150 lines

/**
 * ContentBridge - Minimal content script that receives injected context
 * No polling, no retries - context is injected before this runs
 */
class ContentBridge {
  constructor() {
    this.context = null;
    this.platform = null;
    this.platformModule = null;
    this.isInitialized = false;

    // Set up global event forwarder immediately (for frontend tabs)
    this.setupGlobalEventForwarder();
  }

  /**
   * Set up a global message listener that forwards automation events to window.
   * This runs on ALL pages (including frontend) to enable React hooks to receive events.
   */
  setupGlobalEventForwarder() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      const messageType = request.type || request.action;

      // Forward automation events to window for React frontend to receive
      if (
        [
          "AUTOMATION_STOPPED",
          "AUTOMATION_COMPLETED",
          "AUTOMATION_ERROR",
          "JOB_APPLIED",
        ].includes(messageType)
      ) {
        window.postMessage(
          {
            source: "fastapply-extension",
            type: messageType,
            ...request,
          },
          "*"
        );
        sendResponse({ success: true, forwarded: true });
        return true;
      }

      return false;
    });
  }

  /**
   * Initialize the bridge
   * Uses handshake pattern: signal ready → receive context
   */
  async initialize() {
    // Check if context already exists (injected by background)
    if (window.automationContext) {
      await this.startup(window.automationContext);
      return;
    }

    // Set up event listener FIRST before signaling ready
    const contextPromise = this.waitForContext(10000);

    // Signal to background that we're ready to receive context
    // This implements the handshake pattern to fix the race condition
    try {
      const response = await chrome.runtime.sendMessage({
        type: "CONTENT_SCRIPT_READY",
        url: window.location.href,
        timestamp: Date.now(),
      });

      if (response?.contextInjected) {
        // Context was injected synchronously, check for it
        if (window.automationContext) {
          await this.startup(window.automationContext);
          return;
        }
      }
    } catch (error) {
      // Extension context may be invalid or no background listener - exit silently
      console.debug("ContentBridge: No automation session for this tab");
      return;
    }

    // Wait for context injection event
    const context = await contextPromise;
    if (context) {
      await this.startup(context);
    }
    // If no context after timeout, this is not an automation tab - exit silently
  }

  /**
   * Wait for context injection event
   * @param {number} timeout - Max wait time in ms
   * @returns {Promise<Object|null>}
   */
  waitForContext(timeout) {
    return new Promise((resolve) => {
      // Check again in case it was set between constructor and now
      if (window.automationContext) {
        resolve(window.automationContext);
        return;
      }

      const timeoutId = setTimeout(() => {
        resolve(null);
      }, timeout);

      window.addEventListener(
        "AUTOMATION_CONTEXT_READY",
        (event) => {
          clearTimeout(timeoutId);
          resolve(event.detail);
        },
        { once: true }
      );
    });
  }

  /**
   * Start the automation with context
   * @param {Object} context - Session context
   */
  async startup(context) {
    if (this.isInitialized) return;

    // Set flag immediately to prevent race conditions
    this.isInitialized = true;

    this.context = context;

    try {
      // Load platform module dynamically
      this.platformModule = await this.loadPlatformModule(context.platform);

      if (!this.platformModule) {
        console.error(`❌ Platform ${context.platform} not supported`);
        return;
      }

      // Format context into config structure expected by platform constructors
      const platformConfig = {
        sessionId: context.sessionId,
        platform: context.platform,
        userId: context.userId,
        userProfile: context.userProfile,
        aiApiHost: context.aiApiHost,
        backendApiHost: context.backendApiHost,
        jwtToken: context.jwtToken,
        devMode: context.devMode,
        config: {
          jobsToApply: context.jobsToApply,
          preferences: context.preferences,
          devMode: context.devMode,
        },
        sessionContext: context, // Pass full context for backwards compatibility
      };

      // Create platform instance with formatted config
      this.platform = new this.platformModule(platformConfig);

      // Set up message listener for background communication
      this.setupMessageListener();

      // Initialize platform
      if (this.platform.initialize) {
        await this.platform.initialize();
      }

      // Start automation immediately after initialization
      // This triggers the job search/application process
      if (this.platform.start) {
        await this.platform.start();
      }

      // Notify background we're ready
      this.notifyReady();

      this.isInitialized = true;
    } catch (error) {
      console.error("❌ ContentBridge startup error:", error);
      this.notifyError(error);
    }
  }

  /**
   * Load platform module dynamically
   * @param {string} platform
   * @returns {Promise<Class|null>}
   */
  async loadPlatformModule(platform) {
    const modules = {
      recruitee: () => import("../platforms/recruitee/recruitee.js"),
      greenhouse: () => import("../platforms/greenhouse/greenhouse.js"),
      lever: () => import("../platforms/lever/lever.js"),
      indeed: () => import("../platforms/indeed/indeed.js"),
      glassdoor: () => import("../platforms/glassdoor/glassdoor.js"),
      dice: () => import("../platforms/dice/dice.js"),
      simplyhired: () => import("../platforms/simplyhired/simplyhired.js"),
      ziprecruiter: () => import("../platforms/ziprecruiter/ziprecruiter.js"),
      workable: () => import("../platforms/workable/workable.js"),
      ashby: () => import("../platforms/ashby/ashby.js"),
      breezy: () => import("../platforms/breezy/breezy.js"),
      wellfound: () => import("../platforms/wellfound/wellfound.js"),
      linkedin: () => import("../platforms/linkedin/linkedin.js"),
      workday: () => import("../platforms/workday/workday.js"),
      bayt: () => import("../platforms/bayt/bayt.js"),
      reed: () => import("../platforms/reed/reed.js"),
      smartrecruiters: () =>
        import("../platforms/smartrecruiters/smartrecruiters.js"),
      jobvite: () => import("../platforms/jobvite/jobvite.js"),
      rippling: () => import("../platforms/rippling/rippling.js"),
      icims: () => import("../platforms/icims/icims.js"),
      monster: () => import("../platforms/monster/monster.js"),
    };

    const loader = modules[platform];
    if (!loader) return null;

    try {
      const module = await loader();
      return module.default;
    } catch (error) {
      console.error(`Failed to load ${platform} module:`, error);
      return null;
    }
  }

  /**
   * Set up message listener
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true;
    });
  }

  /**
   * Handle incoming messages
   */
  async handleMessage(request, sender, sendResponse) {
    const { type, action } = request;
    const messageType = type || action;

    switch (messageType) {
      case "PAUSE":
        if (this.platform?.pause) await this.platform.pause();
        sendResponse({ success: true });
        break;

      case "RESUME":
        if (this.platform?.resume) await this.platform.resume();
        sendResponse({ success: true });
        break;

      case "STOP":
        if (this.platform?.stop) await this.platform.stop();
        sendResponse({ success: true });
        break;

      case "CONTROL_ACTION":
        await this.handleControlAction(request.action);
        sendResponse({ success: true });
        break;

      case "INJECT_CONTEXT":
      case "START_AUTOMATION_NOW":
        // Late context injection - allows starting automation after page has loaded
        if (!this.isInitialized && request.context) {
          await this.startup(request.context);
          sendResponse({ success: true, started: true });
        } else if (this.isInitialized) {
          sendResponse({ success: false, error: "Already initialized" });
        } else {
          sendResponse({ success: false, error: "No context provided" });
        }
        break;

      case "AUTOMATION_STOPPED":
      case "AUTOMATION_COMPLETED":
      case "AUTOMATION_ERROR":
      case "JOB_APPLIED":
        window.postMessage(
          {
            source: "fastapply-extension",
            type: messageType,
            ...request,
          },
          "*"
        );
        sendResponse({ success: true });
        break;

      default:
        // Forward to platform if it has a handler
        if (this.platform?.handleMessage) {
          await this.platform.handleMessage(request, sendResponse);
        } else {
          sendResponse({ error: "Unknown message type" });
        }
    }
  }

  /**
   * Handle control actions from overlay
   */
  async handleControlAction(action) {
    if (!this.platform) return;

    switch (action) {
      case "PAUSE":
        if (this.platform.pause) await this.platform.pause();
        break;
      case "RESUME":
        if (this.platform.resume) await this.platform.resume();
        break;
      case "STOP":
        if (this.platform.stop) await this.platform.stop();
        break;
      case "SKIP":
        if (this.platform.skip) await this.platform.skip();
        break;
    }
  }

  /**
   * Notify background that content script is ready
   */
  notifyReady() {
    chrome.runtime
      .sendMessage({
        action: "contentScriptReady",
        sessionId: this.context.sessionId,
        platform: this.context.platform,
      })
      .catch(() => {});
  }

  /**
   * Notify background of error
   */
  notifyError(error) {
    chrome.runtime
      .sendMessage({
        type: "CONTENT_ERROR",
        error: error.message,
        sessionId: this.context?.sessionId,
      })
      .catch(() => {});
  }

  /**
   * Send message to background
   */
  sendToBackground(message) {
    return chrome.runtime.sendMessage({
      ...message,
      sessionId: this.context?.sessionId,
    });
  }
}

// Initialize on load
const bridge = new ContentBridge();
bridge.initialize();
