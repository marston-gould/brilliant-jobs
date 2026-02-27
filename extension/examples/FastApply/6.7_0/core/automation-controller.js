// core/automation-controller.js
// Central controller - Single Source of Truth for all automation state

import SessionState from "./state/session-state.js";
import PlatformQueue from "./state/platform-queue.js";
import LinkQueue from "./state/link-queue.js";
import Logger from "./logger.js";
import ApplicationTrackerService from "../services/application-tracker-service.js";
import { buildStartingUrl } from "./url-builders.js";
import UniversalJobRouter from "./universal-job-router.js";

/**
 * Platform configuration for domain matching and link patterns
 * Note: URL building is now handled by url-builders.js
 */
const PLATFORM_CONFIG = {
  recruitee: {
    domains: ["recruitee.com"],
    linkPattern: /^https:\/\/.*\.recruitee\.com\/(o|career)\/([^\/]+)\/?.*$/,
  },
  greenhouse: {
    domains: ["greenhouse.io", "boards.greenhouse.io", "my.greenhouse.io"],
    linkPattern: /^https:\/\/boards\.greenhouse\.io\/[^\/]+\/jobs\/\d+/,
  },
  lever: {
    domains: ["lever.co", "jobs.lever.co"],
    linkPattern: /^https:\/\/jobs\.lever\.co\/[^\/]+\/[a-f0-9-]+/,
  },
  indeed: {
    domains: ["indeed.com"],
    linkPattern: /indeed\.com\/viewjob/,
  },
  glassdoor: {
    domains: ["glassdoor.com"],
    linkPattern: /glassdoor\.com\/job-listing/,
  },
  dice: {
    domains: ["dice.com"],
    linkPattern: /dice\.com\/job-detail/,
  },
  simplyhired: {
    domains: ["simplyhired.com"],
    linkPattern: /simplyhired\.com\/job/,
  },
  ziprecruiter: {
    domains: ["ziprecruiter.com"],
    linkPattern: /ziprecruiter\.com\/c\/.*\/job/,
  },
  workable: {
    domains: ["workable.com", "apply.workable.com"],
    linkPattern: /apply\.workable\.com\/[^\/]+\/j\//,
  },
  ashby: {
    domains: ["ashbyhq.com", "jobs.ashbyhq.com"],
    linkPattern: /jobs\.ashbyhq\.com\/[^\/]+\/[a-f0-9-]+/,
  },
  breezy: {
    domains: ["breezy.hr"],
    linkPattern: /\.breezy\.hr\/p\//,
  },
  wellfound: {
    domains: ["wellfound.com"],
    linkPattern: /wellfound\.com\/jobs/,
  },
  linkedin: {
    domains: ["linkedin.com"],
    linkPattern: /linkedin\.com\/jobs\/view/,
  },
  workday: {
    domains: ["myworkdayjobs.com"],
    linkPattern: /myworkdayjobs\.com/,
  },
  bayt: {
    domains: ["bayt.com"],
    linkPattern: /bayt\.com\/en\/.*\/jobs\/\d+\.html/,
  },
  reed: {
    domains: ["reed.co.uk"],
    linkPattern: /reed\.co\.uk\/jobs\/.*\/\d+/,
  },
  smartrecruiters: {
    domains: ["smartrecruiters.com", "jobs.smartrecruiters.com"],
    linkPattern: /jobs\.smartrecruiters\.com\/[^\/]+\/[^\/]+/,
  },
  jobvite: {
    domains: ["jobvite.com", "jobs.jobvite.com"],
    linkPattern: /jobs\.jobvite\.com\/[^\/]+\/job\/[^\/]+/,
  },
  rippling: {
    domains: ["rippling.com", "ats.rippling.com"],
    linkPattern: /ats\.rippling\.com\/[^\/]+\/jobs\/[^\/]+/,
  },
  icims: {
    domains: ["icims.com", "careers-", ".icims.com"],
    linkPattern: /icims\.com\/jobs\/\d+/,
  },
  monster: {
    domains: ["monster.com", "www.monster.com"],
    linkPattern: /monster\.com\/job-openings\//,
  },

  // ============================================
  // Aggregator Platforms (redirect to ATS)
  // ============================================
  weworkremotely: {
    domains: ["weworkremotely.com"],
    linkPattern: /weworkremotely\.com\/remote-jobs\//,
    isAggregator: true,
    searchUrl: "https://weworkremotely.com/remote-jobs/search",
  },
  remoteok: {
    domains: ["remoteok.com", "remoteok.io"],
    linkPattern: /remoteok\.(com|io)\/remote-jobs\//,
    isAggregator: true,
    searchUrl: "https://remoteok.com/remote-jobs",
  },
  builtin: {
    domains: ["builtin.com"],
    linkPattern: /builtin\.com\/job\//,
    isAggregator: true,
    searchUrl: "https://builtin.com/jobs",
  },
  angel: {
    domains: ["angel.co", "wellfound.com"],
    linkPattern: /(angel\.co|wellfound\.com)\/jobs/,
    isAggregator: true,
    searchUrl: "https://wellfound.com/jobs",
  },
  flexjobs: {
    domains: ["flexjobs.com"],
    linkPattern: /flexjobs\.com\/publicjobs\/.*\/\d+/,
    isAggregator: true,
    searchUrl: "https://www.flexjobs.com/search",
  },
  otta: {
    domains: ["otta.com"],
    linkPattern: /otta\.com\/jobs\//,
    isAggregator: true,
    searchUrl: "https://otta.com/jobs",
  },
};

/**
 * AutomationController - Central orchestrator for all automation sessions
 * Implements Single Source of Truth pattern
 */
export default class AutomationController {
  constructor(devMode = false) {
    this.logger = new Logger("AutomationController", devMode);
    this.devMode = devMode;

    // Session registry - the ONLY place sessions are stored
    this.sessions = new Map(); // sessionId -> SessionState

    // Window/Tab mappings for quick lookup
    this.windowToSession = new Map(); // windowId -> sessionId
    this.tabToSession = new Map(); // tabId -> sessionId

    // Platform handlers (lazy loaded)
    this.platformHandlers = new Map();

    // Frontend tab cache - populated at automation start for reliable notifications
    this.frontendTabIds = new Set();

    // Platform queue for multi-platform automation
    this.platformQueue = null;
    this.currentQueueSessionId = null;

    // Link queue for URL-based automation
    this.linkQueue = null;
    this.currentLinkQueueSessionId = null;

    // Keep-awake state to prevent system sleep during automation
    this.keepAwakeActive = false;

    // Universal Job Router for aggregator and non-easy-apply jobs
    this.universalRouter = null;

    console.log("✅ AutomationController initialized");
  }

