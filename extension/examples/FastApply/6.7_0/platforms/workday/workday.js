// platforms/workday/workday.js - Workday platform automation
import { UrlUtils, DomUtils } from "../../shared/utilities/index.js";
import { domObserver } from "../../shared/utilities/dom-observer.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";
import Utils from "../../utils/utils.js";
import { WorkdayFileHandler } from "./workday-file-handler.js";
import { WorkdayFormHandler } from "./workday-form-handler.js";

export default class WorkdayPlatform {
  constructor(config) {
    this.config = config || {};
    this.platform = "workday";
    this.baseUrl = "https://myworkdayjobs.com";

    // Session context
    this.sessionContext = config?.sessionContext || null;
    this.sessionId = config?.sessionId || null;
    this.userId = config?.userId || null;
    this.userProfile = config?.userProfile || null;

    // Control state
    this.isRunning = false;
    this.isPaused = false;

    // API hosts (initialized in setSessionContext)
    this.aiApiHost = null;
    this.backendApiHost = null;

    // Handlers - will be initialized when form selectors are provided
    this.fileHandler = null;
    this.formHandler = null;

    // Co-pilot state
    this.copilotState = new CoPilotState();

    // Job data cache
    this.cachedJobDescription = null;
    this.currentJobUrl = null;

    // Job matching
    this.reason = "";

    // Listen for DOM events from the overlay
    document.addEventListener("copilot-control-action", (event) => {
      const { action } = event.detail || {};
      if (action) {
        console.log("🎮 Received copilot-control-action DOM event:", action);
        this.handleCoPilotAction({ action });
      }
    });
  }

  handleMessage(message) {
    const { type, data } = message;
    console.log("📥 Workday handleMessage:", type, data);

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

      case "SEARCH_NEXT":
        this.handleSearchNext(data);
        break;

      case "ERROR":
        break;

      case "SUCCESS":
        if (data && data.submittedLinks !== undefined) {
          this.searchData = data;
        } else if (data && data.profile) {
          this.userProfile = data.profile;
        }
        break;

      case "SEARCH_TASK":
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
        break;

      case "PROFILE_DATA":
        if (data) {
          this.userProfile = data;
          if (this.formHandler) {
            this.formHandler.userData = this.userProfile;
          }
        }
        break;

      case "START_AUTOMATION_NOW":
        console.log("📥 START_AUTOMATION_NOW received");
        if (data?.jobId) {
          this.currentJobId = data.jobId;
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
    if (data.reason === "Already applied") {
      this.handleAlreadyApplied(data);
    } else if (data.reason === "Company blacklisted") {
      this.handleCompanyBlacklisted(data);
    } else if (data.reason === "Limit reached") {
      this.handleLimitReached(data);
    }
    this.findAndOpenNextJob();
  }

  handleAlreadyApplied(data) {
    console.log("📥 handleAlreadyApplied:", data);
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
    notifyStatus({ type: "LIMIT_EXCEEDED" });
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

      // Load co-pilot mode preference from session context
      if (sessionContext.preferences?.hasOwnProperty("copilotMode")) {
        if (sessionContext.preferences?.copilotMode === true) {
          this.copilotState.switchToCoPilot();
          updateStatusButtons("co-pilot-search");
        } else {
          this.copilotState.switchToAutoPilot();
          updateStatusButtons("auto-pilot");
        }
      }
    } catch (error) {
      console.error("❌ Error setting Workday session context:", error);
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

      // Ensure session context preferences are applied
      if (this.sessionContext) {
        await this.setSessionContext(this.sessionContext);
      }

      this.restoreModeButtons();

      await Utils.delay(1000);
      await this.detectPageTypeAndStart();
    } catch (error) {
      notifyStatus({ type: "APPLICATION_ERROR" });
    }
  }

  async detectPageTypeAndStart() {
    const url = window.location.href;

    console.log("🔍 Detecting page type for:", url);

    // Check for error/not found page first (synchronous quick check)
    if (this.isErrorPage()) {
      await this.handleErrorPage();
      return;
    }

    if (url.includes("google.com/search")) {
      await this.startSearchProcess();
    } else if (this.isSuccessPage()) {
      await this.handleSuccessPage();
    } else if (this.isApplicationFormPage(url)) {
      // Already on the application form page (e.g., /apply/autofillWithResume)
      console.log(
        "📋 Application form page detected, handling sign-in/form...",
      );
      await this.handleApplicationFormPage();
    } else if (this.isValidJobPage(url)) {
      // Job details page - wait for actual content before proceeding
      // Workday is a SPA so error containers may not be in DOM yet
      console.log("📄 Job page URL detected, waiting for content to load...");
      const isError = await this.waitForJobPageContent();
      if (isError) {
        await this.handleErrorPage();
        return;
      }
      console.log("📄 Job details page confirmed, starting application...");
      await this.startApplicationProcess();
    } else if (this.isExternalOAuthPage(url)) {
      // External OAuth page (Google, Apple, LinkedIn sign-in) - do nothing, wait for user
      console.log(
        "🔐 External OAuth page detected - waiting for user to complete sign-in",
      );
      // Don't skip - just return and let user complete the OAuth flow
      return;
    } else if (this.isWorkdayLoginPage(url)) {
      // Workday login page requiring email/password - do nothing, wait for user
      console.log(
        "🔐 Workday login page detected - waiting for user to complete sign-in",
      );
      // Don't skip - just return and let user complete the login flow
      return;
    } else {
      this.sendMessage({
        type: "APPLICATION_SKIPPED",
        data: { url, reason: "Unknown page type" },
      });
    }
  }

