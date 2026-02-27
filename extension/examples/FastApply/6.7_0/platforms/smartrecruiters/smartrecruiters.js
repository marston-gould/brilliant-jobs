// platforms/smartrecruiters/smartrecruiters.js - SmartRecruiters platform automation
import { UrlUtils, DomUtils } from "../../shared/utilities/index.js";
import { domObserver } from "../../shared/utilities/dom-observer.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";
import Utils from "../../utils/utils.js";
import { SmartRecruitersFileHandler } from "./smartrecruiters-file-handler.js";
import { SmartRecruitersFormHandler } from "./smartrecruiters-form-handler.js";
import { AIService } from "../../services/index.js";

export default class SmartRecruitersPlatform {
  constructor(config) {
    this.config = config || {};
    this.platform = "smartrecruiters";
    this.baseUrl = "https://jobs.smartrecruiters.com";

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
        this.handleCoPilotAction({ action });
      }
    });
  }

  handleMessage(message) {
    const { type, data } = message;

    switch (type) {
      case "APPLICATION_STARTING":
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
    } else if (this.isOneClickFormPage(url)) {
      // Already on the application form page - process it directly
      await this.handleOneClickFormDirect();
    } else if (this.isValidJobPage(url)) {
      await this.startApplicationProcess();
    } else {
      this.sendMessage({
        type: "APPLICATION_SKIPPED",
        data: { url, reason: "Unknown page type" },
      });
    }
  }

  /**
   * Check if URL is a SmartRecruiters oneclick-ui form page
   * Example: https://jobs.smartrecruiters.com/oneclick-ui/company/Miratech1/publication/80e51f38-a0dc-42a4-945d-4ef455bda25e
   */
  isOneClickFormPage(url) {
    return url.includes("jobs.smartrecruiters.com/oneclick-ui/");
  }

  /**
   * Handle the oneclick-ui form page when we land on it directly
   */
  async handleOneClickFormDirect() {
    try {
      // Retrieve job data cached by startApplicationProcess before the page navigation
      try {
        const result = await chrome.storage.session.get("sr_job_cache");
        const cached = result?.sr_job_cache;
        if (cached) {
          this.cachedJobTitle = cached.title || "";
          this.cachedJobDescription = cached.description || "";
          this.cachedJobLocation = cached.location || "";
          this.cachedJobCompany = cached.company || "";
          this.cachedJobUrl = cached.jobUrl || "";
          // Clear cache after retrieval to avoid stale data
          await chrome.storage.session.remove("sr_job_cache");
        }
      } catch (error) {
        console.warn("Could not retrieve cached job data:", error);
      }

      // Fallback: extract what we can from the form page DOM
      if (!this.cachedJobTitle) this.cachedJobTitle = this.extractJobTitle();
      if (!this.cachedJobCompany)
        this.cachedJobCompany =
          this.extractCompany() ||
          this.extractCompanyFromUrl(window.location.href) ||
          "Company";
      if (!this.cachedJobUrl) this.cachedJobUrl = window.location.href;

      notifyStatus({
        type: "APPLYING_TO_JOB",
        data: { title: this.cachedJobTitle },
      });

      // Process the form
      await this.handleOneClickForm(this.cachedJobTitle);
    } catch (error) {
      this.handleApplicationError(error);
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
      document.querySelectorAll('a[href*="smartrecruiters.com"]')
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
    const allLinks = document.querySelectorAll(
      'a[href*="smartrecruiters.com"]'
    );
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
    // Handle oneclick-ui URL: /oneclick-ui/company/{Company}/publication/{id}
    const oneclickMatch = url.match(
      /oneclick-ui\/company\/([^/]+)/i
    );
    if (oneclickMatch) return oneclickMatch[1];

    // Standard job page URL: https://jobs.smartrecruiters.com/{company}/{jobId}
    const companyPattern = /jobs\.smartrecruiters\.com\/([^/]+)/i;
    const match = url.match(companyPattern);
    if (match && match[1] !== "oneclick-ui") return match[1];

    return null;
  }

  normalizeJobUrl(url) {
    let normalized = url.split("?")[0].replace(/\/$/, "");
    return normalized;
  }

  extractJobId(url) {
    // Strip query params first
    const cleanUrl = url.split("?")[0].replace(/\/$/, "");

    // oneclick-ui URL: .../publication/{uuid}/...
    const pubMatch = cleanUrl.match(/\/publication\/([a-f0-9-]+)/i);
    if (pubMatch) return pubMatch[1];

    // Standard job page URL: .../CompanyName/{numericId-slug}
    const parts = cleanUrl.split("/");
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
    }
  }

  markLinkByUrl(url, color, status) {
    try {
      const links = document.querySelectorAll('a[href*="smartrecruiters.com"]');
      for (const link of links) {
        if (link.href === url || link.href.includes(url)) {
          this.markLinkAsColor(link, color, status);
          break;
        }
      }
    } catch (error) {
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
      await Utils.delay(1500);

      // Cache ALL job data BEFORE clicking "I'm interested" —
      // the SPA navigates to the oneclick-ui form and the job description DOM is gone
      this.cachedJobTitle = this.extractJobTitle();
      this.cachedJobDescription = await this.waitForJobDescription();
      this.cachedJobLocation = this.extractLocation();
      this.cachedJobCompany = this.extractCompany();
      this.cachedJobUrl = window.location.href;

      notifyStatus({
        type: "APPLYING_TO_JOB",
        data: { title: this.cachedJobTitle },
      });

      // Check if job matches preferences
      if (
        this.config.config.preferences?.applyOnlyMatching ||
        this.config.config.preferences?.applyOnlyQualified
      ) {
        const jobDetails = {
          title: this.cachedJobTitle,
          company: this.cachedJobCompany,
          location: this.cachedJobLocation,
          description: this.cachedJobDescription,
          jobUrl: this.cachedJobUrl,
        };
        const matches = await this.doesJobMatchPreferences(jobDetails);
        if (!matches) {
          notifyStatus({
            type: "DOES_NOT_MATCH_PREFERENCES",
            data: {
              reason: this.reason,
              title: this.cachedJobTitle,
            },
          });

          await this.delay(5100);
          this.sendMessage({
            type: "APPLICATION_SKIPPED",
            data: {
              url: this.cachedJobUrl,
              title: this.cachedJobTitle,
              reason: this.reason || "Does not match preferences",
            },
          });

          return;
        }
      }

      // Persist job data in chrome.storage.session BEFORE clicking "I'm interested"
      // Clicking the button causes a full page navigation to oneclick-ui,
      // which kills this content script instance. A new instance on the form page
      // will retrieve this data in handleOneClickFormDirect().
      try {
        await chrome.storage.session.set({
          sr_job_cache: {
            title: this.cachedJobTitle,
            description: this.cachedJobDescription,
            location: this.cachedJobLocation,
            company: this.cachedJobCompany,
            jobUrl: this.cachedJobUrl,
          },
        });
      } catch (error) {
        console.warn("Could not cache job data:", error);
      }

      // Wait for "I'm interested" button to load and click it
      const buttonClicked = await this.waitForImInterestedButtonAndClick();

      if (!buttonClicked) {
        notifyStatus({
          type: "APPLICATION_ERROR",
          data: {
            message: "Could not find 'I'm interested' button on this page",
          },
        });

        this.sendMessage({
          type: "APPLICATION_SKIPPED",
          data: {
            url: this.cachedJobUrl,
            title: this.cachedJobTitle,
            reason: "Could not find 'I'm interested' button",
          },
        });
        return;
      }

      // If it's an SPA navigation (no page reload), handle the form directly
      await this.handleOneClickForm(this.cachedJobTitle);
    } catch (error) {
      this.handleApplicationError(error);
    }
  }

  /**
   * Initialize file and form handlers with current session data
   */
  initializeHandlers() {
    // Build enriched job description with job metadata for AI context
    const jobDescParts = [];
    if (this.cachedJobTitle && this.cachedJobTitle !== "Job on SmartRecruiters") jobDescParts.push(`Job Title: ${this.cachedJobTitle}`);
    if (this.cachedJobCompany && this.cachedJobCompany !== "Company") jobDescParts.push(`Company: ${this.cachedJobCompany}`);
    if (this.cachedJobLocation && this.cachedJobLocation !== "Not specified") jobDescParts.push(`Location: ${this.cachedJobLocation}`);
    if (this.cachedJobDescription) jobDescParts.push(`\nJob Description:\n${this.cachedJobDescription}`);
    const enrichedJobDescription = jobDescParts.length > 0 ? jobDescParts.join('\n') : this.cachedJobDescription || "";

    const handlerConfig = {
      preferences: this.config?.config?.preferences || {},
      backendApiHost: this.getApiHost(),
      aiApiHost: this.getAiApiHost(),
      jwtToken: this.getJwtToken(),
    };

    // Initialize file handler
    this.fileHandler = new SmartRecruitersFileHandler(handlerConfig);

    // Initialize form handler
    this.formHandler = new SmartRecruitersFormHandler({
      ...handlerConfig,
      userData: this.userProfile || {},
      jobDescription: enrichedJobDescription,
      aiService: this.getAIService(),
    });

  }

  /**
   * Get AI service for form handler
   * Uses the shared AIService class with proper endpoints
   */
  getAIService() {
    const aiApiHost = this.getAiApiHost();
    if (!aiApiHost) {
      return null;
    }

    return new AIService({
      aiApiHost: aiApiHost,
      platform: "smartrecruiters",
    });
  }

  /**
   * Handle the oneclick-ui form after clicking "I'm interested"
   * Processes multi-step forms by looping through each step
   */
  async handleOneClickForm(jobTitle) {
    try {
      // Wait for the oneclick-ui page to load
      await domObserver.waitForElement(
        "oc-resume-upload, oc-personal-information, form.oneclick-form, [data-test='application-form']",
        {
          timeout: 15000,
          checkVisibility: true,
        }
      );

      // Initialize handlers
      this.initializeHandlers();

      notifyStatus({ type: "COLLECTING_FIELDS" });
      await Utils.delay(500);

      // Find the form container
      const getFormContainer = () => {
        const form =
          document.querySelector("oc-application-form") ||
          document
            .querySelector(
              "form.oneclick-form, [data-test='application-form'], oc-personal-information"
            )
            ?.closest("form") ||
          document.querySelector("form");
        return form || document.body;
      };

      let formContainer = getFormContainer();

      // Step 1: Handle resume upload (only on first step)
      const preferences =
        this.sessionContext?.preferences ||
        this.config?.config?.preferences ||
        {};
      if (preferences.useCustomResume === true) {
        notifyStatus({ type: "TAILORING_RESUME" });
      } else {
        notifyStatus({ type: "UPLOADING_FILES" });
      }

      const jobId = this.extractJobId(this.cachedJobUrl || window.location.href);
      const resumeUploaded = await this.fileHandler.handleFileUploads(
        formContainer,
        this.userProfile,
        this.cachedJobDescription,
        jobTitle,
        jobId
      );

      if (resumeUploaded) {
      }

      // Wait for autofill or form to update
      await Utils.delay(2000);

      // Process form steps in a loop
      let stepIndex = 0;
      const maxSteps = 10; // Safety limit

      while (stepIndex < maxSteps) {
        // Re-get form container for each step (DOM may have changed)
        formContainer = getFormContainer();

        // Fill form fields for current step
        notifyStatus({ type: "FILLING_FORM" });

        const formFilled = await this.formHandler.fillFormFields(formContainer);

        if (formFilled) {
        }

        // Check for required checkboxes and auto-check them
        this.autoCheckRequiredCheckboxes();

        await Utils.delay(500);

        // Check if there's a Next button
        const nextButton = this.findNextButton();

        if (nextButton) {
          // In co-pilot mode, wait for user before advancing to next step
          if (this.copilotState.isInCoPilotMode()) {
            notifyStatus({
              type: "COPILOT_WAITING_FOR_NEXT",
              data: {
                title: jobTitle,
              },
            });
            const userAction = await this.formHandler.waitForUserAction();
            if (userAction === "SKIP") continue;
          }

          // Store current URL to detect navigation
          const initialUrl = window.location.href;

          // Wait for button to be clickable
          await this.waitForClickableButton(nextButton);

          // Scroll and click
          nextButton.scrollIntoView({ behavior: "smooth", block: "center" });
          await Utils.delay(300);
          nextButton.click();

          // Wait for navigation or DOM update
          const navigated = await this.waitForStepChange(initialUrl);

          if (!navigated) {
            const hasErrors = this.checkForValidationErrors();
            if (hasErrors) {
              await Utils.delay(1000);
              // Re-fill and try again
              continue;
            }
          }

          stepIndex++;
          await Utils.delay(1500); // Wait for new step to load
          continue;
        }

        // No Next button - check for Submit button
        const submitButton = this.findSubmitButton();

        if (submitButton) {
          // In co-pilot mode, wait for user
          if (this.copilotState.isInCoPilotMode()) {
            notifyStatus({
              type: "COPILOT_SUBMIT_READY",
              data: {
                title: jobTitle,
                message: "Form is ready. Please review and submit.",
              },
            });
            const userAction = await this.formHandler.waitForUserAction();
            if (userAction === "SKIP") continue;
          }

          // Auto-pilot: submit the application
          notifyStatus({ type: "SUBMITTING_APPLICATION" });
          await this.waitForClickableButton(submitButton);
          submitButton.scrollIntoView({ behavior: "smooth", block: "center" });
          await Utils.delay(500);
          submitButton.click();

          // SPA: poll for success page (URL changes to /success without reload)
          const successDetected = await this.waitForSuccessPage(15000);
          if (successDetected) {
            await this.handleSuccessfulSubmission();
          }
          return;
        }

        // Neither Next nor Submit found
        notifyStatus({
          type: "COPILOT_SUBMIT_READY",
          data: {
            title: jobTitle,
            message: "Could not find navigation buttons. Please submit manually.",
          },
        });
        return;
      }

    } catch (error) {
      this.handleApplicationError(error);
    }
  }

  /**
   * Find the Next button for multi-step forms
   */
  findNextButton() {
    // SmartRecruiters uses oc-button with data-test="footer-next"
    const selectors = [
      'oc-button[data-test="footer-next"]',
      'button[data-test="footer-next"]',
      '[data-test="footer-next"]',
      'oc-button[data-test="next"]',
      'button[data-test="next"]',
    ];

    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (button && this.isClickable(button)) {
        return button;
      }
    }

    // Fallback: search by text content
    const allButtons = document.querySelectorAll("oc-button, button");
    for (const btn of allButtons) {
      const text = btn.textContent?.trim().toLowerCase() || "";
      if (text === "next" || text === "continue") {
        if (this.isClickable(btn)) {
          return btn;
        }
      }
    }

    return null;
  }

  /**
   * Find the Submit button
   */
  findSubmitButton() {
    // SmartRecruiters uses oc-button with data-test="footer-submit"
    const selectors = [
      'oc-button[data-test="footer-submit"]',
      'button[data-test="footer-submit"]',
      '[data-test="footer-submit"]',
      'oc-button[data-test="submit"]',
      'button[type="submit"]',
    ];

    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (button && this.isClickable(button)) {
        return button;
      }
    }

    // Fallback: search by text content
    const submitTexts = ["submit", "apply", "submit application", "apply now"];
    const allButtons = document.querySelectorAll("oc-button, button");
    for (const btn of allButtons) {
      const text = btn.textContent?.trim().toLowerCase() || "";
      if (submitTexts.some((t) => text.includes(t))) {
        if (this.isClickable(btn)) {
          return btn;
        }
      }
    }

    return null;
  }

  /**
   * Wait for button to be clickable (not disabled)
   */
  async waitForClickableButton(button, timeout = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (button.disabled !== true && !button.hasAttribute("disabled")) {
        const innerButton = button.shadowRoot?.querySelector("button");
        if (!innerButton || (innerButton.disabled !== true && !innerButton.hasAttribute("disabled"))) {
          return true;
        }
      }
      await Utils.delay(200);
    }
    return false;
  }

  /**
   * Wait for step change (URL change or DOM update)
   */
  async waitForStepChange(initialUrl, timeout = 10000) {
    const startTime = Date.now();

    // First, wait a bit for any immediate changes
    await Utils.delay(1000);

    // Check for URL change
    if (window.location.href !== initialUrl) {
      return true;
    }

    // Poll for changes
    while (Date.now() - startTime < timeout) {
      if (window.location.href !== initialUrl) {
        return true;
      }

      // Also check if form content has changed (for SPA navigation)
      const formContainer = document.querySelector("oc-application-form");
      if (formContainer) {
        // Check if there are new visible form fields
        await Utils.delay(500);
        return true; // Assume success if form container exists
      }

      await Utils.delay(500);
    }

    return window.location.href !== initialUrl;
  }

  /**
   * Check for validation errors on the form
   */
  checkForValidationErrors() {
    const errorSelectors = [
      '[class*="error"]',
      '[class*="invalid"]',
      '[data-test*="error"]',
      ".validation-error",
      ".field-error",
    ];

    for (const selector of errorSelectors) {
      const errors = document.querySelectorAll(selector);
      for (const error of errors) {
        if (error.textContent?.trim() && this.isClickable(error)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Auto-check required checkboxes (consent, terms, etc.)
   */
  autoCheckRequiredCheckboxes() {
    const checkboxes = document.querySelectorAll('input[type="checkbox"][required]');
    checkboxes.forEach((checkbox) => {
      if (!checkbox.checked) {
        checkbox.click();
      }
    });
  }

  async handleSuccessfulSubmission() {
    let jobTitle = this.cachedJobTitle || "";
    let companyName = this.cachedJobCompany || "";

    // If no cached data, try to parse from the success page confirmation text
    // e.g. "Your application for Customer Success Manager (USA Remote) at Turnitin, LLC has been submitted"
    if (!jobTitle || !companyName) {
      const successText =
        document.querySelector('[data-test="success-page"] p')?.textContent ||
        document.querySelector("oc-success-page p")?.textContent ||
        "";

      const appMatch = successText.match(
        /application for\s+(.+?)\s+at\s+(.+?)\s+has been/i
      );
      if (appMatch) {
        if (!jobTitle) jobTitle = appMatch[1].trim();
        if (!companyName) companyName = appMatch[2].trim();
      }
    }

    // Final fallbacks
    if (!jobTitle) jobTitle = this.extractJobTitle();
    if (!companyName)
      companyName =
        this.extractCompanyFromUrl(window.location.href) || "Company";

    notifyStatus({
      type: "APPLICATION_SUBMITTED",
      data: { title: jobTitle },
    });

    const jobUrl = this.cachedJobUrl || window.location.href;
    const jobData = {
      jobId: this.extractJobId(jobUrl) || Utils.generateId("sr_"),
      title: jobTitle,
      company: companyName,
      location: this.cachedJobLocation || "Not specified",
      description: this.cachedJobDescription || "",
      jobUrl: jobUrl,
      platform: "smartrecruiters",
      appliedAt: Date.now(),
    };

    console.log("Job data:", jobData);

    this.sendMessage({
      type: "APPLICATION_COMPLETED",
      data: jobData,
    });

    if (jobUrl) {
      this.markLinkByUrl(jobUrl, "green", "Completed");
    }

    // Clear cached data for next application
    this.cachedJobTitle = null;
    this.cachedJobCompany = null;
    this.cachedJobLocation = null;
    this.cachedJobDescription = null;
    this.cachedJobUrl = null;
  }

  async handleSuccessPage() {
    // Reuse the same success extraction + notification logic
    await this.handleSuccessfulSubmission();

    await this.delay(2500);
    window.close();
  }

  isSuccessPage() {
    // Check URL for /success path
    if (window.location.href.includes("/success")) {
      return true;
    }

    // Check for SmartRecruiters success page elements
    const successIndicators = [
      "oc-success-page",
      '[data-test="success-page"]',
      '[data-test="success-page-confirmation"]',
      "oc-success-page-content",
    ];

    for (const selector of successIndicators) {
      if (document.querySelector(selector)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Poll for success page after submit (SPA - no page reload)
   * @param {number} timeout - Max wait time in ms
   * @returns {Promise<boolean>}
   */
  async waitForSuccessPage(timeout = 15000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (this.isSuccessPage()) {
        return true;
      }
      await Utils.delay(500);
    }
    return false;
  }

  handleApplicationError(error) {
    notifyStatus({ type: "APPLICATION_ERROR" });
    this.skipToNextJob(error.message || String(error));
  }

  /**
   * Skip current job and move to the next one.
   * Sends APPLICATION_SKIPPED message and closes the tab.
   */
  async skipToNextJob(reason) {
    const jobTitle = this.cachedJobTitle || this.extractJobTitle();

    notifyStatus({
      type: "JOB_SKIPPED",
      data: { title: jobTitle },
    });

    this.sendMessage({
      type: "APPLICATION_SKIPPED",
      data: {
        url: this.cachedJobUrl || window.location.href,
        title: jobTitle,
        reason: reason || "Submission failed",
        skipReason: "submission_failed",
      },
    });

    if (this.cachedJobUrl) {
      this.markLinkByUrl(this.cachedJobUrl, "orange", "Skipped");
    }

    await Utils.delay(2000);
    window.close();
  }

  /**
   * Find and click the SmartRecruiters "I'm interested" button
   * Button HTML: <a class="button button--primary button--huge js-oneclick button--block"
   *               data-sr-track="apply" id="st-apply" href="...oneclick-ui...">I'm interested</a>
   * @returns {Promise<boolean>} - True if button was found and clicked
   */
  async waitForImInterestedButtonAndClick() {
    // Try immediate lookup first - button is usually already in DOM
    const immediateButton = this.findImInterestedButton();
    if (immediateButton) {
      return this.clickImInterestedButton(immediateButton, "immediate lookup");
    }

    // If not found immediately, wait for DOM to be ready with short polling
    const maxAttempts = 30; // 3 seconds max (30 * 100ms)
    for (let i = 0; i < maxAttempts; i++) {
      await Utils.delay(100);
      const button = this.findImInterestedButton();
      if (button) {
        return this.clickImInterestedButton(button, `attempt ${i + 1}`);
      }
    }

    return false;
  }

  /**
   * Find the "I'm interested" button using multiple selectors
   * @returns {HTMLElement|null}
   */
  findImInterestedButton() {
    // Fast path: ID selector (most common)
    const byId = document.getElementById("st-apply");
    if (byId && this.isClickable(byId)) return byId;

    // Secondary selectors
    const selectors = [
      'a.js-oneclick[data-sr-track="apply"]',
      'a.button--primary[href*="oneclick-ui"]',
      '[data-sr-track="apply"]',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && this.isClickable(el)) return el;
    }

    // Text-based fallback
    const allClickables = document.querySelectorAll(
      "a.button, a.button--primary, button"
    );
    for (const el of allClickables) {
      const text = el.textContent.trim().toLowerCase();
      if (text.includes("i'm interested") || text.includes("im interested")) {
        if (this.isClickable(el)) return el;
      }
    }

    return null;
  }

  /**
   * Check if element is visible and clickable
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  isClickable(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
  }

  /**
   * Click the "I'm interested" button
   * @param {HTMLElement} button
   * @param {string} source - where button was found (for logging)
   * @returns {Promise<boolean>}
   */
  async clickImInterestedButton(button, source) {
    button.scrollIntoView({ behavior: "smooth", block: "center" });
    await Utils.delay(200);
    button.click();
    return true;
  }

  // ========================================
  // JOB DATA EXTRACTION
  // ========================================

  async waitForJobDescription(maxAttempts = 6, intervalMs = 1500) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const description = this.extractJobDescription();
      if (description && description.length > 50) {
        return description;
      }
      if (attempt < maxAttempts - 1) {
        await Utils.delay(intervalMs);
      }
    }
    return this.extractJobDescription();
  }

  extractJobDescription() {
    // SmartRecruiters uses itemprop="description" for the job description
    const descElement = document.querySelector('div[itemprop="description"]');
    if (descElement && descElement.textContent.trim().length > 50) {
      return descElement.textContent.trim();
    }

    // SmartRecruiters may use web components with shadow DOM for job description
    const jobDescHost = document.querySelector("spl-job-description");
    if (jobDescHost) {
      const shadowDesc = jobDescHost.shadowRoot?.querySelector(".c-spl-job-description, .c-spl-job-description__content, [class*='description']");
      if (shadowDesc && shadowDesc.textContent.trim().length > 50) {
        return shadowDesc.textContent.trim();
      }
      if (jobDescHost.textContent.trim().length > 50) {
        return jobDescHost.textContent.trim();
      }
    }

    // Check all spl-* web components for shadow DOM content
    const splComponents = document.querySelectorAll("[class*='spl-'] , [class*='job-description'], [data-test='job-description']");
    for (const comp of splComponents) {
      const shadowContent = comp.shadowRoot?.querySelector("[class*='description']");
      if (shadowContent && shadowContent.textContent.trim().length > 50) {
        return shadowContent.textContent.trim();
      }
    }

    // Fallback selectors
    const fallbacks = [
      ".job-description",
      '[data-test="job-description"]',
      ".description",
      ".job-details",
      '[class*="description"]',
    ];
    for (const selector of fallbacks) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim().length > 50) {
        return element.textContent.trim();
      }
    }

    const mainContent = document.querySelector("main, #content");
    if (mainContent && mainContent.textContent.trim().length > 50) {
      return mainContent.textContent.trim();
    }

    return "";
  }

  extractJobTitle() {
    // SmartRecruiters uses h1.job-title with itemprop="title"
    const titleEl = document.querySelector('h1.job-title[itemprop="title"]');
    if (titleEl?.textContent?.trim()) {
      return titleEl.textContent.trim();
    }

    // Fallback
    const h1 = document.querySelector("h1");
    if (h1?.textContent?.trim()) {
      return h1.textContent.trim();
    }

    return document.title.split(" - ")[0] || "Job on SmartRecruiters";
  }

  extractLocation() {
    // SmartRecruiters uses spl-job-location with .c-spl-job-location__place
    const locationHost = document.querySelector("spl-job-location");
    if (locationHost) {
      // Try shadow DOM
      const placeNode =
        locationHost.shadowRoot?.querySelector(".c-spl-job-location__place") ||
        locationHost.querySelector(".c-spl-job-location__place");
      if (placeNode?.textContent?.trim()) {
        return placeNode.textContent.trim();
      }
      if (locationHost.textContent?.trim()) {
        return locationHost.textContent.trim();
      }
    }

    // Fallback
    const fallbacks = [".job-location", ".location"];
    for (const selector of fallbacks) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim()) {
        return element.textContent.trim();
      }
    }

    return "Not specified";
  }

  /**
   * Extract company name from the job description page DOM
   */
  extractCompany() {
    // SmartRecruiters puts company info in .header-logo.logo
    const companyWrapper = document.querySelector(".header-logo.logo");
    if (companyWrapper) {
      const companyLink = companyWrapper.querySelector("a");
      const companyImg = companyWrapper.querySelector("img");

      const name =
        companyLink?.getAttribute("title")?.trim() ||
        companyLink?.textContent?.trim() ||
        companyImg?.getAttribute("alt")?.trim() ||
        companyWrapper.textContent?.trim() ||
        "";

      // Strip trailing " logo" from alt text
      if (name && name.toLowerCase().endsWith(" logo")) {
        return name.replace(/ logo$/i, "").trim();
      }
      if (name) return name;
    }

    return this.extractCompanyFromUrl(window.location.href) || "Company";
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
          if (this.formHandler) {
            this.formHandler.resolveUserAction?.(
              action === "NEXT" ? "NEXT" : "SUBMIT",
            );
          }
          break;

        case COPILOT_ACTIONS.TAKE_CONTROL:
          this.copilotState.takeManualControl?.();
          if (this.formHandler) {
            this.formHandler.userHasControl = true;
          }
          notifyStatus({
            type: "COPILOT_USER_HAS_CONTROL",
            data: { title: this.cachedJobTitle || "this job" },
          });
          updateStatusButtons("user-control");
          break;

        case COPILOT_ACTIONS.LET_AI_CONTINUE:
          this.copilotState.letAIContinue?.();
          if (this.formHandler) {
            this.formHandler.userHasControl = false;
            this.formHandler.resolveUserAction?.("LET_AI_CONTINUE");
          }
          notifyStatus({
            type: "AI_RESUMED_CONTROL",
            data: { title: this.cachedJobTitle || "this job" },
          });
          updateStatusButtons("co-pilot-filling");
          break;

        case COPILOT_ACTIONS.SKIP:
          notifyStatus({
            type: "JOB_SKIPPED",
            data: { title: this.cachedJobTitle || "this job" },
          });

          this.sendMessage({
            type: "APPLICATION_SKIPPED",
            data: {
              url: window.location.href,
              reason: "User clicked skip button",
              skipReason: "user_skip",
              jobTitle: this.cachedJobTitle || "Unknown job",
            },
          });

          if (this.isValidJobPage(window.location.href) || this.isOneClickFormPage(window.location.href)) {
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
      }
    } catch (error) {
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
    // SmartRecruiters job URL pattern: https://jobs.smartrecruiters.com/{company}/{jobId-slug}
    // Example: https://jobs.smartrecruiters.com/Dev2/743999950671370-lead-software-engineer-full-stack-java-python-angular-react-

    // Must be on jobs.smartrecruiters.com domain
    if (!url.includes("jobs.smartrecruiters.com")) {
      return false;
    }

    // Parse URL to check path structure
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);

      // Must have at least 2 path segments: company and job ID
      if (pathParts.length < 2) {
        return false;
      }

      // Job ID segment typically contains a numeric ID followed by job title slug
      // Example: 743999950671370-lead-software-engineer-full-stack-java-python-angular-react-
      const jobIdSegment = pathParts[1];

      // Check if job ID segment starts with numbers (SmartRecruiters job IDs are numeric)
      const hasNumericJobId = /^\d+/.test(jobIdSegment);

      return hasNumericJobId;
    } catch (e) {
      return false;
    }
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
    }
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  cleanup() {
    this.isRunning = false;
  }
}
