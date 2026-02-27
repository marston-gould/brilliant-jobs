// platforms/breezy/breezy.js - Full orchestrator following Ashby pattern
import { BreezyFormHandler } from "./breezy-form-handler.js";
import BreezyFileHandler from "./breezy-file-handler.js";
import { UrlUtils, DomUtils } from "../../shared/utilities/index.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";
import Utils from "../../utils/utils.js";

export default class BreezyPlatform {
  constructor(config) {
    this.config = config || {};
    this.platform = "breezy";

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

    // Handlers
    this.fileHandler = null;
    this.formHandler = null;

    // Co-pilot state
    this.copilotState = new CoPilotState();

    // Job data cache
    this.cachedJobDescription = null;
    this.cachedJobTitle = null;
    this.currentJobUrl = null;
    this.currentJobId = null;

    // Job matching
    this.reason = "";

    // Search data
    this.searchData = null;

    // Finalization guard - prevents duplicate terminal messages
    // (e.g., APPLICATION_COMPLETED sent twice, or sent after APPLICATION_ERROR)
    this._finalized = false;

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
    console.log("📥 handleMessage:", type, data);

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

  // ========================================
  // SEARCH_NEXT HANDLER
  // ========================================

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
      console.error("❌ Error setting Breezy session context:", error);
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

    // // Check if this job was already finalized (prevents duplicate messages after page nav)
    // if (await this.isJobFinalized()) {
    //   console.log("⏹️ Job already finalized, skipping detectPageTypeAndStart");
    //   return;
    // }

    if (url.includes("google.com/search")) {
      await this.startSearchProcess();
    } else if (this.isApplyPage(url)) {
      await this.handleApplyPage();
    } else if (this.isSubmittedPage(url)) {
      await this.handleSuccess();
    } else if (this.isValidJobPage(url)) {
      await this.handleJobDescriptionPage();
    } else {
      await this.sendTerminalMessage({
        type: "APPLICATION_SKIPPED",
        data: { url, reason: "Unknown page type" },
      });
    }
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
      document.querySelectorAll('a[href*="breezy.hr"]'),
    );

