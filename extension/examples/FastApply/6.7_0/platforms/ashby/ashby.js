// platforms/ashby/ashby.js - Clean implementation following Workable pattern
import { AshbyFormHandler } from "./ashby-form-handler.js";
import { AshbyFileHandler } from "./ashby-file-handler.js";
import { UrlUtils, DomUtils } from "../../shared/utilities/index.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";
import Utils from "../../utils/utils.js";

export default class AshbyPlatform {
  constructor(config) {
    this.config = config || {};
    this.platform = "ashby";
    this.baseUrl = "https://jobs.ashbyhq.com";

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

    // UI
    // Global overlay - no local instance needed

    // Co-pilot state
    this.copilotState = new CoPilotState();

    // Job data cache
    this.cachedJobDescription = null;
    this.currentJobUrl = null;

    // Job matching
    this.reason = "";

    // Listen for DOM events from the overlay (direct, more reliable)
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

  /**
   * CRITICAL: Handle SEARCH_NEXT - Opens next job
   */
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
      console.error("❌ Error setting Ashby session context:", error);
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

      this.restoreModeButtons();

      await Utils.delay(1000);
      await this.detectPageTypeAndStart();
    } catch (error) {
      notifyStatus({ type: "APPLICATION_ERROR" });
    }
  }

  async detectPageTypeAndStart() {
    const url = window.location.href;

    if (url.includes("google.com/search")) {
      await this.startSearchProcess();
    } else if (this.isSuccessPage()) {
      await this.handleSuccessPage();
    } else if (this.isValidJobPage(url)) {
      await this.startApplicationProcess();
    } else {
      this.sendMessage({
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
      document.querySelectorAll('a[href*="ashbyhq.com"]'),
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

      // Normalize URL for deduplication (remove trailing slash, query params, /application suffix)
      let normalizedUrl = url.split("?")[0].replace(/\/$/, "");
      normalizedUrl = normalizedUrl.replace(/\/application\/?$/, "");
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
    const allLinks = document.querySelectorAll('a[href*="ashbyhq.com"]');
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
    console.log({
      url: normalizedUrl,
      jobId: this.extractAshbyJobId(normalizedUrl),
      title: jobTitle,
      requestId: `req_${Date.now()}`,
    });
    this.sendMessage({
      type: "START_APPLICATION",
      data: {
        url: normalizedUrl,
        jobId: this.extractAshbyJobId(normalizedUrl),
        title: jobTitle,
        company: this.extractCompanyFromUrl(normalizedUrl),
        requestId: `req_${Date.now()}`,
      },
    });
  }

  extractCompanyFromUrl(url) {
    // Ashby URL format: https://jobs.ashbyhq.com/{company}/{jobId}
    const companyPattern = /jobs\.ashbyhq\.com\/([^/]+)/i;
    const match = url.match(companyPattern);
    return match ? match[1] : null;
  }

  /**
   * Normalize Ashby job URL to always point to the job page (not /application)
   * This ensures consistent behavior regardless of which URL Google returns
   */
  normalizeJobUrl(url) {
    let normalized = url.replace(/\/application\/?(\?|$)/, "$1");
    normalized = normalized.replace(/\/application\/?\?/, "?");
    return normalized;
  }

  extractAshbyJobId(url) {
    // Match UUID pattern in Ashby URLs (8-4-4-4-12 hex chars)
    const uuidPattern =
      /\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;
    const match = url.match(uuidPattern);
    return match ? match[1] : null;
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
      const links = document.querySelectorAll('a[href*="ashbyhq.com"]');
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
      this.currentJobId = this.extractAshbyJobId(window.location.href);
      const jobTitle = this.extractJobTitle();

      notifyStatus({
        type: "APPLYING_TO_JOB",
        data: { title: jobTitle },
      });

      // Ashby SPA only renders the active tab's content.
      // If page loaded on /application, the Overview tab (with the job description) is not in the DOM.
      // Navigate to Overview tab first to ensure the description is available.
      const isOnApplicationTab = window.location.href.includes("/application");
      if (isOnApplicationTab) {
        await this.navigateToOverviewTab();
      }

      // Wait for job description to render (Ashby loads async via React)
      const jobDescription = await this.waitForJobDescription();
      this.cachedJobDescription = jobDescription;
      console.log("📄 Job description extracted:", jobDescription ? `${jobDescription.substring(0, 100)}...` : "(empty)");

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

      await this.delay(2000);

      // Navigate to application tab
      const navigated = await this.navigateToApplicationTab();
      if (!navigated) {
        throw new Error("Could not navigate to application tab");
      }

      await Utils.delay(1000);

      const form = this.findApplicationForm();
      if (!form) {
        throw new Error("Cannot find application form");
      }

      await this.processApplicationForm(form, jobDescription);
    } catch (error) {
      console.error("Error in startApplicationProcess:", error);
      this.handleApplicationError(error);
    }
  }

  async navigateToApplicationTab() {
    try {
      const applicationTab =
        document.querySelector("#job-application-form") ||
        document.querySelector('a[href*="/application"]') ||
        document
          .querySelector(".ashby-job-posting-right-pane-application-tab")
          ?.closest("a") ||
        Array.from(document.querySelectorAll('a[role="tab"]')).find((tab) =>
          tab.textContent.toLowerCase().includes("application"),
        );

      if (!applicationTab) {
        return false;
      }

      applicationTab.click();
      await this.delay(2000);
      return true;
    } catch (error) {
      console.error("Error navigating to Application tab:", error);
      return false;
    }
  }

  async navigateToOverviewTab() {
    try {
      const overviewTab =
        document.querySelector("#overview-tab") ||
        Array.from(document.querySelectorAll('a[role="tab"]')).find((tab) =>
          tab.textContent.toLowerCase().includes("overview"),
        );

      if (overviewTab) {
        overviewTab.click();
        await this.delay(2000);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error navigating to Overview tab:", error);
      return false;
    }
  }

  findApplicationForm() {
    const ashbySelectors = [
      '[class*="_jobPostingForm_"]',
      ".ashby-application-form-container",
      ".ashby-application-form",
      'form[class*="ashby"]',
      'div[class*="jobPostingForm"]',
    ];

    for (const selector of ashbySelectors) {
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

      // Build enriched job description with job metadata for AI context
      const jobDescParts = [];
      const ashbyJobTitle = this.extractJobTitle();
      const ashbyCompany = UrlUtils.extractCompanyFromUrl(window.location.href, "ashby") || "";
      const ashbyLocation = this.extractLocation();
      const ashbyDepartment = this.extractDepartment();
      const ashbySalary = this.extractSalaryText();
      if (ashbyJobTitle && ashbyJobTitle !== "Job on Ashby") jobDescParts.push(`Job Title: ${ashbyJobTitle}`);
      if (ashbyCompany && ashbyCompany !== "Company on Ashby") jobDescParts.push(`Company: ${ashbyCompany}`);
      if (ashbyLocation && ashbyLocation !== "Not specified") jobDescParts.push(`Location: ${ashbyLocation}`);
      if (ashbySalary) jobDescParts.push(`Salary: ${ashbySalary}`);
      if (ashbyDepartment) jobDescParts.push(`Department: ${ashbyDepartment}`);
      if (jobDescription) jobDescParts.push(`\nJob Description:\n${jobDescription}`);
      const enrichedJobDescription = jobDescParts.length > 0 ? jobDescParts.join('\n') : jobDescription;

      // Ensure handlers are initialized
      if (!this.formHandler && this.userProfile) {
        this.formHandler = new AshbyFormHandler({
          host: this.getAiApiHost(),
          userData: this.userProfile,
          jobDescription: enrichedJobDescription,
          // statusOverlay removed - uses global overlay
          platform: this.platform,
          copilotMode: this.copilotState.isInCoPilotMode(),
          copilotState: this.copilotState,
        });
      }

      if (!this.fileHandler && this.userProfile) {
        this.fileHandler = new AshbyFileHandler({
          backendApiHost: this.getApiHost(),
          aiApiHost: this.getAiApiHost(),
          jwtToken: this.getJwtToken(),
          preferences:
            this.sessionContext?.preferences || this.config.config.preferences,
          // statusService removed - uses global overlay
        });
      }

      // Update form handler
      if (this.formHandler) {
        this.formHandler.jobDescription = enrichedJobDescription;
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
            this.extractJobTitle() || "",
          );
        } catch (error) {
          console.warn("File upload warning:", error);
        }
      }

      // Fill form fields
      if (this.formHandler) {
        notifyStatus({ type: "FILLING_FORM" });
        await Utils.delay(500);

        await this.formHandler.fillFormWithProfile(this.userProfile);
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

        if (status.isSuccess) {
          await this.handleSuccessfulSubmission(jobDescription);
          return;
        } else if (status.hasFailure || status.hasErrors) {
          const reason =
            status.failureMessage ||
            status.errors.join(", ") ||
            "Form submission failed";
          console.warn("⚠️ Submission failed, skipping to next job:", reason);
          await this.skipToNextJob(reason);
          return;
        }

        // Wait before next check
        await Utils.delay(1000);
      }

      // After polling, still no confirmation - skip to next job
      console.warn(
        "⚠️ Submission status unclear after polling, skipping to next job",
      );
      await this.skipToNextJob(
        "Submission status unclear - no success confirmation received",
      );
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

    // Check for success container
    const successContainer = document.querySelector(
      '.ashby-application-form-success-container[data-highlight="positive"]',
    );
    if (successContainer) {
      status.isSuccess = true;
      return status;
    }

    // Check for errors
    const errorsList = document.querySelector('ul[class*="_errors_"]');
    if (errorsList) {
      status.hasErrors = true;
      const errorItems = errorsList.querySelectorAll('li[class*="_error_"] p');
      status.errors = Array.from(errorItems).map((item) =>
        item.textContent.trim(),
      );
    }

    return status;
  }

  async handleSuccessfulSubmission(jobDescription) {
    console.log("✅ Application submitted successfully");

    const jobTitle = this.extractJobTitle();
    const companyName =
      UrlUtils.extractCompanyFromUrl(window.location.href, "ashby") ||
      "Company on Ashby";

    notifyStatus({
      type: "APPLICATION_SUBMITTED",
      data: { title: jobTitle },
    });

    const jobData = {
      jobId:
        this.extractAshbyJobId(window.location.href) ||
        Utils.generateId("ashby_"),
      title: jobTitle,
      company: companyName,
      location: this.extractLocation(),
      jobUrl: window.location.href,
      platform: "ashby",
      department: this.extractDepartment(),
      appliedAt: Date.now(),
      description: jobDescription,
    };

    console.log("✅ Sending APPLICATION_COMPLETED:", jobData);

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

  /**
   * Handle the success page after application
   */
  async handleSuccessPage() {
    console.log("🎉 Ashby success page detected - application successful!");

    const jobTitle = this.extractJobTitle();
    const companyName =
      UrlUtils.extractCompanyFromUrl(window.location.href, "ashby") ||
      "Company on Ashby";

    const jobData = {
      jobId: this.extractAshbyJobId(window.location.href),
      title: jobTitle,
      company: companyName,
      location: this.extractLocation(),
      jobUrl: window.location.href,
      platform: "ashby",
      department: this.extractDepartment(),
      appliedAt: new Date().toISOString(),
      status: "applied",
      description: this.cachedJobDescription || this.extractJobDescription(),
    };

    console.log("✅ Sending APPLICATION_COMPLETED:", jobData);

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
    const successContainer = document.querySelector(
      '.ashby-application-form-success-container[data-highlight="positive"]',
    );
    return !!successContainer;
  }

  handleApplicationError(error) {
    console.error("❌ Application error:", error);

    notifyStatus({ type: "APPLICATION_ERROR" });

    // Skip to next job on application error
    this.skipToNextJob(error.message || String(error));
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

    this.sendMessage({
      type: "APPLICATION_SKIPPED",
      data: {
        url: window.location.href,
        title: jobTitle,
        reason: reason || "Submission failed",
        skipReason: "submission_failed",
      },
    });

    if (window.location.href.includes("ashbyhq.com")) {
      this.markLinkByUrl(window.location.href, "orange", "Skipped");
    }

    await Utils.delay(2000);
    window.close();
  }

  // ========================================
  // JOB DATA EXTRACTION
  // ========================================

  /**
   * Poll for job description to appear in the DOM.
   * Ashby renders content async via React - a single extraction can miss it.
   */
  async waitForJobDescription(maxAttempts = 8, intervalMs = 1500) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const description = this.extractJobDescription();
      // Only accept descriptions that look like real content (not just a few words)
      if (description && description.length > 50) {
        return description;
      }
      if (attempt < maxAttempts - 1) {
        await this.delay(intervalMs);
      }
    }
    // Final attempt - return whatever we got, even if short
    return this.extractJobDescription();
  }

  extractJobDescription() {
    // Try CSS module partial class matches (Ashby uses hashed class names)
    const cssModuleSelectors = [
      '[class*="_descriptionText_"]',
      '[class*="_descriptionBody_"]',
      '[class*="_description_"][class*="_content_"]',
      '[class*="_richText_"]',
    ];

    for (const selector of cssModuleSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim().length > 50) {
          return el.textContent.trim();
        }
      } catch (e) { /* invalid selector, skip */ }
    }

    // Try stable Ashby class names
    const ashbyDescriptionSelectors = [
      ".ashby-job-posting-brief-description",
      ".ashby-job-posting-description",
      ".ashby-job-posting-overview",
      ".job-description",
      ".description",
      ".job-posting-description",
      '[data-testid="job-description"]',
      ".job-details",
    ];

    for (const selector of ashbyDescriptionSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim().length > 50) {
        return el.textContent.trim();
      }
    }

    // Try section-based extraction: look for sections with description-like content
    // Ashby pages use _section_ containers with _heading_ h2 elements
    const sections = document.querySelectorAll('[class*="_section_"]');
    const descriptionParts = [];
    for (const section of sections) {
      const heading = section.querySelector('h2[class*="_heading_"]');
      const headingText = heading?.textContent?.trim()?.toLowerCase() || "";
      // Skip metadata sections (Location, Department, etc.)
      if (["location", "department", "team", "compensation", "employment type"].includes(headingText)) {
        continue;
      }
      // Include sections with substantial content (description, about, responsibilities, etc.)
      const content = section.textContent?.trim();
      if (content && content.length > 100) {
        descriptionParts.push(content);
      }
    }
    if (descriptionParts.length > 0) {
      return descriptionParts.join("\n\n");
    }

    // Try broader CSS module containers that might hold description
    const broadSelectors = [
      '[class*="_description_"]',
      '[class*="_content_"][class*="_posting_"]',
      '[class*="_jobContent_"]',
    ];
    for (const selector of broadSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim().length > 100) {
          return el.textContent.trim();
        }
      } catch (e) { /* invalid selector, skip */ }
    }

    // Final fallback: look for the main content area
    const mainContent = document.querySelector(
      "main, #content, .job-content, .ashby-job-posting",
    );
    if (mainContent && mainContent.textContent.trim().length > 100) {
      return mainContent.textContent.trim();
    }

    // Last resort: use DomUtils
    return DomUtils.extractText([".ashby-job-posting-overview", ".job-description"]) || "";
  }

  extractJobTitle() {
    try {
      // Use the actual Ashby job title selector
      const titleElement = document.querySelector(
        'h1[class*="_title_"].ashby-job-posting-heading, h1.ashby-job-posting-heading',
      );
      if (titleElement && titleElement.textContent.trim()) {
        return titleElement.textContent.trim();
      }

      // Fallback to other selectors
      const fallbackSelectors = [
        "h1",
        ".job-title",
        "[data-testid='job-title']",
        ".ashby-job-posting-title",
      ];

      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }

      return document.title.split(" - ")[0] || "Job on Ashby";
    } catch (error) {
      return "Job on Ashby";
    }
  }

  extractLocation() {
    try {
      // Use the actual Ashby location selector
      const locationSections = document.querySelectorAll('[class*="_section_"]');
      for (const section of locationSections) {
        const heading = section.querySelector('h2[class*="_heading_"]');
        if (heading && heading.textContent.trim() === "Location") {
          const locationElement = section.querySelector("p");
          if (locationElement && locationElement.textContent.trim()) {
            return locationElement.textContent.trim();
          }
        }
      }

      // Fallback
      const fallbackSelectors = [
        ".job-location",
        ".location",
        "[data-testid='location']",
      ];

      for (const selector of fallbackSelectors) {
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
      const sections = document.querySelectorAll('[class*="_section_"]');
      for (const section of sections) {
        const heading = section.querySelector('h2[class*="_heading_"]');
        if (heading && heading.textContent.trim() === "Department") {
          const deptElement = section.querySelector("p");
          if (deptElement && deptElement.textContent.trim()) {
            return deptElement.textContent.trim();
          }
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
          UrlUtils.extractCompanyFromUrl(window.location.href, "ashby") ||
          "Company on Ashby",
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
        title: "Job on Ashby",
        company: "Company on Ashby",
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
      const compensationSummaries = document.querySelectorAll(
        'span[class*="_compensationTierSummary_"]',
      );
      if (compensationSummaries.length > 0) {
        const tiers = Array.from(compensationSummaries)
          .map((el) => el.textContent.trim())
          .filter(Boolean);
        if (tiers.length > 0) return tiers.join("; ");
      }
      return "";
    } catch (error) {
      return "";
    }
  }

  extractJobType() {
    try {
      const sections = document.querySelectorAll('[class*="_section_"]');
      for (const section of sections) {
        const heading = section.querySelector('h2[class*="_heading_"]');
        if (heading && heading.textContent.trim() === "Employment Type") {
          const typeElement = section.querySelector("p");
          if (typeElement && typeElement.textContent.trim()) {
            return typeElement.textContent.trim().toLowerCase();
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
      const sections = document.querySelectorAll('[class*="_section_"]');
      for (const section of sections) {
        const heading = section.querySelector('h2[class*="_heading_"]');
        if (heading && heading.textContent.trim() === "Location Type") {
          const modeElement = section.querySelector("p");
          if (modeElement && modeElement.textContent.trim()) {
            return modeElement.textContent.trim().toLowerCase();
          }
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

  handleCoPilotAction(data) {
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
          if (true) {
            // Global overlay
            notifyStatus({
              type: "MODE_SWITCHED",
              data: { mode: "co-pilot" },
            });
            updateStatusButtons("co-pilot-search");
          }
          break;

        case COPILOT_ACTIONS.SWITCH_TO_AUTOPILOT:
          this.copilotState.switchToAutoPilot();
          if (this.formHandler) {
            this.formHandler.copilotMode = false;
          }
          if (true) {
            // Global overlay
            notifyStatus({
              type: "MODE_SWITCHED",
              data: { mode: "auto-pilot" },
            });
            updateStatusButtons("auto-pilot");
          }
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
          if (true) {
            // Global overlay
            notifyStatus({
              type: "COPILOT_USER_HAS_CONTROL",
              data: { title: this.formHandler?.currentJobTitle || "this job" },
            });
            updateStatusButtons("user-control");
          }
          break;

        case COPILOT_ACTIONS.LET_AI_CONTINUE:
          console.log("🤖 User returning control to AI");
          this.copilotState.letAIContinue();
          if (this.formHandler) {
            this.formHandler.userHasControl = false;
            this.formHandler.resolveUserAction("LET_AI_CONTINUE");
          }
          if (true) {
            // Global overlay
            notifyStatus({
              type: "AI_RESUMED_CONTROL",
              data: { title: this.formHandler?.currentJobTitle || "this job" },
            });
            updateStatusButtons("co-pilot-filling");
          }
          break;

        case COPILOT_ACTIONS.SKIP:
          console.log("⏭️ User clicked skip");

          if (this.formHandler) {
            this.formHandler.resolveUserAction("SKIP");
          }

          if (true) {
            // Global overlay
            notifyStatus({
              type: "JOB_SKIPPED",
              data: { title: this.formHandler?.currentJobTitle || "this job" },
            });
          }

          this.sendMessage({
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
          if (true) {
            // Global overlay
            notifyStatus({ type: "AUTOMATION_PAUSED" });
          }
          break;

        case COPILOT_ACTIONS.RESUME:
          this.isPaused = false;
          if (true) {
            // Global overlay
            notifyStatus({ type: "AUTOMATION_RESUMED" });
          }
          break;

        default:
          console.warn("Unknown co-pilot action:", action);
      }
    } catch (error) {
      console.error("Error in handleCoPilotAction:", error);
    }
  }

  restoreModeButtons() {
    // Global overlay always available

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
    return (
      url.includes("ashbyhq.com") &&
      (url.includes("/jobs/") || url.match(/\/[a-f0-9-]{8,}/))
    );
  }

  isApplicationPage(url) {
    return url.includes("/application");
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

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  cleanup() {
    console.log("🧹 Cleaning up...");

    if (true) {
      // Global overlay
      // Global overlay - cleanup handled automatically
      // Global overlay - no local instance needed
    }

    this.isRunning = false;
  }
}
