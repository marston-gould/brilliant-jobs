// platforms/dice/dice.js
// Refactored to standalone class following Workable pattern
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";
import { DiceFileHandler } from "./dice-file-handler.js";
import { AI_BASE_URL } from "../../services/constants.js";
import Utils from "../../utils/utils.js";

export default class DicePlatform {
  constructor(config) {
    this.config = config || {};
    this.platform = "dice";
    this.baseUrl = "https://www.dice.com";

    // Session context
    this.sessionContext = config?.sessionContext || null;
    this.sessionId = config?.sessionId || null;
    this.userId = config?.userId || null;
    this.userProfile = config?.userProfile || null;

    // Running state
    this.isRunning = false;
    this.isPaused = false;

    // API hosts and services
    this.aiApiHost = config?.aiApiHost || null;
    this.backendApiHost = config?.backendApiHost || null;
    this.aiService = null;

    // Handlers
    this.fileHandler = null;
    // Global overlay - no local instance needed

    // Co-pilot state
    this.copilotState = new CoPilotState();

    // Job data cache
    this.cachedJobDescription = null;
    this.currentJobUrl = null;
    this.currentJobTitle = "";
    this.reason = "";

    // User action promise for co-pilot mode
    this.userActionPromise = null;
    this.userActionResolver = null;

    // Guard to prevent multiple concurrent job openings
    this.isOpeningJob = false;
    this.lastSkipTime = 0;

    // Dice-specific selectors
    this.selectors = {
      resultsCount: "p.pb-3.pl-6.pt-6.text-sm",
      jobResultsContainer: "div[role='list'][aria-label='Job search results']",
      jobCards: "div[data-testid='job-card']",
      jobTitle: "a[data-testid='job-search-job-detail-link']",
      companyName: "a[href*='/company-profile'] p",
      location: "p.text-sm.font-normal.text-zinc-600",
      easyApplyButton: "a[class*='bg-interaction']",
      easyApplyIndicator: ".box p",
      pagination: {
        container: 'nav[role="navigation"][aria-label="Pagination"]',
        nextButton:
          'span[aria-label="Next"]:not([data-disabled="true"]):not([aria-disabled="true"])',
        pageInfo: 'section[aria-label*="Page"][aria-label*="of"]',
      },
    };
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  async initialize() {
    console.log("🚀 Initializing Dice platform automation");

    // Apply session context preferences (including co-pilot mode)
    if (this.sessionContext) {
      await this.setSessionContext(this.sessionContext);
    }

    // Set up message listeners for control actions
    this.setupMessageListeners();

    console.log("✅ Dice platform initialized");
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
        console.log("🎮 Received CONTROL_ACTION message:", message.action);
        this.handleCoPilotAction({ action: message.action });
      } else if (message.type === "SEARCH_NEXT") {
        console.log("🔄 Received SEARCH_NEXT:", message.data);
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
        console.log("Application starting...");
        break;

      case "ALREADY_APPLIED":
        this.handleAlreadyApplied(data);
        break;

      case "DUPLICATE":
        this.handleDuplicate(data);
        break;

      case "LIMIT_REACHED":
        this.handleLimitReached(data);
        break;

      case "COMPANY_BLACKLISTED":
        this.handleCompanyBlacklisted(data);
        break;

      case "PROFILE_DATA":
        if (data) {
          this.userProfile = data;
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
    console.log("🔄 Received SEARCH_NEXT:", data);

    // Reset the job opening guard since we're ready for the next job
    this.isOpeningJob = false;

    if (data.reason === "Already applied") {
      this.handleAlreadyApplied(data);
    } else if (data.reason === "Company blacklisted") {
      this.handleCompanyBlacklisted(data);
    } else if (data.reason === "Limit reached") {
      this.handleLimitReached(data);
      return;
    }
    setTimeout(() => this.findAndOpenNextJob(), 500);
  }

  handleAlreadyApplied(data) {
    notifyStatus({
      type: "ALREADY_APPLIED",
      data: { title: data.title || "Job" },
    });

    if (data.url) {
      this.markLinkByUrl(data.url, "orange", "Already Applied");
    }
  }

  handleDuplicate(data) {
    notifyStatus({ type: "DUPLICATE_APPLICATION" });

    if (data && data.url) {
      this.markLinkByUrl(data.url, "orange", "Duplicate");
    }
  }

  handleLimitReached(data) {
    console.log("🛑 handleLimitReached called", {
      data,
      overlayReady: !!window.StatusOverlay?.isReady?.(),
    });
    notifyStatus({ type: "LIMIT_EXCEEDED", data });
    this.isRunning = false;
  }

  handleCompanyBlacklisted(data) {
    notifyStatus({
      type: "COMPANY_BLACKLISTED",
      data: {
        title: data?.title || "Job",
        company: data?.company || "this company",
      },
    });

    if (data?.url) {
      this.markLinkByUrl(data.url, "red", "Blacklisted Company");
    }
  }

  // ========================================
  // SESSION CONTEXT
  // ========================================

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

      // Update API hosts
      if (sessionContext.aiApiHost) {
        this.aiApiHost = sessionContext.aiApiHost;
      }
      if (sessionContext.backendApiHost) {
        this.backendApiHost = sessionContext.backendApiHost;
      }

      // Initialize file handler with configuration
      if (!this.fileHandler) {
        this.fileHandler = new DiceFileHandler({
          preferences: sessionContext.preferences || {},
          backendApiHost: this.backendApiHost,
          aiApiHost: this.aiApiHost,
          jwtToken: sessionContext.jwtToken || null,
        });
      } else {
        // Update existing file handler configuration
        this.fileHandler.preferences = sessionContext.preferences || {};
        this.fileHandler.backendApiHost = this.backendApiHost;
        this.fileHandler.aiApiHost = this.aiApiHost;
        this.fileHandler.jwtToken = sessionContext.jwtToken || null;
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
      console.error("❌ Error setting Dice session context:", error);
    }
  }

  // ========================================
  // START AUTOMATION
  // ========================================

  async start(params = {}) {
    try {
      this.isRunning = true;
      this.config = { ...this.config, ...params };
      notifyStatus({ type: "AUTOMATION_STARTING" });

      // Ensure session context preferences are applied (fallback if initialize wasn't called)
      if (this.sessionContext) {
        await this.setSessionContext(this.sessionContext);
      }

      // Ensure correct mode buttons are shown after automation starts
      this.restoreModeButtons();

      await Utils.delay(1000);
      await this.detectPageTypeAndStart();
    } catch (error) {
      console.error("❌ Failed to start Dice automation:", error);
      notifyStatus({ type: "APPLICATION_ERROR" });
    }
  }

  /**
   * Detects if the user is not logged in by checking for the Login/Register button in the header
   * @returns {boolean} - True if login is required (user not logged in), false otherwise
   */
  detectLoginRequired() {
    try {
      console.log("🔐 Checking login status...");

      // Method 1: Direct check for Login/Register button by aria-label
      const loginButton = document.querySelector(
        'button[aria-label="Login/Register"]'
      );
      console.log("loginButton", loginButton);
      if (loginButton) {
        console.log("🔐 Found Login/Register button - user not logged in");
        return true;
      }

      // Method 2: Check for login link in dropdown menu
      const loginLink = document.querySelector(
        'a[href="https://www.dice.com/dashboard/login"]'
      );
      if (loginLink) {
        console.log("🔐 Found login link - user not logged in");
        return true;
      }

      // Method 3: Check for register link
      const registerLink = document.querySelector(
        'a[href="https://www.dice.com/register"]'
      );
      if (registerLink) {
        console.log("🔐 Found register link - user not logged in");
        return true;
      }

      // Method 4: Check dropdown-button with Login/Register text
      const dropdownButtons = document.querySelectorAll(".dropdown-button");
      for (const button of dropdownButtons) {
        const buttonText = button.textContent?.trim() || "";
        if (buttonText === "Login/Register") {
          console.log(
            "🔐 Found dropdown button with Login/Register text - user not logged in"
          );
          return true;
        }
      }

      console.log(
        "🔐 No login indicators found - user appears to be logged in"
      );
      return false;
    } catch (error) {
      console.error("❌ Error detecting login status:", error);
      return false;
    }
  }

  async detectPageTypeAndStart() {
    const url = window.location.href;

    // Wait a bit more for page to fully load, then check login status
    await Utils.delay(1500);

    // Check if user is logged in before proceeding
    if (this.detectLoginRequired()) {
      console.log("🔐 User not logged in - showing login required message");
      notifyStatus({ type: "LOGIN_REQUIRED" });
      this.isRunning = false;
      return;
    }

    if (url.includes("google.com/search")) {
      await this.startGoogleSearchProcess();
    } else if (this.isApplicationPage(url)) {
      await this.handleDiceApplicationPage();
    } else if (this.isJobDetailPage(url)) {
      await this.handleJobDetailPage();
    } else if (this.isSearchPage(url)) {
      await this.startJobSearchProcess();
    } else if (this.isSuccessPage(url)) {
      await this.handleApplicationSuccessPage();
    } else {
      console.log("📝 Unknown page type detected:", url);
      // this.sendMessage({
      //   type: "APPLICATION_SKIPPED",
      //   data: { url, reason: "Unknown page type" },
      // });
    }
  }

  async startGoogleSearchProcess() {
    notifyStatus({
      type: "JOB_SEARCH_STARTED",
      data: { preferences: this.config?.config?.preferences || {} },
    });
    this.sendMessage({ type: "GET_SEARCH_TASK" });
    await Utils.delay(2000);
    this.findAndOpenNextJob();
  }

  async startJobSearchProcess() {
    try {
      notifyStatus({
        type: "JOB_SEARCH_STARTED",
        data: { preferences: this.config?.config?.preferences || {} },
      });

      let resultsElement = document.querySelector(this.selectors.resultsCount);
      if (!resultsElement) {
        const allParagraphs = document.querySelectorAll("p");
        resultsElement = Array.from(allParagraphs).find(
          (p) => p.textContent && p.textContent.includes("results")
        );
      }

      if (!resultsElement) {
        notifyStatus({ type: "NO_JOBS_FOUND" });
        return;
      }

      const resultsText = resultsElement.textContent;
      const noResultsPatterns = [
        /^0 results/i,
        /no results found/i,
        /no jobs found/i,
        /0 job[s]?\s/i,
      ];

      const hasNoResults = noResultsPatterns.some((pattern) =>
        pattern.test(resultsText)
      );

      if (hasNoResults) {
        notifyStatus({
          type: "NO_JOBS_FOUND",
          data: { message: "Applied to all available jobs" },
        });
        return;
      }

      await Utils.delay(2000);
      this.findAndOpenNextJob();
    } catch (error) {
      console.error("❌ Error in startJobSearchProcess:", error);
      notifyStatus({ type: "APPLICATION_ERROR" });
    }
  }

  // ========================================
  // JOB SEARCH AND OPENING
  // ========================================

  findAndOpenNextJob() {
    if (!this.isRunning || this.isPaused) return;

    // Prevent multiple concurrent job openings
    if (this.isOpeningJob) {
      console.log("⏳ Already opening a job, skipping duplicate call...");
      return;
    }

    const jobCards = this.findAllJobCards();

    if (jobCards.length === 0) {
      this.handleNoJobsFound();
      return;
    }

    for (const card of jobCards) {
      // Skip already processed cards
      if (card.classList.contains("fastapply-processed")) {
        continue;
      }

      // Skip if already applied
      if (this.isJobAlreadyApplied(card)) {
        card.classList.add("fastapply-processed");
        this.markJobCard(card, "skipped");
        continue;
      }

      // Skip if no Easy Apply
      if (!this.hasEasyApply(card)) {
        card.classList.add("fastapply-processed");
        continue;
      }

      // Found a valid job - process it
      this.openJob(card);
      return;
    }

    // No more jobs on this page
    this.handleNoJobsFound();
  }

  findAllJobCards() {
    return Array.from(
      document.querySelectorAll(this.selectors.jobCards)
    ).filter((card) => this.isElementVisible(card));
  }

  async openJob(jobCard) {
    // Set the guard flag to prevent duplicate openings
    this.isOpeningJob = true;

    jobCard.classList.add("fastapply-processed");

    // Extract job information
    const jobInfo = await this.extractJobInfo(jobCard);
    const jobLink = jobCard.querySelector(this.selectors.jobTitle);
    const url = jobLink?.href || "";

    // Check job match preferences if enabled
    if (
      this.config?.config?.preferences?.applyOnlyMatching ||
      this.config?.config?.preferences?.applyOnlyQualified
    ) {
      const matches = await this.doesJobMatchPreferences(jobInfo);
      if (!matches) {
        notifyStatus({
          type: "DOES_NOT_MATCH_PREFERENCES",
          data: { reason: this.reason, title: jobInfo.title },
        });
        this.markJobCard(jobCard, "skipped");
        await Utils.delay(2000);
        this.findAndOpenNextJob();
        return;
      }
    }

    this.markJobCard(jobCard, "processing");
    notifyStatus({
      type: "APPLYING_TO_JOB",
      data: { title: jobInfo.title },
    });

    // Save job data to storage for the application page
    await this.saveJobToStorage(jobInfo);

    // Send START_APPLICATION to background - this will open a new tab
    this.sendMessage({
      type: "START_APPLICATION",
      data: {
        url: url,
        jobId: this.extractDiceJobId(url),
        company: jobInfo.company,
        title: jobInfo.title,
        requestId: `req_${Date.now()}`,
      },
    });
  }

  extractDiceJobId(url) {
    const match = url.match(/\/job-detail\/([^\/\?]+)/);
    return match ? match[1] : null;
  }

  hasEasyApply(jobCard) {
    const easyApplyIndicator = jobCard.querySelector(".box p");
    if (
      easyApplyIndicator &&
      easyApplyIndicator.textContent?.toLowerCase().includes("easy apply")
    ) {
      return true;
    }

    const easyApplyButton = jobCard.querySelector('a[class*="bg-interaction"]');
    if (
      easyApplyButton &&
      easyApplyButton.textContent?.toLowerCase().includes("easy apply")
    ) {
      return true;
    }

    const spans = jobCard.querySelectorAll("span");
    for (const span of spans) {
      if (span.textContent?.toLowerCase().includes("easy apply")) {
        return true;
      }
    }

    return false;
  }

  isJobAlreadyApplied(jobCard) {
    try {
      const appliedButton = jobCard.querySelector('a[class*="bg-interaction"]');
      if (appliedButton) {
        const buttonText = appliedButton.textContent?.toLowerCase() || "";
        if (buttonText.includes("applied")) {
          return true;
        }
      }

      const appliedElements = jobCard.querySelectorAll("a, button, span");
      for (const element of appliedElements) {
        const text = element.textContent?.toLowerCase() || "";
        if (text.includes("applied") && element.querySelector("svg")) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  async handleNoJobsFound() {
    // Check if there's a next page
    const nextBtn = document.querySelector(
      this.selectors.pagination.nextButton
    );

    if (nextBtn && !this.isPaused) {
      notifyStatus({
        type: "NAVIGATING_PAGE",
        data: { message: "Moving to next page..." },
      });
      nextBtn.click();
      await Utils.delay(3000);
      if (!this.isPaused) this.findAndOpenNextJob();
    } else {
      notifyStatus({ type: "SEARCH_COMPLETED" });
      this.sendMessage({ type: "SEARCH_COMPLETED" });
    }
  }

  // ========================================
  // JOB DETAIL PAGE HANDLING
  // ========================================

  async handleJobDetailPage() {
    try {
      console.log("📋 Handling job detail page");
      await Utils.delay(3000);

      // Extract job title from the detail page
      const jobTitle = this.extractJobTitleFromDetailPage();
      if (jobTitle) {
        this.currentJobTitle = jobTitle;
        await this.updateStoredJobTitle(jobTitle);
        console.log("📋 Extracted job title:", jobTitle);
      }

      // Extract full job description from the job detail page
      const fullDescription = this.extractFullJobDescription();
      if (fullDescription) {
        console.log("📋 Extracted full job description, length:", fullDescription.length);
        await this.updateStoredJobDescription(fullDescription);
      }

      const easyApplyButton = await this.waitForEasyApplyButton();
      if (!easyApplyButton) {
        this.handleJobSkipped("No Easy Apply button available");
        return;
      }

      easyApplyButton.click();
      await Utils.delay(3000);

      // Check if URL changed to application page (SPA navigation without refresh)
      const currentUrl = window.location.href;
      if (this.isApplicationPage(currentUrl)) {
        console.log("📝 URL changed to application page (SPA navigation)");
        await this.handleDiceApplicationPage();
        return;
      }

      // If URL didn't change immediately, monitor for changes
      this.monitorApplicationProgress();
    } catch (error) {
      console.error("❌ Error handling job detail page:", error);
      this.handleJobSkipped("Error processing job detail page");
    }
  }

  /**
   * Extract full job description from the job detail page
   */
  extractFullJobDescription() {
    try {
      // Primary selector: CSS module class containing "jobDescription"
      const jobDescModule = document.querySelector(
        'div[class*="jobDescription"]'
      );
      if (jobDescModule) {
        return jobDescModule.textContent?.trim() || "";
      }

      // Alternative: div with id="jobDescription" or data-testid
      const jobDescById = document.querySelector(
        '#jobDescription, [data-testid="jobDescription"]'
      );
      if (jobDescById) {
        const descriptionHtml = jobDescById.querySelector(
          '[data-testid="jobDescriptionHtml"]'
        );
        if (descriptionHtml) {
          return descriptionHtml.textContent?.trim() || "";
        }
        return jobDescById.textContent?.trim() || "";
      }

      // Fallback: find the "Summary" heading and get description content after it
      const headings = document.querySelectorAll("h3");
      for (const heading of headings) {
        if (heading.textContent?.trim() === "Summary") {
          const descContainer = heading.nextElementSibling;
          if (descContainer) {
            return descContainer.textContent?.trim() || "";
          }
        }
      }

      // Last resort: .job-description class
      const altContainer = document.querySelector(".job-description");
      if (altContainer) {
        return altContainer.textContent?.trim() || "";
      }

      return null;
    } catch (error) {
      console.error("❌ Error extracting full job description:", error);
      return null;
    }
  }

  /**
   * Update stored job data with full description
   */
  async updateStoredJobDescription(description) {
    try {
      const storedData = await this.getStoredJobData();
      if (storedData) {
        storedData.description = description;
        await chrome.storage.local.set({
          currentJobData: storedData,
        });
        console.log("✅ Updated stored job with full description");
      }
    } catch (error) {
      console.error("❌ Error updating stored job description:", error);
    }
  }

  /**
   * Extract job title from the job detail page
   */
  extractJobTitleFromDetailPage() {
    try {
      // Primary: h1 inside the job detail header card
      const headerCard = document.querySelector(
        '[data-testid="job-detail-header-card"]'
      );
      if (headerCard) {
        const h1 = headerCard.querySelector("h1");
        if (h1?.textContent?.trim()) {
          return h1.textContent.trim();
        }
      }

      // Fallback: any h1 on the page
      const h1 = document.querySelector("h1");
      if (h1?.textContent?.trim()) {
        return h1.textContent.trim();
      }

      return null;
    } catch (error) {
      console.error("❌ Error extracting job title:", error);
      return null;
    }
  }

  /**
   * Update stored job data with title
   */
  async updateStoredJobTitle(title) {
    try {
      const storedData = await this.getStoredJobData();
      if (storedData) {
        storedData.title = title;
        await chrome.storage.local.set({
          currentJobData: storedData,
        });
        console.log("✅ Updated stored job with title");
      }
    } catch (error) {
      console.error("❌ Error updating stored job title:", error);
    }
  }

  async waitForEasyApplyButton() {
    return new Promise((resolve) => {
      const checkForButton = () => {
        // Check for the Easy Apply link button with data-testid="apply-button"
        const applyLink = document.querySelector(
          'a[data-testid="apply-button"]'
        );
        if (
          applyLink &&
          applyLink.textContent?.toLowerCase().includes("easy apply") &&
          this.isElementVisible(applyLink)
        ) {
          resolve(applyLink);
          return true;
        }

        // Check for Easy Apply link with specific class
        const applyButtonByClass = document.querySelector(
          'a[class*="apply-button_applyButton"]'
        );
        if (
          applyButtonByClass &&
          applyButtonByClass.textContent
            ?.toLowerCase()
            .includes("easy apply") &&
          this.isElementVisible(applyButtonByClass)
        ) {
          resolve(applyButtonByClass);
          return true;
        }

        // Fallback: Check for shadow DOM button (legacy)
        const applyButtonWc = document.querySelector("apply-button-wc");
        if (applyButtonWc && applyButtonWc.shadowRoot) {
          const shadowButton = applyButtonWc.shadowRoot.querySelector(
            "button.btn.btn-primary"
          );
          if (shadowButton && this.isElementVisible(shadowButton)) {
            resolve(shadowButton);
            return true;
          }
        }

        // Fallback: Check for regular button with "easy apply" text
        const regularButton = document.querySelector("button.btn.btn-primary");
        if (
          regularButton &&
          regularButton.textContent?.toLowerCase().includes("easy apply")
        ) {
          resolve(regularButton);
          return true;
        }

        // NEW: Check for regular "Apply" button (for non-logged-in users)
        // This button redirects to login but we can still click it
        if (
          applyLink &&
          applyLink.textContent?.toLowerCase().trim() === "apply" &&
          this.isElementVisible(applyLink)
        ) {
          console.log("📋 Found regular Apply button (may redirect to login)");
          resolve(applyLink);
          return true;
        }

        // Check for "Apply Now" button (button element with data-testid="apply-button")
        const applyNowButton = document.querySelector(
          'button[data-testid="apply-button"]'
        );
        if (
          applyNowButton &&
          applyNowButton.textContent?.toLowerCase().includes("apply") &&
          this.isElementVisible(applyNowButton)
        ) {
          console.log("📋 Found Apply Now button");
          resolve(applyNowButton);
          return true;
        }

        // Also check inside #applyButton container
        const applyButtonContainer = document.querySelector("#applyButton");
        if (applyButtonContainer) {
          const applyLinkInContainer = applyButtonContainer.querySelector(
            'a[data-testid="apply-button"]'
          );
          if (
            applyLinkInContainer &&
            this.isElementVisible(applyLinkInContainer)
          ) {
            console.log("📋 Found Apply button in #applyButton container");
            resolve(applyLinkInContainer);
            return true;
          }

          // Also check for button element in container
          const applyButtonInContainer = applyButtonContainer.querySelector(
            'button[data-testid="apply-button"]'
          );
          if (
            applyButtonInContainer &&
            this.isElementVisible(applyButtonInContainer)
          ) {
            console.log("📋 Found Apply Now button in #applyButton container");
            resolve(applyButtonInContainer);
            return true;
          }
        }

        return false;
      };

      if (checkForButton()) return;

      const observer = new MutationObserver(() => {
        if (checkForButton()) {
          observer.disconnect();
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, 10000);
    });
  }

  monitorApplicationProgress() {
    let checkCount = 0;
    const maxChecks = 60;

    const checkProgress = async () => {
      checkCount++;
      const currentUrl = window.location.href;

      // Check for application page (SPA navigation)
      if (this.isApplicationPage(currentUrl)) {
        console.log("📝 Application page detected (SPA navigation)");
        await this.handleDiceApplicationPage();
        return;
      }

      if (this.isApplicationSuccess()) {
        this.handleApplicationSuccessPage();
        return;
      }

      if (checkCount < maxChecks) {
        setTimeout(checkProgress, 500);
      } else {
        this.handleJobSkipped("Application monitoring timeout");
      }
    };

    setTimeout(checkProgress, 1000);
  }

  // ========================================
  // DICE APPLICATION FORM HANDLING
  // ========================================

  async handleDiceApplicationPage() {
    try {
      console.log("📝 Handling Dice application form");

      // Ensure currentJobTitle is set from stored data if not already set
      if (!this.currentJobTitle) {
        const storedData = await this.getStoredJobData();
        if (storedData?.title) {
          this.currentJobTitle = storedData.title;
        }
      }

      await this.processApplicationForm();
    } catch (error) {
      console.error("❌ Error handling Dice application page:", error);
      this.handleJobSkipped("Error processing application page");
    }
  }

  async processApplicationForm() {
    console.log("📝 Dice application form page detected");
    try {
      // Process form steps - page doesn't refresh, so we monitor DOM changes
      await this.processCurrentStep();
    } catch (error) {
      throw error;
    }
  }

  async processCurrentStep() {
    let attempts = 0;
    const maxAttempts = 30;
    let filesUploaded = false;
    let formFilled = false;

    while (attempts < maxAttempts) {
      attempts++;
      await Utils.delay(1500);

      // Check if we've reached the success page
      if (this.isSuccessPage(window.location.href)) {
        console.log("✅ Success page detected");
        await this.handleApplicationSuccessPage();
        return "submitted";
      }

      // Check what buttons are present in real-time
      const hasSubmitButton = this.hasSubmitButton();
      const hasNextButton = this.hasNextButton();

      console.log(
        `📋 Step ${attempts} - Submit: ${hasSubmitButton}, Next: ${hasNextButton}`
      );

      // If we see Submit button (and no Next button), we're on the preview/final step - just submit
      if (hasSubmitButton && !hasNextButton) {
        console.log("📋 Submit button detected - submitting application");
        const result = await this.handleSubmitStep();
        if (result === "submitted" || result === "skipped") {
          return result;
        }
        continue;
      }

      // If we see Next button, we're on a form step
      if (hasNextButton) {
        // Check what needs to be filled on this step
        const hasResumeSection = this.hasResumeOrCoverLetterSection();
        const hasInputFields = this.hasFormInputFields();

        console.log(
          `📋 Form step - Resume section: ${hasResumeSection}, Input fields: ${hasInputFields}, Files uploaded: ${filesUploaded}`
        );

        if (hasResumeSection && !filesUploaded) {
          const preferences = this.sessionContext?.preferences || {};
          if (preferences.useCustomResume === true) {
            notifyStatus({ type: "TAILORING_RESUME" });
          } else {
            notifyStatus({ type: "UPLOADING_FILES" });
          }
          await this.handleResumeAndCoverLetterStep();
          filesUploaded = true;
          await Utils.delay(1000);
        }

        // Handle input fields if present (only once per step)
        if (hasInputFields && !formFilled) {
          notifyStatus({ type: "FILLING_FORM" });
          await this.fillFormFieldsWithAI();
          formFilled = true;
        }

        // Click Next button to proceed to next step
        const nextResult = await this.clickNextButton();
        if (nextResult === "skipped") {
          return "skipped";
        }

        // Reset formFilled for next step (but not filesUploaded - only upload once)
        formFilled = false;

        // Wait for DOM to update after clicking Next
        await this.waitForStepChange(hasSubmitButton, hasNextButton);
        continue;
      }

      // Neither Submit nor Next button found - wait and retry
      console.log("⚠️ No actionable button found, waiting...");
    }

    console.log("⚠️ Max attempts reached");
    return "error";
  }

  async waitForStepChange(previousHasSubmit, previousHasNext) {
    // Wait for the DOM to update after clicking Next
    let waitAttempts = 0;
    const maxWaitAttempts = 15;

    while (waitAttempts < maxWaitAttempts) {
      await Utils.delay(500);
      waitAttempts++;

      const currentHasSubmit = this.hasSubmitButton();
      const currentHasNext = this.hasNextButton();

      // Check if we transitioned to Submit-only state (final step)
      if (currentHasSubmit && !currentHasNext) {
        return;
      }

      // Check if button states changed in any way
      if (
        currentHasSubmit !== previousHasSubmit ||
        currentHasNext !== previousHasNext
      ) {
        return;
      }

      // Also check for loading state ending
      const loadingIndicator = document.querySelector(
        '[class*="loading"], [class*="spinner"]'
      );
      if (loadingIndicator) {
        continue;
      }
    }
  }

  hasFormContentChanged() {
    // Simple check - look for loading indicators or form changes
    const loadingIndicator = document.querySelector(
      '[class*="loading"], [class*="spinner"]'
    );
    return !loadingIndicator;
  }

  hasResumeOrCoverLetterSection() {
    // Check for resume heading
    const headings = document.querySelectorAll("h2, h3");
    for (const heading of headings) {
      const text = heading.textContent?.toLowerCase() || "";
      if (text.includes("resume") || text.includes("cover letter")) {
        return true;
      }
    }

    // Check for resume container or cover letter upload button
    const resumeIndicator = document.querySelector(
      'div[class*="text-cyan-700"], button[class*="border-dashed"]'
    );
    return !!resumeIndicator;
  }

  hasFormInputFields() {
    // Check for textareas, text inputs, radio buttons, checkboxes, selects
    const inputs = document.querySelectorAll(
      'textarea, input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="radio"], input[type="checkbox"], select'
    );

    // Filter out hidden file inputs
    const visibleInputs = Array.from(inputs).filter((input) => {
      if (input.type === "file") return false;
      if (input.classList.contains("sr-only")) return false;
      return this.isElementVisible(input);
    });

    return visibleInputs.length > 0;
  }

  hasSubmitButton() {
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      // Skip buttons inside the status overlay
      if (
        btn.closest(
          "#chatbot-status-overlay, .chatbot-overlay-container, .control-button-container"
        )
      ) {
        continue;
      }
      const text = (btn.textContent || btn.innerText || "")
        .toLowerCase()
        .trim();
      if (text.includes("submit")) {
        return true;
      }
    }
    return false;
  }

  hasNextButton() {
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      // Skip buttons inside the status overlay
      if (
        btn.closest(
          "#chatbot-status-overlay, .chatbot-overlay-container, .control-button-container"
        )
      ) {
        continue;
      }
      const text = (btn.textContent || btn.innerText || "")
        .toLowerCase()
        .trim();
      if (text.includes("next")) {
        return true;
      }
    }
    // Legacy selector
    return !!document.querySelector(".btn-next");
  }

  async handleSubmitStep() {
    const submitButton = this.findSubmitButton();
    if (!submitButton) {
      return "error";
    }

    // Co-pilot pause logic before final submit
    if (this.copilotState.isInCoPilotMode()) {
      notifyStatus({
        type: "COPILOT_SUBMIT_READY",
        data: {
          buttonText: submitButton.textContent?.trim(),
          jobTitle: this.currentJobTitle,
        },
      });

      const userAction = await this.waitForUserAction();

      if (userAction === "SKIP") {
        return "skipped";
      }
    }

    // Show submitting status before clicking submit
    notifyStatus({ type: "SUBMITTING_APPLICATION" });

    await Utils.delay(1000);
    submitButton.click();

    // Wait for success page in real-time (URL changes without redirect)
    const success = await this.waitForSuccessPage();
    if (success) {
      await this.handleApplicationSuccessPage();
    }
    return "submitted";
  }

  async waitForSuccessPage(timeout = 12000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check URL for success page
      if (this.isSuccessPage(window.location.href)) {
        console.log("✅ Success page URL detected");
        return true;
      }

      // Check DOM for success indicators
      if (this.isApplicationSuccess()) {
        console.log("✅ Success indicators detected in DOM");
        return true;
      }

      await Utils.delay(500);
    }

    console.log("⚠️ Timeout waiting for success page");
    return false;
  }

  findSubmitButton() {
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      const text = btn.textContent?.toLowerCase() || "";
      if (text.includes("submit")) {
        return btn;
      }
    }
    return null;
  }

  async clickNextButton() {
    // Find Next button
    let nextButton = null;

    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      const text = btn.textContent?.toLowerCase() || "";
      if (text.includes("next")) {
        nextButton = btn;
        break;
      }
    }

    // Legacy selector fallback
    if (!nextButton) {
      nextButton = document.querySelector(".btn-next");
    }

    if (!nextButton) {
      return "error";
    }

    // Co-pilot pause logic before clicking Next
    if (this.copilotState.isInCoPilotMode()) {
      notifyStatus({
        type: "COPILOT_WAITING_FOR_NEXT",
        data: {
          buttonText: nextButton.textContent?.trim(),
          title: this.currentJobTitle,
        },
      });

      const userAction = await this.waitForUserAction();

      if (userAction === "SKIP") {
        return "skipped";
      }

      notifyStatus({ type: "COPILOT_CONTINUING_TO_NEXT_STEP" });
    }

    await Utils.delay(1000);
    nextButton.click();
    return "continuing";
  }

  async handleResumeAndCoverLetterStep() {
    try {
      console.log("📄 Handling Resume & Cover Letter section");

      const userDetails = this.userProfile;
      const storedJobData = await this.getStoredJobData();
      const jobDescription = storedJobData?.description || "";

      // Find the resume and cover letter sections
      const resumeSection = this.findSectionByLabel("Resume");
      const coverLetterSection = this.findSectionByLabel("Cover letter");

      // Always upload a new resume (even if one exists from profile)
      if (resumeSection) {
        await this.handleResumeUpload(
          userDetails,
          jobDescription,
          resumeSection
        );
      }

      // Handle cover letter upload if enabled in preferences
      const preferences = this.sessionContext?.preferences || {};
      if (preferences.uploadCoverLetter !== false && coverLetterSection) {
        await this.handleCoverLetterUpload(
          coverLetterSection,
          userDetails,
          jobDescription
        );
      }

      await Utils.delay(1000);
    } catch (error) {
      console.error("❌ Error in Resume & Cover Letter step:", error);
    }
  }

  findSectionByLabel(labelText) {
    // Find section container by looking for the label text
    const allSpans = document.querySelectorAll("span");
    for (const span of allSpans) {
      const text = span.textContent?.trim().toLowerCase() || "";
      if (text.startsWith(labelText.toLowerCase())) {
        // Find the parent container (the rounded-lg border div)
        const container = span.closest(
          'div[class*="rounded-lg"][class*="border"], div[class*="shadow-sm"]'
        );
        if (container) {
          return container;
        }
      }
    }
    return null;
  }

  async handleResumeUpload(userDetails, jobDescription, section) {
    try {
      console.log("📄 Uploading resume...");

      if (!userDetails) {
        console.log("⚠️ No user details available for resume upload");
        return false;
      }

      if (!section) {
        console.log("⚠️ Resume section not found");
        return false;
      }

      // Check if there's a "Replace" button/option within this section
      const replaceClicked = await this.clickReplaceInSection(section);
      if (replaceClicked) {
        await Utils.delay(1000);
      }

      // Find file input for resume - look globally as it may be outside the section
      const fileInputs = document.querySelectorAll('input[type="file"]');
      let fileInput = null;

      for (const input of fileInputs) {
        const accept = input.getAttribute("accept") || "";
        if (accept.includes(".pdf") || accept.includes(".doc")) {
          fileInput = input;
          break;
        }
      }

      if (!fileInput) {
        console.log("⚠️ Resume file input not found");
        return false;
      }

      // Initialize file handler if needed
      if (!this.fileHandler) {
        this.fileHandler = new DiceFileHandler({
          preferences: this.sessionContext?.preferences || {},
          backendApiHost: this.getBackendApiHost(),
          aiApiHost: this.getAiApiHost(),
          jwtToken: this.sessionContext?.jwtToken || null,
        });
      }

      const storedJobData = await this.getStoredJobData();
      const jobId = storedJobData?.jobId;

      // Get resume URLs from user profile
      const resumeUrls =
        userDetails.resumes?.map((resume) => resume.fileUrl) || [];
      if (resumeUrls.length === 0) {
        console.log("⚠️ No resume URLs found in user profile");
        return false;
      }

      // Use file handler to upload the appropriate resume
      const success = await this.fileHandler.handleResumeUpload(
        fileInput,
        userDetails,
        jobDescription,
        resumeUrls,
        jobId,
        this.currentJobTitle || ""
      );

      if (success) {
        console.log("✅ Resume uploaded successfully");
        await Utils.delay(2000);
      }

      return success;
    } catch (error) {
      console.error("❌ Error uploading resume:", error);
      return false;
    }
  }

  async clickReplaceInSection(section) {
    try {
      if (!section) return false;

      // Look for "Replace" text within this specific section
      const elements = section.querySelectorAll("span, div");
      for (const element of elements) {
        const text = element.textContent?.trim().toLowerCase() || "";
        if (text === "replace") {
          // Find the clickable parent (button or clickable div)
          const clickableParent = element.closest(
            'button, [role="button"], [role="menuitem"], div[class*="cursor-pointer"], div[tabindex]'
          );
          if (clickableParent && section.contains(clickableParent)) {
            console.log("📄 Clicking Replace option in section");
            clickableParent.click();
            return true;
          }
          // If no clickable parent, try clicking the element itself
          element.click();
          return true;
        }
      }

      // Check for "File options" button (three dots menu) within this section
      const optionsButton = section.querySelector(
        'button[aria-label="File options"]'
      );
      if (optionsButton) {
        optionsButton.click();
        await Utils.delay(500);

        // Look for Replace in the dropdown menu (dropdown may be outside section)
        const menuItems = document.querySelectorAll(
          '[role="menuitem"], [role="option"]'
        );
        for (const item of menuItems) {
          const itemText = item.textContent?.toLowerCase() || "";
          if (itemText.includes("replace")) {
            item.click();
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.error("❌ Error clicking Replace option in section:", error);
      return false;
    }
  }

  async handleCoverLetterUpload(section, userDetails, jobDescription) {
    try {
      console.log("📄 Uploading cover letter...");

      if (!section) {
        console.log("⚠️ Cover letter section not found");
        return false;
      }

      // Check if there's a "Replace" option within this section (cover letter already exists)
      const replaceClicked = await this.clickReplaceInSection(section);
      if (replaceClicked) {
        await Utils.delay(1000);
      } else {
        // No replace button, check if there's an upload button to click
        const uploadButton = section.querySelector(
          'button[class*="border-dashed"]'
        );
        if (uploadButton) {
          uploadButton.click();
          await Utils.delay(500);
        }
      }

      // Find the file input - look globally as it may be outside the section
      const fileInputs = document.querySelectorAll('input[type="file"]');
      let fileInput = null;

      for (const input of fileInputs) {
        const accept = input.getAttribute("accept") || "";
        if (accept.includes(".pdf") || accept.includes(".doc")) {
          fileInput = input;
          break;
        }
      }

      if (!fileInput) {
        console.log("⚠️ Cover letter file input not found");
        return false;
      }

      if (!userDetails || !jobDescription) {
        console.log(
          "⚠️ Missing user details or job description for cover letter"
        );
        return false;
      }

      // Generate cover letter PDF
      const coverLetterBlob = await this.generateCoverLetterPDF(
        userDetails,
        jobDescription
      );

      if (!coverLetterBlob) {
        console.log("⚠️ Failed to generate cover letter");
        return false;
      }

      const fileName = `${userDetails.firstName || "User"}_${
        userDetails.lastName || "CoverLetter"
      }_Cover_Letter.pdf`;

      const file = new File([coverLetterBlob], fileName, {
        type: "application/pdf",
      });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));

      console.log("✅ Cover letter uploaded successfully");
      await Utils.delay(2000);
      return true;
    } catch (error) {
      console.error("❌ Error uploading cover letter:", error);
      return false;
    }
  }

  getCurrentStepNumber() {
    // Legacy method for old form structure
    const stepContainer = document.querySelector('main[class*="step"]');
    if (!stepContainer) return null;

    const stepClass = stepContainer.className;
    if (stepClass.includes("step-one")) return 1;
    if (stepClass.includes("step-two")) return 2;
    if (stepClass.includes("step-three")) return 3;
    if (stepClass.includes("step-four")) return 4;
    return null;
  }

  // ========================================
  // FILE UPLOADS (Legacy - kept for backward compatibility)
  // ========================================

  async handleFileUploads() {
    const userDetails = this.userProfile;
    const storedJobData = await this.getStoredJobData();
    const jobDescription = storedJobData?.description || "";
    const jobId = storedJobData?.jobId;

    if (!userDetails) {
      console.log("⚠️ No user details available, skipping uploads");
      return;
    }

    const form = document.querySelector("form, main");
    if (!form) {
      console.log("⚠️ No form found, skipping uploads");
      return;
    }

    await this.handleFileUploadsDirectly(
      form,
      userDetails,
      jobDescription,
      jobId
    );
    notifyStatus({ type: "FILES_UPLOADED" });
  }

  async handleFileUploadsDirectly(form, userDetails, jobDescription, jobId) {
    try {
      const resumeContainer = form.querySelector(".resume-container");
      const coverLetterContainer = form.querySelector(".cover-letter-wrapper");

      if (resumeContainer) {
        await this.uploadResumeViaModal(
          resumeContainer,
          userDetails,
          jobDescription,
          jobId
        );
      }

      if (coverLetterContainer && jobDescription) {
        await this.uploadCoverLetterViaModal(
          coverLetterContainer,
          userDetails,
          jobDescription
        );
      }

      await Utils.delay(3000);
      return true;
    } catch (error) {
      console.error("❌ Error in file uploads:", error);
      return false;
    }
  }

  getBackendApiHost() {
    return this.sessionContext?.backendApiHost;
  }

  getAiApiHost() {
    return this.sessionContext?.aiApiHost;
  }

  async uploadResumeViaModal(resumeContainer, userDetails, jobDescription) {
    try {
      if (!this.fileHandler) {
        this.fileHandler = new DiceFileHandler({
          preferences: this.sessionContext?.preferences || {},
          backendApiHost: this.getBackendApiHost(),
          aiApiHost: this.getAiApiHost(),
          jwtToken: this.sessionContext?.jwtToken || null,
        });
      }

      const uploadButton = resumeContainer.querySelector("button");
      if (!uploadButton) return false;

      uploadButton.click();
      await Utils.delay(3000);

      const modal = await this.waitForModal();
      if (!modal) return false;

      await Utils.delay(2500);

      const fileInput = modal.querySelector(
        '#fsp-fileUpload, input[type="file"]'
      );
      if (!fileInput) {
        await this.closeModal();
        return false;
      }

      const resumeUrls = userDetails.resumes.map((resume) => resume.fileUrl);
      if (!resumeUrls || resumeUrls.length === 0) {
        await this.closeModal();
        return false;
      }

      // Use handleResumeUpload which handles both custom and matched resumes
      const success = await this.fileHandler.handleResumeUpload(
        fileInput,
        userDetails,
        jobDescription,
        resumeUrls,
        this.currentJobTitle || ""
      );

      if (success) {
        const uploadBtn = await this.waitForUploadButton();
        if (uploadBtn) {
          uploadBtn.click();
          await Utils.delay(3000);
          await this.waitForModalToClose();
          await Utils.delay(2500);
          return true;
        }
      }

      await this.closeModal();
      return false;
    } catch (error) {
      console.error("❌ Error uploading resume:", error);
      await this.closeModal();
      return false;
    }
  }

  async uploadCoverLetterViaModal(
    coverLetterContainer,
    userDetails,
    jobDescription
  ) {
    try {
      const uploadButton = coverLetterContainer.querySelector("button");
      if (!uploadButton) return false;

      uploadButton.click();
      await Utils.delay(3000);

      const modal = await this.waitForModal();
      if (!modal) return false;

      const fileInput = modal.querySelector(
        '#fsp-fileUpload, input[type="file"]'
      );
      if (!fileInput) {
        await this.closeModal();
        return false;
      }

      const coverLetterBlob = await this.generateCoverLetterPDF(
        userDetails,
        jobDescription
      );
      if (!coverLetterBlob) return false;

      const fileName = `${userDetails.firstName || "User"}_${
        userDetails.lastName || "CoverLetter"
      }_Cover_Letter.pdf`;
      const file = new File([coverLetterBlob], fileName, {
        type: "application/pdf",
      });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));

      await Utils.delay(2000);
      const uploadBtn = document.querySelector('[data-e2e="upload"]');
      if (uploadBtn) {
        uploadBtn.click();
        return true;
      }
      return false;
    } catch (error) {
      console.error("❌ Error in cover letter upload:", error);
      return false;
    }
  }