    // Filter valid job pages and deduplicate by URL
    const seenUrls = new Set();
    return allLinks.filter((link) => {
      const url = link.href;
      if (!this.isValidJobPage(url)) {
        return false;
      }

      // Skip "Read more" links and similar non-primary job links
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

      // Normalize URL for deduplication (strip /apply suffix too)
      let normalizedUrl = this.normalizeJobUrl(url);
      if (seenUrls.has(normalizedUrl)) {
        return false;
      }
      seenUrls.add(normalizedUrl);
      return true;
    });
  }

  async openJob(linkElement, url) {
    linkElement.classList.add("fastapply-processed");

    // Mark ALL links with the same URL as processed to prevent duplicates
    const normalizedUrl = this.normalizeJobUrl(url);
    const allLinks = document.querySelectorAll('a[href*="breezy.hr"]');
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
        jobId: this.extractBreezyJobId(normalizedUrl),
        title: jobTitle,
        company: this.extractCompanyFromUrl(normalizedUrl),
        requestId: `req_${Date.now()}`,
      },
    });
  }

  extractCompanyFromUrl(url) {
    // Breezy URL format: https://{company}.breezy.hr/p/{jobId}
    const companyPattern = /\/\/([^.]+)\.breezy\.hr/i;
    const match = url.match(companyPattern);
    if (match && match[1] !== "app") {
      return match[1];
    }

    // Fallback: app.breezy.hr/jobs/{company}/{jobId}
    const appPattern = /app\.breezy\.hr\/jobs\/([^/]+)/i;
    const appMatch = url.match(appPattern);
    return appMatch ? appMatch[1] : null;
  }

  /**
   * Normalize Breezy job URL to always point to the job description page (not /apply)
   * This ensures we always land on the description page first to extract the JD
   * before navigating to /apply — same pattern as Ashby strips /application
   */
  normalizeJobUrl(url) {
    let normalized = url.split("?")[0].replace(/\/$/, "");
    // Strip /apply suffix so we always open the job description page first
    normalized = normalized.replace(/\/apply\/?$/, "");
    return normalized;
  }

  extractBreezyJobId(url) {
    // Match /p/{jobId} pattern
    const pPattern = /\/p\/([^/?\s]+)/i;
    const pMatch = url.match(pPattern);
    if (pMatch) return pMatch[1];

    // Match /jobs/{company}/{jobId} pattern
    const jobsPattern = /\/jobs\/[^/]+\/([^/?\s]+)/i;
    const jobsMatch = url.match(jobsPattern);
    if (jobsMatch) return jobsMatch[1];

    return null;
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
      const links = document.querySelectorAll('a[href*="breezy.hr"]');
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

  /**
   * Phase 1: Job Description Page (e.g. /p/xxx-senior-software-engineer)
   * Extracts the job description, checks preferences, caches it, then clicks "Apply To Position"
   */
  async handleJobDescriptionPage() {
    try {
      const jobTitle = this.extractJobTitle();
      this.cachedJobTitle = jobTitle;

      // Extract and cache jobId from URL
      const jobId = this.extractBreezyJobId(window.location.href);
      if (jobId) {
        this.currentJobId = jobId;
      }

      // Check if position is closed before doing anything else
      if (this.isPositionClosed()) {
        console.log("🚫 Position is closed, skipping...");
        await this.sendTerminalMessage({
          type: "APPLICATION_SKIPPED",
          data: {
            url: window.location.href,
            title: jobTitle,
            reason: "Position closed",
          },
        });
        return;
      }

      notifyStatus({
        type: "APPLYING_TO_JOB",
        data: { title: jobTitle },
      });

      // Wait for job description to render
      const jobDescription = await this.waitForJobDescription();
      this.cachedJobDescription = jobDescription;
      console.log(
        "📄 Job description extracted:",
        jobDescription ? `${jobDescription.substring(0, 100)}...` : "(empty)",
      );

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
          await this.sendTerminalMessage({
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

      // Cache job description in chrome.storage.session for the /apply page
      if (jobId) {
        try {
          await chrome.storage.session.set({
            [`breezy_jd_${jobId}`]: jobDescription,
          });
          console.log("💾 Job description cached for apply page");
        } catch (error) {
          console.warn("Could not cache job description:", error);
        }
      }

      await this.delay(1000);

      // Find and click the "Apply To Position" button to navigate to /apply
      const applyButton = this.findApplyButton();
      if (applyButton) {
        console.log("🖱️ Clicking 'Apply To Position' button");
        notifyStatus({ type: "COLLECTING_FIELDS" });
        applyButton.click();
      } else {
        // Fallback: navigate directly to the /apply URL
        const applyUrl = window.location.href.replace(/\/?$/, "/apply");
        console.log(
          "⚠️ Apply button not found, navigating directly to:",
          applyUrl,
        );
        window.location.href = applyUrl;
      }
    } catch (error) {
      console.error("Error on job description page:", error);
      await this.handleApplicationError(error);
    }
  }

  /**
   * Detect if the current Breezy position is closed / no longer accepting candidates
   */
  isPositionClosed() {
    const bodyText = document.body?.textContent?.toLowerCase() || "";
    return (
      bodyText.includes("position closed") ||
      bodyText.includes("no longer accepting candidates") ||
      bodyText.includes("no longer accepting applications") ||
      bodyText.includes("this position has been filled") ||
      bodyText.includes("position has been closed")
    );
  }

  /**
   * Find the "Apply To Position" button/link on the job description page
   */
  findApplyButton() {
    // Look for the specific Breezy "Apply To Position" link
    const selectors = [
      'a.apply[href*="/apply"]',
      'a[href*="/apply"].bzyButtonColor',
      'a[href*="/apply"].button',
      'a[href$="/apply"]',
      'a[href*="/apply"]',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }

    // Look for Angular apply buttons/links
    const ngSelectors = ['button[ng-click*="apply"]', 'a[ng-click*="apply"]'];
    for (const selector of ngSelectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }

    // Fallback: find any button or link with "apply" text
    const clickables = document.querySelectorAll("a, button");
    for (const el of clickables) {
      const text = el.textContent.toLowerCase().trim();
      if (
        text.includes("apply to position") ||
        text.includes("apply now") ||
        text.includes("apply for this") ||
        text === "apply"
      ) {
        return el;
      }
    }

    return null;
  }

  /**
   * Phase 2: Apply Page (e.g. /p/xxx-senior-software-engineer/apply)
   * Retrieves cached job description, finds the form, fills it, and submits
   */
  async handleApplyPage() {
    try {
      // Extract and cache jobId from URL
      const jobId = this.extractBreezyJobId(window.location.href);
      if (jobId && !this.currentJobId) {
        this.currentJobId = jobId;
      }

      // Use cached title from description page; fall back to extraction
      const jobTitle = this.cachedJobTitle || this.extractJobTitle();
      this.cachedJobTitle = jobTitle;

      notifyStatus({
        type: "APPLYING_TO_JOB",
        data: { title: jobTitle },
      });

      // Retrieve cached job description from chrome.storage.session
      let jobDescription = this.cachedJobDescription || "";

      if (!jobDescription && jobId) {
        try {
          const result = await chrome.storage.session.get(`breezy_jd_${jobId}`);
          jobDescription = result[`breezy_jd_${jobId}`] || "";
          console.log(
            "📄 Retrieved cached job description:",
            jobDescription
              ? `${jobDescription.substring(0, 100)}...`
              : "(empty)",
          );
        } catch (error) {
          console.warn("Could not retrieve cached job description:", error);
        }
      }

      // Fallback: try to extract from the apply page itself
      if (!jobDescription) {
        jobDescription = this.extractJobDescription();
      }

      this.cachedJobDescription = jobDescription;

      // Check if apply page also shows position closed
      if (this.isPositionClosed()) {
        console.log("🚫 Position is closed on apply page, skipping...");
        await this.sendTerminalMessage({
          type: "APPLICATION_SKIPPED",
          data: {
            url: window.location.href,
            title: jobTitle,
            reason: "Position closed",
          },
        });
        return;
      }

      // Wait for form to render (Angular needs time)
      await this.delay(2000);

      // Find application form with retry
      let form = this.findApplicationForm();
      if (!form) {
        // Retry after extra wait - Angular may still be bootstrapping
        await this.delay(3000);
        form = this.findApplicationForm();
      }
      if (!form) {
        throw new Error("Cannot find application form on apply page");
      }

      await this.processApplicationForm(form, jobDescription);
    } catch (error) {
      console.error("Error on apply page:", error);
      await this.handleApplicationError(error);
    }
  }

  findApplicationForm() {
    const breezySelectors = [
      "form.application-form",
      "form[ng-submit]",
      ".application-form",
      'form[action*="apply"]',
      'form[class*="apply"]',
      "form",
    ];

    for (const selector of breezySelectors) {
      const formContainer = document.querySelector(selector);
      if (formContainer) {
        return formContainer;
      }
    }

    return null;
  }

  async processApplicationForm(form, jobDescription) {
    try {
      notifyStatus({ type: "COLLECTING_FIELDS" });
      await Utils.delay(1000);

      // Ensure handlers are initialized
      if (!this.formHandler && this.userProfile) {
        this.formHandler = new BreezyFormHandler({
          host: this.getAiApiHost(),
          userData: this.userProfile,
          jobDescription: jobDescription,
          platform: this.platform,
          copilotMode: this.copilotState.isInCoPilotMode(),
          copilotState: this.copilotState,
        });
      }

      if (!this.fileHandler && this.userProfile) {
        this.fileHandler = new BreezyFileHandler({
          backendApiHost: this.getApiHost(),
          aiApiHost: this.getAiApiHost(),
          jwtToken: this.getJwtToken(),
          preferences:
            this.sessionContext?.preferences || this.config.config.preferences,
        });
      }

      // Update form handler
      if (this.formHandler) {
        this.formHandler.jobDescription = jobDescription;
        this.formHandler.userData = this.userProfile;
        this.formHandler.copilotMode = this.copilotState.isInCoPilotMode();
      }

      if (this.fileHandler && this.userProfile) {
        const preferences =
          this.sessionContext?.preferences ||
          this.config?.config?.preferences ||
          {};

        if (preferences.useCustomResume === true) {
          notifyStatus({ type: "TAILORING_RESUME" });
        } else {
          notifyStatus({ type: "UPLOADING_FILES" });
        }
        await Utils.delay(500);

        try {
          await this.fileHandler.handleFileUploads(
            form,
            this.userProfile,
            jobDescription,
            this.currentJobId,
            this.cachedJobTitle || this.extractJobTitle() || "",
          );
          await Utils.delay(3000);
        } catch (error) {
          console.warn("File upload warning:", error);
        }
      }

      // Fill form fields
      if (this.formHandler) {
        notifyStatus({ type: "FILLING_FORM" });
        await Utils.delay(500);

        // Build enriched job description with job metadata for AI context
        const jobDescParts = [];
        const enrichedJobTitle = this.cachedJobTitle || this.extractJobTitle();
        const company = this.extractCompanyFromUrl(window.location.href) || "";
        const location = this.extractLocation();
        if (enrichedJobTitle && enrichedJobTitle !== "Job on Breezy") jobDescParts.push(`Job Title: ${enrichedJobTitle}`);
        if (company) jobDescParts.push(`Company: ${company}`);
        if (location && location !== "Not specified") jobDescParts.push(`Location: ${location}`);
        if (jobDescription) jobDescParts.push(`\nJob Description:\n${jobDescription}`);
        const enrichedJobDescription = jobDescParts.join("\n");

        await this.formHandler.fillFormWithProfile(
          form,
          this.userProfile,
          enrichedJobDescription,
        );
      }

      notifyStatus({ type: "SUBMITTING_APPLICATION" });
      await Utils.delay(1000);

      // Submit form
      if (!this.formHandler) {
        throw new Error("Form handler not initialized - cannot submit");
      }

      await this.formHandler.submitAndVerify();
      await Utils.delay(2000);

      // Poll for submission status - wait up to 10s for success or failure
      const maxAttempts = 8;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const status = this.checkSubmissionStatus();
        console.log("Submission status:", status);

        if (status.isSuccess) {
          await this.handleSuccess();
          return;
        } else if (status.hasErrors) {
          const reason = status.errors.join(", ") || "Form submission failed";
          console.warn("⚠️ Submission failed, skipping to next job:", reason);
          await this.skipToNextJob(reason);
          return;
        }

        await Utils.delay(1000);
      }

      // After polling, no clear result - skip to next job
      console.warn("⚠️ Submission status unclear after polling, skipping to next job");
      await this.skipToNextJob("Submission status unclear - no success confirmation received");
    } catch (error) {
      console.error("Error processing form:", error);
      throw error;
    }
  }

  checkSubmissionStatus() {
    const status = {
      isSuccess: false,
      hasErrors: false,
      hasFailure: false,
      errors: [],
      failureMessage: "",
    };

    // Check 1: URL changed to /apply/submitted
    if (this.isSubmittedPage(window.location.href)) {
      status.isSuccess = true;
      return status;
    }

    // Check 2: Breezy's confirmed submission element (must be visible)
    const confirmed = document.querySelector(".application-confirmed");
    if (confirmed && confirmed.offsetParent !== null) {
      status.isSuccess = true;
      return status;
    }

    // Check for Breezy's Angular error container (e.g. "already applied")
    const errorContainer = document.querySelector(".error-container");
    if (errorContainer && errorContainer.offsetParent !== null) {
      const errorSpan = errorContainer.querySelector(".error");
      if (errorSpan && errorSpan.textContent.trim()) {
        status.hasErrors = true;
        status.errors.push(errorSpan.textContent.trim());
        return status;
      }
    }

    // Check for error indicators (only visible elements to avoid false positives)
    const errorSelectors = [
      ".error-message",
      ".form-error",
      ".validation-error",
    ];

    for (const selector of errorSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim() && el.offsetParent !== null) {
        status.hasErrors = true;
        status.errors.push(el.textContent.trim());
      }
    }

    return status;
  }

  /**
   * Single success handler for all success scenarios.
   * Called from polling (same page) or detectPageTypeAndStart (success page redirect).
   */
  async handleSuccess() {
    console.log("✅ Application submitted successfully");

    const jobData = await this.buildJobData();

    console.log("✅ Sending APPLICATION_COMPLETED:", jobData);
    await this.sendTerminalMessage({
      type: "APPLICATION_COMPLETED",
      data: jobData,
    });

    notifyStatus({
      type: "APPLICATION_SUBMITTED",
      data: { title: jobData.title },
    });

    try {
      if (jobData.jobUrl) {
        this.markLinkByUrl(jobData.jobUrl, "green", "Completed");
      }
    } catch (e) {
      // non-critical
    }

    // If we're on the submitted page, close the tab after a short delay
    if (this.isSubmittedPage(window.location.href)) {
      await this.delay(2500);
      window.close();
    }
  }

  /**
   * Build job data object for APPLICATION_COMPLETED.
   * Retrieves cached job description if not available in memory.
   */
  async buildJobData() {
    const jobTitle = this.extractJobTitle();
    const companyName =
      UrlUtils.extractCompanyFromUrl(window.location.href, "breezy") ||
      "Company on Breezy";

    let description = this.cachedJobDescription || "";
    if (!description) {
      const jobId =
        this.currentJobId || this.extractBreezyJobId(window.location.href);
      if (jobId) {
        try {
          const result = await chrome.storage.session.get(`breezy_jd_${jobId}`);
          description = result[`breezy_jd_${jobId}`] || "";
        } catch (e) {}
      }
    }
    if (!description) {
      description = this.extractJobDescription();
    }

    return {
      jobId:
        this.currentJobId ||
        this.extractBreezyJobId(window.location.href) ||
        Utils.generateId("breezy_"),
      title: jobTitle,
      company: companyName,
      location: this.extractLocation(),
      jobUrl: window.location.href,
      platform: "breezy",
      department: this.extractDepartment(),
      appliedAt: Date.now(),
      description,
    };
  }

  isSuccessPage() {
    // URL-based check: /apply/submitted is the definitive success page
    if (this.isSubmittedPage(window.location.href)) {
      return true;
    }

    // DOM-based check: Breezy's confirmed submission element (must be visible)
    const confirmed = document.querySelector(".application-confirmed");
    if (confirmed && confirmed.offsetParent !== null) {
      return true;
    }

    return false;
  }

  async handleApplicationError(error) {
    console.error("❌ Application error:", error);

    notifyStatus({ type: "APPLICATION_ERROR" });

    // Skip to next job on application error
    await this.skipToNextJob(error.message || String(error));
  }

  /**
   * Skip current job and move to the next one.
   * Sends APPLICATION_SKIPPED message and closes the tab.
   */
  async skipToNextJob(reason) {
    const jobTitle = this.extractJobTitle();

    notifyStatus({
      type: "JOB_SKIPPED",
      data: { title: jobTitle },
    });

    await this.sendTerminalMessage({
      type: "APPLICATION_SKIPPED",
      data: {
        url: window.location.href,
        title: jobTitle,
        reason: reason || "Submission failed",
        skipReason: "submission_failed",
      },
    });

    if (window.location.href.includes("breezy.hr")) {
      this.markLinkByUrl(window.location.href, "orange", "Skipped");
    }

    await this.delay(2000);
    window.close();
  }

  // ========================================
  // JOB DATA EXTRACTION
  // ========================================

  async waitForJobDescription(maxAttempts = 8, intervalMs = 1500) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const description = this.extractJobDescription();
      if (description && description.length > 50) {
        return description;
      }
      if (attempt < maxAttempts - 1) {
        await this.delay(intervalMs);
      }
    }
    return this.extractJobDescription();
  }

  extractJobDescription() {
    const breezyDescriptionSelectors = [
      ".job-description",
      ".position-description",
      ".description",
      '[class*="description"]',
      '[data-testid="job-description"]',
      ".job-details",
      ".job-posting-description",
    ];

    const description = DomUtils.extractText(breezyDescriptionSelectors);

    if (!description) {
      const mainContent = document.querySelector(
        "main, #content, .job-content, .position-content",
      );
      if (mainContent) {
        return mainContent.textContent.trim();
      }
    }

    return description || "";
  }

  extractJobTitle() {
    try {
      // Priority 1: Breezy-specific title selectors
      const titleSelectors = [
        "h1.position-title",
        "h1.job-title",
        ".position-title",
        ".job-title",
        "[data-testid='job-title']",
      ];

      for (const selector of titleSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }

      // Priority 2: First h1 that doesn't look like a status message
      const h1Elements = document.querySelectorAll("h1");
      for (const h1 of h1Elements) {
        const text = h1.textContent.trim();
        const lower = text.toLowerCase();
        // Skip status messages, success pages, form headings
        if (
          lower.includes("application submitted") ||
          lower.includes("thank you") ||
          lower.includes("apply for") ||
          lower.includes("apply to") ||
          lower.includes("your application") ||
          text.length < 3
        ) {
          continue;
        }
        return text;
      }

      // Priority 3: Extract from URL slug
      // e.g., /p/xxx-senior-software-engineer → "Senior Software Engineer"
      const titleFromUrl = this.extractTitleFromUrlSlug(window.location.href);
      if (titleFromUrl) return titleFromUrl;

      // Priority 4: Document title
      return document.title.split(" - ")[0] || "Job on Breezy";
    } catch (error) {
      return "Job on Breezy";
    }
  }

  /**
   * Extract a human-readable job title from the Breezy URL slug.
   * e.g., /p/abc123-senior-software-engineer/apply → "Senior Software Engineer"
   */
  extractTitleFromUrlSlug(url) {
    try {
      // Match /p/{id}-{slug} pattern
      const match = url.match(/\/p\/[a-f0-9]+-(.+?)(?:\/apply)?(?:\?|$)/i);
      if (match && match[1]) {
        // Convert slug to title case: "senior-software-engineer" → "Senior Software Engineer"
        return match[1]
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  extractLocation() {
    try {
      const locationSelectors = [
        ".job-location",
        ".position-location",
        ".location",
        '[class*="location"]',
        "[data-testid='location']",
      ];

      for (const selector of locationSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }

      return "Not specified";
    } catch (error) {
      return "Not specified";
    }
  }

  extractDepartment() {
    try {
      const deptSelectors = [
        ".job-department",
        ".position-department",
        ".department",
        '[class*="department"]',
      ];

      for (const selector of deptSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }

      return "";
    } catch (error) {
      return "";
    }
  }

  getJobProperties() {
    try {
      return {
        title: this.extractJobTitle(),
        company:
          UrlUtils.extractCompanyFromUrl(window.location.href, "breezy") ||
          "Company on Breezy",
        location: this.extractLocation(),
        salary: this.extractSalaryText(),
        type: this.extractJobType(),
        workMode: this.extractWorkMode(),
        department: this.extractDepartment(),
        description: this.extractJobDescription(),
        jobUrl: window.location.href,
      };
    } catch (error) {
      return {
        title: "Job on Breezy",
        company: "Company on Breezy",
        location: "Not specified",
        salary: "",
        type: "",
        workMode: "",
        department: "",
        description: "",
        jobUrl: window.location.href,
      };
    }
  }

  extractSalaryText() {
    try {
      const salarySelectors = [
        ".job-salary",
        ".position-salary",
        ".salary",
        '[class*="salary"]',
        '[class*="compensation"]',
      ];

      for (const selector of salarySelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }

      return "";
    } catch (error) {
      return "";
    }
  }

  extractJobType() {
    try {
      const typeSelectors = [
        ".job-type",
        ".position-type",
        ".employment-type",
        '[class*="type"]',
      ];

      for (const selector of typeSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          const text = element.textContent.trim().toLowerCase();
          if (
            text.includes("full") ||
            text.includes("part") ||
            text.includes("contract") ||
            text.includes("intern")
          ) {
            return text;
          }
        }
      }

      return "";
    } catch (error) {
      return "";
    }
  }

  extractWorkMode() {
    try {
      const modeSelectors = [
        ".work-mode",
        ".remote-status",
        '[class*="remote"]',
        '[class*="onsite"]',
        '[class*="hybrid"]',
      ];

      for (const selector of modeSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim().toLowerCase();
        }
      }

      return "";
    } catch (error) {
      return "";
    }
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

  async handleCoPilotAction(data) {
    try {
      const { action } = data || {};
      if (!action) return;

      console.log("🎮 Co-pilot action:", action);

      switch (action) {
        case COPILOT_ACTIONS.SWITCH_TO_COPILOT:
          this.copilotState.switchToCoPilot();
          if (this.formHandler) {
            this.formHandler.copilotMode = true;
          }
          notifyStatus({
            type: "MODE_SWITCHED",
            data: { mode: "co-pilot" },
          });
          updateStatusButtons("co-pilot-search");
          break;

        case COPILOT_ACTIONS.SWITCH_TO_AUTOPILOT:
          this.copilotState.switchToAutoPilot();
          if (this.formHandler) {
            this.formHandler.copilotMode = false;
          }
          notifyStatus({
            type: "MODE_SWITCHED",
            data: { mode: "auto-pilot" },
          });
          updateStatusButtons("auto-pilot");
          break;

        case COPILOT_ACTIONS.SUBMIT:
        case "NEXT":
          if (this.formHandler) {
            this.formHandler.resolveUserAction(
              action === "NEXT" ? "NEXT" : "SUBMIT",
            );
          }
          break;

        case COPILOT_ACTIONS.TAKE_CONTROL:
          console.log("✋ User taking manual control");
          this.copilotState.takeManualControl();
          if (this.formHandler) {
            this.formHandler.userHasControl = true;
          }
          notifyStatus({
            type: "COPILOT_USER_HAS_CONTROL",
            data: { title: this.formHandler?.currentJobTitle || "this job" },
          });
          updateStatusButtons("user-control");
          break;

        case COPILOT_ACTIONS.LET_AI_CONTINUE:
          console.log("🤖 User returning control to AI");
          this.copilotState.letAIContinue();
          if (this.formHandler) {
            this.formHandler.userHasControl = false;
            this.formHandler.resolveUserAction("LET_AI_CONTINUE");
          }
          notifyStatus({
            type: "AI_RESUMED_CONTROL",
            data: { title: this.formHandler?.currentJobTitle || "this job" },
          });
          updateStatusButtons("co-pilot-filling");
          break;

        case COPILOT_ACTIONS.SKIP:
          console.log("⏭️ User clicked skip");

          if (this.formHandler) {
            this.formHandler.resolveUserAction("SKIP");
          }

          notifyStatus({
            type: "JOB_SKIPPED",
            data: { title: this.formHandler?.currentJobTitle || "this job" },
          });

          await this.sendTerminalMessage({
            type: "APPLICATION_SKIPPED",
            data: {
              url: window.location.href,
              reason: "User clicked skip button",
              skipReason: "user_skip",
              jobTitle: this.formHandler?.currentJobTitle || "Unknown job",
            },
          });

          if (this.isApplicationPage(window.location.href)) {
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

  isValidJobPage(url) {
    // Breezy job pages: {company}.breezy.hr/p/{jobId} or app.breezy.hr/jobs/{company}/{jobId}
    // This matches both description pages and /apply pages
    return (
      url.includes("breezy.hr") &&
      (url.includes("/p/") || url.includes("/jobs/"))
    );
  }

  isApplyPage(url) {
    // The /apply sub-page where the actual application form lives
    // Must NOT match /apply/submitted (that's the success page)
    return url.includes("breezy.hr") && /\/p\/[^/]+\/apply\/?$/i.test(url);
  }

  isSubmittedPage(url) {
    return url.includes("breezy.hr") && /\/apply\/submitted/i.test(url);
  }

  isApplicationPage(url) {
    return url.includes("breezy.hr") && url.includes("/p/");
  }

  getApiHost() {
    return (
      this.sessionContext?.backendApiHost ||
      this.config.sessionContext?.backendApiHost ||
      this.config.backendApiHost ||
      this.sessionContext?.apiHost ||
      this.config.apiHost
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

  /**
   * Send a terminal message (APPLICATION_COMPLETED, APPLICATION_ERROR, APPLICATION_SKIPPED)
   * and mark the job as finalized to prevent duplicate messages.
   * After sending, closes the tab (unless it's the search tab).
   */
  async sendTerminalMessage(message) {
    if (this._finalized) {
      console.log(`⏹️ Already finalized, suppressing ${message.type}`);
      return;
    }
    this._finalized = true;
    await this.markJobFinalized();
    this.sendMessage(message);
  }

  /**
   * Mark the current job as finalized in chrome.storage.session.
   * This persists across same-tab navigations (content script reloads).
   */
  async markJobFinalized() {
    const jobId =
      this.currentJobId || this.extractBreezyJobId(window.location.href);
    if (jobId) {
      try {
        await chrome.storage.session.set({ [`breezy_fin_${jobId}`]: true });
      } catch (e) {
        // Non-critical
      }
    }
  }

  // /**
  //  * Check if the current job was already finalized (in a previous page load).
  //  * Returns true if a terminal message was already sent for this job.
  //  */
  // async isJobFinalized() {
  //   const jobId =
  //     this.currentJobId || this.extractBreezyJobId(window.location.href);
  //   if (!jobId) return false;
  //   try {
  //     const result = await chrome.storage.session.get(`breezy_fin_${jobId}`);
  //     return !!result[`breezy_fin_${jobId}`];
  //   } catch (e) {
  //     return false;
  //   }
  // }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  cleanup() {
    console.log("🧹 Cleaning up...");
    this.isRunning = false;
  }
}
