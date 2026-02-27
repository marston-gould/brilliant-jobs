// platforms/linkedin/linkedin.js - Standalone version (no base class inheritance)
import AIService from "../../services/ai-service.js";
import ApplicationTrackerService from "../../services/application-tracker-service.js";
import LinkedInFileHandler from "./linkedin-file-handler.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { CoPilotState } from "../../core/constants.js";

export default class LinkedInPlatform {
  constructor(config) {
    // ============ From BasePlatform ============
    this.sessionId = config.sessionId;
    this.platform = "linkedin";
    this.userId = config.userId;
    this.contentScript = config.contentScript;
    this.config = config.config || {};
    this.devMode =
      config.devMode ||
      config.config?.devMode ||
      config.sessionContext?.devMode ||
      false;

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

    // ============ From BasePlatformAutomation ============
    // Initialize user profile from multiple sources
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
    this.jobsLoopState = null;
    this.alreadyAppliedCounter = 0;
    this.applicationState = {
      isApplying: false,
      currentStep: "",
      attempts: 0,
      startTime: null,
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

    // ============ LinkedIn-specific ============
    this.baseUrl = "https://www.linkedin.com";
    this.hasStarted = false;
    this.automationStarted = false;
    this.processedJobs = new Set();

    // Initialize Co-Pilot state management
    this.copilotState = new CoPilotState();

    // Store processJobs state for resume capability
    this.jobsLoopState = null;

    // Get API hosts
    const aiApiHost =
      this.getInjectedAiApiHost() ||
      config.aiApiHost ||
      config.sessionContext?.aiApiHost ||
      config.sessionContext?.sessionConfig?.aiApiHost;
    this.HOST = aiApiHost;

    const backendApiHost =
      this.getInjectedBackendApiHost() ||
      config.backendApiHost ||
      config.sessionContext?.backendApiHost ||
      config.sessionContext?.sessionConfig?.backendApiHost;

    // Initialize services
    this.aiService = new AIService({ aiApiHost, platform: this.platform });
    this.appTracker = new ApplicationTrackerService({
      backendApiHost,
      userId: this.getUserId(),
      jobProfileId:
        config.sessionContext?.userProfile?.id || config.userProfile?.id,
      jwtToken: this.getJwtToken(),
    });

    this.fileHandler = new LinkedInFileHandler({
      backendApiHost,
      aiApiHost,
      jwtToken: this.getJwtToken(),
    });
  }

  // ============ Injected Context Methods (from BasePlatformAutomation) ============

  getInjectedUserProfile() {
    try {
      if (typeof window !== "undefined" && window.automationUserProfile) {
        return window.automationUserProfile;
      }
      if (typeof sessionStorage !== "undefined") {
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

  getUserId() {
    return this.userProfile?.userId || this.userId || null;
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

  // Required abstract methods from BasePlatformAutomation
  getPlatformDomains() {
    return ["linkedin.com"];
  }

  getSearchLinkPattern() {
    return /linkedin\.com\/jobs\/view\/\d+/;
  }

  isValidJobPage(url) {
    return url.includes("linkedin.com/jobs/view/");
  }

  getApiHost() {
    return this.getInjectedAiApiHost() || this.HOST;
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };

    const newAiApiHost =
      newConfig.aiApiHost || newConfig.sessionContext?.aiApiHost;
    const newBackendApiHost =
      newConfig.backendApiHost || newConfig.sessionContext?.backendApiHost;

    if (newAiApiHost && newAiApiHost !== this.HOST) {
      this.HOST = newAiApiHost;
      this.aiService = new AIService({ aiApiHost: newAiApiHost });
    }

    if (newBackendApiHost || newAiApiHost) {
      this.appTracker = new ApplicationTrackerService({
        backendApiHost: newBackendApiHost || this.appTracker?.apiHost,
        userId: this.getUserId(),
        jobProfileId: this.userProfile?.id,
        jwtToken: this.getJwtToken(),
      });
      this.fileHandler = new LinkedInFileHandler({
        backendApiHost: newBackendApiHost,
        aiApiHost: newAiApiHost || this.HOST,
        jwtToken: this.getJwtToken(),
      });
    }
  }

  async setSessionContext(sessionContext) {
    try {
      this.sessionContext = sessionContext;

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

      if (
        sessionContext.userId &&
        sessionContext.userId !== this.appTracker?.userId
      ) {
        const backendApiHost =
          sessionContext.backendApiHost ||
          sessionContext.sessionConfig?.backendApiHost ||
          this.appTracker?.apiHost;
        this.appTracker = new ApplicationTrackerService({
          backendApiHost,
          userId: this.getUserId(),
          jobProfileId: this.userProfile?.id,
          jwtToken: this.getJwtToken(),
        });
      }

      // Load co-pilot mode preference from session context
      if (sessionContext.preferences?.hasOwnProperty("copilotMode")) {
        if (sessionContext.preferences?.copilotMode === true) {
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
      console.error("❌ Error setting LinkedIn session context:", error);
    }
  }

  async initialize() {
    console.log("🚀 Initializing LinkedIn platform automation");

    // Apply session context preferences (including co-pilot mode)
    // This must be called to process preferences like copilotMode
    if (this.sessionContext) {
      await this.setSessionContext(this.sessionContext);
    }

    // Set up communication and monitoring (from BasePlatformAutomation)
    this.initializePortConnection();
    this.startHealthCheck();
    this.startStateVerification();

    // LinkedIn-specific setup
    this.setupControlListeners();
  }

  /**
   * Setup listeners for control button actions from status overlay
   */
  setupControlListeners() {
    if (!chrome.runtime) return;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "CONTROL_ACTION") {
        // Handle async action and send response after completion
        this.handleControlAction(message.action, message)
          .then(() => {
            sendResponse({ success: true });
          })
          .catch((error) => {
            console.error("Error handling control action:", error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // Keep message channel open for async response
      }
    });
  }

  /**
   * Handle control actions from buttons
   */
  async handleControlAction(action, data) {
    console.log("Handling control action:", action);

    switch (action) {
      case "SUBMIT":
        await this.handleSubmitAction();
        break;

      case "NEXT":
        await this.handleNextAction();
        break;

      case "SKIP":
        await this.handleSkipAction();
        break;

      case "PAUSE":
        await this.handlePauseAction();
        break;

      case "RESUME":
        await this.handleResumeAction();
        break;

      case "SWITCH_TO_COPILOT":
        await this.handleSwitchToCoPilot();
        break;

      case "SWITCH_TO_AUTOPILOT":
        await this.handleSwitchToAutoPilot();
        break;

      case "TAKE_CONTROL":
        await this.handleTakeControl();
        break;

      case "LET_AI_CONTINUE":
        await this.handleLetAIContinue();
        break;

      default:
        console.warn("Unknown control action:", action);
    }
  }

  /**
   * Handle Submit button click
   */
  async handleSubmitAction() {
    console.log("Submit action triggered");
    if (this.copilotState.hasPendingSubmission()) {
      await this.submitPendingApplication();
    }
  }

  /**
   * Handle Next button click (for co-pilot mode step-by-step progression)
   */
  async handleNextAction() {
    console.log("Next action triggered");
    if (this.copilotState.hasPendingNext()) {
      await this.clickPendingNextButton();
    }
  }

  /**
   * Handle Skip button click
   */
  async handleSkipAction() {
    console.log("Skip action triggered");

    // Clear pending submission
    this.copilotState.clearPendingSubmission();

    // Close the application modal
    await this.closeApplication();

    // Show message that we're skipping
    notifyStatus({
      type: "JOB_SKIPPED",
      data: {
        title: this.currentJobDetails?.title || "this job",
        reason: "User requested skip",
      },
    });
    await this.delay(4000);

    // Restore appropriate mode buttons for continuing
    this.restoreModeButtons();

    // Wait a moment for the modal to close
    await this.sleep(1000);

    // Resume automation - continue the existing processJobs loop
    if (this.jobsLoopState) {
      // Continue from where we paused
      const currentApplied = this.jobsLoopState.appliedCount || 0;
      const totalToApply = this.config.jobsToApply || 0;

      if (currentApplied < totalToApply) {
        // Continue the existing loop instead of restarting
        await this.continueProcessJobs({ jobsToApply: totalToApply });
      } else {
        // Target reached
        notifyStatus({ type: "SEARCH_COMPLETED" });
        await this.delay(4000);
        this.reportComplete();
      }
    }
  }

  /**
   * Handle Pause button click
   */
  async handlePauseAction() {
    console.log("Pause action triggered");
    this.isPaused = true;
    notifyStatus({ type: "AUTOMATION_PAUSED" });
    await this.delay(4000);
  }

  /**
   * Handle Resume button click
   */
  async handleResumeAction() {
    console.log("Resume action triggered");
    this.isPaused = false;
    notifyStatus({ type: "AUTOMATION_RESUMED" });
    await this.delay(4000);
  }

  /**
   * Handle Switch to Co-Pilot mode
   */
  async handleSwitchToCoPilot() {
    console.log("🔄 Switching to Co-Pilot mode");

    // Clear any pending states from auto-pilot mode
    this.copilotState.clearPendingSubmission();
    this.copilotState.clearPendingNext();

    // Switch mode
    this.copilotState.switchToCoPilot();

    // Only show message once
    if (!this.copilotState.modeJustSwitched) {
      this.copilotState.modeJustSwitched = true;
      await this.delay(4000);

      // Clear flag after a delay
      setTimeout(() => {
        this.copilotState.modeJustSwitched = false;
      }, 2000);
    }

    // Show co-pilot-search buttons (allows switching back to auto-pilot)
    updateStatusButtons("co-pilot-search");
    await this.delay(4000);
  }

  /**
   * Handle Switch to Auto-Pilot mode
   */
  async handleSwitchToAutoPilot() {
    console.log("🔄 Switching to Auto-Pilot mode");

    // Clear any pending states from co-pilot mode
    this.copilotState.clearPendingSubmission();
    this.copilotState.clearPendingNext();

    // Switch mode
    this.copilotState.switchToAutoPilot();

    // Only show message once
    if (!this.copilotState.modeJustSwitched) {
      this.copilotState.modeJustSwitched = true;

      await this.delay(4000);

      // Clear flag after a delay
      setTimeout(() => {
        this.copilotState.modeJustSwitched = false;
      }, 2000);
    }

    // Clear any co-pilot specific status messages
    notifyStatus({
      type: "MODE_SWITCHED",
      data: { mode: "auto-pilot" },
    });
    await this.delay(4000);

    updateStatusButtons("auto-pilot");
    await this.delay(4000);

    // If there's a pending submission, trigger it now in auto-pilot mode
    if (this.copilotState.currentJob?.submitButton) {
      console.log("🚀 Auto-pilot: Clicking pending submit button");
      const submitButton = this.copilotState.currentJob.submitButton;
      this.copilotState.clearPendingSubmission();

      // Show submitting message
      notifyStatus({ type: "SUBMITTING_APPLICATION" });
      await this.delay(4000);
      // Click the submit button
      setTimeout(async () => {
        if (submitButton && typeof submitButton.click === "function") {
          submitButton.click();
          await this.sleep(2000);
        }
      }, 500);
      return; // Exit early to prevent showing auto-pilot buttons
    }

    // If there's a pending next button, trigger it now in auto-pilot mode
    if (this.copilotState.currentJob?.nextButton) {
      console.log("🚀 Auto-pilot: Clicking pending next button");
      const nextButton = this.copilotState.currentJob.nextButton;
      this.copilotState.clearPendingNext();
      await this.delay(4000);
      // Click the next button
      setTimeout(async () => {
        if (nextButton && typeof nextButton.click === "function") {
          nextButton.click();
          await this.sleep(2000);
        }
      }, 500);
      return; // Exit early to prevent showing auto-pilot buttons
    }
  }

  /**
   * Handle Take Control button click
   */
  async handleTakeControl() {
    console.log("User taking control");
    this.copilotState.takeManualControl();
    notifyStatus({
      type: "COPILOT_USER_HAS_CONTROL",
    });
    await this.delay(4000);
  }

  /**
   * Handle Let AI Continue button click
   */
  async handleLetAIContinue() {
    this.copilotState.letAIContinue();
    notifyStatus({
      type: "COPILOT_AI_CONTINUING",
    });
    await this.delay(4000);
  }

  /**
   * Restore appropriate mode buttons after submit/skip
   */
  restoreModeButtons() {
    // Check current mode and show appropriate buttons
    if (this.copilotState.isInCoPilotMode()) {
      updateStatusButtons("co-pilot-search");
    } else {
      updateStatusButtons("auto-pilot");
    }
  }

  async start(params = {}) {
    if (this.hasStarted) {
      return;
    }

    this.updateConfig(params);

    this.hasStarted = true;
    this.isRunning = true;

    try {
      if (!this.userProfile) {
        throw new Error(
          "Cannot start LinkedIn automation without user profile"
        );
      }

      if (!this.config.jobsToApply || this.config.jobsToApply <= 0) {
        const errorMessage =
          "I need to know how many jobs you want me to apply to!";
        throw new Error(errorMessage);
      }

      // Show automation starting message
      notifyStatus({ type: "AUTOMATION_STARTING" });
      await this.delay(4000);

      // Ensure correct mode buttons are shown after automation starts
      this.restoreModeButtons();

      this.updateProgress({ total: this.config.jobsToApply });
      await this.waitForPageLoad();

      const currentUrl = window.location.href.toLowerCase();
      if (!currentUrl.includes("linkedin.com/jobs")) {
        // await this.navigateToLinkedInJobs();
      } else {
        await this.applyAdditionalFilters();
      }

      // Show job search started message BEFORE processing begins
      notifyStatus({
        type: "JOB_SEARCH_STARTED",
        data: { preferences: this.config.preferences },
      });
      await this.delay(4000);
      await this.waitForSearchResultsLoad();

      // Wait for message to display
      await this.delay(2500);

      this.automationStarted = true;
      await this.processJobs({ jobsToApply: this.config.jobsToApply });
    } catch (error) {
      console.log("Error starting LinkedIn automation:", error);
      this.hasStarted = false;
      this.reportError(error, { phase: "start" });
    }
  }

  async navigateToLinkedInJobs() {
    const searchUrl = await this.generateComprehensiveSearchUrl(
      this.config.preferences || {}
    );
    window.location.href = searchUrl;
    await this.delay(5000);
    await this.waitForPageLoad();
  }

  determineApplyType(applyButton) {
    if (!applyButton) return null;

    const buttonText = applyButton.textContent?.trim().toLowerCase() || "";
    const buttonAriaLabel =
      applyButton.getAttribute("aria-label")?.toLowerCase() || "";

    if (
      buttonText.includes("easy apply") ||
      buttonAriaLabel.includes("easy apply")
    ) {
      return "easy_apply";
    }

    if (buttonText.includes("apply") || buttonAriaLabel.includes("apply")) {
      return "external_apply";
    }

    return "unknown";
  }

  async generateComprehensiveSearchUrl(preferences) {
    const baseUrl = "https://www.linkedin.com/jobs/search/?";

    const joinWithOR = (arr) => (arr ? arr.join(" OR ") : "");

    const params = new URLSearchParams();
    // NOTE: Easy Apply filter (f_AL) removed to allow processing of ALL jobs
    // External apply jobs will be routed through UniversalJobRouter

    if (preferences.positions?.length) {
      params.append("keywords", joinWithOR(preferences.positions));
    }

    if (preferences.location?.length) {
      const location = preferences.location[0];

      const geoIdMap = {
        Nigeria: "105365761",
        Netherlands: "102890719",
        "United States": "103644278",
        "United Kingdom": "101165590",
        Canada: "101174742",
        Australia: "101452733",
        Germany: "101282230",
        France: "105015875",
        India: "102713980",
        Singapore: "102454443",
        "South Africa": "104035573",
        Ireland: "104738515",
        "New Zealand": "105490917",
      };

      if (location === "Remote" || preferences.remoteOnly) {
        params.append("f_WT", "2");
      } else if (geoIdMap[location]) {
        params.append("geoId", geoIdMap[location]);
      } else {
        params.append("location", location);
      }
    }

    const workModeMap = {
      Remote: "2",
      Hybrid: "3",
      "On-site": "1",
    };

    if (preferences.workMode?.length) {
      const workModeCodes = preferences.workMode
        .map((mode) => workModeMap[mode])
        .filter(Boolean);
      if (workModeCodes.length) {
        params.append("f_WT", workModeCodes.join(","));
      }
    } else if (preferences.remoteOnly) {
      params.append("f_WT", "2");
    }

    const datePostedMap = {
      "Any time": "",
      "Past month": "r2592000",
      "Past week": "r604800",
      "Past 24 hours": "r86400",
      "Few Minutes Ago": "r3600",
    };

    if (preferences.datePosted) {
      const dateCode = datePostedMap[preferences.datePosted];
      if (dateCode) {
        params.append("f_TPR", dateCode);
      }
    }

    const experienceLevelMap = {
      Internship: "1",
      "Entry level": "2",
      Associate: "3",
      "Mid-Senior level": "4",
      Director: "5",
      Executive: "6",
    };

    if (preferences.experience?.length) {
      const experienceCodes = preferences.experience
        .map((level) => experienceLevelMap[level])
        .filter(Boolean);
      if (experienceCodes.length) {
        params.append("f_E", experienceCodes.join(","));
      }
    }

    const jobTypeMap = {
      "Full-time": "F",
      "Part-time": "P",
      Contract: "C",
      Temporary: "T",
      Internship: "I",
      Volunteer: "V",
    };

    if (preferences.jobType?.length) {
      const jobTypeCodes = preferences.jobType
        .map((type) => jobTypeMap[type])
        .filter(Boolean);
      if (jobTypeCodes.length) {
        params.append("f_JT", jobTypeCodes.join(","));
      }
    }

    if (preferences.salary?.length === 2) {
      const [min] = preferences.salary;
      const salaryBuckets = {
        40000: "1",
        60000: "2",
        80000: "3",
        100000: "4",
        120000: "5",
        140000: "6",
        160000: "7",
        180000: "8",
        200000: "9",
      };

      const bucketValue = Object.entries(salaryBuckets)
        .reverse()
        .find(([threshold]) => min >= parseInt(threshold))?.[1];

      if (bucketValue) {
        params.append("f_SB", bucketValue);
      }
    }

    params.append("sortBy", "R");

    const finalUrl = baseUrl + params.toString();
    return finalUrl;
  }

  async applyAdditionalFilters() {
    try {
      const preferences = this.config.preferences || {};

      if (preferences.companyRating && preferences.companyRating !== "") {
        await this.applyCompanyRatingFilter(preferences.companyRating);
      }
    } catch (error) {}
  }

  async applyCompanyRatingFilter(minRating) {
    try {
      const moreFiltersButton = await this.waitForElement(
        'button[aria-label*="Show more filters"], button[data-control-name="filter_show_more"]',
        5000
      );

      if (moreFiltersButton) {
        moreFiltersButton.click();
        await this.delay(1000);

        const ratingSelector = `button[aria-label*="${minRating}"], input[value="${minRating}"]`;
        const ratingElement = await this.waitForElement(ratingSelector, 3000);

        if (ratingElement) {
          ratingElement.click();
          await this.delay(500);

          const applyButton = await this.waitForElement(
            'button[data-control-name="filter_show_results"]',
            3000
          );

          if (applyButton) {
            applyButton.click();
            await this.delay(2000);
          }
        }
      }
    } catch (error) {}
  }

  /**
   * Use backend API to determine if job matches user preferences and qualifications
   * - applyOnlyMatching: calls /job-eligibility/match
   * - applyOnlyQualified: calls /job-eligibility/check
   */
  async doesJobMatchPreferences(jobInfo) {
    const preferences =
      this.sessionContext?.preferences || this.config?.preferences || {};
    const backendApiHost =
      this.sessionContext?.backendApiHost || this.config?.backendApiHost;
    const jwtToken = this.sessionContext?.jwtToken || this.config?.jwtToken;

    if (!backendApiHost) {
      console.error("❌ No backendApiHost configured");
      return true; // Allow on error
    }

    try {
      // Build job info object
      const jobInformation = {
        title: jobInfo.title || "",
        company: jobInfo.company || "",
        location: jobInfo.location || "",
        description: jobInfo.description || "",
        salary: jobInfo.salary || "",
        jobType: jobInfo.type || jobInfo.jobType || "",
      };

      // Determine which endpoint to use based on preference
      if (preferences.applyOnlyQualified) {
        // Use /job-eligibility/check for qualification matching
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

        if (!response.ok) {
          console.error("❌ Job eligibility check failed:", response.status);
          return true; // Allow on error
        }

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

        if (!response.ok) {
          console.error("❌ Job eligibility match failed:", response.status);
          return true; // Allow on error
        }

        const result = await response.json();
        this.reason = result.reason || "";
        return result.canApply !== false;
      }

      // No matching preference enabled
      return true;
    } catch (error) {
      console.error("Error checking job eligibility:", error);
      return true; // Allow on error
    }
  }

  extractSalaryFromJobDetails(jobDetails) {
    const salaryText = jobDetails.salary || jobDetails.description || "";
    const salaryMatch = salaryText.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
    return salaryMatch ? parseInt(salaryMatch[1].replace(/,/g, "")) : null;
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

  async saveExternalJob(jobDetails) {
    try {
      const externalJobData = {
        jobId: jobDetails.jobId,
        title: jobDetails.title,
        company: jobDetails.company,
        location: jobDetails.location,
        jobUrl: window.location.href,
        salary: jobDetails.salary || "Not specified",
        workplace: jobDetails.workplace,
        postedDate: jobDetails.postedDate,
        applicants: jobDetails.applications,
        platform: this.platform,
        applyType: "external",
        dateFound: new Date().toISOString(),
      };

      return true;
    } catch (error) {
      console.error("Error saving external job:", error);
      return false;
    }
  }

  /**
   * Handle external apply jobs through UniversalJobRouter
   * This is called when a non-Easy Apply button is clicked
   * @param {Object} jobDetails - Job details
   * @returns {Promise<boolean|string>} Result - true if successful, false if failed, "WAITING_FOR_USER" if co-pilot
   */
  async handleExternalApply(jobDetails) {
    try {
      // Get the external tab that was opened
      // LinkedIn opens external apply in a new tab
      await this.delay(3000); // Wait for new tab to open

      // Send message to background to route the external job
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "ROUTE_EXTERNAL_APPLY",
            data: {
              jobDetails,
              platform: "linkedin",
              sourceUrl: window.location.href,
            },
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("Error routing external apply:", chrome.runtime.lastError);
              resolve(false);
              return;
            }

            if (response?.waitingForUser) {
              resolve("WAITING_FOR_USER");
              return;
            }

            if (response?.success) {
              resolve(true);
            } else {
              resolve(false);
            }
          }
        );
      });
    } catch (error) {
      console.error("Error handling external apply:", error);
      return false;
    }
  }

  async continueProcessJobs({ jobsToApply }) {
    if (!this.jobsLoopState) {
      return await this.processJobs({ jobsToApply });
    }

    return await this._runProcessJobsLoop({ jobsToApply });
  }

  async processJobs({ jobsToApply }) {
    if (!this.jobsLoopState) {
      this.jobsLoopState = {
        processedCount: 0,
        appliedCount: 0,
        skippedCount: 0,
        filteredCount: 0,
        processedJobs: new Set(),
        currentPage: 1,
        noNewJobsCount: 0,
        MAX_NO_NEW_JOBS: 3,
        jobFoundMessageShown: false, // Track if we've shown the message
      };

      await this.initialScroll();
    }

    return await this._runProcessJobsLoop({ jobsToApply });
  }

  /**
   * Reusable canApply check with UI notifications
   * @param {string} jobId - The job ID to check
   * @param {object} jobDetails - Job details for display
   * @returns {Promise<{action: 'continue'|'skip'|'stop', canApplyResult?: object}>}
   */
  async checkCanApplyAndNotify(jobId, jobDetails) {
    try {
      const canApplyResult = await this.appTracker.checkCanApply(jobId);

      if (canApplyResult.error) {
        return { action: "continue", canApplyResult: null };
      }

      if (canApplyResult.alreadyApplied) {
        const messageTypes = [
          "ALREADY_APPLIED",
          "SKIPPING_APPLIED_JOB",
          "DUPLICATE_APPLICATION",
        ];
        const messageType =
          messageTypes[this.alreadyAppliedCounter % messageTypes.length];
        this.alreadyAppliedCounter++;

        notifyStatus({
          type: messageType,
          data: {
            title: jobDetails?.title || "Unknown Job",
            jobTitle: jobDetails?.title || "Unknown Job",
            company: jobDetails?.company || "Unknown Company",
          },
        });
        await this.delay(4000);
        return { action: "skip", canApplyResult };
      }

      // Now check for rate limit / other canApply=false reasons
      if (!canApplyResult.canApply) {
        notifyStatus({
          type: "LIMIT_EXCEEDED",
          data: { planType: this.userProfile?.plan },
        });
        await this.delay(4000);
        return { action: "stop", canApplyResult };
      }

      // Check if company is blacklisted
      const companyBlacklist =
        this.sessionContext?.preferences?.companyBlacklist || [];
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
          await this.delay(4000);
          return { action: "skip", canApplyResult };
        }
      }

      // Can proceed with application
      return { action: "continue", canApplyResult };
    } catch (error) {
      console.error("Error checking can apply:", error);
      // On error, allow continuation (don't block)
      return { action: "continue", canApplyResult: null };
    }
  }