  /**
   * Get or create the Universal Job Router
   * @returns {UniversalJobRouter}
   */
  getUniversalRouter() {
    if (!this.universalRouter) {
      this.universalRouter = new UniversalJobRouter(this, this.devMode);
    }
    return this.universalRouter;
  }

  /**
   * Check if platform is an aggregator
   * @param {string} platform - Platform name
   * @returns {boolean}
   */
  isAggregatorPlatform(platform) {
    const config = PLATFORM_CONFIG[platform];
    return config?.isAggregator === true;
  }

  // ============================================
  // Session Lifecycle
  // ============================================

  /**
   * Start a new automation session
   * This is the MAIN entry point from the frontend
   * @param {Object} params - Session parameters from frontend
   * @returns {Promise<Object>} Result with sessionId and windowId
   */
  async startAutomation(params) {
    try {
      console.log("🚀 Starting automation", { platform: params.platform });

      // Validate required params
      this.validateParams(params);

      // Enable keep-awake to prevent system sleep during automation
      this.enableKeepAwake();

      // Cache frontend tabs at start for reliable notifications during automation
      await this.cacheFrontendTabs();

      // Create session state
      const session = new SessionState(params);
      this.sessions.set(session.id, session);

      // Initialize ApplicationTrackerService for this session
      session.applicationTracker = new ApplicationTrackerService({
        userId: session.userId,
        jobProfileId: session.userProfile?.id,
        backendApiHost: session.config.backendApiHost,
        jwtToken: session.config.jwtToken,
      });

      console.log(session);

      // Build starting URL with full preferences support
      const startUrl = this.buildStartUrl(
        session.platform,
        session.config.preferences,
        session.userProfile?.country
      );

      // Create automation window
      const window = await this.createAutomationWindow(startUrl);

      // Update session with window ID
      session.start(window.id);
      this.windowToSession.set(window.id, session.id);

      // Wait for tab to be ready, then inject context
      const tabs = await chrome.tabs.query({ windowId: window.id });
      if (tabs.length > 0) {
        const tab = tabs[0];
        this.tabToSession.set(tab.id, session.id);

        // Inject context immediately (no polling needed on content side)
        await this.injectContext(tab.id, session);
      }

      // Mark session as running
      session.run();

      console.log("✅ Automation started", {
        sessionId: session.id,
        windowId: window.id,
      });

      return {
        success: true,
        sessionId: session.id,
        windowId: window.id,
        platform: session.platform,
      };
    } catch (error) {
      console.error("❌ Failed to start automation", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Start automation for an aggregator platform
   * Aggregators (WeWorkRemotely, RemoteOK, etc.) click apply buttons which redirect to ATS
   * The UniversalJobRouter handles routing to the appropriate handler
   * @param {Object} params - Session parameters from frontend
   * @returns {Promise<Object>} Result with sessionId and windowId
   */
  async startAggregatorAutomation(params) {
    try {
      const { platform } = params;
      console.log("🚀 Starting aggregator automation", { platform });

      // Validate it's an aggregator platform
      if (!this.isAggregatorPlatform(platform)) {
        throw new Error(`${platform} is not an aggregator platform`);
      }

      // Get aggregator config
      const platformConfig = PLATFORM_CONFIG[platform];

      // Start like normal automation, but mark session as aggregator mode
      const result = await this.startAutomation(params);

      if (result.success) {
        const session = this.getSession(result.sessionId);
        if (session) {
          session.isAggregatorMode = true;
          session.aggregatorPlatform = platform;

          // Initialize the universal router for this session
          const router = this.getUniversalRouter();
          session.universalRouter = router;

          console.log(`✅ Aggregator automation started for ${platform}`);
        }
      }

      return result;
    } catch (error) {
      console.error("❌ Failed to start aggregator automation", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Route a job URL through the Universal Job Router
   * Called by aggregator content scripts after clicking apply
   * @param {string} sessionId - Current session ID
   * @param {string} url - The URL to route
   * @param {number} tabId - The tab ID
   * @returns {Promise<Object>} Routing result
   */
  async routeJobUrl(sessionId, url, tabId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return { success: false, error: "Session not found" };
    }

    const router = this.getUniversalRouter();

    try {
      const result = await router.routeJob(url, tabId, {
        sessionId,
        userProfile: session.userProfile,
        preferences: session.config.preferences,
        platform: session.platform,
      });

      return result;
    } catch (error) {
      console.error("❌ Error routing job URL:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get session by ID
   * @param {string} sessionId
   * @returns {SessionState|null}
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get session for a window
   * @param {number} windowId
   * @returns {SessionState|null}
   */
  getSessionForWindow(windowId) {
    const sessionId = this.windowToSession.get(windowId);
    return sessionId ? this.getSession(sessionId) : null;
  }

  /**
   * Get session for a tab
   * @param {number} tabId
   * @returns {SessionState|null}
   */
  getSessionForTab(tabId) {
    const sessionId = this.tabToSession.get(tabId);
    return sessionId ? this.getSession(sessionId) : null;
  }

  /**
   * Pause automation
   * @param {string} sessionId
   */
  async pauseAutomation(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    session.pause();
    await this.broadcastToSession(sessionId, { type: "PAUSE" });

    return { success: true };
  }

  /**
   * Resume automation
   * @param {string} sessionId
   */
  async resumeAutomation(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    session.resume();
    await this.broadcastToSession(sessionId, { type: "RESUME" });

    return { success: true };
  }

  /**
   * Stop automation
   * @param {string} sessionId
   * @param {string} reason
   */
  async stopAutomation(sessionId, reason = "User stopped") {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    session.stop(reason);

    // Close the automation window
    if (session.windowId) {
      try {
        await chrome.windows.remove(session.windowId);
      } catch (e) {
        // Window may already be closed
      }
    }

    // Cleanup mappings
    this.cleanupSession(sessionId);

    return { success: true };
  }

  /**
   * Get automation status
   * @param {string} sessionId
   */
  getStatus(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return { error: "Session not found" };

    return session.getStatus();
  }

  // ============================================
  // Multi-Platform Queue Operations
  // ============================================

  /**
   * Start automation for multiple platforms in sequence
   * @param {Object} params - Params containing platforms array and shared config
   * @returns {Promise<Object>} Result with queueId and first session info
   */
  async startMultiPlatformAutomation(params) {
    try {
      const { platforms, ...sharedParams } = params;

      console.log("🚀 Starting multi-platform automation", { platforms });

      if (!Array.isArray(platforms) || platforms.length === 0) {
        throw new Error("Platforms array is required and must not be empty");
      }

      // Validate all platforms
      for (const platform of platforms) {
        if (!PLATFORM_CONFIG[platform]) {
          throw new Error(`Unknown platform: ${platform}`);
        }
      }

      // Create the platform queue
      this.platformQueue = new PlatformQueue(platforms, sharedParams);
      this.platformQueue.start();

      console.log(`📋 Queue created:`, {
        queueId: this.platformQueue.id,
        status: this.platformQueue.status,
        platforms: this.platformQueue.platforms,
        hasActiveQueue: this.hasActiveQueue(),
      });

      // Cache frontend tabs
      await this.cacheFrontendTabs();

      // Start the first platform
      const firstPlatform = this.platformQueue.getCurrentPlatform();
      const firstPlatformParams =
        this.platformQueue.getParamsForPlatform(firstPlatform);

      console.log(
        `📋 Queue created with ${platforms.length} platforms, starting with: ${firstPlatform}`
      );

      const result = await this.startAutomation(firstPlatformParams);

      if (result.success) {
        this.currentQueueSessionId = result.sessionId;
        this.platformQueue.sessionIds.set(firstPlatform, result.sessionId);

        console.log(`📋 After first platform started:`, {
          queueExists: !!this.platformQueue,
          queueActive: this.hasActiveQueue(),
          currentQueueSessionId: this.currentQueueSessionId,
        });

        // Notify frontend that first platform started
        await this.notifyFrontend({
          type: "PLATFORM_STARTED",
          queueId: this.platformQueue.id,
          platform: firstPlatform,
          sessionId: result.sessionId,
          windowId: result.windowId,
          queueStatus: this.platformQueue.getStatus(),
          timestamp: Date.now(),
        });
      }

      return {
        success: result.success,
        queueId: this.platformQueue.id,
        sessionId: result.sessionId,
        windowId: result.windowId,
        currentPlatform: firstPlatform,
        totalPlatforms: platforms.length,
        remainingPlatforms: platforms.slice(1),
        error: result.error,
      };
    } catch (error) {
      console.error("❌ Failed to start multi-platform automation", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Handle platform completion - start next platform or complete queue
   * Called when a session completes (SEARCH_COMPLETED or target reached)
   * @param {string} sessionId - The session that completed
   * @param {Object} progress - Progress data from the completed session
   */
  async handlePlatformComplete(sessionId, progress = {}) {
    if (!this.platformQueue || !this.platformQueue.isActive()) {
      console.log(
        "📋 No active platform queue, skipping handlePlatformComplete"
      );
      return;
    }

    const session = this.getSession(sessionId);
    if (!session) {
      console.warn(
        `⚠️ Session ${sessionId} not found for handlePlatformComplete`
      );
      return;
    }

    const completedPlatform = session.platform;
    console.log(
      `✅ Platform ${completedPlatform} completed, checking queue...`
    );

    // Record the completed platform
    this.platformQueue.recordPlatformComplete(
      completedPlatform,
      progress,
      sessionId
    );

    // Notify frontend that this platform completed
    await this.notifyFrontend({
      type: "PLATFORM_COMPLETED",
      queueId: this.platformQueue.id,
      platform: completedPlatform,
      progress: { ...progress },
      queueStatus: this.platformQueue.getStatus(),
      timestamp: Date.now(),
    });

    // Close the current window
    if (session.windowId) {
      try {
        await chrome.windows.remove(session.windowId);
        console.log(
          `🪟 Closed window ${session.windowId} for ${completedPlatform}`
        );
      } catch (e) {
        console.warn(`Could not close window: ${e.message}`);
      }
    }

    // Cleanup the completed session
    this.cleanupSession(sessionId);

    // Get next platform
    const nextPlatform = this.platformQueue.getNext();

    if (!nextPlatform) {
      // Queue is complete
      console.log("🎉 All platforms completed!");

      await this.notifyFrontend({
        type: "QUEUE_COMPLETED",
        queueId: this.platformQueue.id,
        results: this.platformQueue.results,
        totalCompleted: this.platformQueue.results.length,
        timestamp: Date.now(),
      });

      // Clear the queue
      this.platformQueue = null;
      this.currentQueueSessionId = null;
      return;
    }

    // Start next platform
    console.log(`📋 Starting next platform: ${nextPlatform}`);

    const nextParams = this.platformQueue.getParamsForPlatform(nextPlatform);

    // Small delay before starting next platform
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const result = await this.startAutomation(nextParams);

    if (result.success) {
      this.currentQueueSessionId = result.sessionId;
      this.platformQueue.sessionIds.set(nextPlatform, result.sessionId);

      await this.notifyFrontend({
        type: "PLATFORM_STARTED",
        queueId: this.platformQueue.id,
        platform: nextPlatform,
        sessionId: result.sessionId,
        windowId: result.windowId,
        queueStatus: this.platformQueue.getStatus(),
        timestamp: Date.now(),
      });
    } else {
      console.error(`❌ Failed to start ${nextPlatform}: ${result.error}`);
      // Record failure and try next
      this.platformQueue.recordPlatformStopped(nextPlatform, result.error);
      // Recursively try next platform
      await this.handlePlatformComplete(null, {});
    }
  }

  /**
   * Stop the entire platform queue
   * @param {string} reason - Reason for stopping
   */
  async stopQueue(reason = "User stopped") {
    if (!this.platformQueue) {
      return { success: false, error: "No active queue" };
    }

    console.log(`🛑 Stopping platform queue: ${reason}`);

    // Stop current session
    if (this.currentQueueSessionId) {
      try {
        await this.stopAutomation(this.currentQueueSessionId, reason);
      } catch (e) {
        console.warn("Error stopping current session:", e.message);
      }
    }

    // Stop the queue
    this.platformQueue.stop(reason);

    await this.notifyFrontend({
      type: "QUEUE_STOPPED",
      queueId: this.platformQueue.id,
      reason,
      results: this.platformQueue.results,
      timestamp: Date.now(),
    });

    // Clear queue state
    this.platformQueue = null;
    this.currentQueueSessionId = null;

    return { success: true };
  }

  /**
   * Get queue status
   * @returns {Object|null} Queue status or null if no queue
   */
  getQueueStatus() {
    if (!this.platformQueue) {
      return null;
    }
    return this.platformQueue.getStatus();
  }

  /**
   * Check if there is an active platform queue
   * @returns {boolean}
   */
  hasActiveQueue() {
    return this.platformQueue !== null && this.platformQueue.isActive();
  }

  // ============================================
  // Link Queue Operations
  // ============================================

  /**
   * Detect platform from a URL
   * @param {string} url - Job URL to detect platform from
   * @returns {string|null} Platform name or null if not detected
   */
  detectPlatformFromUrl(url) {
    if (!url) return null;

    const normalizedUrl = url.toLowerCase();

    for (const [platform, config] of Object.entries(PLATFORM_CONFIG)) {
      // Check if URL contains any of the platform's domains
      const domainMatch = config.domains.some((domain) =>
        normalizedUrl.includes(domain.toLowerCase())
      );

      if (domainMatch) {
        console.log(`🔍 Detected platform "${platform}" from URL: ${url}`);
        return platform;
      }
    }

    console.warn(`⚠️ Could not detect platform from URL: ${url}`);
    return null;
  }

  /**
   * Start automation for a queue of job URLs
   * Each URL is processed sequentially - platform is auto-detected
   * @param {Object} params - Params containing links array and shared config
   * @returns {Promise<Object>} Result with queueId and first session info
   */
  async startLinkQueueAutomation(params) {
    try {
      const { links, ...sharedParams } = params;

      console.log("🚀 Starting link queue automation", {
        linkCount: links?.length,
      });

      if (!Array.isArray(links) || links.length === 0) {
        throw new Error("Links array is required and must not be empty");
      }

      // Normalize links and detect platforms
      const normalizedLinks = links.map((link) => {
        const url = typeof link === "string" ? link : link.url;
        const platform =
          (typeof link === "object" && link.platform) ||
          this.detectPlatformFromUrl(url);
        return { url, platform };
      });

      // Filter out links with undetectable platforms
      const validLinks = normalizedLinks.filter((link) => link.platform);
      const skippedLinks = normalizedLinks.filter((link) => !link.platform);

      if (skippedLinks.length > 0) {
        console.warn(
          `⚠️ Skipping ${skippedLinks.length} links with undetectable platforms:`,
          skippedLinks.map((l) => l.url)
        );
      }

      if (validLinks.length === 0) {
        throw new Error(
          "No valid links found - could not detect platform for any provided URLs"
        );
      }

      // Create the link queue
      this.linkQueue = new LinkQueue(validLinks, sharedParams);
      this.linkQueue.start();

      // Record skipped links
      skippedLinks.forEach((link, idx) => {
        this.linkQueue.recordLinkSkipped(
          idx,
          link.url,
          "Platform not detected"
        );
      });

      console.log(`📋 Link queue created:`, {
        queueId: this.linkQueue.id,
        status: this.linkQueue.status,
        totalLinks: validLinks.length,
        skippedLinks: skippedLinks.length,
      });

      // Cache frontend tabs
      await this.cacheFrontendTabs();

      // Start the first link
      const firstLink = this.linkQueue.getCurrentLink();
      const firstPlatform = firstLink.platform;
      const firstParams = this.linkQueue.getParamsForLink(
        firstLink,
        firstPlatform
      );

      console.log(
        `📋 Starting first link: ${firstLink.url} (${firstPlatform})`
      );

      const result = await this.startLinkAutomation(firstParams);

      if (result.success) {
        this.currentLinkQueueSessionId = result.sessionId;
        this.linkQueue.sessionIds.set(0, result.sessionId);

        // Notify frontend that link queue started
        await this.notifyFrontend({
          type: "LINK_QUEUE_STARTED",
          queueId: this.linkQueue.id,
          currentLink: firstLink,
          currentIndex: 0,
          platform: firstPlatform,
          sessionId: result.sessionId,
          windowId: result.windowId,
          queueStatus: this.linkQueue.getStatus(),
          timestamp: Date.now(),
        });
      }

      return {
        success: result.success,
        queueId: this.linkQueue.id,
        queueType: "link",
        sessionId: result.sessionId,
        windowId: result.windowId,
        currentLink: firstLink,
        currentPlatform: firstPlatform,
        totalLinks: validLinks.length,
        skippedLinks: skippedLinks.length,
        remainingLinks: validLinks.length - 1,
        error: result.error,
      };
    } catch (error) {
      console.error("❌ Failed to start link queue automation", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Start automation for a single link (used by link queue)
   * Opens directly to the job URL instead of a search page
   * @param {Object} params - Session parameters with directJobUrl
   * @returns {Promise<Object>} Result with sessionId and windowId
   */
  async startLinkAutomation(params) {
    try {
      const { directJobUrl, platform } = params;

      console.log("🚀 Starting link automation", {
        platform,
        url: directJobUrl,
      });

      // Validate required params
      if (!platform) throw new Error("Platform is required");
      if (!params.userId) throw new Error("User ID is required");
      if (!params.selectedProfile) throw new Error("User profile is required");
      if (!directJobUrl) throw new Error("Direct job URL is required");
      if (!PLATFORM_CONFIG[platform]) {
        throw new Error(`Unknown platform: ${platform}`);
      }

      // Enable keep-awake
      this.enableKeepAwake();

      // Cache frontend tabs
      await this.cacheFrontendTabs();

      // Create session state with link queue mode flag
      const session = new SessionState({
        ...params,
        // Set jobsToApply to 1 since we're processing one link at a time
        jobsToApply: 1,
      });
      session.isLinkQueueMode = true;
      session.directJobUrl = directJobUrl;
      this.sessions.set(session.id, session);

      // Initialize ApplicationTrackerService
      session.applicationTracker = new ApplicationTrackerService({
        userId: session.userId,
        jobProfileId: session.userProfile?.id,
        backendApiHost: session.config.backendApiHost,
        jwtToken: session.config.jwtToken,
      });

      // Create automation window with the direct job URL
      const window = await this.createAutomationWindow(directJobUrl);

      // Update session with window ID
      session.start(window.id);
      this.windowToSession.set(window.id, session.id);

      // Get the tab and set up automation trigger
      const tabs = await chrome.tabs.query({ windowId: window.id });
      if (tabs.length > 0) {
        const tab = tabs[0];
        this.tabToSession.set(tab.id, session.id);

        // Inject context immediately
        await this.injectContext(tab.id, session);

        // Set up listener to send START_AUTOMATION_NOW when tab loads
        // This triggers the platform automation to start filling the application
        const onUpdatedListener = (tabId, changeInfo, updatedTab) => {
          if (
            tabId === tab.id &&
            changeInfo.status === "complete" &&
            updatedTab.url &&
            updatedTab.url !== "chrome://newtab/"
          ) {
            // Remove listener
            chrome.tabs.onUpdated.removeListener(onUpdatedListener);

            // Wait for content script to initialize, then send START_AUTOMATION_NOW
            setTimeout(async () => {
              try {
                // Re-inject context in case it wasn't ready
                await this.injectContext(tab.id, session);

                await chrome.tabs.sendMessage(tab.id, {
                  type: "START_AUTOMATION_NOW",
                  data: {
                    url: directJobUrl,
                    immediate: true,
                    isLinkQueueMode: true,
                  },
                });
                console.log(
                  `✅ Sent START_AUTOMATION_NOW to link queue tab ${tab.id}`
                );
              } catch (error) {
                console.warn(
                  `⚠️ Could not send START_AUTOMATION_NOW:`,
                  error.message
                );
              }
            }, 2000);
          }
        };

        chrome.tabs.onUpdated.addListener(onUpdatedListener);

        // Timeout fallback - remove listener after 15 seconds
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(onUpdatedListener);
        }, 15000);
      }

      // Mark session as running
      session.run();

      console.log("✅ Link automation started", {
        sessionId: session.id,
        windowId: window.id,
        url: directJobUrl,
      });

      return {
        success: true,
        sessionId: session.id,
        windowId: window.id,
        platform: session.platform,
      };
    } catch (error) {
      console.error("❌ Failed to start link automation", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Handle link completion - start next link or complete queue
   * Called when a single job application completes (JOB_SUCCESS, JOB_FAILURE, etc.)
   * @param {string} sessionId - The session that completed
   * @param {Object} result - Result data {success, jobData, error}
   */
  async handleLinkComplete(sessionId, result = {}) {
    if (!this.linkQueue || !this.linkQueue.isActive()) {
      console.log("📋 No active link queue, skipping handleLinkComplete");
      return;
    }

    const session = this.getSession(sessionId);
    if (!session) {
      console.warn(
        `⚠️ Session ${sessionId} not found for handleLinkComplete`
      );
      return;
    }

    const currentIndex = this.linkQueue.getCurrentIndex();
    const currentLink = this.linkQueue.getCurrentLink();
    const platform = session.platform;

    console.log(
      `✅ Link ${currentIndex + 1}/${this.linkQueue.links.length} completed: ${currentLink?.url}`
    );

    // Record the completed link
    this.linkQueue.recordLinkComplete(
      currentIndex,
      currentLink?.url,
      platform,
      result,
      sessionId
    );

    // Notify frontend that this link completed
    await this.notifyFrontend({
      type: "LINK_COMPLETED",
      queueId: this.linkQueue.id,
      linkIndex: currentIndex,
      link: currentLink,
      platform,
      result,
      queueStatus: this.linkQueue.getStatus(),
      timestamp: Date.now(),
    });

    // Close the current window
    if (session.windowId) {
      try {
        await chrome.windows.remove(session.windowId);
        console.log(`🪟 Closed window ${session.windowId} for link`);
      } catch (e) {
        console.warn(`Could not close window: ${e.message}`);
      }
    }

    // Cleanup the completed session
    this.cleanupSession(sessionId);

    // Get next link
    const nextLink = this.linkQueue.getNext();

    if (!nextLink) {
      // Queue is complete
      console.log("🎉 All links completed!");

      await this.notifyFrontend({
        type: "LINK_QUEUE_COMPLETED",
        queueId: this.linkQueue.id,
        results: this.linkQueue.results,
        totalCompleted: this.linkQueue.getCompletedCount(),
        totalFailed: this.linkQueue.getFailedCount(),
        totalSkipped: this.linkQueue.getSkippedCount(),
        timestamp: Date.now(),
      });

      // Clear the queue
      this.linkQueue = null;
      this.currentLinkQueueSessionId = null;
      return;
    }

    // Start next link
    const nextPlatform = nextLink.platform;
    console.log(
      `📋 Starting next link: ${nextLink.url} (${nextPlatform})`
    );

    const nextParams = this.linkQueue.getParamsForLink(nextLink, nextPlatform);

    // Small delay before starting next link
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const nextResult = await this.startLinkAutomation(nextParams);

    if (nextResult.success) {
      this.currentLinkQueueSessionId = nextResult.sessionId;
      this.linkQueue.sessionIds.set(
        this.linkQueue.getCurrentIndex(),
        nextResult.sessionId
      );

      await this.notifyFrontend({
        type: "LINK_STARTED",
        queueId: this.linkQueue.id,
        linkIndex: this.linkQueue.getCurrentIndex(),
        link: nextLink,
        platform: nextPlatform,
        sessionId: nextResult.sessionId,
        windowId: nextResult.windowId,
        queueStatus: this.linkQueue.getStatus(),
        timestamp: Date.now(),
      });
    } else {
      console.error(
        `❌ Failed to start link ${nextLink.url}: ${nextResult.error}`
      );
      // Record failure and try next
      this.linkQueue.recordLinkSkipped(
        this.linkQueue.getCurrentIndex(),
        nextLink.url,
        nextResult.error
      );
      // Recursively try next link
      await this.handleLinkComplete(null, { success: false, error: nextResult.error });
    }
  }

  /**
   * Stop the entire link queue
   * @param {string} reason - Reason for stopping
   */
  async stopLinkQueue(reason = "User stopped") {
    if (!this.linkQueue) {
      return { success: false, error: "No active link queue" };
    }

    console.log(`🛑 Stopping link queue: ${reason}`);

    // Stop current session
    if (this.currentLinkQueueSessionId) {
      try {
        await this.stopAutomation(this.currentLinkQueueSessionId, reason);
      } catch (e) {
        console.warn("Error stopping current session:", e.message);
      }
    }

    // Stop the queue
    this.linkQueue.stop(reason);

    await this.notifyFrontend({
      type: "LINK_QUEUE_STOPPED",
      queueId: this.linkQueue.id,
      reason,
      results: this.linkQueue.results,
      stoppedAt: this.linkQueue.getCurrentIndex(),
      timestamp: Date.now(),
    });

    // Clear queue state
    this.linkQueue = null;
    this.currentLinkQueueSessionId = null;

    return { success: true };
  }

  /**
   * Get link queue status
   * @returns {Object|null} Queue status or null if no queue
   */
  getLinkQueueStatus() {
    if (!this.linkQueue) {
      return null;
    }
    return this.linkQueue.getStatus();
  }

  /**
   * Check if there is an active link queue
   * @returns {boolean}
   */
  hasActiveLinkQueue() {
    return this.linkQueue !== null && this.linkQueue.isActive();
  }

  // ============================================
  // Tab Event Handlers
  // ============================================

  /**
   * Handle new tab created in automation window
   * @param {number} tabId
   * @param {number} windowId
   */
  async handleTabCreated(tabId, windowId) {
    const session = this.getSessionForWindow(windowId);
    if (!session) return;

    this.tabToSession.set(tabId, session.id);

    // Inject context into new tab (may fail if tab is still at about:blank)
    await this.injectContext(tabId, session);
  }

  /**
   * Handle tab navigation complete
   * @param {number} tabId
   * @param {Object} tab
   */
  async handleTabUpdated(tabId, tab) {
    // Skip chrome:// pages and pages without URLs
    if (!tab.url || tab.url.startsWith("chrome://")) return;
    if (tab.status !== "complete") return;

    // Log for /apply tabs to trace the specific issue
    if (tab.url.includes("/apply")) {
      console.log(
        `📑 handleTabUpdated: /apply tab detected - tabId=${tabId}, windowId=${tab.windowId}`
      );
    }

    // Try tab lookup first
    let session = this.getSessionForTab(tabId);

    // Fall back to window lookup if tab not registered
    // This handles tabs opened by button clicks on the page
    if (!session && tab.windowId) {
      session = this.getSessionForWindow(tab.windowId);
      if (session) {
        // Register this tab for future lookups
        this.tabToSession.set(tabId, session.id);
        if (tab.url.includes("/apply")) {
          console.log(
            `📑 Late-registered /apply tab ${tabId} to session ${session.id}`
          );
        }
      }
    }

    if (!session) {
      // Check ALL sessions for pending external apply (external tab might be in different window)
      const isExternalUrl =
        !tab.url.includes("linkedin.com") &&
        !tab.url.includes("indeed.com") &&
        !tab.url.includes("chrome://");

      if (isExternalUrl) {
        // Find any session with a pending external apply
        for (const [sessionId, sess] of this.sessions) {
          if (sess.pendingExternalApply) {
            const pending = sess.pendingExternalApply;
            if (
              tab.id !== pending.sourceTabId &&
              Date.now() - pending.timestamp < 30000
            ) {
              console.log(`🔗 Found pending external apply in session ${sessionId} for tab ${tabId}`);

              // Clear the pending flag
              sess.pendingExternalApply = null;

              // Register this tab to the session
              this.tabToSession.set(tabId, sessionId);

              // Handle the external apply
              this.handleExternalApplyTab(tabId, tab, sess, pending).catch((err) => {
                console.error("Error handling external apply tab:", err);
              });
              return;
            }
          }
        }
      }

      if (tab.url.includes("/apply")) {
        console.log(`❌ No session found for /apply tab ${tabId}`);
      }
      return;
    }

    // Check for pending external apply (from LinkedIn/Indeed external button click)
    if (session.pendingExternalApply) {
      const pending = session.pendingExternalApply;
      const isExternalTab =
        !tab.url.includes("linkedin.com") &&
        !tab.url.includes("indeed.com") &&
        tab.id !== pending.sourceTabId;

      if (isExternalTab && Date.now() - pending.timestamp < 30000) {
        console.log(`🔗 External apply tab loaded: ${tab.url}`);

        // Clear the pending flag
        session.pendingExternalApply = null;

        // Handle the external apply asynchronously
        this.handleExternalApplyTab(tabId, tab, session, pending).catch((err) => {
          console.error("Error handling external apply tab:", err);
        });
        return;
      }
    }

    // Inject context into the page
    if (tab.url.includes("/apply")) {
      console.log(`💉 Injecting context into /apply tab ${tabId}`);
    }
    await this.injectContext(tabId, session);
  }

  /**
   * Handle external apply tab that was opened from LinkedIn/Indeed
   * @param {number} tabId
   * @param {Object} tab
   * @param {Object} session
   * @param {Object} pending - Pending external apply info
   */
  async handleExternalApplyTab(tabId, tab, session, pending) {
    const { jobDetails, platform, sourceUrl } = pending;

    console.log(`🔗 Processing external apply tab from ${platform}:`, {
      tabId,
      url: tab.url,
      jobTitle: jobDetails?.title,
    });

    try {
      // Register this tab to the session
      this.tabToSession.set(tabId, session.id);

      // Store job context for the external tab
      session.currentJobInfo = jobDetails;
      session.externalApplySourceUrl = sourceUrl;
      session.currentJobTabId = tabId;

      // Set the search tab to the source tab (LinkedIn/Indeed tab)
      // This ensures SEARCH_NEXT is sent back to the correct tab
      if (!session.searchTabId && pending.sourceTabId) {
        session.searchTabId = pending.sourceTabId;
      }

      // Inject the PageAnalyzer content script
      await this.injectPageAnalyzer(tabId);

      // Route through UniversalJobRouter
      const router = this.getUniversalRouter();
      const result = await router.routeJob(tab.url, tabId, {
        sessionId: session.id,
        userProfile: session.userProfile,
        preferences: session.config.preferences,
        platform: session.platform,
        jobDetails,
        isExternalApply: true,
        sourceUrl,
      });

      if (result.success) {
        console.log(`✅ External apply routed to: ${result.handlerName || 'generic'}`);
      } else {
        console.warn(`⚠️ External apply routing failed:`, result.reason || result.error);
      }
    } catch (error) {
      console.error(`❌ Error handling external apply tab:`, error);
    }
  }

  /**
   * Inject the PageAnalyzer content script into a tab
   * @param {number} tabId
   * @returns {Promise<boolean>}
   */
  async injectPageAnalyzer(tabId) {
    try {
      // Check if already injected
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: "GET_PAGE_FINGERPRINT",
        });
        if (response?.success) {
          console.log(`✅ PageAnalyzer already present in tab ${tabId}`);
          return true;
        }
      } catch {
        // Not injected yet, continue with injection
      }

      // Inject the PageAnalyzer script
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["shared/content/page-analyzer.js"],
      });

      // Give it a moment to initialize
      await new Promise((r) => setTimeout(r, 500));

      console.log(`✅ Injected PageAnalyzer into tab ${tabId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to inject PageAnalyzer into tab ${tabId}:`, error.message);
      return false;
    }
  }

  /**
   * Handle window closed
   * @param {number} windowId
   */
  async handleWindowClosed(windowId) {
    const session = this.getSessionForWindow(windowId);
    if (!session) return;

    console.log(`🪟 Window ${windowId} closed for session ${session.id}`);

    const reason = "Window closed by user";

    if (!session.isTerminal()) {
      session.stop(reason);
    }

    // Check if there's an active platform queue and stop it
    if (this.platformQueue && this.platformQueue.isActive()) {
      console.log(`🛑 Window closed during platform queue - stopping queue`);

      // Record the current platform as stopped
      this.platformQueue.recordPlatformStopped(
        session.platform,
        reason,
        session.progress
      );

      // Stop the queue
      this.platformQueue.stop(reason);

      // Notify frontend about queue being stopped
      await this.notifyFrontend({
        type: "QUEUE_STOPPED",
        queueId: this.platformQueue.id,
        reason,
        stoppedAt: session.platform,
        results: this.platformQueue.results,
        timestamp: Date.now(),
      });

      // Also send AUTOMATION_STOPPED for backward compatibility
      // (so existing frontend listeners work)
      await this.notifyFrontend({
        type: "AUTOMATION_STOPPED",
        sessionId: session.id,
        platform: session.platform,
        reason: reason,
        progress: { ...session.progress },
        isQueueMode: true,
        queueId: this.platformQueue.id,
        timestamp: Date.now(),
      });

      // Clear queue state
      this.platformQueue = null;
      this.currentQueueSessionId = null;
    } else if (this.linkQueue && this.linkQueue.isActive()) {
      // Check if there's an active link queue and stop it
      console.log(`🛑 Window closed during link queue - stopping queue`);

      // Record the current link as stopped
      const currentIndex = this.linkQueue.getCurrentIndex();
      const currentLink = this.linkQueue.getCurrentLink();
      this.linkQueue.recordLinkSkipped(
        currentIndex,
        currentLink?.url,
        reason
      );

      // Stop the queue
      this.linkQueue.stop(reason);

      // Notify frontend about link queue being stopped
      await this.notifyFrontend({
        type: "LINK_QUEUE_STOPPED",
        queueId: this.linkQueue.id,
        reason,
        stoppedAt: currentIndex,
        currentLink: currentLink,
        results: this.linkQueue.results,
        timestamp: Date.now(),
      });

      // Also send AUTOMATION_STOPPED for backward compatibility
      await this.notifyFrontend({
        type: "AUTOMATION_STOPPED",
        sessionId: session.id,
        platform: session.platform,
        reason: reason,
        progress: { ...session.progress },
        isLinkQueueMode: true,
        queueId: this.linkQueue.id,
        timestamp: Date.now(),
      });

      // Clear queue state
      this.linkQueue = null;
      this.currentLinkQueueSessionId = null;
    } else {
      // No queue - normal single-platform window close
      // Notify frontend that the automation window was closed
      await this.notifyFrontend({
        type: "AUTOMATION_STOPPED",
        sessionId: session.id,
        platform: session.platform,
        reason: reason,
        progress: { ...session.progress },
        timestamp: Date.now(),
      });
    }

    this.cleanupSession(session.id);
  }

  /**
   * Cache frontend tab IDs at automation start for reliable notifications
   * Also injects a message listener to ensure content script is ready
   */
  async cacheFrontendTabs() {
    try {
      const tabs = await chrome.tabs.query({
        url: [
          "*://fastapply.co/*",
          "*://*.fastapply.co/*",
          "http://localhost:3000/*",
          "http://localhost:3001/*",
        ],
      });

      this.frontendTabIds.clear();

      for (const tab of tabs) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              if (!window.__fastapplyListenerReady) {
                window.__fastapplyListenerReady = true;
                chrome.runtime.onMessage.addListener(
                  (request, sender, sendResponse) => {
                    const messageType = request.type || request.action;
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
                      sendResponse({ success: true });
                      return true;
                    }
                    return false;
                  }
                );
              }
            },
          });
          this.frontendTabIds.add(tab.id);
        } catch (err) {
          // Tab may not be injectable - skip it
        }
      }

      if (this.frontendTabIds.size > 0) {
        console.log(
          `📋 Frontend notifications ready (${this.frontendTabIds.size} tabs)`
        );
      }
    } catch (error) {
      console.warn("Failed to cache frontend tabs:", error.message);
    }
  }

  /**
   * Notify the frontend (Next.js app) about automation events
   * Uses cached tab IDs for reliable delivery during active automation
   * @param {Object} message - Message to send to frontend
   */
  async notifyFrontend(message) {
    let tabIds = [...this.frontendTabIds];

    if (tabIds.length === 0) {
      try {
        const tabs = await chrome.tabs.query({
          url: [
            "*://fastapply.co/*",
            "*://*.fastapply.co/*",
            "http://localhost:3000/*",
            "http://localhost:3001/*",
          ],
        });
        tabIds = tabs.map((t) => t.id);
      } catch (error) {
        return;
      }
    }

    for (const tabId of tabIds) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          source: "fastapply-extension",
          ...message,
        });
      } catch (err) {
        this.frontendTabIds.delete(tabId);
      }
    }
  }

