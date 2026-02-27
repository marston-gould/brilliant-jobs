// platforms/lever/lever.js - Clean implementation following Workable pattern
import LeverFormHandler from "./lever-form-handler.js";
import LeverFileHandler from "./lever-file-handler.js";
import { UrlUtils, DomUtils } from "../../shared/utilities/index.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";
import Utils from "../../utils/utils.js";

export default class LeverPlatform {
  constructor(config) {
    this.config = config || {};
    this.platform = "lever";
    this.baseUrl = "https://jobs.lever.co";

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

    // Job data
    this.currentJobUrl = null;
    this.isProcessingJob = false; // Guard against processing multiple jobs

    // Job matching
    this.reason = "";
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  async initialize() {
    if (this.sessionContext) {
      await this.setSessionContext(this.sessionContext);
    }

    this.setupMessageListeners();
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
        this.handleCoPilotAction({ action: message.action });
      } else if (message.type === "SEARCH_NEXT") {
        if (message.data.reason === "Already applied") {
          this.handleAlreadyApplied(message.data);
        }
        this.handleSearchNext(message.data);
      } else {
        this.handleMessage(message);
      }

      sendResponse({ success: true });
      return true;
    });
  }

  // ========================================
  // JOB DESCRIPTION STORAGE (localStorage)
  // ========================================

  saveJobDescription(jobDescription) {
    try {
      localStorage.setItem(
        "lever_jobDescription",
        JSON.stringify(jobDescription)
      );
    } catch (e) {
      console.warn("Could not save job description to localStorage:", e);
    }
  }

  getJobDescription() {
    try {
      const saved = localStorage.getItem("lever_jobDescription");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.warn("Could not get job description from localStorage:", e);
      return null;
    }
  }

  clearJobDescription() {
    try {
      localStorage.removeItem("lever_jobDescription");
    } catch (e) {
      // ignore
    }
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
        // Handle automation start signal from message-router
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
    // Reset processing flag - previous job is complete
    this.isProcessingJob = false;
    if (data.reason === "Already applied") {
      this.handleAlreadyApplied(data);
    } else if (data.reason === "Company blacklisted") {
      this.handleCompanyBlacklisted(data);
    } else if (data.reason === "Limit reached") {
      this.handleLimitReached(data);
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

    // Check for 404 page first
    if (this.is404Page()) {
      this.sendMessage({
        type: "APPLICATION_SKIPPED",
        data: { url, reason: "Job not found (404)" },
      });
      return;
    }

    if (url.includes("google.com/search")) {
      await this.startSearchProcess();
    } else if (this.isLeverThanksPage(url)) {
      await this.handleThanksPage();
    } else if (this.isApplicationPage(url)) {
      await this.startApplication();
    } else if (this.isValidJobPage(url)) {
      await this.navigateToApplicationAndStart();
    } else {
      this.sendMessage({
        type: "APPLICATION_SKIPPED",
        data: { url, reason: "Unknown page type" },
      });
    }
  }

  is404Page() {
    // Check for common 404 indicators on Lever pages
    const pageText = document.body?.textContent?.toLowerCase() || "";
    const title = document.title?.toLowerCase() || "";

    // Check for 404 in title or common "not found" messages
    if (title.includes("404") || title.includes("not found")) {
      return true;
    }

    // Check for specific Lever 404 content
    if (
      pageText.includes("page not found") ||
      pageText.includes("job not found") ||
      pageText.includes("this position has been filled") ||
      pageText.includes("this job is no longer available") ||
      pageText.includes("posting has been removed")
    ) {
      return true;
    }

    // Check for 404 element
    const notFoundEl = document.querySelector(
      ".not-found, .error-404, [data-qa='404']"
    );
    if (notFoundEl) {
      return true;
    }

    return false;
  }

  async startSearchProcess() {
    // Reset processing flag at start of search
    this.isProcessingJob = false;

    notifyStatus({
      type: "JOB_SEARCH_STARTED",
      data: { preferences: this.config.preferences || {} },
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

    // Prevent processing multiple jobs concurrently
    if (this.isProcessingJob) {
      console.log("⏳ Already processing a job, skipping findAndOpenNextJob");
      return;
    }

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
      document.querySelectorAll('a[href*="lever.co"]')
    );

    // Filter valid job pages and deduplicate by URL
    const seenUrls = new Set();
    return allLinks.filter((link) => {
      const url = link.href;
      const linkText = link.textContent?.toLowerCase().trim() || "";

      // Skip "Read more" and similar secondary links
      if (
        linkText === "read more" ||
        linkText === "learn more" ||
        linkText === "view details" ||
        linkText === "see more"
      ) {
        return false;
      }

      const isValid =
        this.isValidJobPage(url) ||
        /^https:\/\/jobs\.(eu\.)?lever\.co\/([^\/]*)\/([^\/]*)\/?(.*)$/.test(
          url
        );

      if (!isValid) {
        return false;
      }

      // Normalize URL for deduplication (remove trailing slash, query params, /apply suffix)
      const normalizedUrl = url
        .split("?")[0]
        .replace(/\/$/, "")
        .replace(/\/apply$/, "");

      if (seenUrls.has(normalizedUrl)) {
        return false;
      }
      seenUrls.add(normalizedUrl);
      return true;
    });
  }

  async openJob(linkElement, url) {
    // Set processing flag to prevent duplicate job openings
    this.isProcessingJob = true;

    linkElement.classList.add("fastapply-processed");

    const h3 = linkElement.querySelector("h3");
    const jobTitle = h3
      ? h3.textContent.trim()
      : linkElement.textContent.trim();

    // Normalize URL to remove /apply suffix (we want to open job page, not apply page)
    const normalizedUrl = url.replace(/\/apply\/?$/, "");

    this.markLinkAsColor(linkElement, "blue", "Processing");
    this.sendMessage({
      type: "START_APPLICATION",
      data: {
        url: normalizedUrl,
        jobId: this.extractLeverJobId(normalizedUrl),
        company: this.extractLeverCompany(normalizedUrl),
        title: jobTitle,
        requestId: `req_${Date.now()}`,
      },
    });
  }

  extractLeverCompany(url) {
    const match = url.match(/\/\/jobs\.(?:eu\.)?lever\.co\/([^\/]+)/);
    return match ? match[1] : null;
  }

  extractLeverJobId(url) {
    const match = url.match(/\/([a-f0-9-]{36})/);
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
      const links = document.querySelectorAll('a[href*="lever.co"]');
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

  async navigateToApplicationAndStart() {
    try {
      // Extract job ID from URL and set it for file uploads
      this.currentJobId = this.extractLeverJobId(window.location.href);

      // Extract job description from overview page first
      const jobDescription = await this.extractJobDescription();

      // Save to localStorage so it persists across page navigation
      this.saveJobDescription(jobDescription);
      // Check if job matches preferences

      if (
        this.config?.config?.preferences?.applyOnlyMatching ||
        this.config?.config?.preferences?.applyOnlyQualified
      ) {
        const matches = await this.doesJobMatchPreferences(jobDescription);
        if (!matches) {
          notifyStatus({
            type: "DOES_NOT_MATCH_PREFERENCES",
            data: {
              reason: this.reason,
              title: jobDescription.title,
            },
          });

          await this.delay(5100);
          this.sendMessage({
            type: "APPLICATION_SKIPPED",
            data: {
              url: window.location.href,
              title: jobDescription.title,
              reason: this.reason || "Does not match preferences",
            },
          });

          return;
        }
      }

      // Find and click Apply button
      const applyButton = this.findApplyButton();
      if (applyButton) {
        applyButton.click();
        await this.waitForApplicationPage();
        await this.startApplication();
      } else {
        // Direct to /apply URL
        const currentUrl = window.location.href;
        const applyUrl = currentUrl.includes("/apply")
          ? currentUrl
          : currentUrl.replace(/\/$/, "") + "/apply";

        if (applyUrl !== currentUrl) {
          window.location.href = applyUrl;
          await this.waitForPageLoad();
          await Utils.delay(2000);
          await this.startApplication();
        } else {
          await this.startApplication();
        }
      }
    } catch (error) {
      this.handleApplicationError(error);
    }
  }

  async startApplication() {
    try {
      // Ensure job ID is set (in case startApplication is called directly)
      if (!this.currentJobId) {
        this.currentJobId = this.extractLeverJobId(window.location.href);
      }

      // Get from localStorage or extract fresh
      const jobDetails =
        this.getJobDescription() || (await this.extractJobDescription());
      const jobTitle = jobDetails.title || document.title || "Job on Lever";

      notifyStatus({
        type: "APPLYING_TO_JOB",
        data: { title: jobTitle },
      });

      await Utils.delay(1000);

      const form = await this.findApplicationForm();

      if (!form) {
        throw new Error("Cannot find application form");
      }

      await this.processApplicationForm(form, jobDetails);
    } catch (error) {
      this.handleApplicationError(error);
    }
  }

  async findApplicationForm() {
    const selectors = [
      'form[action*="lever"]',
      'form[action*="apply"]',
      "form.application-form",
      "form#application-form",
      "form.lever-apply-form",
      "form",
    ];

    for (const selector of selectors) {
      const form = await Utils.waitForElement(selector, 2000);
      if (form) return form;
    }

    return null;
  }

  async processApplicationForm(form, jobDescription) {
    try {
      notifyStatus({ type: "COLLECTING_FIELDS" });
      await Utils.delay(1000);

      // Ensure handlers are initialized
      if (!this.formHandler && this.userProfile) {
        this.formHandler = new LeverFormHandler({
          host: this.getAiApiHost(),
          userData: this.userProfile,
          // statusOverlay removed - uses global overlay
          platform: this.platform,
          copilotMode: this.copilotState.isInCoPilotMode(),
          copilotState: this.copilotState,
        });
      }

      if (!this.fileHandler && this.userProfile) {
        this.fileHandler = new LeverFileHandler({
          backendApiHost: this.getApiHost(),
          aiApiHost: this.getAiApiHost(),
          jwtToken: this.getJwtToken(),
          preferences:
            this.sessionContext?.sessionContext?.preferences ||
            this.config.config.preferences,
        });
      }

      // Build enriched job description with job metadata for AI context
      if (this.formHandler) {
        const jobDescParts = [];
        if (jobDescription.title) jobDescParts.push(`Job Title: ${jobDescription.title}`);
        if (jobDescription.company) jobDescParts.push(`Company: ${jobDescription.company}`);
        if (jobDescription.location) jobDescParts.push(`Location: ${jobDescription.location}`);
        if (jobDescription.department) jobDescParts.push(`Department: ${jobDescription.department}`);
        if (jobDescription.commitment) jobDescParts.push(`Commitment: ${jobDescription.commitment}`);
        if (jobDescription.workplaceType) jobDescParts.push(`Workplace: ${jobDescription.workplaceType}`);
        if (jobDescription.fullDescription) jobDescParts.push(`\nJob Description:\n${jobDescription.fullDescription}`);
        const enrichedJobDescription = jobDescParts.join('\n');

        this.formHandler.jobDescription = enrichedJobDescription;
        this.formHandler.userData = this.userProfile;
        this.formHandler.currentJobTitle =
          jobDescription.title || document.title;
      }

      if (this.fileHandler && this.userProfile) {
        const preferences =
          this.sessionContext?.sessionContext?.preferences ||
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
            jobDescription.fullDescription,
            this.currentJobId,
            jobDescription.title || document.title || ""
          );
        } catch (error) {
          console.warn("File upload warning:", error);
        }
      }

      // Fill form fields
      if (this.formHandler) {
        notifyStatus({ type: "FILLING_FORM" });
        await Utils.delay(500);

        await this.formHandler.fillFormWithProfile(
          form,
          this.userProfile,
          jobDescription
        );
      }

      notifyStatus({ type: "SUBMITTING_APPLICATION" });
      await Utils.delay(1000);

      // Wait for validation
      await Utils.delay(2000);

      if (!this.formHandler) {
        throw new Error("Form handler not initialized - cannot submit");
      }

      const submitted = await this.formHandler.submitForm(form);

      if (submitted === true) {
        // Form was submitted - wait for redirect to /thanks page
        // The handleThanksPage() method will be triggered when the page navigates
        console.log("✅ Form submitted - waiting for redirect to thanks page");
        notifyStatus({
          type: "APPLICATION_SUBMITTED",
          data: { title: jobDescription.title || "Job" },
        });
        // Don't call handleSuccessfulSubmission here - let the thanks page detection handle it
      } else if (submitted === "CAPTCHA_PENDING") {
        console.log("⏸️ CAPTCHA pending - waiting for user");
      } else {
        throw new Error("Form submission failed");
      }
    } catch (error) {
      console.error("Error processing form:", error);
      throw error;
    }
  }

  async handleSuccessfulSubmission(jobDescription) {
    console.log("✅ Application submitted successfully");

    notifyStatus({
      type: "APPLICATION_SUBMITTED",
      data: { title: jobDescription.title || "Job" },
    });

    const jobData = {
      jobId:
        this.extractLeverJobId(window.location.href) ||
        Utils.generateId("lever_"),
      title: jobDescription.title || document.title || "Job on Lever",
      company: jobDescription.company || "Company on Lever",
      location: jobDescription.location || "Not specified",
      description: jobDescription.fullDescription || "",
      jobUrl: window.location.href.replace(/\/apply\/?$/, ""),
      platform: "lever",
      workplace: jobDescription.workplaceType,
      department: jobDescription.department,
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

  /**
   * Handle the thanks/confirmation page after successful application
   */
  async handleThanksPage() {
    console.log("🎉 Lever thanks page detected - application successful!");
    const jobDetails = this.extractJobDetailsFromPage();

    const url = window.location.href;
    const jobId = this.extractLeverJobId(url);

    const jobData = {
      jobId,
      title: jobDetails.title || "Job on Lever",
      company: jobDetails.company,
      location: jobDetails.location,
      description: this.getJobDescription()?.fullDescription || "",
      jobUrl: url.replace(/\/thanks$/, ""),
      salary: "Not specified",
      workplace: jobDetails.workplace,
      platform: "lever",
      appliedAt: new Date().toISOString(),
      status: "applied",
    };

    console.log("✅ Sending APPLICATION_COMPLETED:", jobData);

    this.sendMessage({
      type: "APPLICATION_COMPLETED",
      data: jobData,
    });

    notifyStatus({
      type: "APPLICATION_SUBMITTED",
      data: { title: jobDetails.title },
    });

    await this.delay(2500);
    window.close();
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

  async extractJobDescription() {
    try {
      const jobDescription = {
        title: DomUtils.extractText([
          ".posting-header h2",
          ".posting-headline h2",
          ".section h2",
          "h2",
        ]),
        location: DomUtils.extractText([
          ".posting-categories .location",
          ".location",
        ]),
        department: DomUtils.extractText([
          ".posting-categories .department",
          ".department",
        ]),
        commitment: DomUtils.extractText([
          ".posting-categories .commitment",
          ".commitment",
        ]),
        workplaceType: DomUtils.extractText([
          ".posting-categories .workplaceTypes",
          ".workplaceTypes",
        ]),
        company: UrlUtils.extractCompanyFromUrl(window.location.href, "lever"),
      };

      // Extract full description from Lever's data-qa selectors
      let fullDescription = "";

      // Main job description section
      const jobDescEl = document.querySelector('[data-qa="job-description"]');
      if (jobDescEl) {
        fullDescription += jobDescEl.textContent.trim();
      }

      // Closing description section
      const closingDescEl = document.querySelector(
        '[data-qa="closing-description"]'
      );
      if (closingDescEl) {
        fullDescription += "\n\n" + closingDescEl.textContent.trim();
      }

      // Fallback to older selectors if data-qa not found
      if (!fullDescription) {
        const fallbackEl = document.querySelector(
          ".posting-content, .posting-description, .job-description, .section-wrapper"
        );
        if (fallbackEl) {
          fullDescription = fallbackEl.textContent.trim();
        }
      }

      jobDescription.fullDescription = fullDescription;

      return jobDescription;
    } catch (error) {
      console.error("Error extracting job description:", error);
      return { title: document.title || "Job Position", fullDescription: "" };
    }
  }

  extractJobDetailsFromPage() {
    const details = {
      title: document.title || "Job on Lever",
      company:
        UrlUtils.extractCompanyFromUrl(window.location.href, "lever") ||
        "Company",
      location: "Not specified",
      department: "Not specified",
      commitment: "Not specified",
      workplace: "Not specified",
    };

    try {
      const titleElement = document.querySelector(".posting-headline h2");
      if (titleElement) {
        details.title = titleElement.textContent.trim();
      }

      const locationEl = document.querySelector(
        ".posting-categories .location"
      );
      if (locationEl) {
        details.location = locationEl.textContent.trim();
      }

      const departmentEl = document.querySelector(
        ".posting-categories .department"
      );
      if (departmentEl) {
        details.department = departmentEl.textContent
          .trim()
          .replace(/\s*\/\s*$/, "");
      }

      const workplaceEl = document.querySelector(
        ".posting-categories .workplaceTypes"
      );
      if (workplaceEl) {
        details.workplace = workplaceEl.textContent.trim();
      }
    } catch (error) {
      console.warn("Error extracting job details from page:", error);
    }

    return details;
  }

  // ========================================
  // JOB MATCHING
  // ========================================

  async doesJobMatchPreferences(jobInfo) {
    const preferences =
      this.sessionContext?.preferences || this.config?.preferences || {};
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
        description: jobInfo.fullDescription || jobInfo.description || "",
        salary: jobInfo.salary || "",
        jobType: jobInfo.type || "",
      };

      if (preferences.applyOnlyQualified) {
        const profileData = {
          name: `${this.userProfile?.firstName || ""} ${this.userProfile?.lastName || ""
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
              jobDescription:
                jobInfo.fullDescription || jobInfo.description || "",
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
              action === "NEXT" ? "NEXT" : "SUBMIT"
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
          // Guard against duplicate skip (button dispatches both DOM event + chrome.runtime message)
          if (this._skipInProgress) return;
          this._skipInProgress = true;
          setTimeout(() => { this._skipInProgress = false; }, 3000);

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
    // Global overlay - always available

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
    return /^https:\/\/jobs\.(eu\.)?lever\.co\/[^\/]+\/[^\/]+/.test(url);
  }

  isApplicationPage(url) {
    return url.includes("/apply") || url.includes("/application");
  }

  isLeverThanksPage(url) {
    return /^https:\/\/jobs\.(eu\.)?lever\.co\/[^\/]+\/[^\/]+\/thanks/.test(
      url
    );
  }

  findApplyButton() {
    const applySelectors = [
      'a[href*="/apply"]',
      "a.postings-btn",
      'a.button[href*="/apply"]',
      'a.btn[href*="/apply"]',
      'a[data-qa="btn-apply"]',
    ];

    for (const selector of applySelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (
          DomUtils.isElementVisible(element) &&
          (element.href?.includes("/apply") ||
            element.textContent.toLowerCase().includes("apply"))
        ) {
          return element;
        }
      }
    }

    return null;
  }

  async waitForApplicationPage(timeout = 10000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (window.location.href.includes("/apply")) {
        const form = await this.findApplicationForm();
        if (form) {
          return true;
        }
      }
      await this.delay(200);
    }

    throw new Error("Timeout waiting for application page to load");
  }

  async waitForPageLoad(timeout = 10000) {
    return new Promise((resolve) => {
      if (document.readyState === "complete") {
        resolve();
        return;
      }

      const timer = setTimeout(() => resolve(), timeout);

      window.addEventListener(
        "load",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
    });
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

  async setSessionContext(sessionContext) {
    this.sessionContext = sessionContext;

    if (sessionContext.sessionId) this.sessionId = sessionContext.sessionId;
    if (sessionContext.userId) this.userId = sessionContext.userId;
    if (sessionContext.userProfile)
      this.userProfile = sessionContext.userProfile;

    // Initialize hosts
    this.aiApiHost = this.getAiApiHost();
    this.backendApiHost = this.getApiHost();

    // Initialize handlers
    if (!this.formHandler && this.userProfile) {
      this.formHandler = new LeverFormHandler({
        host: this.aiApiHost,
        userData: this.userProfile,
        // statusOverlay removed - uses global overlay
        platform: this.platform,
        copilotMode: this.copilotState.isInCoPilotMode(),
        copilotState: this.copilotState,
      });
    } else if (this.userProfile) {
      this.formHandler.userData = this.userProfile;
    }

    if (!this.fileHandler && this.userProfile) {
      this.fileHandler = new LeverFileHandler({
        backendApiHost: this.backendApiHost,
        aiApiHost: this.aiApiHost,
        jwtToken: this.getJwtToken(),
        preferences:
          this.sessionContext?.sessionContext?.preferences ||
          this.config.config.preferences,
      });
    }

    // Load co-pilot mode preference
    if (sessionContext.preferences?.hasOwnProperty("copilotMode")) {
      if (sessionContext.preferences.copilotMode === true) {
        this.copilotState.switchToCoPilot();
        if (this.formHandler) {
          this.formHandler.copilotMode = true;
        }
        if (true) {
          // Global overlay
          updateStatusButtons("co-pilot-search");
        }
      } else {
        this.copilotState.switchToAutoPilot();
        if (this.formHandler) {
          this.formHandler.copilotMode = false;
        }
        if (true) {
          // Global overlay
          updateStatusButtons("auto-pilot");
        }
      }
    }
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