  /**
   * Check if URL is an external OAuth sign-in page
   * These are pages where the user needs to sign in with Google, Apple, LinkedIn, etc.
   * We should not skip these - just wait for user to complete
   */
  isExternalOAuthPage(url) {
    const oauthDomains = [
      "accounts.google.com",
      "appleid.apple.com",
      "linkedin.com/oauth",
      "login.microsoftonline.com",
      "github.com/login/oauth",
    ];

    return oauthDomains.some((domain) => url.includes(domain));
  }

  /**
   * Check if URL is a Workday login page requiring email/password authentication
   * These pages have /login in the URL with a redirect parameter
   * We should not automate these - wait for user to complete manual login
   */
  isWorkdayLoginPage(url) {
    // Check for Workday login page pattern: myworkdayjobs.com/*/login
    if (url.includes("myworkdayjobs.com") && url.includes("/login")) {
      return true;
    }
    return false;
  }

  /**
   * Handle when we're already on the application form page
   * (e.g., directly navigated to /apply/autofillWithResume)
   */
  async handleApplicationFormPage() {
    try {
      // Wait for page to fully load first
      await Utils.delay(2000);

      console.log("isErrorPage", this.isErrorPage());
      // Check for error page FIRST (before showing "applying" status)
      if (this.isErrorPage()) {
        await this.handleErrorPage();
        return;
      }

      const jobTitle = this.extractJobTitle();

      notifyStatus({
        type: "APPLYING_TO_JOB",
        data: { title: jobTitle },
      });

      // Handle sign-in/create account if required
      const signInHandled = await this.handleSignInIfRequired();

      if (!signInHandled) {
        console.log("ℹ️ No sign-in required or sign-in already completed");
      } else {
        console.log("✅ Sign-in/account creation completed");
      }

      // Initialize and run form handler
      await this.runFormHandler();
    } catch (error) {
      console.error("Error in handleApplicationFormPage:", error);
      this.handleApplicationError(error);
    }
  }

  /**
   * Initialize and run the Workday form handler
   */
  async runFormHandler() {
    console.log("📝 Initializing Workday form handler...");

    try {
      // Initialize file handler
      const fileHandler = new WorkdayFileHandler({
        preferences: this.config?.config?.preferences || {},
        backendApiHost: this.getApiHost(),
        aiApiHost: this.getAiApiHost(),
        jwtToken: this.sessionContext?.jwtToken || this.config?.jwtToken,
      });

      // Initialize form handler
      const formHandler = new WorkdayFormHandler({
        backendApiHost: this.getApiHost(),
        aiApiHost: this.getAiApiHost(),
        jwtToken: this.sessionContext?.jwtToken || this.config?.jwtToken,
        userData: this.userProfile || this.sessionContext?.userProfile || {},
        userPreferences: this.config?.config?.preferences || {},
        jobDescription:
          this.cachedJobDescription || this.extractJobDescription(),
        jobTitle: this.extractJobTitle(),
        fileHandler: fileHandler,
        copilotMode: this.copilotMode,
      });

      // Run form completion
      const result = await formHandler.fillCompleteForm();

      // Handle error page detection (job doesn't exist, expired, etc.)
      if (result && typeof result === "object" && result.skipToNext) {
        console.log(`⚠️ Error detected during form fill: ${result.error}`);
        notifyStatus({
          type: "JOB_NOT_FOUND",
          data: {
            title: this.extractJobTitle(),
            message: result.error || "Job posting no longer exists",
          },
        });

        this.sendMessage({
          type: "APPLICATION_SKIPPED",
          data: {
            url: window.location.href,
            title: this.extractJobTitle(),
            reason: result.error || "Job posting no longer exists",
            skipReason: "not_found",
          },
        });

        // Close the tab to move to next job
        await Utils.delay(2000);
        window.close();
        return;
      }

      if (result === true) {
        console.log("✅ Application submitted successfully!");
        notifyStatus({
          type: "APPLICATION_SUBMITTED",
          data: { title: this.extractJobTitle() },
        });

        this.sendMessage({
          type: "APPLICATION_SUBMITTED",
          data: {
            url: window.location.href,
            title: this.extractJobTitle(),
          },
        });
      } else {
        console.warn("⚠️ Form completion did not reach success state");
      }
    } catch (error) {
      console.error("❌ Form handler error:", error);
      this.handleApplicationError(error);
    }
  }