  // ============================================
  // Job Event Handlers (from content scripts)
  // ============================================

  /**
   * Check if user can apply to a job
   * Centralizes logic that was in each background handler
   * @param {string} sessionId
   * @param {string} jobId
   * @returns {Promise<Object>} { canApply, alreadyApplied, credits }
   */
  async checkCanApply(sessionId, jobId) {
    const session = this.getSession(sessionId);
    if (!session || !session.applicationTracker) {
      return { canApply: false, error: "Session not found" };
    }

    try {
      return await session.applicationTracker.checkCanApply(jobId);
    } catch (error) {
      console.error("Error checking can apply:", error);
      return { canApply: false, error: error.message };
    }
  }

  /**
   * Handle job application success
   * @param {string} sessionId
   * @param {Object} jobData
   */
  async recordJobSuccess(sessionId, jobData) {
    const session = this.getSession(sessionId);
    if (!session) return;

    session.recordSuccess(jobData);

    // Save to backend via ApplicationTrackerService
    if (session.applicationTracker) {
      try {
        await session.applicationTracker.saveAppliedJob({
          ...jobData,
          platform: session.platform,
        });
        console.log(`✅ Job saved to backend:`, jobData.title || jobData.jobId);
      } catch (error) {
        console.error("Failed to save job to backend:", error);
      }
    }

    // Notify frontend about the successful application
    await this.notifyFrontend({
      type: "JOB_APPLIED",
      sessionId: session.id,
      platform: session.platform,
      jobData: jobData,
      progress: { ...session.progress },
      timestamp: Date.now(),
    });

    console.log(`✅ Job success recorded for session ${sessionId}`, jobData);
  }