  async _runProcessJobsLoop({ jobsToApply }) {
    let {
      processedCount,
      appliedCount,
      skippedCount,
      filteredCount,
      processedJobs,
      currentPage,
      noNewJobsCount,
      MAX_NO_NEW_JOBS,
      jobFoundMessageShown,
    } = this.jobsLoopState;

    try {
      while (appliedCount < jobsToApply) {
        const jobCards = await this.getJobCards();

        if (jobCards.length > 0 && !jobFoundMessageShown) {
          // Show job found message only once when first jobs are discovered
          notifyStatus({ type: "JOB_FOUND" });
          await this.delay(2000);
          this.jobsLoopState.jobFoundMessageShown = true;
          jobFoundMessageShown = true;
          // Wait for message to be seen
          await this.delay(1800);
        }

        if (jobCards.length === 0) {
          if (await this.scrollAndWaitForNewJobs()) {
            continue;
          }

          const hasNextPage = await this.goToNextPage(currentPage);
          if (hasNextPage) {
            currentPage++;
            noNewJobsCount = 0;
            await this.waitForPageLoad();
            continue;
          } else {
            break;
          }
        }

        let newJobsFound = false;
        let newApplicableJobsFound = false;

        for (const jobCard of jobCards) {
          if (appliedCount >= jobsToApply) {
            break;
          }

          const jobId = this.getJobIdFromCard(jobCard);

          if (!jobId || processedJobs.has(jobId)) {
            continue;
          }

          processedJobs.add(jobId);
          newJobsFound = true;
          processedCount++;

          try {
            if (!this.isElementInViewport(jobCard)) {
              jobCard.scrollIntoView({ behavior: "smooth", block: "center" });
              await this.sleep(1000);
            }

            await this.clickJobCard(jobCard);
            await this.waitForJobDetailsLoad();

            const jobDetails = this.getJobProperties();

            // Check if company is blacklisted - do this early before other checks
            const companyBlacklist =
              this.sessionContext?.preferences?.companyBlacklist || [];
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
                await this.delay(4000);
                skippedCount++;
                continue;
              }
            }

            if (
              this.sessionContext?.preferences?.applyOnlyMatching ||
              this.sessionContext?.preferences?.applyOnlyQualified
            ) {
              if (!(await this.doesJobMatchPreferences(jobDetails))) {
                filteredCount++;

                notifyStatus({
                  type: "DOES_NOT_MATCH_PREFERENCES",
                  data: {
                    reason: this.reason,
                    title: jobDetails.title,
                  },
                });

                await this.delay(4000);
                continue;
              }
            }

            const applyButton = await this.findApplyButton();
            if (!applyButton) {
              skippedCount++;
              continue;
            }

            const jobDescription = await this.scrapeJobDescription();
            jobDetails.description = jobDescription;

            const applyType = this.determineApplyType(applyButton);

            if (applyType !== "easy_apply") {
              // Skip non-Easy Apply jobs
              console.log(`⏭️ Skipping non-Easy Apply job: ${jobDetails.title} (${applyType})`);
              skippedCount++;
              continue;
            } else {
              // Use reusable canApply check
              const checkResult = await this.checkCanApplyAndNotify(
                jobDetails.jobId,
                jobDetails
              );

              if (checkResult.action === "stop") {
                // Stop the automation (limit reached)
                return;
              }

              if (checkResult.action === "skip") {
                // Already applied - skip to next job
                skippedCount++;
                continue;
              }

              // Can proceed with application
              newApplicableJobsFound = true;

              notifyStatus({
                type: "APPLYING_TO_JOB",
                data: { title: jobDetails.title, company: jobDetails.company },
              });

              await this.delay(1500);

              this.updateProgress({
                current: `Applying to: ${jobDetails.title} at ${jobDetails.company}`,
              });

              await this.delay(2000);

              const result = await this.applyToJob(applyButton, jobDetails);
              if (result === "WAITING_FOR_USER") {
                // Save the current state so we can resume from here
                this.jobsLoopState = {
                  processedCount,
                  appliedCount,
                  skippedCount,
                  filteredCount,
                  processedJobs,
                  currentPage,
                  noNewJobsCount,
                  MAX_NO_NEW_JOBS,
                  jobFoundMessageShown,
                };
                console.log(
                  "Co-pilot mode: Waiting for user to review and submit"
                );
                return;
              }

              if (result === true) {
                appliedCount++;
                this.progress.completed = appliedCount;
                this.updateProgress({ completed: appliedCount });

                // Check if user can continue applying after this application
                const postApplyCheck = await this.checkCanApplyAndNotify(
                  null, // No specific job ID - just checking limits
                  null
                );

                console.log("Post apply check:", postApplyCheck);

                if (postApplyCheck.action === "stop") {
                  // Limit reached after this application - report and stop
                  this.reportApplicationSubmitted(jobDetails, {
                    method: "Easy Apply",
                    userId: this.getUserId(),
                    matchedPreferences: true,
                  });
                  return;
                }

                this.reportApplicationSubmitted(jobDetails, {
                  method: "Easy Apply",
                  userId: this.getUserId(),
                  matchedPreferences: true,
                });
              } else {
                this.progress.failed++;
                this.updateProgress({ failed: this.progress.failed });
              }
            }

            await this.sleep(2000);
          } catch (error) {
            console.error(`Error processing job ${jobId}:`, error);
            continue;
          }
        }

        if (!newApplicableJobsFound) {
          if (await this.scrollAndWaitForNewJobs()) {
            noNewJobsCount = 0;
            continue;
          }

          const hasNextPage = await this.goToNextPage(currentPage);
          if (hasNextPage) {
            currentPage++;
            noNewJobsCount = 0;
            await this.waitForPageLoad();
          } else {
            noNewJobsCount++;
            if (noNewJobsCount >= MAX_NO_NEW_JOBS) {
              break;
            }
          }
        } else {
          noNewJobsCount = 0;
        }
      }