  /**
   * Check if the current page is a Workday error/not found page
   * @returns {boolean}
   */
  isErrorPage() {
    // Check for the error container
    const errorContainer = document.querySelector(
      '[data-automation-id="errorContainer"]',
    );
    if (errorContainer) {
      return true;
    }

    // Check for error message text
    const errorMessage = document.querySelector(
      '[data-automation-id="errorMessage"]',
    );
    if (errorMessage) {
      const text = errorMessage.textContent.toLowerCase();
      if (
        text.includes("doesn't exist") ||
        text.includes("does not exist") ||
        text.includes("not found")
      ) {
        return true;
      }
    }

    // Check for "Search for Jobs" button (fallback indicator)
    const searchButton = document.querySelector(
      '[data-automation-id="searchForJobsButton"]',
    );
    if (
      searchButton &&
      !document.querySelector('[data-automation-id="adventureButton"]')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Wait for Workday SPA to render actual page content before routing.
   * Races error indicators against real job content elements.
   * @returns {Promise<boolean>} true if error page detected, false if job content loaded
   */
  async waitForJobPageContent() {
    const errorSelectors = [
      '[data-automation-id="errorContainer"]',
      '[data-automation-id="errorMessage"]',
    ];
    const jobContentSelectors = [
      '[data-automation-id="adventureButton"]',
      '[data-automation-id="jobPostingHeader"]',
      '[data-automation-id="jobPostingDescription"]',
    ];

    const allSelectors = [...errorSelectors, ...jobContentSelectors];

    try {
      const result = await domObserver.waitForAnyElement(allSelectors, {
        timeout: 15000,
        checkVisibility: true,
        checkInteractivity: false,
        parent: document.body,
      });

      if (result && result.element) {
        const matchedSelector = result.selector;
        if (errorSelectors.includes(matchedSelector)) {
          console.log(`⚠️ Error content loaded first: ${matchedSelector}`);
          return true;
        }
        console.log(`✅ Job content loaded: ${matchedSelector}`);
        return false;
      }
    } catch (e) {
      console.warn("⚠️ Timeout waiting for page content, checking error state...");
    }

    // Fallback: after timeout, do a synchronous check
    return this.isErrorPage();
  }

  /**
   * Handle error/not found page - skip to next job
   */
  async handleErrorPage() {
    console.log("⚠️ Workday error page detected - job doesn't exist");

    const jobTitle = this.extractJobTitle() || "Job";

    notifyStatus({
      type: "JOB_NOT_FOUND",
      data: {
        title: jobTitle,
        message: "This job posting no longer exists",
      },
    });

    this.sendMessage({
      type: "APPLICATION_SKIPPED",
      data: {
        url: window.location.href,
        title: jobTitle,
        reason: "Job posting no longer exists",
        skipReason: "not_found",
      },
    });

    // Close the tab and let the background script open the next job
    await Utils.delay(2000);
    window.close();
  }

  async startSearchProcess() {
    notifyStatus({
      type: "JOB_SEARCH_STARTED",
      data: { preferences: this.config.config.preferences || {} },
    });
    this.sendMessage({ type: "GET_SEARCH_TASK" });
    await Utils.delay(2000);
    this.findAndOpenNextJob();
  }

  // ========================================
  // JOB SEARCH AND OPENING
  // ========================================

  findAndOpenNextJob() {
    if (!this.isRunning || this.isPaused) return;

    const links = this.findAllJobLinks();

    if (links.length === 0) {
      this.handleNoJobsFound();
      return;
    }

    for (const link of links) {
      const url = link.href;

      if (link.classList.contains("fastapply-processed")) {
        continue;
      }

      if (link.classList.contains("fastapply-invalid")) {
        continue;
      }

      if (!this.isValidJobPage(url)) {
        link.classList.add("fastapply-invalid");
        this.markLinkAsColor(link, "red", "Invalid");
        continue;
      }

      this.openJob(link, url);
      return;
    }

    this.handleNoJobsFound();
  }

  findAllJobLinks() {
    const allLinks = Array.from(
      document.querySelectorAll('a[href*="myworkdayjobs.com"]'),
    );

    // Filter valid job pages and deduplicate by URL
    const seenUrls = new Set();
    return allLinks.filter((link) => {
      const url = link.href;
      if (!this.isValidJobPage(url)) {
        return false;
      }

      // Skip common non-job links
      const linkText = link.textContent.trim().toLowerCase();
      if (
        linkText === "read more" ||
        linkText === "learn more" ||
        linkText === "view more" ||
        linkText === "see more" ||
        linkText === "more"
      ) {
        return false;
      }

      // Normalize URL for deduplication
      let normalizedUrl = url.split("?")[0].replace(/\/$/, "");
      if (seenUrls.has(normalizedUrl)) {
        return false;
      }
      seenUrls.add(normalizedUrl);
      return true;
    });
  }

  async openJob(linkElement, url) {
    linkElement.classList.add("fastapply-processed");

    // Mark ALL links with the same URL as processed
    const normalizedUrl = this.normalizeJobUrl(url);
    const allLinks = document.querySelectorAll('a[href*="myworkdayjobs.com"]');
    for (const link of allLinks) {
      if (this.normalizeJobUrl(link.href) === normalizedUrl) {
        link.classList.add("fastapply-processed");
      }
    }

    const h3 = linkElement.querySelector("h3");
    const jobTitle = h3
      ? h3.textContent.trim()
      : linkElement.textContent.trim();

    this.markLinkAsColor(linkElement, "blue", "Processing");

    this.sendMessage({
      type: "START_APPLICATION",
      data: {
        url: normalizedUrl,
        jobId: this.extractJobId(normalizedUrl),
        title: jobTitle,
        company: this.extractCompanyFromUrl(normalizedUrl),
        requestId: `req_${Date.now()}`,
      },
    });
  }

  extractCompanyFromUrl(url) {
    // Workday URL format: https://{company}.myworkdayjobs.com/...
    const companyPattern = /https?:\/\/([^.]+)\.myworkdayjobs\.com/i;
    const match = url.match(companyPattern);
    return match ? match[1] : null;
  }

  normalizeJobUrl(url) {
    let normalized = url.split("?")[0].replace(/\/$/, "");
    return normalized;
  }

  extractJobId(url) {
    // Extract job ID from Workday URL - usually in the path
    const jobPattern = /\/job\/([^/?]+)/i;
    const match = url.match(jobPattern);
    if (match) return match[1];

    // Fallback: use last path segment
    const parts = url.split("/").filter(Boolean);
    return parts[parts.length - 1] || null;
  }

  markLinkAsColor(element, color, status) {
    try {
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

  markLinkByUrl(url, color, status) {
    try {
      const links = document.querySelectorAll('a[href*="myworkdayjobs.com"]');
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

  handleNoJobsFound() {
    const nextBtn = this.findNextPageButton();

    if (nextBtn && !this.isPaused) {
      nextBtn.click();
      setTimeout(() => {
        if (!this.isPaused) this.findAndOpenNextJob();
      }, 3000);
    } else {
      notifyStatus({ type: "SEARCH_COMPLETED" });
      this.sendMessage({ type: "SEARCH_COMPLETED" });
    }
  }

  findNextPageButton() {
    const nextLink = document.querySelector("a#pnnext");
    if (nextLink && nextLink.offsetParent !== null) {
      return nextLink;
    }

    const allLinks = document.querySelectorAll('a[aria-label*="Page"]');
    for (const link of allLinks) {
      if (link.offsetParent !== null && !link.classList.contains("fl")) {
        return link;
      }
    }

    return null;
  }

  // ========================================
  // JOB APPLICATION FLOW
  // ========================================

  async startApplicationProcess() {
    try {
      // Check for error page FIRST (before showing "applying" status)
      if (this.isErrorPage()) {
        await this.handleErrorPage();
        return;
      }

      const jobTitle = this.extractJobTitle();

      notifyStatus({
        type: "APPLYING_TO_JOB",
        data: { title: jobTitle },
      });

      await Utils.delay(1500);

      // Extract job description and build enriched version with metadata for AI context
      const rawJobDescription = this.extractJobDescription();
      const jobTitle = this.extractJobTitle();
      const company = this.extractCompanyFromUrl(window.location.href) || "";
      const location = this.extractLocation();
      const jobDescParts = [];
      if (jobTitle && jobTitle !== "Job on Workday") jobDescParts.push(`Job Title: ${jobTitle}`);
      if (company && company !== "Company") jobDescParts.push(`Company: ${company}`);
      if (location && location !== "Not specified") jobDescParts.push(`Location: ${location}`);
      if (rawJobDescription) jobDescParts.push(`\nJob Description:\n${rawJobDescription}`);
      this.cachedJobDescription = jobDescParts.length > 0 ? jobDescParts.join('\n') : rawJobDescription;

      // Check if job matches preferences
      if (
        this.config.config.preferences?.applyOnlyMatching ||
        this.config.config.preferences?.applyOnlyQualified
      ) {
        const jobDetails = this.getJobProperties();
        const matches = await this.doesJobMatchPreferences(jobDetails);
        if (!matches) {
          notifyStatus({
            type: "DOES_NOT_MATCH_PREFERENCES",
            data: {
              reason: this.reason,
              title: jobTitle,
            },
          });

          await this.delay(5100);
          this.sendMessage({
            type: "APPLICATION_SKIPPED",
            data: {
              url: window.location.href,
              title: jobTitle,
              reason: this.reason || "Does not match preferences",
            },
          });

          return;
        }
      }

      // Wait for Apply button to load and click it
      const applyClicked = await this.waitForApplyButtonAndClick();

      if (!applyClicked) {
        // Re-check for error page - may have loaded during the wait
        if (this.isErrorPage()) {
          await this.handleErrorPage();
          return;
        }
        notifyStatus({
          type: "APPLICATION_ERROR",
          data: { message: "Could not find Apply button on this page" },
        });
        return;
      }

      console.log("✅ Apply button clicked, waiting for application modal...");

      // Wait for the "Start Your Application" modal and click "Apply Manually Instead"
      const autofillClicked = await this.waitForModalAndClickAutofill();

      if (!autofillClicked) {
        notifyStatus({
          type: "APPLICATION_ERROR",
          data: { message: "Could not find Apply Manually option" },
        });
        return;
      }

      console.log("✅ Apply Manually clicked, checking for sign-in page...");

      // Wait for page to load and check for sign-in requirement
      await Utils.delay(2000);

      // Handle sign-in/create account if required
      const signInHandled = await this.handleSignInIfRequired();

      if (!signInHandled) {
        console.log("ℹ️ No sign-in required or sign-in already completed");
      } else {
        console.log("✅ Sign-in/account creation completed");
      }

      // Run the form handler to complete the application
      await this.runFormHandler();
    } catch (error) {
      console.error("Error in startApplicationProcess:", error);
      this.handleApplicationError(error);
    }
  }

  /**
   * Generate a random password that meets Workday requirements:
   * - Minimum 8 characters
   * - At least one uppercase letter
   * - At least one lowercase letter
   * - At least one number
   * - At least one special character
   * @returns {string}
   */
  generateSecurePassword() {
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const special = "!@#$%^&*()_+-=[]{}|;:,.<>?";

    // Ensure at least one of each required type
    let password = "";
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Fill remaining with random characters (total 16 chars for security)
    const allChars = uppercase + lowercase + numbers + special;
    for (let i = 0; i < 12; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password
    return password
      .split("")
      .sort(() => Math.random() - 0.5)
      .join("");
  }

  /**
   * Detect if we're on a sign-in page and notify user to log in manually
   * Uses MutationObserver for reliable detection on slow-loading pages
   * @returns {Promise<boolean>} - True if sign-in was required (user notified)
   */
  async handleSignInIfRequired() {
    console.log("🔍 Waiting for sign-in content to load...");

    // Use domObserver to dynamically wait for sign-in content
    try {
      const signInContent = await domObserver.waitForElement(
        '[data-automation-id="signInContent"]',
        {
          timeout: 10000, // 10 seconds to wait for sign-in form
          checkVisibility: true,
          checkInteractivity: false,
        },
      );

      if (!signInContent) {
        console.log("ℹ️ No sign-in content detected after waiting");
        return false;
      }

      console.log("✅ Sign-in form detected - requesting user login");

      // Extract job title for the notification
      const jobTitle = this.extractJobTitle() || "this position";

      // Notify user to log in manually via status overlay
      notifyStatus({
        type: "LOGIN_REQUIRED",
        data: {
          message:
            "Please sign in or create a Workday account to continue your application.",
          title: jobTitle,
          action: "Sign in to continue",
        },
      });

      // Wait for the sign-in content to disappear (user completed login)
      console.log("⏳ Waiting for user to complete sign-in...");

      try {
        await domObserver.waitForElementToDisappear(
          '[data-automation-id="signInContent"]',
          {
            timeout: 300000, // 5 minute timeout for manual login
          },
        );
        console.log("✅ Sign-in completed by user");

        notifyStatus({
          type: "AUTOMATION_RESUMED",
          data: { message: "Sign-in completed, continuing application..." },
        });

        return true;
      } catch (timeoutError) {
        console.warn("⚠️ Sign-in timeout - user may need more time");
        return false;
      }

      /* 
       * AUTO SIGNUP LOGIC - COMMENTED OUT FOR NOW
       * Uncomment when ready to implement automatic account creation
       *
      // Determine current state: Sign In page, Create Account page, or Social login chooser
      const pageTitle = document.querySelector("#authViewTitle")?.textContent?.trim().toLowerCase() || "";
      console.log(`📄 Auth page detected: "${pageTitle}"`);

      // Check if we're on the "Create Account" page directly
      const isCreateAccountPage = pageTitle.includes("create account");

      // If we see social login buttons (Apple/Google) + "Sign in with email", click email first
      const signInWithEmailBtn = document.querySelector('[data-automation-id="SignInWithEmailButton"]');
      if (signInWithEmailBtn) {
        console.log("📧 Found 'Sign in with email' button, clicking...");
        signInWithEmailBtn.click();
        await Utils.delay(2000);
      }

      // Now we should be on either Sign In form or Create Account form
      // If on Sign In form, click "Create Account" link
      const createAccountLink = document.querySelector('[data-automation-id="createAccountLink"]');
      if (createAccountLink && !isCreateAccountPage) {
        console.log("🆕 Clicking 'Create Account' link...");
        createAccountLink.click();
        await Utils.delay(2000);
      }

      // Now handle the Create Account form
      return await this.fillCreateAccountForm();
      */
    } catch (error) {
      // Timeout means no sign-in form appeared - might already be logged in
      console.log(
        "ℹ️ No sign-in content detected (timeout) - may already be logged in",
      );
      return false;
    }
  }

  /**
   * Fill and submit the Create Account form
   * @returns {Promise<boolean>}
   */
  async fillCreateAccountForm() {
    console.log("📝 Filling Create Account form...");

    // Wait for the form to be ready
    const emailInput = await domObserver
      .waitForElement('[data-automation-id="email"]', {
        timeout: 10000,
        checkVisibility: true,
        checkInteractivity: true,
      })
      .catch(() => null);

    if (!emailInput) {
      console.error("❌ Could not find email input");
      return false;
    }

    // Get user email
    const userEmail =
      this.userProfile?.email || this.sessionContext?.userProfile?.email;
    if (!userEmail) {
      console.error("❌ No user email available for account creation");
      notifyStatus({
        type: "APPLICATION_ERROR",
        data: { message: "User email required for Workday account creation" },
      });
      return false;
    }

    // Generate a secure password
    const password = this.generateSecurePassword();
    console.log("🔐 Generated secure password for Workday account");

    // Fill email
    emailInput.focus();
    emailInput.value = userEmail;
    emailInput.dispatchEvent(new Event("input", { bubbles: true }));
    emailInput.dispatchEvent(new Event("change", { bubbles: true }));
    await Utils.delay(300);

    // Fill password
    const passwordInput = document.querySelector(
      '[data-automation-id="password"]',
    );
    if (passwordInput) {
      passwordInput.focus();
      passwordInput.value = password;
      passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
      passwordInput.dispatchEvent(new Event("change", { bubbles: true }));
      await Utils.delay(300);
    }

    // Fill verify password
    const verifyPasswordInput = document.querySelector(
      '[data-automation-id="verifyPassword"]',
    );
    if (verifyPasswordInput) {
      verifyPasswordInput.focus();
      verifyPasswordInput.value = password;
      verifyPasswordInput.dispatchEvent(new Event("input", { bubbles: true }));
      verifyPasswordInput.dispatchEvent(new Event("change", { bubbles: true }));
      await Utils.delay(300);
    }

    // Check the terms checkbox
    const termsCheckbox = document.querySelector(
      '[data-automation-id="createAccountCheckbox"]',
    );
    if (termsCheckbox && !termsCheckbox.checked) {
      console.log("☑️ Checking terms and conditions checkbox...");
      termsCheckbox.click();
      await Utils.delay(300);
    }

    // Wait a moment for form validation
    await Utils.delay(500);

    // Click the Create Account submit button
    // Note: Workday uses a click_filter div overlay, so we need to click that
    const clickFilter = document.querySelector(
      '[data-automation-id="click_filter"][aria-label="Create Account"]',
    );
    const submitButton = document.querySelector(
      '[data-automation-id="createAccountSubmitButton"]',
    );

    if (clickFilter) {
      console.log("🚀 Clicking Create Account (via click filter)...");
      clickFilter.click();
    } else if (submitButton) {
      console.log("🚀 Clicking Create Account submit button...");
      submitButton.click();
    } else {
      console.error("❌ Could not find Create Account submit button");
      return false;
    }

    console.log("✅ Create Account form submitted");

    // Wait for the page to process and move to next step
    await Utils.delay(3000);

    // Check for any error messages
    const errorMessage = document.querySelector(
      '[data-automation-id="errorMessage"]',
    );
    if (errorMessage && errorMessage.textContent.trim()) {
      const errorText = errorMessage.textContent.trim();
      console.warn("⚠️ Account creation error:", errorText);

      // If email already exists, try to sign in instead
      if (
        errorText.toLowerCase().includes("already") ||
        errorText.toLowerCase().includes("exists")
      ) {
        console.log("📧 Email already registered, attempting sign-in...");
        return await this.handleExistingAccountSignIn(userEmail, password);
      }

      return false;
    }

    return true;
  }

  /**
   * Handle sign-in for an existing account
   * @param {string} email
   * @param {string} password - Note: This won't work since we don't know the real password
   * @returns {Promise<boolean>}
   */
  async handleExistingAccountSignIn(email, password) {
    console.log("🔄 Attempting to sign in with existing account...");

    // Click sign in link if available
    const signInLink = document.querySelector(
      '[data-automation-id="signInLink"]',
    );
    if (signInLink) {
      signInLink.click();
      await Utils.delay(1500);
    }

    // For existing accounts, we can't know the password
    // Notify user that manual intervention may be needed
    notifyStatus({
      type: "MANUAL_ACTION_REQUIRED",
      data: {
        message:
          "Workday account already exists. Please sign in manually or use 'Forgot Password' to reset.",
        email: email,
      },
    });

    // Wait for user action with overlay
    console.log("⏳ Waiting for manual sign-in...");

    // Watch for successful sign-in (page will change)
    try {
      await domObserver.waitForElementToDisappear(
        '[data-automation-id="signInContent"]',
        {
          timeout: 120000, // 2 minute timeout for manual login
        },
      );
      console.log("✅ Sign-in content disappeared, assuming successful login");
      return true;
    } catch (error) {
      console.warn("⚠️ Sign-in timeout - user may need more time");
      return false;
    }
  }

  /**
   * Efficiently wait for and click the Workday Apply button using MutationObserver
   * No fixed delays - uses real-time dynamic DOM watching for production reliability
   * @returns {Promise<boolean>} - True if button was found and clicked
   */
  async waitForApplyButtonAndClick() {
    console.log("🔍 Waiting for Workday Apply button to load...");

    // Workday Apply button selectors - ordered by specificity
    const applyButtonSelectors = [
      // Primary: data-automation-id is most reliable for Workday
      '[data-automation-id="adventureButton"]',
      // Secondary: data-uxi-element-id for Apply
      '[data-uxi-element-id="Apply_adventureButton"]',
      // Tertiary: role button with Apply text
      'a[role="button"][href*="/apply"]',
      // Fallback: link with /apply in href
      'a[href$="/apply"]',
    ];

    try {
      // Use domObserver.waitForAnyElement for race-condition detection
      // This will return as soon as ANY of the selectors match a visible element
      const result = await domObserver.waitForAnyElement(applyButtonSelectors, {
        timeout: 15000, // 15 second timeout for slow pages
        checkVisibility: true,
        checkInteractivity: true,
        parent: document.body,
      });

      if (result && result.element) {
        const applyButton = result.element;
        console.log(`✅ Apply button found using selector: ${result.selector}`);

        // Scroll into view if needed
        applyButton.scrollIntoView({ behavior: "smooth", block: "center" });

        // Small delay for scroll animation
        await Utils.delay(300);

        // Click the button
        applyButton.click();
        console.log("✅ Apply button clicked successfully");

        return true;
      }
    } catch (error) {
      console.warn(
        "⚠️ Primary selectors failed, trying fallback text search...",
      );
    }

    // Fallback: Use text-based search if data attributes fail
    try {
      const applyButton = await domObserver.waitForElement(
        () => {
          // Find all buttons and links with "Apply" text
          const allClickables = document.querySelectorAll(
            'a[role="button"], button',
          );
          for (const el of allClickables) {
            const text = el.textContent.trim().toLowerCase();
            if (text === "apply" || text === "apply now") {
              // Verify it's related to job application (has /apply in href)
              if (el.href && el.href.includes("/apply")) {
                return el;
              }
            }
          }
          return null;
        },
        {
          timeout: 10000,
          checkVisibility: true,
          checkInteractivity: true,
        },
      );

      if (applyButton) {
        console.log("✅ Apply button found via text search fallback");
        applyButton.scrollIntoView({ behavior: "smooth", block: "center" });
        await Utils.delay(300);
        applyButton.click();
        console.log("✅ Apply button clicked successfully (fallback)");
        return true;
      }
    } catch (fallbackError) {
      console.error("❌ Fallback text search also failed:", fallbackError);
    }

    console.error("❌ Could not find Apply button on this page");
    return false;
  }

  /**
   * Wait for the "Start Your Application" modal and click "Apply Manually Instead"
   * Uses MutationObserver for dynamic waiting - no fixed delays
   * @returns {Promise<boolean>} - True if apply button was found and clicked
   */
  async waitForModalAndClickAutofill() {
    console.log("🔍 Waiting for 'Start Your Application' modal...");

    // Modal selectors - ordered by specificity
    const modalSelectors = [
      // Primary: data-automation-id for the popup frame
      '[data-automation-id="wd-popup-frame"]',
      // Secondary: aria-label for the dialog
      '[aria-label="Start Your Application"]',
      // Tertiary: class-based selector
      '.workday-popup.wd-popup[role="dialog"]',
    ];

    try {
      // Wait for the modal to appear
      const modalResult = await domObserver.waitForAnyElement(modalSelectors, {
        timeout: 10000, // 10 second timeout for modal
        checkVisibility: true,
        checkInteractivity: false, // Modal itself doesn't need to be interactive
        parent: document.body,
      });

      if (!modalResult || !modalResult.element) {
        console.error("❌ Modal did not appear");
        return false;
      }

      console.log(
        "✅ Modal appeared, looking for 'Apply Manually Instead' button...",
      );

      // Now wait for the "Apply Manually Instead" button inside the modal
      const applyManuallySelectors = [
        // Primary: data-automation-id for apply manually
        '[data-automation-id="applyManually"]',
        // Secondary: href-based selector
        'a[href*="/apply/applyManually"]',
        // Tertiary: role button with applyManually in href
        'a[role="button"][href*="applyManually"]',
      ];

      const applyManuallyResult = await domObserver.waitForAnyElement(
        applyManuallySelectors,
        {
          timeout: 5000, // 5 second timeout since modal is already visible
          checkVisibility: true,
          checkInteractivity: true,
          parent: modalResult.element, // Search within the modal
        },
      );

      if (applyManuallyResult && applyManuallyResult.element) {
        const applyButton = applyManuallyResult.element;
        console.log(
          `✅ 'Apply Manually Instead' button found using selector: ${applyManuallyResult.selector}`,
        );

        // Scroll into view if needed (within modal)
        applyButton.scrollIntoView({ behavior: "smooth", block: "center" });

        // Small delay for scroll animation
        await Utils.delay(300);

        // Click the button
        applyButton.click();
        console.log("✅ 'Apply Manually Instead' button clicked successfully");

        return true;
      }
    } catch (error) {
      console.warn(
        "⚠️ Primary modal/apply manually detection failed, trying fallback...",
        error,
      );
    }

    // Fallback: Text-based search for Apply Manually button anywhere in the document
    try {
      const applyButton = await domObserver.waitForElement(
        () => {
          const allClickables = document.querySelectorAll(
            'a[role="button"], button',
          );
          for (const el of allClickables) {
            const text = el.textContent.trim().toLowerCase();
            if (
              text.includes("apply manually") ||
              text.includes("manually instead")
            ) {
              return el;
            }
          }
          return null;
        },
        {
          timeout: 5000,
          checkVisibility: true,
          checkInteractivity: true,
        },
      );

      if (applyButton) {
        console.log(
          "✅ 'Apply Manually Instead' found via text search fallback",
        );
        applyButton.scrollIntoView({ behavior: "smooth", block: "center" });
        await Utils.delay(300);
        applyButton.click();
        console.log(
          "✅ 'Apply Manually Instead' clicked successfully (fallback)",
        );
        return true;
      }
    } catch (fallbackError) {
      console.error(
        "❌ Fallback apply manually search also failed:",
        fallbackError,
      );
    }

    console.error("❌ Could not find 'Apply Manually Instead' button");
    return false;
  }

  async handleSuccessfulSubmission() {
    console.log("✅ Application submitted successfully");

    const jobTitle = this.extractJobTitle();
    const companyName =
      this.extractCompanyFromUrl(window.location.href) || "Company";

    notifyStatus({
      type: "APPLICATION_SUBMITTED",
      data: { title: jobTitle },
    });

    const jobData = {
      jobId: this.extractJobId(window.location.href) || Utils.generateId("wd_"),
      title: jobTitle,
      company: companyName,
      location: this.extractLocation(),
      jobUrl: window.location.href,
      platform: "workday",
      appliedAt: Date.now(),
    };

    try {
      this.sendMessage({
        type: "APPLICATION_COMPLETED",
        data: jobData,
      });

      if (jobData.jobUrl) {
        this.markLinkByUrl(jobData.jobUrl, "green", "Completed");
      }
    } catch (error) {
      console.error("❌ Error processing application:", error);
      this.sendMessage({
        type: "APPLICATION_COMPLETED",
        data: jobData,
      });
    }
  }

  async handleSuccessPage() {
    console.log("🎉 Workday success page detected!");

    const jobTitle = this.extractJobTitle();
    const companyName =
      this.extractCompanyFromUrl(window.location.href) || "Company";

    const jobData = {
      jobId: this.extractJobId(window.location.href),
      title: jobTitle,
      company: companyName,
      location: this.extractLocation(),
      jobUrl: window.location.href,
      platform: "workday",
      appliedAt: new Date().toISOString(),
      status: "applied",
    };

    this.sendMessage({
      type: "APPLICATION_COMPLETED",
      data: jobData,
    });

    notifyStatus({
      type: "APPLICATION_SUBMITTED",
      data: { title: jobTitle },
    });

    await this.delay(2500);
    window.close();
  }

  isSuccessPage() {
    // TODO: Update with actual Workday success page detection selectors
    const successIndicators = [
      '[data-automation-id="successMessage"]',
      ".application-success",
      ".confirmation-message",
      '[data-automation-id="applicationConfirmation"]',
    ];

    for (const selector of successIndicators) {
      if (document.querySelector(selector)) {
        return true;
      }
    }
    return false;
  }

  handleApplicationError(error) {
    console.error("❌ Application error:", error);

    notifyStatus({ type: "APPLICATION_ERROR" });
    this.sendMessage({
      type: "APPLICATION_ERROR",
      data: error.message || String(error),
    });
  }

  // ========================================
  // JOB DATA EXTRACTION
  // ========================================

  extractJobDescription() {
    // TODO: Update with actual Workday selectors
    const selectors = [
      '[data-automation-id="jobPostingDescription"]',
      ".job-description",
      ".description",
      '[data-testid="job-description"]',
      ".job-details",
      ".content",
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }

    const mainContent = document.querySelector("main, #content, .content");
    if (mainContent) {
      return mainContent.textContent.trim();
    }

    return "";
  }

  extractJobTitle() {
    // First try DOM selectors
    const selectors = [
      '[data-automation-id="jobPostingHeader"]',
      '[data-automation-id="jobTitle"]',
      "h1",
      ".job-title",
      '[data-testid="job-title"]',
      ".position-title",
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }

    // Try extracting from URL path
    // Example: /job/Software-Engineer_26WD94727 -> "Software Engineer"
    const url = window.location.href;
    const jobPathMatch = url.match(/\/job\/([^/?#]+)/);
    if (jobPathMatch && jobPathMatch[1]) {
      // Remove the job ID suffix (e.g., _26WD94727) and clean up
      let jobSlug = jobPathMatch[1];
      // Remove trailing job ID (underscore followed by alphanumeric ID)
      jobSlug = jobSlug.replace(/_[A-Z0-9]+$/i, "");
      // Replace hyphens with spaces
      jobSlug = jobSlug.replace(/-/g, " ");
      // Capitalize first letter of each word
      const cleanTitle = jobSlug
        .split(" ")
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
        )
        .join(" ");
      if (cleanTitle && cleanTitle.length > 2) {
        return cleanTitle;
      }
    }

    // Fallback to document title
    const titlePart = document.title.split(" - ")[0];
    if (titlePart && titlePart.length > 2 && titlePart !== "Apply") {
      return titlePart;
    }

    return "Job on Workday";
  }

  extractLocation() {
    // TODO: Update with actual Workday selectors
    const selectors = [
      '[data-automation-id="locations"]',
      '[data-automation-id="jobPostingLocation"]',
      ".job-location",
      ".location",
      '[data-testid="location"]',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }

    return "Not specified";
  }

  getJobProperties() {
    return {
      title: this.extractJobTitle(),
      company: this.extractCompanyFromUrl(window.location.href) || "Company",
      location: this.extractLocation(),
      description: this.extractJobDescription(),
      jobUrl: window.location.href,
    };
  }

  // ========================================
  // JOB MATCHING
  // ========================================

  async doesJobMatchPreferences(jobDetails) {
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
        title: jobDetails.title || "",
        company: jobDetails.company || "",
        location: jobDetails.location || "",
        description: jobDetails.description || "",
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
          },
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
          },
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
  // CO-PILOT ACTIONS
  // ========================================

  handleCoPilotAction(data) {
    try {
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

        case COPILOT_ACTIONS.SKIP:
          console.log("⏭️ User clicked skip");
          notifyStatus({
            type: "JOB_SKIPPED",
            data: { title: "this job" },
          });

          this.sendMessage({
            type: "APPLICATION_SKIPPED",
            data: {
              url: window.location.href,
              reason: "User clicked skip button",
              skipReason: "user_skip",
            },
          });

          if (this.isValidJobPage(window.location.href)) {
            setTimeout(() => {
              window.close();
            }, 1500);
          }
          break;

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
    } catch (error) {
      console.error("Error in handleCoPilotAction:", error);
    }
  }

  restoreModeButtons() {
    if (this.copilotState.isInCoPilotMode()) {
      updateStatusButtons("co-pilot-search");
    } else {
      updateStatusButtons("auto-pilot");
    }
  }

  // ========================================
  // UTILITIES
  // ========================================

  /**
   * Check if URL is a job details page (where we click Apply)
   * NOT the application form page
   */
  isValidJobPage(url) {
    if (!url.includes("myworkdayjobs.com")) {
      return false;
    }

    // Exclude application form pages - these have /apply/ in URL
    if (url.includes("/apply/") || url.includes("/apply?")) {
      return false;
    }

    // Must have /job/ in URL for job details
    return url.includes("/job/") || url.includes("/details/");
  }

  /**
   * Check if URL is an application form page (autofill, manual apply, etc.)
   */
  isApplicationFormPage(url) {
    return (
      url.includes("myworkdayjobs.com") &&
      (url.includes("/apply/autofillWithResume") ||
        url.includes("/apply/applyManually") ||
        url.includes("/apply/useMyLastApplication") ||
        url.includes("/apply?"))
    );
  }

  getApiHost() {
    return (
      this.sessionContext?.backendApiHost ||
      this.config.sessionContext?.backendApiHost ||
      this.config.backendApiHost
    );
  }

  getAiApiHost() {
    return (
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

  sendMessage(message) {
    try {
      chrome.runtime.sendMessage(message);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  cleanup() {
    console.log("🧹 Cleaning up Workday...");
    this.isRunning = false;
  }
}