  /**
   * Handle job application failure
   * @param {string} sessionId
   * @param {Object} jobData
   * @param {string} error
   */
  recordJobFailure(sessionId, jobData, error) {
    const session = this.getSession(sessionId);
    if (!session) return;

    session.recordFailure(jobData, error);
    console.log(`❌ Job failure recorded for session ${sessionId}`, {
      jobData,
      error,
    });
  }

  /**
   * Handle job skipped
   * @param {string} sessionId
   * @param {Object} jobData
   * @param {string} reason
   */
  recordJobSkipped(sessionId, jobData, reason) {
    const session = this.getSession(sessionId);
    if (!session) return;

    session.recordSkipped(jobData, reason);
    console.log(`⏭️ Job skipped for session ${sessionId}`, {
      jobData,
      reason,
    });
  }

  // ============================================
  // Platform Config
  // ============================================

  /**
   * Get platform configuration
   * @param {string} platform
   * @returns {Object}
   */
  getPlatformConfig(platform) {
    return PLATFORM_CONFIG[platform] || null;
  }

  /**
   * Check if URL matches platform
   * @param {string} url
   * @param {string} platform
   * @returns {boolean}
   */
  urlMatchesPlatform(url, platform) {
    const config = this.getPlatformConfig(platform);
    if (!config) return false;

    return config.domains.some((domain) => url.includes(domain));
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Validate automation params
   * @private
   */
  validateParams(params) {
    if (!params.platform) throw new Error("Platform is required");
    if (!params.userId) throw new Error("User ID is required");
    if (!params.selectedProfile) throw new Error("User profile is required");
    if (!PLATFORM_CONFIG[params.platform]) {
      throw new Error(`Unknown platform: ${params.platform}`);
    }
  }

  /**
   * Build starting URL for platform with full preferences support
   * @private
   * @param {string} platform - Platform name
   * @param {Object} preferences - Job search preferences
   * @param {string} country - User's country (optional)
   * @returns {string} The constructed URL
   */
  buildStartUrl(platform, preferences, country = null) {
    // Use the centralized URL builders for full preference support
    return buildStartingUrl(platform, preferences, country);
  }

  /**
   * Create automation browser window
   * @private
   */
  async createAutomationWindow(url) {
    return await chrome.windows.create({
      url: url,
      type: "normal",
      focused: true,
      width: 1200,
      height: 800,
    });
  }

  /**
   * Inject session context into tab
   * This is the SINGLE injection point - no retries needed
   * @private
   */
  async injectContext(tabId, session) {
    const context = session.getContext();

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (ctx) => {
          // Set on window for immediate access
          window.automationContext = ctx;
          window.isAutomationWindow = true;
          window.automationSessionId = ctx.sessionId;

          // Dispatch event for any waiting listeners
          window.dispatchEvent(
            new CustomEvent("AUTOMATION_CONTEXT_READY", {
              detail: ctx,
            })
          );
        },
        args: [context],
      });