  async generateCoverLetterPDF(userDetails, jobDescription) {
    try {
      const response = await fetch(
        "https://resumify.fastapply.co/api/generate-cover-letter-pdf",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: `${userDetails.firstName} ${userDetails.lastName}`,
            jobDescription: jobDescription,
            skills: userDetails.skills || [],
            education: userDetails.education || [],
            fullPositions: userDetails.fullPositions || [],
            tone: "Professional",
          }),
        }
      );

      if (!response.ok) return null;
      const blob = await response.blob();
      return blob.size > 0 ? blob : null;
    } catch (error) {
      return null;
    }
  }

  async waitForModal(timeout = 10000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkForModal = () => {
        const elapsed = Date.now() - startTime;
        const modal = document.querySelector(
          '.fsp-modal__body, .fsp-modal, [class*="modal"]'
        );
        if (
          modal &&
          (modal.querySelector(".fsp-drop-area, .fsp-content") ||
            modal.querySelector("#fsp-fileUpload"))
        ) {
          resolve(modal);
          return;
        }
        if (elapsed > timeout) {
          resolve(null);
          return;
        }
        setTimeout(checkForModal, 100);
      };
      checkForModal();
    });
  }

  async waitForUploadButton(timeout = 10000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkForButton = () => {
        const elapsed = Date.now() - startTime;
        const uploadButton = document.querySelector('[data-e2e="upload"]');
        if (
          uploadButton &&
          !uploadButton.classList.contains("fsp-button--disabled")
        ) {
          resolve(uploadButton);
          return;
        }
        if (elapsed > timeout) {
          resolve(null);
          return;
        }
        setTimeout(checkForButton, 200);
      };
      checkForButton();
    });
  }

  async waitForModalToClose(timeout = 10000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const check = () => {
        const elapsed = Date.now() - startTime;
        const modal = document.querySelector(".fsp-modal__body, .fsp-modal");
        if (!modal) {
          resolve(true);
          return;
        }
        if (elapsed > timeout) {
          resolve(false);
          return;
        }
        setTimeout(check, 500);
      };
      check();
    });
  }

  async closeModal() {
    try {
      const closeButton = document.querySelector(
        '.fsp-picker__close-button, .fsp-icon--close-modal, [title*="close"], [title*="ESC"]'
      );
      if (closeButton) {
        closeButton.click();
        await Utils.delay(500);
        return true;
      }

      const escEvent = new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        bubbles: true,
      });
      document.dispatchEvent(escEvent);
      await Utils.delay(500);
      return true;
    } catch (error) {
      return false;
    }
  }

  // ========================================
  // AI FORM FILLING
  // ========================================

  async fillFormFieldsWithAI() {
    try {
      console.log("🤖 Starting AI-powered form filling");

      const userDetails = this.userProfile;
      const storedJobData = await this.getStoredJobData();

      if (!userDetails) {
        console.log("⚠️ No user details available for AI form filling");
        return;
      }

      const textareas = document.querySelectorAll("textarea");
      const radioGroups = this.getRadioGroups();
      const checkboxGroups = this.getCheckboxGroups();
      const textInputs = document.querySelectorAll(
        'input[type="text"], input[type="email"], input[type="tel"], input[type="number"]'
      );
      const selectInputs = document.querySelectorAll("select");

      // Process textareas
      for (const textarea of textareas) {
        await this.fillTextareaWithAI(textarea, userDetails, storedJobData);
        await Utils.delay(500 + Math.random() * 1000);
      }

      // Process radio groups
      for (const radioGroup of radioGroups) {
        await this.fillRadioGroupWithAI(radioGroup, userDetails, storedJobData);
        await Utils.delay(300 + Math.random() * 500);
      }

      // Process checkbox groups
      for (const checkboxGroup of checkboxGroups) {
        await this.fillCheckboxGroupWithAI(
          checkboxGroup,
          userDetails,
          storedJobData
        );
        await Utils.delay(300 + Math.random() * 500);
      }

      // Process text inputs
      for (const input of textInputs) {
        await this.fillBasicInputField(input, userDetails);
        await Utils.delay(200 + Math.random() * 300);
      }

      // Process selects
      for (const select of selectInputs) {
        await this.fillBasicSelectField(select, userDetails);
        await Utils.delay(200 + Math.random() * 300);
      }

      console.log("✅ AI-powered form filling completed");
    } catch (error) {
      console.error("❌ Error in AI form filling:", error);
    }
  }

  getRadioGroups() {
    const radioGroups = [];
    const processedNames = new Set();

    document
      .querySelectorAll(".ja-radio-buttons-wrapper")
      .forEach((container) => {
        const radios = container.querySelectorAll('input[type="radio"]');
        if (radios.length > 0) {
          const firstRadio = radios[0];
          if (!processedNames.has(firstRadio.name)) {
            processedNames.add(firstRadio.name);
            const question = this.getQuestionFromContainer(container);
            const options = Array.from(radios).map((r) => ({
              element: r,
              value: r.value,
              text: this.getOptionText(r),
            }));
            radioGroups.push({
              name: firstRadio.name,
              question,
              options,
              required: this.isRequiredFromContainer(container),
            });
          }
        }
      });

    return radioGroups;
  }

  getCheckboxGroups() {
    const checkboxGroups = [];
    document
      .querySelectorAll(".ja-checkbox-wrapper, .multichoice-input-wrapper")
      .forEach((container, index) => {
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        if (checkboxes.length > 0) {
          const question = this.getQuestionFromContainer(container);
          const options = Array.from(checkboxes).map((cb) => ({
            element: cb,
            value: cb.value,
            text: this.getOptionText(cb),
          }));
          checkboxGroups.push({
            name: `checkbox-group-${index}`,
            question,
            options,
            required: this.isRequiredFromContainer(container),
          });
        }
      });
    return checkboxGroups;
  }

  async fillTextareaWithAI(textarea, userDetails, jobData) {
    try {
      if (textarea.value && textarea.value.trim()) return;

      const question = this.getQuestionText(textarea);
      if (!question) return;

      const context = {
        fieldType: "textarea",
        platform: this.platform,
        userData: userDetails,
        jobDescription: jobData?.description || "",
        jobTitle: jobData?.title || this.currentJobTitle || "",
        required: textarea.hasAttribute("required"),
      };

      const answer = await this.aiService.getNormalAnswer(
        question,
        [],
        context
      );
      if (answer) {
        await this.typeTextHumanLike(textarea, answer);
        await Utils.delay(500);
      }
    } catch (error) {
      console.error("❌ Error filling textarea:", error);
    }
  }

  async fillRadioGroupWithAI(radioGroup, userDetails, jobData) {
    try {
      const checkedRadio = radioGroup.options.find(
        (opt) => opt.element.checked
      );
      if (checkedRadio) return;

      const context = {
        fieldType: "radio",
        platform: this.platform,
        userData: userDetails,
        jobDescription: jobData?.description || "",
        jobTitle: jobData?.title || this.currentJobTitle || "",
        required: radioGroup.required,
      };

      const options = radioGroup.options.map((opt) => opt.text);
      const answer = await this.aiService.getOptionAnswer(
        radioGroup.question,
        options,
        context
      );

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
          await Utils.delay(500);
        }
      }
    } catch (error) {
      console.error("❌ Error filling radio group:", error);
    }
  }

  async fillCheckboxGroupWithAI(checkboxGroup, userDetails, jobData) {
    try {
      const checkedBoxes = checkboxGroup.options.filter(
        (opt) => opt.element.checked
      );
      if (checkedBoxes.length > 0) return;

      const context = {
        fieldType: "checkbox",
        platform: this.platform,
        userData: userDetails,
        jobDescription: jobData?.description || "",
        jobTitle: jobData?.title || this.currentJobTitle || "",
        required: checkboxGroup.required,
      };

      const options = checkboxGroup.options.map((opt) => opt.text);
      const answer = await this.aiService.getOptionAnswer(
        checkboxGroup.question,
        options,
        context
      );

      if (answer) {
        const selectedOptions = this.findMatchingCheckboxOptions(
          answer,
          checkboxGroup.options
        );
        for (const option of selectedOptions) {
          option.element.focus();
          option.element.checked = true;
          option.element.dispatchEvent(new Event("change", { bubbles: true }));
          option.element.blur();
          await Utils.delay(300);
        }
      }
    } catch (error) {
      console.error("❌ Error filling checkbox group:", error);
    }
  }

  async fillBasicInputField(input, userDetails) {
    try {
      if (input.value && input.value.trim()) return;

      const fieldContext = `${input.name || ""} ${input.id || ""} ${
        input.placeholder || ""
      }`.toLowerCase();
      let value = "";

      if (fieldContext.includes("first") && fieldContext.includes("name")) {
        value = userDetails.firstName || "";
      } else if (
        fieldContext.includes("last") &&
        fieldContext.includes("name")
      ) {
        value = userDetails.lastName || "";
      } else if (fieldContext.includes("email")) {
        value = userDetails.email || "";
      } else if (fieldContext.includes("phone")) {
        value = userDetails.phoneNumber || "";
      } else if (fieldContext.includes("linkedin")) {
        value = userDetails.linkedinUrl || "";
      }

      if (value && input.value !== value) {
        await this.typeTextHumanLike(input, value);
      }
    } catch (error) {
      console.error("❌ Error filling input field:", error);
    }
  }

  async fillBasicSelectField(select, userDetails) {
    try {
      if (select.value && select.value.trim() && select.selectedIndex > 0)
        return;

      const fieldContext = `${select.name || ""} ${
        select.id || ""
      }`.toLowerCase();
      const options = Array.from(select.options)
        .slice(1)
        .map((opt) => opt.textContent.trim())
        .filter((t) => t);

      if (options.length === 0) return;

      const context = {
        fieldType: "select",
        platform: this.platform,
        userData: userDetails,
      };

      let question = this.getFieldLabel(select) || "Please select an option";
      const answer = await this.aiService.getOptionAnswer(
        question,
        options,
        context
      );

      if (answer) {
        await this.selectOptionByText(select, answer);
      }
    } catch (error) {
      console.error("❌ Error filling select field:", error);
    }
  }

  // ========================================
  // APPLICATION SUCCESS
  // ========================================

  async handleApplicationSuccessPage() {
    console.log("✅ Application submitted successfully");

    const jobData = await this.getStoredJobData();

    notifyStatus({
      type: "APPLICATION_SUBMITTED",
      data: { title: jobData?.title || "Job Application" },
    });

    // Send APPLICATION_COMPLETED to trigger SEARCH_NEXT loop
    this.sendMessage({
      type: "APPLICATION_COMPLETED",
      data: {
        jobId: jobData?.jobId || this.extractJobIdFromCurrentUrl(),
        title: jobData?.title || "Job on Dice",
        company: jobData?.company || "Unknown Company",
        location: jobData?.location || "Unknown Location",
        jobUrl: jobData?.jobUrl || window.location.href,
        platform: "dice",
        appliedAt: Date.now(),
        description: jobData?.description || "",
      },
    });
  }

  handleJobSkipped(reason) {
    console.log(`🚫 Job skipped: ${reason}`);
    notifyStatus({ type: "APPLICATION_SKIPPED" });

    this.sendMessage({
      type: "APPLICATION_SKIPPED",
      data: {
        url: window.location.href,
        reason: reason,
      },
    });
  }

  // ========================================
  // CO-PILOT ACTIONS
  // ========================================

  handleCoPilotAction(data) {
    const { action } = data || {};
    if (!action) return;

    console.log("🎮 Co-pilot action:", action);

    switch (action) {
      case COPILOT_ACTIONS.SWITCH_TO_COPILOT:
        this.copilotState.switchToCoPilot();
        notifyStatus({
          type: "MODE_SWITCHED",
          data: { mode: "co-pilot" },
        });
        updateStatusButtons("co-pilot-search");
        break;

      case COPILOT_ACTIONS.SWITCH_TO_AUTOPILOT:
        this.copilotState.switchToAutoPilot();
        notifyStatus({
          type: "MODE_SWITCHED",
          data: { mode: "auto-pilot" },
        });
        updateStatusButtons("auto-pilot");
        break;

      case COPILOT_ACTIONS.SUBMIT:
      case "NEXT":
        this.resolveUserAction(action === "NEXT" ? "NEXT" : "SUBMIT");
        break;

      case COPILOT_ACTIONS.SKIP: {
        // Debounce skip action to prevent multiple triggers
        const now = Date.now();
        if (now - this.lastSkipTime < 1000) {
          console.log("⏭️ Skip action debounced (duplicate trigger)");
          return;
        }
        this.lastSkipTime = now;

        console.log("⏭️ User clicked skip");
        this.resolveUserAction("SKIP");
        notifyStatus({
          type: "JOB_SKIPPED",
          data: { title: this.currentJobTitle || "this job" },
        });
        this.sendMessage({
          type: "APPLICATION_SKIPPED",
          data: {
            url: window.location.href,
            reason: "User clicked skip button",
          },
        });
        break;
      }

      case COPILOT_ACTIONS.PAUSE:
        this.isPaused = true;
        notifyStatus({ type: "AUTOMATION_PAUSED" });
        break;

      case COPILOT_ACTIONS.RESUME:
        this.isPaused = false;
        notifyStatus({ type: "AUTOMATION_RESUMED" });
        break;

      default:
        console.warn("Unknown co-pilot action:", action);
    }
  }

  restoreModeButtons() {
    // Global overlay - always available
    if (this.copilotState.isInCoPilotMode()) {
      updateStatusButtons("co-pilot-search");
    } else {
      updateStatusButtons("auto-pilot");
    }
  }

  waitForUserAction() {
    // Always create a new promise to avoid stale promise issues
    // This ensures each wait gets its own fresh promise
    this.userActionPromise = new Promise((resolve) => {
      this.userActionResolver = resolve;
    });
    return this.userActionPromise;
  }

  resolveUserAction(action) {
    if (this.userActionResolver) {
      this.userActionResolver(action);
      this.userActionResolver = null;
      this.userActionPromise = null;
    }
  }

  // ========================================
  // JOB MATCHING
  // ========================================

  async doesJobMatchPreferences(jobInfo) {
    const preferences = this.config?.config?.preferences || {};
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

  // ========================================
  // JOB INFO EXTRACTION
  // ========================================

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

      const jobLink = jobCard.querySelector(this.selectors.jobTitle);
      let jobId = "";
      if (jobLink?.href) {
        const match = jobLink.href.match(/\/job-detail\/([^\/\?]+)/);
        jobId = match ? match[1] : "";
      }

      // Extract description
      let description = "";
      const descSelectors = [
        "p.line-clamp-2.h-10.shrink.grow.basis-0.text-sm.font-normal.text-zinc-900",
        'p[class*="line-clamp"]',
      ];
      for (const selector of descSelectors) {
        const element = jobCard.querySelector(selector);
        if (element && element.textContent?.trim()) {
          description = element.textContent.trim();
          break;
        }
      }

      // Extract salary
      let salary = "";
      const salaryBox = jobCard.querySelector(
        '[aria-labelledby="salary-label"]'
      );
      if (salaryBox) {
        const salaryElement = salaryBox.querySelector("p");
        if (salaryElement) salary = salaryElement.textContent?.trim() || "";
      }

      return {
        jobId,
        title,
        company,
        location,
        description,
        salary,
        jobUrl: jobLink?.href || window.location.href,
        platform: this.platform,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error("❌ Error extracting job info:", error);
      return {
        title: "Unknown Position",
        company: "Unknown Company",
        platform: this.platform,
      };
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  sendMessage(message) {
    try {
      chrome.runtime.sendMessage(message);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  }

  isSearchPage(url) {
    return /dice\.com\/jobs/i.test(url);
  }

  isJobDetailPage(url) {
    return /dice\.com\/job-detail/i.test(url);
  }

  isApplicationPage(url) {
    // Application page has /wizard but NOT /wizard/success
    return url.includes("/wizard") && !url.includes("/wizard/success");
  }

  isSuccessPage(url) {
    return (
      url.includes("dice.com") &&
      (url.includes("/wizard/success") ||
        url.includes("application-success") ||
        url.includes("thank-you"))
    );
  }

  isApplicationSuccess() {
    const diceSuccessElement = document.querySelector(
      ".post-apply-header-text h1"
    );
    if (
      diceSuccessElement &&
      diceSuccessElement.textContent?.includes("Application submitted")
    ) {
      return true;
    }

    const pageText = document.body.textContent?.toLowerCase() || "";
    return (
      pageText.includes("application submitted") ||
      pageText.includes("successfully applied") ||
      pageText.includes("we're rooting for you")
    );
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

  extractJobIdFromCurrentUrl() {
    try {
      const url = window.location.href;
      const match = url.match(/\/job-detail\/([^\/\?]+)/);
      return match ? match[1] : null;
    } catch (error) {
      return null;
    }
  }

  async saveJobToStorage(jobInfo) {
    try {
      await chrome.storage.local.set({
        currentJobData: { ...jobInfo, timestamp: Date.now() },
      });
    } catch (error) {
      console.error("❌ Error saving job to storage:", error);
    }
  }

  async getStoredJobData() {
    try {
      const result = await chrome.storage.local.get("currentJobData");
      return result.currentJobData || {};
    } catch (error) {
      return {};
    }
  }

  markJobCard(jobCard, status) {
    try {
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

      highlight.style.cssText = `position: absolute; top: 0; right: 0; background-color: ${color}; color: white; padding: 3px 8px; font-size: 12px; font-weight: bold; border-radius: 0 0 0 5px; z-index: 999;`;
      highlight.textContent = text;

      jobCard.style.border = `2px solid ${color}`;
      jobCard.style.position = "relative";

      const existing = jobCard.querySelector(".job-highlight");
      if (existing) existing.remove();
      jobCard.appendChild(highlight);
    } catch (error) {
      console.error("❌ Error marking job card:", error);
    }
  }

  markLinkAsColor(element, color, status) {
    try {
      let indicator = element.querySelector(".job-status-indicator");
      if (!indicator) {
        indicator = document.createElement("span");
        indicator.className = "job-status-indicator";
        indicator.style.cssText = `display: inline-block; margin-left: 8px; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; color: white;`;
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

  markLinkByUrl(url, color, status) {
    try {
      const links = document.querySelectorAll('a[href*="dice.com"]');
      for (const link of links) {
        if (link.href === url || link.href.includes(url)) {
          this.markLinkAsColor(link, color, status);
          break;
        }
      }
    } catch (error) {
      console.warn("Error marking link by URL:", error);
    }
  }

  getQuestionText(element) {
    const label = this.findLabelForElement(element);
    if (label) return this.cleanText(label.textContent);

    const container = element.closest(
      ".textarea-input-wrapper, .radio-input-wrapper"
    );
    if (container) {
      const questionElement = container.querySelector(
        "seds-paragraph, .label-text, label"
      );
      if (questionElement) return this.cleanText(questionElement.textContent);
    }

    return "";
  }

  getQuestionFromContainer(container) {
    const sedsElement = container.querySelector("seds-paragraph");
    if (sedsElement) return this.cleanText(sedsElement.textContent);

    const questionElement = container.querySelector(".label-text, label");
    if (questionElement) return this.cleanText(questionElement.textContent);

    return "";
  }

  getOptionText(element) {
    const label = this.findLabelForElement(element);
    if (label) {
      const labelTextSpan = label.querySelector(".label-text");
      if (labelTextSpan) return this.cleanText(labelTextSpan.textContent);
      return this.cleanText(label.textContent);
    }

    const span = element.nextElementSibling;
    if (span && span.textContent) return this.cleanText(span.textContent);

    return element.value || "";
  }

  findLabelForElement(element) {
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) return label;
    }
    return element.closest("label");
  }

  getFieldLabel(input) {
    try {
      if (input.id) {
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (label) return label.textContent?.trim();
      }
      const parentLabel = input.closest("label");
      if (parentLabel) return parentLabel.textContent?.trim();
      return "";
    } catch (error) {
      return "";
    }
  }

  isRequiredFromContainer(container) {
    return (
      container.querySelector(
        ".textarea-required, .radio-input-required, .multi-choice-required"
      ) !== null
    );
  }

  cleanText(text) {
    return text.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  }

  findBestMatchingOption(answer, options) {
    const answerLower = answer.toLowerCase();
    for (const option of options) {
      if (option.text.toLowerCase() === answerLower) return option;
    }
    for (const option of options) {
      if (
        answerLower.includes(option.text.toLowerCase()) ||
        option.text.toLowerCase().includes(answerLower)
      ) {
        return option;
      }
    }
    return null;
  }

  findMatchingCheckboxOptions(answer, options) {
    const answerLower = answer.toLowerCase();
    const selected = [];
    for (const option of options) {
      if (
        answerLower.includes(option.text.toLowerCase()) ||
        option.text.toLowerCase().includes(answerLower)
      ) {
        selected.push(option);
      }
    }
    return selected;
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
          select.blur();
          await Utils.delay(500);
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async typeTextHumanLike(element, text) {
    try {
      const isTextarea = element.tagName.toLowerCase() === "textarea";
      const cleanedText = String(text).trim();

      if (element.value && element.value.trim() === cleanedText) return true;

      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.focus();
      await Utils.delay(200);

      const nativeValueSetter = Object.getOwnPropertyDescriptor(
        isTextarea
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype,
        "value"
      ).set;

      nativeValueSetter.call(element, "");
      element.dispatchEvent(new Event("input", { bubbles: true }));

      if (isTextarea && cleanedText.length > 50) {
        nativeValueSetter.call(element, cleanedText);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        for (let i = 0; i < cleanedText.length; i++) {
          const currentValue = element.value + cleanedText[i];
          nativeValueSetter.call(element, currentValue);
          element.dispatchEvent(new Event("input", { bubbles: true }));
          await Utils.delay(50 + Math.random() * 100);
        }
      }

      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    } catch (error) {
      console.error("Error in typeTextHumanLike:", error);
      return false;
    }
  }

  getApiHost() {
    return (
      this.sessionContext?.backendApiHost ||
      this.config?.backendApiHost ||
      this.config?.sessionContext?.backendApiHost
    );
  }

  getAiApiHost() {
    return (
      this.sessionContext?.aiApiHost ||
      this.config?.aiApiHost ||
      this.config?.sessionContext?.aiApiHost
    );
  }

  cleanup() {
    console.log("🧹 Cleaning up Dice platform...");
    if (true) {
      // Global overlay
      // Global overlay - cleanup handled automatically
      // Global overlay - no local instance needed
    }
    this.isRunning = false;
  }
}
