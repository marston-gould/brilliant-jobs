// platforms/rippling/rippling.js - Rippling ATS platform automation
import RipplingFormHandler from "./rippling-form-handler.js";
import RipplingFileHandler from "./rippling-file-handler.js";
import { UrlUtils, DomUtils } from "../../shared/utilities/index.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";
import Utils from "../../utils/utils.js";

export default class RipplingPlatform {
  constructor(config) {
    this.config = config || {};
    this.platform = "rippling";
    this.baseUrl = "https://ats.rippling.com";

    // Session context
    this.sessionContext = config?.sessionContext || null;
    this.sessionId = config?.sessionId || null;
    this.userId = config?.userId || null;
    this.userProfile = config?.userProfile || null;

    // Control state
    this.isRunning = false;
    this.isPaused = false;
    this.isProcessingApplication = false;

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
    this.currentJobUrl = null;

    // Job matching
    this.reason = "";
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  async initialize() {
    notifyStatus({ type: "AUTOMATION_STARTING" });

    if (this.sessionContext) {
      await this.setSessionContext(this.sessionContext);
    }

    this.setupMessageListeners();
  }

  setupMessageListeners() {
    // Listen for DOM events from the overlay
    document.addEventListener("copilot-control-action", (event) => {
      const { action } = event.detail || {};
      if (action) {
        console.log("🎮 Received copilot-control-action DOM event:", action);
        this.handleCoPilotAction({ action });
      }
    });

    // Listen for chrome.runtime messages from background script
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message) return true;

      if (message.type === "CONTROL_ACTION") {
        this.handleCoPilotAction({ action: message.action });
      } else if (message.type === "SEARCH_NEXT") {
        this.handleSearchNext(message.data);
      } else {
        this.handleMessage(message);
      }

      sendResponse({ received: true });
      return true;
    });
  }

  handleMessage(message) {
    const { type, data } = message;
    console.log("📥 Rippling handleMessage:", type, data);

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

      // Initialize file handler
      if (!this.fileHandler) {
        this.fileHandler = new RipplingFileHandler({
          backendApiHost: this.getApiHost(),
          aiApiHost: this.getAiApiHost(),
          jwtToken: this.getJwtToken(),
          preferences:
            sessionContext.preferences ||
            this.config?.config?.preferences,
        });
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
      console.error("❌ Error setting Rippling session context:", error);
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
      document.querySelectorAll('a[href*="rippling.com"]')
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
    const allLinks = document.querySelectorAll('a[href*="rippling.com"]');
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
    // Rippling URL format: https://ats.rippling.com/{company}/jobs/{jobId}
    const companyPattern = /ats\.rippling\.com\/([^/]+)/i;
    const match = url.match(companyPattern);
    return match ? match[1] : null;
  }

  normalizeJobUrl(url) {
    let normalized = url.split("?")[0].replace(/\/$/, "");
    return normalized;
  }

  extractJobId(url) {
    // Extract job ID from Rippling URL
    const jobPattern = /\/jobs\/([^/?]+)/i;
    const match = url.match(jobPattern);
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
      const links = document.querySelectorAll('a[href*="rippling.com"]');
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
      const jobTitle = this.extractJobTitle();

      notifyStatus({
        type: "APPLYING_TO_JOB",
        data: { title: jobTitle },
      });

      await Utils.delay(1500);

      // Extract job description
      const jobDescription = this.extractJobDescription();
      this.cachedJobDescription = jobDescription;

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

      // Navigate to apply page if not already there
      const currentUrl = window.location.href;
      if (!currentUrl.includes("/apply")) {
        const navigated = await this.navigateToApplyPage();
        if (!navigated) {
          throw new Error("Could not navigate to application form");
        }
        await Utils.delay(2000);
      }

      // Find the application form
      const form = await this.findApplicationForm();
      if (!form) {
        throw new Error("Cannot find application form");
      }

      await this.processApplicationForm(form, jobDescription);
    } catch (error) {
      console.error("Error in startApplicationProcess:", error);
      this.isProcessingApplication = false;
      this.handleApplicationError(error);
    }
  }

  // ========================================
  // APPLICATION FORM PROCESSING
  // ========================================

  async navigateToApplyPage() {
    try {
      // Try data-testid button first
      let applyButton = document.querySelector(
        'button[data-testid="Apply now"]'
      );

      // Fallback: text-based search
      if (!applyButton) {
        const buttons = document.querySelectorAll("button, a");
        for (const btn of buttons) {
          const text = (btn.textContent || "").trim().toLowerCase();
          if (
            text === "apply now" ||
            text === "apply" ||
            text === "apply for this job"
          ) {
            applyButton = btn;
            break;
          }
        }
      }

      if (!applyButton) {
        console.warn("⚠️ No Apply button found");
        return false;
      }

      console.log("🖱️ Clicking Apply button");
      applyButton.click();

      // Wait for navigation to /apply page
      await Utils.delay(2000);

      // Verify we're on the apply page
      if (window.location.href.includes("/apply")) {
        return true;
      }

      // Wait a bit more for SPA navigation
      await Utils.delay(3000);
      return window.location.href.includes("/apply");
    } catch (error) {
      console.error("Error navigating to apply page:", error);
      return false;
    }
  }

  async findApplicationForm() {
    const selectors = [
      "form",
      '[data-testid="application-form"]',
      '[role="form"]',
    ];

    for (const selector of selectors) {
      const form = await Utils.waitForElement(selector, 5000);
      if (form) return form.closest("form") || form;
    }

    return null;
  }

  async processApplicationForm(form, jobDescription) {
    if (this.isProcessingApplication) {
      console.log("⏭️ Already processing application - ignoring");
      return;
    }
    this.isProcessingApplication = true;

    try {
      notifyStatus({ type: "FILLING_FORM" });

      // Step 1: Initialize form handler
      if (!this.formHandler && this.userProfile) {
        this.formHandler = new RipplingFormHandler({
          host: this.getAiApiHost(),
          userData: this.userProfile,
          copilotMode: this.copilotState.isInCoPilotMode(),
          copilotState: this.copilotState,
        });
      }

      // Step 2: Update form handler context
      if (this.formHandler) {
        const jobDescParts = [];
        if (typeof jobDescription === "object") {
          if (jobDescription.title)
            jobDescParts.push(`Job Title: ${jobDescription.title}`);
          if (jobDescription.company)
            jobDescParts.push(`Company: ${jobDescription.company}`);
          if (jobDescription.location)
            jobDescParts.push(`Location: ${jobDescription.location}`);
          if (jobDescription.department)
            jobDescParts.push(`Department: ${jobDescription.department}`);
          if (jobDescription.fullDescription)
            jobDescParts.push(
              `\nJob Description:\n${jobDescription.fullDescription}`
            );
          this.formHandler.jobDescription = jobDescParts.join("\n");
          this.formHandler.currentJobTitle =
            jobDescription.title || document.title;
        } else {
          this.formHandler.jobDescription = jobDescription || "";
          this.formHandler.currentJobTitle = this.extractJobTitle();
        }
        this.formHandler.userData = this.userProfile;
      }

      // Step 3: Handle file uploads FIRST
      const preferences =
        this.sessionContext?.preferences ||
        this.config?.config?.preferences ||
        {};

      if (preferences.useCustomResume === true) {
        notifyStatus({ type: "TAILORING_RESUME" });
      } else {
        notifyStatus({ type: "UPLOADING_FILES" });
      }

      if (this.fileHandler && this.userProfile) {
        try {
          const jobDesc =
            typeof jobDescription === "object"
              ? jobDescription.fullDescription
              : jobDescription;
          const jobId =
            typeof jobDescription === "object"
              ? jobDescription.jobId
              : this.extractJobId(window.location.href);
          const jobTitle =
            typeof jobDescription === "object"
              ? jobDescription.title
              : this.extractJobTitle();

          await this.fileHandler.handleFileUploads(
            form,
            this.userProfile,
            jobDesc,
            jobId,
            jobTitle
          );
          console.log("✅ File uploads completed");
        } catch (error) {
          console.warn("⚠️ File upload warning:", error);
        }
      }
      await Utils.delay(500);

      // Step 4: Fill form fields AFTER file uploads
      notifyStatus({ type: "FILLING_FORM" });
      if (this.formHandler) {
        await this.formHandler.fillFormWithProfile(form, this.userProfile);
        console.log("✅ Form filling completed");
      }

      // Step 5: Submit the form
      notifyStatus({ type: "SUBMITTING_APPLICATION" });
      await Utils.delay(1000);

      // Wait for validation
      await Utils.delay(2000);

      if (!this.formHandler) {
        throw new Error("Form handler not initialized - cannot submit");
      }

      const submitted = await this.formHandler.submitForm(form);
      if (submitted === true) {
        // Wait for success page
        await Utils.delay(3000);
        if (this.isSuccessPage()) {
          await this.handleSuccessfulSubmission();
        } else {
          // Check after more time
          await Utils.delay(5000);
          if (this.isSuccessPage()) {
            await this.handleSuccessfulSubmission();
          }
        }
      } else if (submitted && submitted.reason === "user_skipped") {
        console.log("⏭️ User skipped submission");
        this.sendMessage({
          type: "APPLICATION_SKIPPED",
          data: {
            url: window.location.href,
            reason: "User skipped in co-pilot mode",
          },
        });
      }
    } catch (error) {
      console.error("❌ Error processing form:", error);
      throw error;
    } finally {
      this.isProcessingApplication = false;
    }
  }

  async handleSuccessfulSubmission() {
    console.log("✅ Application submitted successfully");

    const cached = this.cachedJobDescription || {};
    const jobTitle =
      (typeof cached === "object" ? cached.title : null) ||
      this.extractJobTitle();
    const companyName =
      (typeof cached === "object" ? cached.company : null) ||
      this.extractCompanyFromUrl(window.location.href) ||
      this.extractCompanyFromPage() ||
      "Company";

    this.isProcessingApplication = false;

    notifyStatus({
      type: "APPLICATION_SUBMITTED",
      data: { title: jobTitle },
    });

    const jobData = {
      jobId:
        (typeof cached === "object" ? cached.jobId : null) ||
        this.extractJobId(window.location.href) ||
        Utils.generateId("rp_"),
      title: jobTitle,
      company: companyName,
      location:
        (typeof cached === "object" ? cached.location : null) ||
        this.extractLocation(),
      description:
        (typeof cached === "object" ? cached.fullDescription : "") || "",
      jobUrl: window.location.href,
      platform: "rippling",
      department:
        (typeof cached === "object" ? cached.department : "") || "",
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
    console.log("🎉 Rippling success page detected!");

    const cached = this.cachedJobDescription || {};
    const jobTitle =
      (typeof cached === "object" ? cached.title : null) ||
      this.extractJobTitle();
    const companyName =
      (typeof cached === "object" ? cached.company : null) ||
      this.extractCompanyFromUrl(window.location.href) ||
      this.extractCompanyFromPage() ||
      "Company";

    const jobData = {
      jobId:
        (typeof cached === "object" ? cached.jobId : null) ||
        this.extractJobId(window.location.href),
      title: jobTitle,
      company: companyName,
      location:
        (typeof cached === "object" ? cached.location : null) ||
        this.extractLocation(),
      description:
        (typeof cached === "object" ? cached.fullDescription : "") || "",
      jobUrl: window.location.href,
      platform: "rippling",
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
    const url = window.location.href.toLowerCase();

    // URL-based detection
    if (
      url.includes("/thanks") ||
      url.includes("/confirmation") ||
      url.includes("/success") ||
      url.includes("/thank-you")
    ) {
      return true;
    }

    // Selector-based detection
    const successSelectors = [
      '[data-testid="success"]',
      '[data-testid="confirmation"]',
      ".application-success",
      ".confirmation-message",
    ];

    for (const selector of successSelectors) {
      if (document.querySelector(selector)) {
        return true;
      }
    }

    // Text-based detection
    const bodyText = (document.body?.textContent || "").toLowerCase();
    const successPhrases = [
      "thank you for applying",
      "thanks for applying",
      "application submitted",
      "application has been submitted",
      "successfully submitted",
      "we have received your application",
      "your application has been received",
    ];

    for (const phrase of successPhrases) {
      if (bodyText.includes(phrase)) {
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
    const result = {
      title: this.extractJobTitle(),
      company: this.extractCompanyFromUrl(window.location.href) || this.extractCompanyFromPage(),
      location: this.extractLocation(),
      department: this.extractDepartment(),
      fullDescription: "",
      jobId: this.extractJobId(window.location.href),
      jobUrl: window.location.href,
    };

    // Primary: Rippling's HTML preview container
    const htmlPreview = document.querySelector(".ATS_htmlPreview");
    if (htmlPreview && htmlPreview.textContent.trim()) {
      result.fullDescription = htmlPreview.textContent.trim();
      return result;
    }

    // Fallback selectors
    const descSelectors = [
      '[data-testid="job-description"]',
      ".job-description",
      ".description",
      ".job-details",
    ];

    for (const selector of descSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        result.fullDescription = element.textContent.trim();
        return result;
      }
    }

    // Last resort: main content area
    const mainContent = document.querySelector("main, #content, .content");
    if (mainContent) {
      result.fullDescription = mainContent.textContent.trim();
    }

    return result;
  }

  extractJobTitle() {
    // Primary: Rippling's job title heading
    const titleH2 = document.querySelector("h2.css-s0tsp0");
    if (titleH2 && titleH2.textContent.trim()) {
      return titleH2.textContent.trim();
    }

    // Fallback: breadcrumb last link
    const breadcrumbs = document.querySelectorAll(
      '[data-testid="breadcrumb"] a'
    );
    if (breadcrumbs.length > 1) {
      const lastBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
      if (lastBreadcrumb.textContent.trim()) {
        return lastBreadcrumb.textContent.trim();
      }
    }

    // Generic fallbacks
    const genericSelectors = [
      "h1",
      "h2",
      ".job-title",
      '[data-testid="job-title"]',
    ];
    for (const selector of genericSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }

    return document.title.split(" - ")[0] || "Job on Rippling";
  }

  extractLocation() {
    // Rippling metadata items with icons
    const metadataItems = document.querySelectorAll(".css-1jugqli");
    for (const item of metadataItems) {
      const icon = item.querySelector('[data-icon="LOCATION_OUTLINE"]');
      if (icon) {
        // Get text from parent/sibling
        const text = item.textContent?.trim();
        if (text) return text;
      }
    }

    // Generic fallbacks
    const selectors = [
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

  extractDepartment() {
    const metadataItems = document.querySelectorAll(".css-1jugqli");
    for (const item of metadataItems) {
      const icon = item.querySelector('[data-icon="DEPARTMENTS_OUTLINE"]');
      if (icon) {
        const text = item.textContent?.trim();
        if (text) return text;
      }
    }
    return "";
  }

  extractCompanyFromPage() {
    // Try breadcrumb first link (company name)
    const breadcrumbs = document.querySelectorAll(
      '[data-testid="breadcrumb"] a'
    );
    if (breadcrumbs.length > 0) {
      const text = breadcrumbs[0].textContent?.trim();
      if (text) return text;
    }
    return "";
  }

  getJobProperties() {
    const jobDesc = this.cachedJobDescription || this.extractJobDescription();
    if (typeof jobDesc === "object") {
      return {
        title: jobDesc.title || this.extractJobTitle(),
        company: jobDesc.company || this.extractCompanyFromUrl(window.location.href) || "Company",
        location: jobDesc.location || this.extractLocation(),
        description: jobDesc.fullDescription || "",
        jobUrl: window.location.href,
      };
    }
    return {
      title: this.extractJobTitle(),
      company: this.extractCompanyFromUrl(window.location.href) || "Company",
      location: this.extractLocation(),
      description: jobDesc || "",
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
          notifyStatus({
            type: "MODE_SWITCHED",
            data: { mode: "user-control" },
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
            type: "MODE_SWITCHED",
            data: { mode: "co-pilot" },
          });
          updateStatusButtons("co-pilot-search");
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
    return (
      url.includes("rippling.com") &&
      (url.includes("/jobs/") || url.includes("/apply"))
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
    console.log("🧹 Cleaning up Rippling...");
    this.isRunning = false;
  }
}