      // Clear state after completion
      this.jobsLoopState = null;

      const completionStatus =
        appliedCount >= jobsToApply ? "target_reached" : "no_more_jobs";
      const message =
        appliedCount >= jobsToApply
          ? `Mission accomplished! 🎉 I successfully applied to all ${appliedCount} jobs you wanted! We looked through ${processedCount} total opportunities across ${currentPage} pages and filtered out ${filteredCount} jobs that didn't match your criteria.`
          : `Great work! I applied to ${appliedCount} out of ${jobsToApply} jobs. I looked through ${processedCount} opportunities, filtered out ${filteredCount} that didn't match your preferences, and skipped ${skippedCount} others that weren't quite right.`;

      notifyStatus({ type: "SEARCH_COMPLETED" });
      await this.delay(4000);
      this.reportComplete();

      return {
        status: completionStatus,
        message,
        appliedCount,
        processedCount,
        skippedCount,
        filteredCount,
        totalPages: currentPage,
        preferencesUsed: this.config.preferences,
      };
    } catch (error) {
      console.error("Error in processJobs:", error);
      this.jobsLoopState = null; // Clear state on error
      this.reportError(error, { phase: "processJobs" });
      throw error;
    }
  }

  async applyToJob(applyButton, jobDetails) {
    try {
      console.log(jobDetails);
      // Build enriched job description with extracted metadata for AI context
      const descriptionParts = [];
      if (jobDetails.title && jobDetails.title !== "N/A") descriptionParts.push(`Job Title: ${jobDetails.title}`);
      if (jobDetails.company && jobDetails.company !== "N/A") descriptionParts.push(`Company: ${jobDetails.company}`);
      if (jobDetails.location && jobDetails.location !== "Not specified") descriptionParts.push(`Location: ${jobDetails.location}`);
      if (jobDetails.salary && jobDetails.salary !== "Not specified") descriptionParts.push(`Salary: ${jobDetails.salary}`);
      if (jobDetails.workplace && jobDetails.workplace !== "Not specified") descriptionParts.push(`Workplace: ${jobDetails.workplace}`);
      if (jobDetails.jobType && jobDetails.jobType !== "Not specified") descriptionParts.push(`Job Type: ${jobDetails.jobType}`);
      if (jobDetails.description) descriptionParts.push(`\n${jobDetails.description}`);

      this.currentJobDescription =
        descriptionParts.length > 0 ? descriptionParts.join("\n") : "No job description available";

      // Store job details for co-pilot mode
      this.currentJobDetails = jobDetails;

      applyButton.click();

      notifyStatus({ type: "FILLING_FORM" });

      await this.delay(4000);

      let currentStep = "initial";
      let attempts = 0;
      const maxAttempts = 20;

      while (
        currentStep !== "submitted" &&
        currentStep !== "waiting_for_user_approval" &&
        currentStep !== "waiting_for_user_next" &&
        attempts < maxAttempts
      ) {
        await this.fillCurrentStep();
        currentStep = await this.moveToNextStep();
        attempts++;

        if (currentStep === "waiting_for_user_next") {
          // Pause here and wait for user to review current step and click next
          notifyStatus({
            type: "COPILOT_WAITING_FOR_NEXT",
            data: { title: jobDetails.title, company: jobDetails.company },
          });
          return "WAITING_FOR_USER";
        }

        if (currentStep === "waiting_for_user_approval") {
          // Pause here and wait for user to review and submit
          notifyStatus({
            type: "COPILOT_WAITING_FOR_REVIEW",
            data: { title: jobDetails.title, company: jobDetails.company },
          });
          return "WAITING_FOR_USER";
        }

        if (currentStep === "submitted") {
          // Show submitting application message BEFORE handling submission
          notifyStatus({ type: "SUBMITTING_APPLICATION" });
          await this.delay(2000);
          await this.handlePostSubmissionModal();
        }
      }

      if (attempts >= maxAttempts) {
        await this.closeApplication();
        await this.sleep(1000);
        return false;
      }

      await this.saveAppliedJob(
        jobDetails,
        this.extractJobId(this.applicationState.applicationUrl)
      );
      return true;
    } catch (error) {
      // Show application error message
      notifyStatus({ type: "APPLICATION_ERROR" });
      await this.delay(4000);
      await this.handleErrorState();
      await this.sleep(1000);
      return false;
    }
  }

  async submitPendingApplication() {
    try {
      if (!this.copilotState.hasPendingSubmission()) {
        console.warn("No pending submission to submit");
        return false;
      }

      const submitButton = this.copilotState.currentJob.submitButton;
      const jobDetails = this.copilotState.currentJob.jobDetails;

      if (submitButton && this.isElementVisible(submitButton)) {
        // Show submitting message
        notifyStatus({ type: "SUBMITTING_APPLICATION" });
        await this.delay(3000);
        // Click the submit button
        submitButton.click();
        await this.sleep(2000);

        // Handle post-submission modal
        await this.handlePostSubmissionModal();

        // Save the applied job
        await this.saveAppliedJob(
          jobDetails,
          this.extractJobId(this.applicationState.applicationUrl)
        );

        // Update progress
        this.progress.completed++;
        this.updateProgress({ completed: this.progress.completed });

        // Report application submitted
        this.reportApplicationSubmitted(jobDetails, {
          method: "Easy Apply",
          userId: this.getUserId(),
          matchedPreferences: true,
        });

        // Clear the pending submission
        this.copilotState.clearPendingSubmission();

        // Restore mode buttons for next job
        this.restoreModeButtons();

        // Resume automation to continue with next job
        await this.resumeAfterUserSubmit();

        return true;
      } else {
        console.error("Submit button is no longer visible");
        this.copilotState.clearPendingSubmission();
        return false;
      }
    } catch (error) {
      console.error("Error submitting pending application:", error);
      this.copilotState.clearPendingSubmission();
      return false;
    }
  }

  async clickPendingNextButton() {
    try {
      if (!this.copilotState.hasPendingNext()) {
        console.warn("No pending next button to click");
        return false;
      }

      const nextButton = this.copilotState.currentJob.nextButton;
      const jobDetails = this.copilotState.currentJob.jobDetails;

      if (nextButton && this.isElementVisible(nextButton)) {
        // Click the next button (no message here to avoid duplicates)
        nextButton.click();
        await this.sleep(2000);

        // Clear the pending next button
        this.copilotState.clearPendingNext();

        // Continue the application process
        await this.continueApplicationAfterNext();

        return true;
      } else {
        console.error("Next button is no longer visible");
        this.copilotState.clearPendingNext();
        return false;
      }
    } catch (error) {
      console.error("Error clicking pending next button:", error);
      this.copilotState.clearPendingNext();
      return false;
    }
  }

  async continueApplicationAfterNext() {
    try {
      // Continue the application loop from where we paused
      const jobDetails = this.currentJobDetails;

      let currentStep = "initial";
      let attempts = 0;
      const maxAttempts = 20;

      while (
        currentStep !== "submitted" &&
        currentStep !== "waiting_for_user_approval" &&
        currentStep !== "waiting_for_user_next" &&
        attempts < maxAttempts
      ) {
        await this.fillCurrentStep();
        currentStep = await this.moveToNextStep();
        attempts++;

        if (currentStep === "waiting_for_user_next") {
          // Pause again at the next step
          notifyStatus({
            type: "COPILOT_WAITING_FOR_NEXT",
            data: { title: jobDetails.title, company: jobDetails.company },
          });
          await this.delay(4000);
          return;
        }

        if (currentStep === "waiting_for_user_approval") {
          // Final submit step - moveToNextStep already set the pending submission
          // Show message since we reached submit after clicking Next (not shown yet in this flow)
          notifyStatus({
            type: "COPILOT_WAITING_FOR_REVIEW",
            data: { title: jobDetails.title, company: jobDetails.company },
          });
          await this.delay(4000);
          return;
        }

        if (currentStep === "submitted") {
          // Application was submitted
          notifyStatus({ type: "SUBMITTING_APPLICATION" });
          await this.delay(4000);
          await this.handlePostSubmissionModal();
          await this.saveAppliedJob(
            jobDetails,
            this.extractJobId(this.applicationState.applicationUrl)
          );

          // Update progress and resume
          this.progress.completed++;
          this.updateProgress({ completed: this.progress.completed });
          this.reportApplicationSubmitted(jobDetails, {
            method: "Easy Apply",
            userId: this.getUserId(),
            matchedPreferences: true,
          });

          // Restore mode buttons for next job
          this.restoreModeButtons();

          // Resume to next job
          await this.resumeAfterUserSubmit();
          return;
        }
      }

      if (attempts >= maxAttempts) {
        await this.closeApplication();
        await this.sleep(1000);
        // Resume to next job after error
        await this.resumeAfterUserSubmit();
      }
    } catch (error) {
      console.error("Error continuing application after next:", error);
      notifyStatus({ type: "APPLICATION_ERROR" });
      await this.delay(4000);
      await this.handleErrorState();
      await this.sleep(1000);
      // Resume to next job after error
      await this.resumeAfterUserSubmit();
    }
  }

  async resumeAfterUserSubmit() {
    try {
      // Get the current applied count and jobs to apply
      const currentApplied = this.progress.completed || 0;
      const totalToApply = this.config.jobsToApply || 0;

      if (currentApplied >= totalToApply) {
        // Target reached
        notifyStatus({ type: "SEARCH_COMPLETED" });
        await this.delay(4000);
        this.reportComplete();
        return;
      }

      // Check if we have saved state from the paused job loop
      if (this.jobsLoopState) {
        // Update the appliedCount in the saved state to reflect the submission
        this.jobsLoopState.appliedCount = currentApplied;

        // Continue the existing loop instead of restarting
        await this.continueProcessJobs({ jobsToApply: totalToApply });
      } else {
        // No saved state, start fresh (shouldn't happen in normal flow)
        await this.processJobs({ jobsToApply: totalToApply });
      }
    } catch (error) {
      console.error("Error resuming after user submit:", error);
      this.reportError(error, { phase: "resumeAfterUserSubmit" });
    }
  }

  async fillCurrentStep() {
    const fileUploadContainers = document.querySelectorAll(
      ".js-jobs-document-upload__container"
    );
    if (fileUploadContainers.length) {
      // Show uploading files message
      if (this.config?.preferences?.useCustomResume === true) {
        notifyStatus({ type: "TAILORING_RESUME" });
      } else {
        notifyStatus({ type: "UPLOADING_FILES" });
      }
      await this.delay(4000);

      for (const container of fileUploadContainers) {
        try {
          const jobDescription =
            this.currentJobDescription || "No job description available";
          const currentJobUrl = window.location.href;
          const jobId = this.extractJobId(currentJobUrl);

          await this.fileHandler.handleFileUpload(
            container,
            this.userProfile,
            jobDescription,
            this.config.preferences,
            jobId,
            this.currentJobDetails?.title || ""
          );
        } catch (error) {
          console.error(`❌ File upload error: ${error.message}`);
        }
      }
    }

    const questions = document.querySelectorAll(".fb-dash-form-element");
    for (const question of questions) {
      await this.handleQuestion(question);
    }
  }

  async handleQuestion(question) {
    if (
      question.classList.contains("js-jobs-document-upload__container") ||
      question.hasAttribute("data-processed")
    ) {
      return;
    }

    const questionHandlers = {
      select: this.handleSelectQuestion,
      radio: this.handleRadioQuestion,
      text: this.handleTextQuestion,
      textarea: this.handleTextAreaQuestion,
      checkbox: this.handleCheckboxQuestion,
    };

    for (const [type, handler] of Object.entries(questionHandlers)) {
      const element = question.querySelector(this.getQuestionSelector(type));
      if (element) {
        await handler.call(this, element);
        question.setAttribute("data-processed", "true");
        return;
      }
    }
  }

  getQuestionSelector(type) {
    const selectors = {
      select: "select",
      radio:
        'fieldset[data-test-form-builder-radio-button-form-component="true"]',
      text: "input[type='text']",
      textarea: "textarea",
      checkbox: "input[type='checkbox']",
    };
    return selectors[type];
  }

  async handleSelectQuestion(select) {
    const container = select.closest(".fb-dash-form-element");
    const labelElement = container.querySelector(
      ".fb-dash-form-element__label"
    );
    const label = labelElement?.textContent?.trim();

    const options = Array.from(select.options)
      .filter((opt) => opt.value !== "Select an option")
      .map((opt) => opt.text.trim());

    const answer = await this.getAnswer(label, options, {
      elementType: "select",
      required: this.isFieldRequired(select),
    });
    select.value = answer;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async handleRadioQuestion(radio) {
    const label = this.getQuestionLabel(radio);
    const options = Array.from(
      radio.querySelectorAll('input[type="radio"]')
    ).map((input) => {
      const labelElement = document.querySelector(`label[for="${input.id}"]`);
      return labelElement ? labelElement.textContent.trim() : "Unknown";
    });
    const answer = await this.getAnswer(label, options, {
      elementType: "radio",
      required: this.isFieldRequired(radio),
    });

    const answerElement = Array.from(radio.querySelectorAll("label")).find(
      (el) => el.textContent.includes(answer)
    );
    if (answerElement) answerElement.click();
  }

  async handleTextQuestion(textInput) {
    const label = this.getQuestionLabel(textInput);

    // Derive actual field type from LinkedIn's input id suffix (-text, -numeric)
    const inputId = textInput.id || "";
    const isNumericInput = inputId.endsWith("-numeric");
    const elementType = isNumericInput ? "number" : "text";

    const answer = await this.getAnswer(label, [], {
      elementType,
      required: this.isFieldRequired(textInput),
    });

    // Numeric fields first — LinkedIn reuses artdeco-date components for these
    if (isNumericInput || this.isNumericField(label)) {
      textInput.value = answer;
      textInput.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    const isDateField =
      textInput.getAttribute("placeholder") === "mm/dd/yyyy" ||
      textInput.getAttribute("name") === "artdeco-date" ||
      label.toLowerCase().includes("date") ||
      this.isDateField(label);

    if (isDateField) {
      const formattedDate = this.formatDateForInput(answer);
      textInput.value = formattedDate;
      textInput.dispatchEvent(new Event("input", { bubbles: true }));
      textInput.dispatchEvent(new Event("blur", { bubbles: true }));
      return;
    }

    const isTypeahead = textInput.getAttribute("role") === "combobox";
    textInput.value = answer;
    textInput.dispatchEvent(new Event("input", { bubbles: true }));

    if (isTypeahead) {
      await this.sleep(1000);
      textInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown" })
      );
      await this.sleep(500);
      textInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    }
  }

  async handleTextAreaQuestion(textArea) {
    const label = this.getQuestionLabel(textArea);
    const answer = await this.getAIAnswer(label, [], null, {
      elementType: "textarea",
      fieldType: "textarea",
      fieldContext: `This is a textarea/long-form text field requiring a detailed response. Field label: "${label}"`,
      required: this.isFieldRequired(textArea),
    });
    textArea.value = answer;
    textArea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async handleCheckboxQuestion(checkbox) {
    const container = checkbox.closest(".fb-dash-form-element");
    const allCheckboxes = container
      ? Array.from(container.querySelectorAll("input[type='checkbox']"))
      : [checkbox];

    if (allCheckboxes.length <= 1) {
      // Single checkbox - use yes/no approach
      const label = this.getQuestionLabel(checkbox);
      const answer =
        (await this.getAnswer(label, ["Yes", "No"], {
          elementType: "checkbox",
          required: this.isFieldRequired(checkbox),
        })) === "Yes";
      checkbox.checked = answer;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    // Multiple checkboxes - checkbox group, use getMultiSelectAnswer
    const questionLabel = this.getQuestionLabel(checkbox);

    // Extract option text for each checkbox
    const optionMap = [];
    for (const cb of allCheckboxes) {
      let optionText = "";
      // Try label[for="id"]
      if (cb.id) {
        const labelEl = container.querySelector(`label[for="${cb.id}"]`);
        if (labelEl) optionText = labelEl.textContent.trim();
      }
      // Try data-test-text-selectable-option__label nearby
      if (!optionText) {
        const parentLabel = cb.closest("label");
        if (parentLabel) {
          const optLabel = parentLabel.querySelector(
            "[data-test-text-selectable-option__label]"
          );
          optionText = optLabel
            ? optLabel.textContent.trim()
            : parentLabel.textContent.trim();
        }
      }
      // Try next sibling element
      if (!optionText && cb.nextElementSibling) {
        optionText = cb.nextElementSibling.textContent.trim();
      }
      if (optionText) {
        optionMap.push({ checkbox: cb, text: optionText });
      }
    }

    const options = optionMap.map((o) => o.text);
    if (options.length === 0) {
      // Fallback: can't extract option labels, treat as single
      const label = this.getQuestionLabel(checkbox);
      const answer =
        (await this.getAnswer(label, ["Yes", "No"], {
          elementType: "checkbox",
          required: this.isFieldRequired(checkbox),
        })) === "Yes";
      checkbox.checked = answer;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    const context = {
      platform: "linkedin",
      userData: this.userProfile,
      jobDescription:
        this.currentJobDescription || "No job description available",
      elementType: "checkbox",
      fieldType: "checkbox-group",
      fieldContext: "LinkedIn Easy Apply form - checkbox group field",
      required: this.isFieldRequired(checkbox),
    };

    const selectedOptions = await this.aiService.getMultiSelectAnswer(
      questionLabel,
      options,
      context
    );

    // Apply selections - fuzzy match AI response to actual options
    for (const { checkbox: cb, text } of optionMap) {
      const textLower = text.toLowerCase();
      const shouldCheck = selectedOptions.some(
        (selected) =>
          textLower === selected ||
          textLower.includes(selected) ||
          selected.includes(textLower)
      );
      if (shouldCheck && !cb.checked) {
        cb.click();
      }
    }
  }

  getQuestionLabel(element) {
    const container = element.closest(".fb-dash-form-element");
    if (!container) return "Unknown";

    // For fieldsets (radio buttons), prioritize legend over labels
    // Labels inside fieldsets are typically option labels, not question labels
    const isFieldset =
      element.tagName === "FIELDSET" || element.closest("fieldset");

    if (isFieldset) {
      // First check for legend (proper fieldset label)
      const legend = container.querySelector("legend");
      if (legend && legend.textContent.trim()) {
        return legend.textContent.trim().replace(/\s+/g, " ");
      }

      // For fieldsets without legend, look for external group title first
      // before falling back to option labels
      const parentSection =
        container.closest(
          ".jobs-easy-apply-form-section__group, div[class*='jobs-easy-apply-form-section']"
        ) || container.parentElement?.parentElement;

      if (parentSection) {
        const groupTitle = parentSection.querySelector(
          ".jobs-easy-apply-form-section__group-title"
        );
        if (groupTitle && groupTitle.textContent.trim()) {
          const questionText = groupTitle.textContent.trim();
          console.log(
            "📝 Found fieldset label from group-title:",
            questionText
          );
          return questionText.replace(/\s+/g, " ");
        }
      }
    }

    // Standard approach: find label inside the container
    // Exclude labels that are for radio/checkbox options
    let label = container.querySelector(
      "legend, .fb-dash-form-element__label, .fb-dash-form-element__label-title--is-required"
    );

    // Avoid selecting option labels (labels with data-test-text-selectable-option__label)
    if (
      !label ||
      label.hasAttribute("data-test-text-selectable-option__label")
    ) {
      label = container.querySelector(
        "label:not([data-test-text-selectable-option__label])"
      );
    }

    if (
      label &&
      !label.hasAttribute("data-test-text-selectable-option__label")
    ) {
      return label.textContent.trim().replace(/\s+/g, " ");
    }

    // If no label found inside, look for labels OUTSIDE the container
    // This handles cases where question spans are siblings or ancestors
    const parentSection =
      container.closest(
        ".jobs-easy-apply-form-section__group, div[class*='jobs-easy-apply-form-section']"
      ) || container.parentElement;

    if (parentSection) {
      // Look for LinkedIn-specific question title/subtitle classes
      const groupTitle = parentSection.querySelector(
        ".jobs-easy-apply-form-section__group-title"
      );
      const groupSubtitle = parentSection.querySelector(
        ".jobs-easy-apply-form-section__group-subtitle"
      );

      if (groupSubtitle && groupSubtitle.textContent.trim()) {
        // Prefer subtitle as it usually contains the actual question
        const questionText = groupSubtitle.textContent.trim();
        console.log(
          "📝 Found label outside container (subtitle):",
          questionText
        );
        return questionText.replace(/\s+/g, " ");
      }

      if (groupTitle && groupTitle.textContent.trim()) {
        // Use title if subtitle not available
        const questionText = groupTitle.textContent.trim();
        console.log("📝 Found label outside container (title):", questionText);
        return questionText.replace(/\s+/g, " ");
      }

      // Fallback: look for any span with class containing "title" near the container
      const nearbySpan = parentSection.querySelector(
        "span[class*='title'], span[class*='group']"
      );
      if (nearbySpan && nearbySpan.textContent.trim()) {
        const questionText = nearbySpan.textContent.trim();
        console.log(
          "📝 Found label outside container (nearby span):",
          questionText
        );
        return questionText.replace(/\s+/g, " ");
      }
    }

    console.warn("⚠️ No label found for element:", element);
    return "Unknown";
  }

  async getAnswer(label, options = [], additionalContext = {}) {
    try {
      // fieldType = actual HTML element type (text, select, textarea, radio, checkbox)
      const fieldType = additionalContext.elementType || additionalContext.fieldType || "text";
      const answer = await this.getAIAnswer(label, options, null, {
        fieldType: fieldType,
        fieldContext: `LinkedIn Easy Apply form field - ${fieldType} field`,
        ...additionalContext,
      });

      if (answer !== null && answer !== undefined && answer !== "") {
        return answer;
      } else {
        return null;
      }
    } catch (error) {
      console.error("AI Answer Error:", error);
      throw error;
    }
  }

  /**
   * Override base platform method to use specialized AI service methods (same as Workable/Lever)
   */
  async getAIAnswer(
    question,
    options = [],
    fieldElement = null,
    additionalContext = {},
    retryCount = 0
  ) {
    try {
      const context = {
        platform: "linkedin",
        userData: this.userProfile,
        jobDescription:
          this.currentJobDescription || "No job description available",
        fieldType: additionalContext.elementType || additionalContext.fieldType || "text",
        fieldContext:
          additionalContext.fieldContext ||
          this.buildFieldContext(question, options),
        required: additionalContext.required || false,
        fieldElement,
        ...additionalContext,
      };

      let answer;

      // Use specialized AI service methods based on field type and context (same as Workable/Lever)
      if (options && options.length > 0) {
        answer = await this.aiService.getOptionAnswer(
          question,
          options,
          context
        );
      } else if (this.isSalaryField(question)) {
        answer = await this.aiService.getSalaryAnswer(
          question,
          options,
          context
        );
      } else if (
        context.fieldType === "textarea" ||
        context.fieldContext.toLowerCase().includes("cover letter") ||
        context.fieldContext.toLowerCase().includes("describe") ||
        context.fieldContext.toLowerCase().includes("why")
      ) {
        answer = await this.aiService.getLongformAnswer(
          question,
          options,
          context
        );
      } else {
        answer = await this.aiService.getNormalAnswer(
          question,
          options,
          context
        );
      }

      if (
        answer === null ||
        answer === undefined ||
        answer === "" ||
        String(answer).trim() === ""
      ) {
        if (retryCount < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 + retryCount * 500)
          );

          const retryContext = {
            ...context,
            fieldContext:
              context.fieldContext +
              ` (This field requires an answer. Please provide a response based on the user profile.)`,
          };

          let retryAnswer;
          if (options && options.length > 0) {
            retryAnswer = await this.aiService.getOptionAnswer(
              question,
              options,
              retryContext
            );
          } else if (this.isSalaryField(question)) {
            retryAnswer = await this.aiService.getSalaryAnswer(
              question,
              options,
              retryContext
            );
          } else if (
            context.fieldType === "textarea" ||
            context.fieldContext.toLowerCase().includes("cover letter") ||
            context.fieldContext.toLowerCase().includes("describe") ||
            context.fieldContext.toLowerCase().includes("why")
          ) {
            retryAnswer = await this.aiService.getLongformAnswer(
              question,
              options,
              retryContext
            );
          } else {
            retryAnswer = await this.aiService.getNormalAnswer(
              question,
              options,
              retryContext
            );
          }

          if (
            (retryAnswer === null ||
              retryAnswer === undefined ||
              retryAnswer === "" ||
              String(retryAnswer).trim() === "") &&
            retryCount < 1
          ) {
            return await this.getAIAnswer(
              question,
              options,
              fieldElement,
              additionalContext,
              retryCount + 1
            );
          }

          if (
            retryAnswer !== null &&
            retryAnswer !== undefined &&
            String(retryAnswer).trim() !== ""
          ) {
            return retryAnswer;
          }
        }

        return null;
      }

      return answer;
    } catch (error) {
      // Retry on error if we haven't exceeded retry limit
      if (retryCount < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 + retryCount * 500)
        );
        return await this.getAIAnswer(
          question,
          options,
          fieldElement,
          additionalContext,
          retryCount + 1
        );
      }

      return null;
    }
  }

  // Helper methods to add to the LinkedIn class

  determineFieldType(label, options, elementType) {
    // Boolean only valid for radio/checkbox/select elements, not free-text inputs
    if (
      elementType !== "text" &&
      elementType !== "textarea" &&
      this.isBooleanField(label)
    )
      return "boolean";
    if (this.isSalaryField(label)) return "numeric";
    if (this.isNumericField(label)) return "numeric";
    if (this.isDateField(label)) return "date";
    if (this.isPhoneField(label)) return "phone";
    if (this.isEmailField(label)) return "email";
    if (this.isUrlField(label)) return "url";
    if (this.isLocationField(label)) return "location";
    if (this.isHowDidYouHearField(label)) return "source";
    if (options && options.length > 0) return "select";
    return "text";
  }

  isFieldRequired(element) {
    if (element.required || element.hasAttribute("required")) return true;
    const container = element.closest(".fb-dash-form-element");
    if (
      container?.querySelector(
        ".fb-dash-form-element__label-title--is-required"
      )
    )
      return true;
    return false;
  }

  buildFieldContext(label, options) {
    let context = `Field label: "${label}"`;

    if (options && options.length > 0) {
      context += `. Available options: ${options.join(", ")}`;
    }

    if (this.isBooleanField(label)) {
      context +=
        ". This is a yes/no question. Respond with 'Yes' or 'No' only, or select the appropriate option if provided.";
    }

    if (this.isSalaryField(label)) {
      context +=
        ". This is a salary/compensation field requiring numeric input only.";
    }

    if (this.isNumericField(label)) {
      context +=
        ". This is a numeric field. Provide a number only (e.g., '5' for 5 years of experience).";
    }

    if (this.isDateField(label)) {
      context +=
        ". This is a date field requiring MM/DD/YYYY format. You MUST respond with a concrete date like '01/15/2025'. Do NOT respond with relative terms like 'immediately', 'ASAP', '2 weeks', or 'as soon as possible'. If the question asks about availability or start date, provide a date approximately 2 weeks from today.";
    }

    if (this.isPhoneField(label)) {
      context +=
        ". This is a phone number field. Use the user's phone number from their profile.";
    }

    if (this.isEmailField(label)) {
      context +=
        ". This is an email field. Use the user's email address from their profile.";
    }

    if (this.isUrlField(label)) {
      context +=
        ". This is a URL field. Provide a valid URL (e.g., LinkedIn profile, portfolio, or website).";
    }

    if (this.isLocationField(label)) {
      context +=
        ". This is a location field that should use user's location data.";
    }

    return context;
  }

  isSalaryField(label) {
    const salaryPatterns = [
      /salary/i,
      /compensation/i,
      /expected.*salary/i,
      /salary.*expectation/i,
      /pay.*range/i,
      /wage/i,
      /rate.*hour/i,
      /hourly.*rate/i,
      /annual.*income/i,
      /desired.*salary/i,
      /ctc/i,
      /cost.*to.*company/i,
      /package/i,
      /remuneration/i,
      /pay.*expectation/i,
      /current.*salary/i,
      /minimum.*salary/i,
      /target.*salary/i,
      /\bote\b/i,
      /on.target.earnings/i,
      /total.*comp/i,
      /base.*pay/i,
      /pay.*rate/i,
    ];

    return salaryPatterns.some((pattern) => pattern.test(label));
  }

  isDateField(label) {
    const datePatterns = [
      /date.*available/i,
      /start.*date/i,
      /available.*date/i,
      /graduation.*date/i,
      /end.*date/i,
      /when.*available/i,
      /notice.*period/i,
      /dob/i,
      /date.*of.*birth/i,
      /birth.*date/i,
      /hire.*date/i,
      /joining.*date/i,
      /availability.*date/i,
      /earliest.*start/i,
      /when.*can.*you.*start/i,
      /when.*can.*you.*join/i,
    ];

    return datePatterns.some((pattern) => pattern.test(label));
  }

  isLocationField(label) {
    const locationPatterns = [
      /location/i,
      /where.*located/i,
      /city.*state/i,
      /address/i,
      /where.*live/i,
      /residence/i,
      /geographic/i,
      /zip.*code/i,
      /postal.*code/i,
      /postcode/i,
      /country/i,
      /city/i,
      /state/i,
      /province/i,
      /region/i,
      /current.*location/i,
      /preferred.*location/i,
    ];

    return locationPatterns.some((pattern) => pattern.test(label));
  }

  isHowDidYouHearField(label) {
    const hearPatterns = [
      /how.*did.*you.*hear/i,
      /how.*did.*you.*find/i,
      /source.*referral/i,
      /referred.*by/i,
      /how.*learn.*about/i,
    ];

    return hearPatterns.some((pattern) => pattern.test(label));
  }

  isPhoneField(label) {
    const phonePatterns = [
      /phone/i,
      /mobile/i,
      /cell/i,
      /telephone/i,
      /contact.*number/i,
      /phone.*number/i,
      /mobile.*number/i,
    ];

    return phonePatterns.some((pattern) => pattern.test(label));
  }

  isEmailField(label) {
    const emailPatterns = [
      /email/i,
      /e-mail/i,
      /email.*address/i,
      /contact.*email/i,
    ];

    return emailPatterns.some((pattern) => pattern.test(label));
  }

  isUrlField(label) {
    const urlPatterns = [
      /website/i,
      /portfolio/i,
      /linkedin.*url/i,
      /linkedin.*profile/i,
      /github/i,
      /personal.*url/i,
      /personal.*website/i,
      /online.*profile/i,
      /social.*media/i,
      /url/i,
      /link.*to/i,
    ];

    return urlPatterns.some((pattern) => pattern.test(label));
  }

  isNumericField(label) {
    const numericPatterns = [
      /years.*experience/i,
      /experience.*years/i,
      /how.*many.*years/i,
      /number.*of/i,
      /total.*years/i,
      /years.*of/i,
      /direct.*reports/i,
      /team.*size/i,
      /age/i,
      /quantity/i,
      /count/i,
    ];

    return numericPatterns.some((pattern) => pattern.test(label));
  }

  isBooleanField(label) {
    const booleanPatterns = [
      /are\s+you\s+authorized/i,
      /authorized\s+to\s+work/i,
      /legally\s+authorized/i,
      /work\s+authorization/i,
      /require\s+sponsorship/i,
      /need\s+sponsorship/i,
      /will\s+you\s+now\s+or/i,
      /do\s+you\s+require/i,
      /have\s+you\s+ever/i,
      /are\s+you\s+willing/i,
      /are\s+you\s+able/i,
      /^can\s+you\b/i,
      /^do\s+you\s+have\b/i,
      /^is\s+this\b/i,
      /^will\s+you\b/i,
      /^would\s+you\b/i,
      /^are\s+you\b/i,
      /currently\s+employed/i,
      /agree\s+to/i,
      /consent\s+to/i,
    ];

    return booleanPatterns.some((pattern) => pattern.test(label));
  }

  getUserLocationData() {
    const userData = this.userProfile;

    // Try different location combinations like Ashby
    if (userData.streetAddress) {
      return userData.streetAddress;
    }

    // Combine city, state, country
    const parts = [];
    if (userData.city) parts.push(userData.city);
    if (userData.state) parts.push(userData.state);
    if (userData.country && userData.country !== "United States") {
      parts.push(userData.country);
    }

    if (parts.length > 0) {
      return parts.join(", ");
    }

    // State and country only
    if (userData.state) {
      let location = userData.state;
      if (userData.country && userData.country !== "United States") {
        location += ", " + userData.country;
      }
      return location;
    }

    // Country only
    if (userData.country) {
      return userData.country;
    }

    return "";
  }

  formatDateForInput(dateStr) {
    try {
      if (!dateStr || typeof dateStr !== "string") return dateStr;

      // If already in MM/DD/YYYY format, return as-is
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr.trim())) {
        return dateStr.trim();
      }

      // Handle non-date answers like "immediately", "ASAP", "2 weeks", etc.
      // by generating a near-future date
      const nonDatePatterns =
        /^(immediately|asap|now|right away|as soon as possible|today|tomorrow|next week|2\s*weeks?|one\s*week|two\s*weeks?|1\s*month|one\s*month|anytime|flexible)/i;
      if (nonDatePatterns.test(dateStr.trim())) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 14); // Default to 2 weeks from now
        const mm = String(futureDate.getMonth() + 1).padStart(2, "0");
        const dd = String(futureDate.getDate()).padStart(2, "0");
        const yyyy = futureDate.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
      }

      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        // Invalid date — fallback to 2 weeks from now
        const fallback = new Date();
        fallback.setDate(fallback.getDate() + 14);
        const mm = String(fallback.getMonth() + 1).padStart(2, "0");
        const dd = String(fallback.getDate()).padStart(2, "0");
        const yyyy = fallback.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
      }

      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const dd = String(date.getDate()).padStart(2, "0");
      const yyyy = date.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    } catch (error) {
      // Last resort fallback — 2 weeks from now
      const fallback = new Date();
      fallback.setDate(fallback.getDate() + 14);
      const mm = String(fallback.getMonth() + 1).padStart(2, "0");
      const dd = String(fallback.getDate()).padStart(2, "0");
      const yyyy = fallback.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    }
  }

  async scrapeJobDescription() {
    try {
      // Wait for the description element to be present
      const descriptionElement = await this.waitForElement(
        ".jobs-description-content__text--stretch, .jobs-description-content__text",
        10000
      );

      if (!descriptionElement) {
        return "No job description found";
      }

      // Wait a bit for the content to fully load
      await this.sleep(500);

      // Try to get the content from the mt4 div which contains the actual description
      const contentDiv =
        descriptionElement.querySelector(".mt4") || descriptionElement;

      // Extract all text content including nested spans
      const fullText = contentDiv.textContent || contentDiv.innerText || "";

      if (!fullText || fullText.trim().length === 0) {
        return "No job description available";
      }

      // Clean up the text while preserving structure
      const cleanedText = fullText
        .replace(/\s+/g, " ") // Replace multiple spaces with single space
        .trim()
        .replace(/([.!?])\s+/g, "$1\n") // Add line breaks after sentences
        .replace(/\n\s+\n/g, "\n\n"); // Clean up multiple line breaks
      return cleanedText;
    } catch (error) {
      console.error("Error scraping job description:", error);
      return "Error loading job description";
    }
  }

  async moveToNextStep() {
    try {
      const buttonSelectors = {
        next: 'button[aria-label="Continue to next step"]',
        preview: 'button[aria-label="Review your application"]',
        submit: 'button[aria-label="Submit application"]',
        dismiss: 'button[aria-label="Dismiss"]',
        done: 'button[aria-label="Done"]',
        close: 'button[aria-label="Close"]',
        continueApplying:
          'button[aria-label*="Easy Apply"][aria-label*="Continue applying"]',
        continueTips:
          'button[aria-label="I understand the tips and want to continue the apply process"]',
        saveJob: 'button[data-control-name="save_application_btn"]',
      };

      await this.waitForAnyElement(Object.values(buttonSelectors));

      if (await this.findAndClickButton(buttonSelectors.continueTips)) {
        await this.sleep(2000);
        return "continue";
      }

      if (await this.findAndClickButton(buttonSelectors.continueApplying)) {
        await this.sleep(2000);
        return "continue";
      }

      if (await this.findAndClickButton(buttonSelectors.saveJob)) {
        await this.sleep(2000);
        return "saved";
      }

      const submitButton = document.querySelector(buttonSelectors.submit);
      if (submitButton && this.isElementVisible(submitButton)) {
        // Check if we're in co-pilot mode
        if (this.copilotState.isInCoPilotMode()) {
          // Store the submit button and wait for user approval
          this.copilotState.setPendingSubmission(
            this.currentJobDetails,
            submitButton
          );
          return "waiting_for_user_approval";
        } else {
          // Auto-pilot mode: Click automatically
          submitButton.click();
          await this.sleep(2000);
          return "submitted";
        }
      }

      // Check for preview button (acts like next)
      const previewButton = document.querySelector(buttonSelectors.preview);
      if (previewButton && this.isElementVisible(previewButton)) {
        if (this.copilotState.isInCoPilotMode()) {
          // Store the button and wait for user approval
          this.copilotState.setPendingNext(
            this.currentJobDetails,
            previewButton
          );
          return "waiting_for_user_next";
        } else {
          // Auto-pilot: Click automatically
          previewButton.click();
          await this.sleep(2000);
          return "preview";
        }
      }

      // CRITICAL INTERCEPTION POINT: Check for next button
      const nextButton = document.querySelector(buttonSelectors.next);
      if (nextButton && this.isElementVisible(nextButton)) {
        if (this.copilotState.isInCoPilotMode()) {
          // Store the button and wait for user approval
          this.copilotState.setPendingNext(this.currentJobDetails, nextButton);
          return "waiting_for_user_next";
        } else {
          // Auto-pilot: Click automatically
          nextButton.click();
          await this.sleep(2000);
          return "next";
        }
      }

      if (
        (await this.findAndClickButton(buttonSelectors.dismiss)) ||
        (await this.findAndClickButton(buttonSelectors.done)) ||
        (await this.findAndClickButton(buttonSelectors.close))
      ) {
        await this.sleep(2000);
        return "modal-closed";
      }
      return "error";
    } catch (error) {
      return "error";
    }
  }

  async goToNextPage(currentPage) {
    try {
      const nextButton = document.querySelector(
        "button.jobs-search-pagination__button--next"
      );
      if (nextButton) {
        nextButton.click();
        await this.waitForPageLoad();
        return true;
      }

      const paginationContainer = document.querySelector(
        ".jobs-search-pagination__pages"
      );
      if (!paginationContainer) {
        return false;
      }

      const activeButton = paginationContainer.querySelector(
        ".jobs-search-pagination__indicator-button--active"
      );
      if (!activeButton) {
        return false;
      }

      const currentPageNum = parseInt(
        activeButton.querySelector("span").textContent
      );

      const pageIndicators = paginationContainer.querySelectorAll(
        ".jobs-search-pagination__indicator"
      );
      let nextPageButton = null;

      pageIndicators.forEach((indicator) => {
        const button = indicator.querySelector("button");
        const span = button.querySelector("span");
        const pageNum = span.textContent;

        if (pageNum !== "…" && parseInt(pageNum) === currentPageNum + 1) {
          nextPageButton = button;
        }
      });

      if (nextPageButton) {
        nextPageButton.click();
        await this.waitForPageLoad();
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error navigating to next page:", error);
      return false;
    }
  }

  async initialScroll() {
    const jobsList = document.querySelector(".job-card-list ");
    if (!jobsList) return;

    const totalHeight = jobsList.scrollHeight;
    const increment = Math.floor(totalHeight / 4);

    for (let i = 0; i <= totalHeight; i += increment) {
      jobsList.scrollTo(0, i);
      await this.sleep(500);
    }

    jobsList.scrollTo(0, 0);
    await this.sleep(1000);
  }

  async scrollAndWaitForNewJobs() {
    const jobsList = document.querySelector(".job-card-list ");
    if (!jobsList) return false;

    const previousHeight = jobsList.scrollHeight;
    const previousJobCount = document.querySelectorAll(
      ".job-card-list  [data-occludable-job-id]"
    ).length;

    const currentScroll = jobsList.scrollTop;
    const targetScroll = currentScroll + window.innerHeight * 0.75;

    jobsList.scrollTo({ top: targetScroll, behavior: "smooth" });

    await this.sleep(2000);

    const newHeight = jobsList.scrollHeight;
    const newJobCount = document.querySelectorAll(
      ".job-card-list  [data-occludable-job-id]"
    ).length;

    return newHeight > previousHeight || newJobCount > previousJobCount;
  }

  async waitForPageLoad() {
    try {
      await this.waitForElement(".job-card-list ");
      await this.sleep(2000);

      const spinner = document.querySelector(".artdeco-loader");
      if (spinner) {
        await new Promise((resolve) => {
          const observer = new MutationObserver(() => {
            if (!document.contains(spinner)) {
              observer.disconnect();
              resolve();
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
        });
      }
    } catch (error) {
      console.error("Error waiting for page load:", error);
    }
  }

  async waitForSearchResultsLoad() {
    return new Promise((resolve) => {
      const checkSearchResults = () => {
        if (document.querySelector(".job-card-list ")) {
          resolve();
        } else {
          setTimeout(checkSearchResults, 500);
        }
      };
      checkSearchResults();
    });
  }

  async getJobCards() {
    const jobCards = document.querySelectorAll(
      ".scaffold-layout__list-item[data-occludable-job-id]"
    );
    return jobCards;
  }

  getJobIdFromCard(jobCard) {
    const jobLink = jobCard.querySelector("a[href*='jobs/view']");
    if (jobLink) {
      const href = jobLink.href;
      const match = href.match(/view\/(\d+)/);
      return match ? match[1] : null;
    }
    return jobCard.dataset.jobId || null;
  }

  /**
   * Find any apply button (both Easy Apply and External Apply)
   * @returns {Promise<Element|null>} The apply button element
   */
  async findApplyButton() {
    try {
      // Try to find the apply button - works for both Easy Apply and External Apply
      const button = await this.waitForElement(".jobs-apply-button", 5000);
      return button;
    } catch (error) {
      return null;
    }
  }

  /**
   * @deprecated Use findApplyButton() instead
   * Kept for backward compatibility
   */
  async findEasyApplyButton() {
    return this.findApplyButton();
  }

  getJobProperties() {
    // Company
    const company =
      document
        .querySelector(".job-details-jobs-unified-top-card__company-name")
        ?.textContent?.trim() || "N/A";

    // Title
    const title =
      document
        .querySelector(".job-details-jobs-unified-top-card__job-title")
        ?.textContent?.trim() || "N/A";

    // Job ID
    const urlParams = new URLSearchParams(window.location.search);
    const jobId = urlParams.get("currentJobId");

    // Details container for location, posted date, applicants
    const detailsContainer = document.querySelector(
      ".job-details-jobs-unified-top-card__primary-description-container .t-black--light.mt2"
    );
    const detailsText = detailsContainer ? detailsContainer.textContent : "";

    // Location - try multiple selectors to handle different LinkedIn layouts
    let location = "Not specified";

    // Try extracting from tvm__text span (newer layout)
    const locationSpan = document.querySelector(
      ".job-details-jobs-unified-top-card__tertiary-description-container .tvm__text--low-emphasis"
    );
    if (locationSpan) {
      const locationText = locationSpan.textContent?.trim();
      if (
        locationText &&
        !locationText.toLowerCase().includes("reposted") &&
        !locationText.toLowerCase().includes("applicant") &&
        !locationText.toLowerCase().includes("promoted")
      ) {
        location = locationText;
      }
    }

    // Fallback to regex extraction if no location found
    if (location === "Not specified" && detailsText) {
      location = detailsText.match(/^(.*?)\s·/)?.[1]?.trim() || "Not specified";
    }

    // Posted date
    const postedDate =
      detailsText.match(/·\s(.*?)\s·/)?.[1]?.trim() || "Not specified";

    // Applications/Applicants
    const applicantsMatch = detailsText.match(/·\s([^·]*applicants[^·]*)/i);
    const applications = applicantsMatch?.[1]?.trim() || "Not specified";

    // Salary - extract from buttons in job-details-fit-level-preferences
    let salary = "Not specified";
    const salaryButtons = document.querySelectorAll(
      ".job-details-fit-level-preferences button"
    );
    for (const button of salaryButtons) {
      // Try to get text from tvm__text span first (newer layout)
      const tvmSpan = button.querySelector(".tvm__text");
      const buttonText = tvmSpan
        ? tvmSpan.textContent?.trim()
        : button.textContent?.trim() || "";

      if (buttonText.includes("$") || buttonText.match(/\d+K/)) {
        salary = buttonText;
        break;
      }
    }

    // Workplace type (Remote, On-site, Hybrid)
    let workplace = "Not specified";
    for (const button of salaryButtons) {
      // Try to get text from tvm__text span first (newer layout)
      const tvmSpan = button.querySelector(".tvm__text");
      const buttonText = tvmSpan
        ? tvmSpan.textContent?.trim()
        : button.textContent?.trim() || "";

      if (buttonText.match(/Remote|On-site|Hybrid/i)) {
        // Remove the checkmark icon text if present
        workplace = buttonText.replace(/✓\s*/g, "").trim();
        break;
      }
    }

    // Job type (Full-time, Part-time, Contract, etc.)
    let jobType = "Not specified";
    for (const button of salaryButtons) {
      // Try to get text from tvm__text span first (newer layout)
      const tvmSpan = button.querySelector(".tvm__text");
      const buttonText = tvmSpan
        ? tvmSpan.textContent?.trim()
        : button.textContent?.trim() || "";

      if (
        buttonText.match(/Full-time|Part-time|Contract|Internship|Temporary/i)
      ) {
        jobType = buttonText;
        break;
      }
    }

    // Application status
    let applicationStatus = null;
    const appliedFeedback = document.querySelector(
      ".jobs-s-apply .artdeco-inline-feedback__message"
    );
    if (appliedFeedback) {
      applicationStatus = appliedFeedback.textContent?.trim() || null;
    }

    // Job description
    const descriptionElem = document.querySelector(
      ".jobs-description-content__text, .jobs-box__html-content"
    );
    const description = descriptionElem?.textContent?.trim() || "";

    return {
      title,
      jobId,
      company,
      location,
      postedDate,
      applications,
      workplace,
      salary,
      jobType,
      applicationStatus,
      description,
    };
  }

  async clickJobCard(jobCard) {
    try {
      const clickableElement = jobCard.querySelector(
        "a[href*='jobs/view'], .job-card-list__title, .job-card-container__link"
      );

      if (!clickableElement) {
        throw new Error("No clickable element found in job card");
      }

      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      });

      clickEvent.preventDefault();
      clickableElement.dispatchEvent(clickEvent);

      await this.waitForJobDetailsLoad();

      return true;
    } catch (error) {
      throw error;
    }
  }

  async waitForJobDetailsLoad() {
    try {
      const element = await this.waitForElement(
        ".job-details-jobs-unified-top-card__job-title",
        10000
      );
      await this.sleep(1000);
      return element;
    } catch (error) {
      throw new Error("Job details failed to load");
    }
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async waitForElement(selector, timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await this.sleep(100);
    }
    throw new Error(`Element not found: ${selector}`);
  }

  async waitForAnyElement(selectors, timeout = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && this.isElementVisible(element)) {
          return element;
        }
      }
      await this.sleep(100);
    }
    throw new Error(`None of the elements found: ${selectors.join(", ")}`);
  }

  isElementVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    return element.offsetParent !== null;
  }

  isElementInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <=
        (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  async findAndClickButton(selector, options = {}) {
    const { dryRun = false } = options;

    const button = document.querySelector(selector);
    if (button && this.isElementVisible(button)) {
      try {
        if (dryRun) {
          return true;
        }
        button.click();
        return true;
      } catch (error) {
        return false;
      }
    }
    return false;
  }

  async handlePostSubmissionModal() {
    try {
      await this.sleep(2000);

      const modalSelectors = [
        'button[aria-label="Dismiss"]',
        'button[aria-label="Done"]',
        'button[aria-label="Close"]',
        ".artdeco-modal__dismiss",
        ".jobs-applied-modal__dismiss-btn",
      ];

      for (const selector of modalSelectors) {
        const button = document.querySelector(selector);
        if (button && this.isElementVisible(button)) {
          button.click();
          await this.sleep(1000);
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async closeApplication() {
    try {
      const closeButton = document.querySelector(
        "button[data-test-modal-close-btn]"
      );
      if (closeButton && this.isElementVisible(closeButton)) {
        closeButton.click();
        await this.sleep(1000);

        const discardButton = document.querySelector(
          'button[data-control-name="discard_application_confirm_btn"]'
        );
        if (discardButton && this.isElementVisible(discardButton)) {
          discardButton.click();
          await this.sleep(1000);
        }
        return true;
      }

      const fallbackSelectors = [
        ".artdeco-modal__dismiss",
        'button[aria-label="Dismiss"]',
        'button[aria-label="Close"]',
      ];

      for (const selector of fallbackSelectors) {
        const button = document.querySelector(selector);
        if (button && this.isElementVisible(button)) {
          button.click();
          await this.sleep(1000);
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async handleErrorState() {
    try {
      const closeButtons = [
        'button[aria-label="Dismiss"]',
        'button[aria-label="Close"]',
        ".artdeco-modal__dismiss",
        ".jobs-applied-modal__dismiss-btn",
      ];

      for (const selector of closeButtons) {
        const button = document.querySelector(selector);
        if (button && this.isElementVisible(button)) {
          button.click();
          await this.sleep(1000);
        }
      }
    } catch (error) {
      console.error("Error handling error state:", error);
    }
  }

  async saveAppliedJob(jobDetails) {
    try {
      const success = await this.appTracker.saveAppliedJob({
        jobId: jobDetails.jobId,
        title: jobDetails.title,
        company: jobDetails.company,
        location: jobDetails.location,
        jobUrl: window.location.href,
        salary: jobDetails.salary || "Not specified",
        workplace: jobDetails.workplace,
        postedDate: jobDetails.postedDate,
        applicants: jobDetails.applications,
        platform: this.platform,
        description: this.currentJobDescription,
        userId: this.getUserId(),
      });

      // Notify frontend about successful application (single-tab - don't close tab)
      if (success) {
        chrome.runtime
          .sendMessage({
            type: "NOTIFY_JOB_APPLIED",
            jobData: {
              jobId: jobDetails.jobId,
              title: jobDetails.title,
              company: jobDetails.company,
              platform: "linkedin",
            },
            sessionId: this.sessionId,
          })
          .catch(() => {});
      }

      return success;
    } catch (error) {
      return false;
    }
  }

  onDOMChange() {
    if (this.automationStarted && this.isRunning && !this.isPaused) {
    }
  }

  onNavigation(oldUrl, newUrl) {
    if (
      !newUrl.includes("linkedin.com/jobs") &&
      this.automationStarted &&
      this.isRunning
    ) {
      setTimeout(() => {
        if (this.isRunning) {
          this.navigateToLinkedInJobs();
        }
      }, 3000);
    }
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
    this.hasStarted = false;
    this.automationStarted = false;

    // Show automation stopped message and destroy overlay
    if (true) {
      // Global overlay
      notifyStatus({ type: "AUTOMATION_STOPPED" });
      await this.delay(4000);
    }
  }

  cleanup() {
    // Clear timers (from BasePlatformAutomation)
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

    // Destroy the status overlay
    if (true) {
      // Global overlay
      // Global overlay - cleanup handled automatically
      // Global overlay - no local instance needed
    }

    this.processedJobs.clear();
    console.log("🧹 LinkedIn platform cleanup completed");
  }

  // ============ Port Connection Methods (from BasePlatformAutomation) ============

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

  isApplicationPage(url) {
    return url.includes("/jobs/view/") || url.includes("/apply");
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

    this.stateVerificationInterval = setInterval(() => {
      if (this.applicationState.isApplicationInProgress && this.port) {
        try {
          console.log("Verifying application status with background script");
          this.safeSendPortMessage({ type: "CHECK_APPLICATION_STATUS" });
        } catch (e) {
          console.log("Error in periodic state verification:", e);
        }
      }
    }, 30000);
  }

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

  safeSendPortMessage(message) {
    try {
      // Critical messages that need to reach the message router
      // Use chrome.runtime.sendMessage for reliability (like other platforms)
      const criticalTypes = [
        "SEARCH_COMPLETED",
        "START_APPLICATION",
        "JOB_SUCCESS",
        "JOB_FAILURE",
        "APPLICATION_COMPLETED",
        "AUTOMATION_STOPPED",
      ];

      if (criticalTypes.includes(message.type)) {
        console.log(
          `📤 Sending critical message via chrome.runtime.sendMessage: ${message.type}`
        );
        chrome.runtime.sendMessage(message).catch((err) => {
          console.warn(
            `⚠️ chrome.runtime.sendMessage failed for ${message.type}:`,
            err.message
          );
        });
      }

      // Also send via port if available (for backward compatibility)
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
      console.log("📨 Received port message:", message);

      const { type, data } = message || {};
      if (!type) {
        console.log("⚠️ Received message without type, ignoring");
        return;
      }

      switch (type) {
        case "CONNECTION_ESTABLISHED":
          console.log("📡 Connection established with background script");
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
          this.handlePlatformSpecificMessage(type, data);
      }
    } catch (error) {
      console.log("❌ Error handling port message:", error);
    }
  }

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
      setTimeout(() => this.searchNext(), 1000);
    }
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

    setTimeout(() => {
      if (!this.isPaused) {
        this.searchNext();
      }
    }, 3000);
  }

  handlePlatformSpecificMessage(type, data) {
    console.log(`❓ Unhandled message type: ${type}`);
  }

  // ============ Automation Control Methods (from BasePlatformAutomation) ============

  async pauseAutomation() {
    this.isRunning = false;
    this.isPaused = true;

    if (this.sendCvPageNotRespondTimeout) {
      clearTimeout(this.sendCvPageNotRespondTimeout);
      this.sendCvPageNotRespondTimeout = null;
    }

    this.safeSendPortMessage({
      type: "AUTOMATION_PAUSED",
      sessionId: this.sessionId,
    });
  }

  async resumeAutomation() {
    this.isRunning = true;
    this.isPaused = false;

    console.log("▶️ Automation resumed by user");

    this.safeSendPortMessage({
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

    this.safeSendPortMessage({
      type: "AUTOMATION_STOPPED",
      reason: "user_requested",
      sessionId: this.sessionId,
    });
  }

  // ============ Search Methods (from BasePlatformAutomation) ============

  async searchNext() {
    try {
      if (this.isPaused) {
        console.log("Automation is paused, not searching");
        return;
      }

      console.log("Executing searchNext");

      if (this.applicationState.isApplicationInProgress) {
        console.log("Application in progress, not searching for next link");
        this.safeSendPortMessage({ type: "CHECK_APPLICATION_STATUS" });
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
    this.applicationState.applicationUrl = url;

    if (!this.applicationState.processedUrls) {
      this.applicationState.processedUrls = new Set();
    }
    this.applicationState.processedUrls.add(url);

    this.setStuckDetectionTimeout();

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
      this.safeSendPortMessage({ type: "SEARCH_COMPLETED" });
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

  // ============ Link/URL Utility Methods (from BasePlatformAutomation) ============

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

  // ============ Utility Methods (from BasePlatform) ============

  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
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

  updateProgress(updates) {
    this.progress = { ...this.progress, ...updates };

    if (this.onProgress) {
      this.onProgress(this.progress);
    }

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

    this.notifyContentScript("error", errorInfo);
  }

  reportComplete() {
    this.isRunning = false;
    if (this.onComplete) {
      this.onComplete();
    }

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


  async handleGenericError(error, context = {}) {
    console.error("❌ Generic error:", error);
  }

  extractJobId(url) {
    try {
      if (!url) return null;

      // Try /jobs/view/123 pattern first
      const viewMatch = url.match(/linkedin\.com\/jobs\/view\/(\d+)/);
      if (viewMatch && viewMatch[1]) {
        return viewMatch[1];
      }

      // Try currentJobId query parameter (search results page)
      const urlObj = new URL(url);
      const currentJobId = urlObj.searchParams.get("currentJobId");
      if (currentJobId) {
        return currentJobId;
      }

      return null;
    } catch (error) {
      console.error("Error extracting job ID:", error);
      return null;
    }
  }
}

if (typeof Element !== "undefined" && !Element.prototype.isVisible) {
  Element.prototype.isVisible = function () {
    return (
      window.getComputedStyle(this).display !== "none" &&
      window.getComputedStyle(this).visibility !== "hidden" &&
      this.offsetParent !== null
    );
  };
}