      console.log(`💉 Context injected into tab ${tabId}`);
      return true;
    } catch (error) {
      console.warn(
        `⚠️ Failed to inject context into tab ${tabId}:`,
        error.message
      );
      return false;
    }
  }

  /**
   * Broadcast message to all tabs in session
   * @private
   */
  async broadcastToSession(sessionId, message) {
    const session = this.getSession(sessionId);
    if (!session || !session.windowId) return;

    const tabs = await chrome.tabs.query({ windowId: session.windowId });

    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          ...message,
          sessionId,
        });
      } catch (e) {
        // Tab may not have content script loaded
      }
    }
  }

  /**
   * Cleanup session mappings
   * @private
   */
  cleanupSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Clean up persisted overlay messages for this session
    try {
      chrome.storage.session.remove(`overlay_messages_${sessionId}`);
    } catch (e) {
      // storage may not be available
    }

    // Remove window mapping
    if (session.windowId) {
      this.windowToSession.delete(session.windowId);
    }

    // Remove tab mappings
    for (const [tabId, sid] of this.tabToSession.entries()) {
      if (sid === sessionId) {
        this.tabToSession.delete(tabId);
      }
    }

    // Disable keep-awake if no active automation sessions remain
    // Check if there are any non-terminal sessions other than this one
    const hasActiveSession = [...this.sessions.values()].some(
      (s) => s.id !== sessionId && !s.isTerminal()
    );
    if (!hasActiveSession && !this.hasActiveQueue() && !this.hasActiveLinkQueue()) {
      this.disableKeepAwake();
    }

    console.log(`🧹 Cleaned up session ${sessionId}`);
  }

  // ============================================
  // Keep-Awake Management
  // ============================================

  /**
   * Enable keep-awake to prevent system sleep during automation
   * Uses "system" level - prevents sleep but allows display to turn off
   */
  enableKeepAwake() {
    if (this.keepAwakeActive) return;

    try {
      chrome.power.requestKeepAwake("system");
      this.keepAwakeActive = true;
      console.log(
        "💡 Keep-awake enabled - system will not sleep during automation"
      );
    } catch (error) {
      console.warn("⚠️ Failed to enable keep-awake:", error.message);
    }
  }

  /**
   * Disable keep-awake when automation ends
   */
  disableKeepAwake() {
    if (!this.keepAwakeActive) return;

    try {
      chrome.power.releaseKeepAwake();
      this.keepAwakeActive = false;
      console.log("💤 Keep-awake disabled - system can sleep normally");
    } catch (error) {
      console.warn("⚠️ Failed to disable keep-awake:", error.message);
    }
  }

  /**
   * Check if window is an automation window
   * @param {number} windowId
   * @returns {boolean}
   */
  isAutomationWindow(windowId) {
    return this.windowToSession.has(windowId);
  }

  /**
   * Check if tab is in an automation window
   * @param {number} tabId
   * @returns {boolean}
   */
  isAutomationTab(tabId) {
    return this.tabToSession.has(tabId);
  }
}
