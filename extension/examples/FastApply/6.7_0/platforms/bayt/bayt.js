// platforms/bayt/bayt.js
// Standalone Bayt platform - follows Workable architecture pattern

import BaytFormHandler from "./bayt-form-handler.js";
import BaytFileHandler from "./bayt-file-handler.js";
import { AIService } from "../../services/index.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";

import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";
import Utils from "../../utils/utils.js";

export default class BaytPlatform {
  constructor(config) {
    this.config = config || {};
    this.platform = "bayt";
    this.baseUrl = "https://www.bayt.com";

    // Session context
    this.sessionContext = config?.sessionContext || null;
    this.sessionId = config?.sessionId || null;
    this.userId = config?.userId || null;
    this.userProfile = config?.userProfile || null;

    // State
    this.isRunning = false;
    this.isPaused = false;
    this.appliedJobs = new Set();

    // Processing guards - prevent duplicate processing
    this.isProcessingApplication = false;
    this.hasStartedAutomation = false;
    this.isSearchingJobs = false;

    // API hosts and services - initialized via sessionContext
    this.aiApiHost = null;
    this.backendApiHost = null;
    this.jwtToken = null;

    // Services
    this.aiService = null;
    this.fileHandler = null;
    this.formHandler = null;

    // Co-pilot
    this.copilotState = new CoPilotState();
    this.copilotMode = false;
    this.userActionResolver = null;

    // Job data
    this.currentJobUrl = null;
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  async initialize() {
    console.log("🌍 Initializing Bayt platform");

    // Global overlay is managed by content-status-overlay.js
    // Initial notification to show overlay
    notifyStatus({ type: "AUTOMATION_STARTING" });

    // Apply session context preferences (including co-pilot mode)
    if (this.sessionContext) {
      await this.setSessionContext(this.sessionContext);
    }

    this.setupMessageListeners();
    console.log("✅ Bayt platform initialized");
  }

  /**
   * Ensure overlay is shown - triggers global overlay
   */
  ensureOverlay() {
    // Global overlay is managed by content-status-overlay.js
    notifyStatus({ type: "FILLING_FORM" });
  }

  async setSessionContext(sessionContext) {
    this.sessionContext = sessionContext;

    // Extract hosts from sessionContext
    this.aiApiHost =
      sessionContext.aiApiHost || sessionContext.sessionConfig?.aiApiHost;
    this.backendApiHost =
      sessionContext.backendApiHost ||
      sessionContext.sessionConfig?.backendApiHost;
    this.jwtToken =
      sessionContext.jwtToken || sessionContext.sessionConfig?.jwtToken;
    this.userProfile = sessionContext.userProfile || this.userProfile;

    // Initialize AI service
    this.aiService = new AIService({ apiHost: this.aiApiHost });

    // Initialize file handler
    this.fileHandler = new BaytFileHandler({
      preferences: sessionContext.preferences,
      backendApiHost: this.backendApiHost,
      aiApiHost: this.aiApiHost,
      jwtToken: this.jwtToken,
    });

    // Initialize form handler
    this.formHandler = new BaytFormHandler({
      host: this.aiApiHost,
      userData: this.userProfile,
      jobDescription: "",
      copilotMode: this.copilotMode,
    });

    // Co-pilot mode
    const preferences =
      sessionContext.preferences ||
      sessionContext.sessionConfig?.preferences ||
      {};
    this.copilotMode = preferences.coPilotMode === true;

    if (this.copilotMode) {
      console.log("🔒 Co-pilot mode enabled for Bayt");
    }
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

      case "LIMIT_REACHED":
        this.handleLimitReached(data);
        break;

      case "COMPANY_BLACKLISTED":
        this.handleCompanyBlacklisted(data);
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
        // Guard: If already started automation via start(), ignore this message
        if (this.hasStartedAutomation) {
          console.log(
            "⏭️ Ignoring START_AUTOMATION_NOW - automation already started via start()"
          );
          break;
        }
        // Guard: If already processing an application, ignore
        if (this.isProcessingApplication) {
          console.log(
            "⏭️ Ignoring START_AUTOMATION_NOW - already processing application"
          );
          break;
        }
        // Ensure overlay exists when automation starts in new tab
        this.ensureOverlay();
        if (data?.jobId) {
          this.currentJobId = data.jobId;
        }
        // Start the application process
        this.handleJobDetailPage();
        break;

      case "COPILOT_ACTION":
        this.handleCoPilotAction(data);
        break;

      default:
        break;
    }
  }

  handleSearchNext(data) {
    console.log("🔄 Bayt SEARCH_NEXT received");
    // Mark the previous job based on status from SEARCH_NEXT data
    if (data && data.url) {
      const status = data.status;
      const reason = data.reason || "";

      if (status === "SUCCESS") {
        this.markLinkByUrl(data.url, "green", "✓ Applied");
      } else if (
        status === "SKIPPED" &&
        reason.toLowerCase().includes("already")
      ) {
        this.markLinkByUrl(data.url, "orange", "Already Applied");
      } else if (status === "SKIPPED") {
        this.markLinkByUrl(data.url, "orange", "Skipped");
      } else if (status === "ERROR") {
        this.markLinkByUrl(data.url, "red", "Error");
      }
    }
    // Display status overlay based on reason
    if (data?.reason === "Already applied") {
      this.handleAlreadyApplied(data);
    } else if (data?.reason === "Company blacklisted") {
      this.handleCompanyBlacklisted(data);
    } else if (data?.reason === "Limit reached") {
      this.handleLimitReached(data);
    }
    setTimeout(() => this.findAndOpenNextJob(), 500);
  }

  handleAlreadyApplied(data) {
    notifyStatus({
      type: "ALREADY_APPLIED",
      data: { title: data?.title || "Job" },
    });
    if (data?.url) {
      this.markLinkByUrl(data.url, "orange", "Already Applied");
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

  handleCoPilotAction(data) {
    const action = data?.action;
    console.log("🎮 Bayt Co-pilot action:", action);

    switch (action) {
      case COPILOT_ACTIONS.SUBMIT:
      case COPILOT_ACTIONS.NEXT:
        if (this.userActionResolver) {
          this.userActionResolver(action);
          this.userActionResolver = null;
        }
        break;
      case COPILOT_ACTIONS.SKIP:
        if (this.userActionResolver) {
          this.userActionResolver("SKIP");
          this.userActionResolver = null;
        }
        break;
      case COPILOT_ACTIONS.SWITCH_TO_AUTOPILOT:
        this.copilotMode = false;
        notifyStatus({ type: "SWITCHED_TO_AUTOPILOT" });
        break;
      case COPILOT_ACTIONS.SWITCH_TO_COPILOT:
        this.copilotMode = true;
        notifyStatus({ type: "SWITCHED_TO_COPILOT" });
        break;
    }
  }

  waitForUserAction() {
    return new Promise((resolve) => {
      this.userActionResolver = resolve;
    });
  }

  // ========================================
  // START AUTOMATION
  // ========================================

  async start(params = {}) {
    // Guard: Prevent duplicate start calls
    if (this.hasStartedAutomation) {
      console.log(
        "⏭️ start() called but automation already started - ignoring"
      );
      return;
    }
    this.hasStartedAutomation = true;

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

      // Check login status
      const isLoggedIn = await this.checkLoginStatus();
      if (!isLoggedIn) {
        notifyStatus({
          type: "LOGIN_REQUIRED",
          data: { message: "Please log in to Bayt.com" },
        });
        return;
      }

      await this.detectPageTypeAndStart();
    } catch (error) {
      console.error("❌ Failed to start Bayt automation:", error);
      notifyStatus({ type: "APPLICATION_ERROR" });
      this.hasStartedAutomation = false;
    }
  }

  async checkLoginStatus() {
    // Check for login/register buttons (presence means NOT logged in)
    const loginRegisterContainer = document.querySelector(
      "li.is-group ul.list.is-inline.is-basic"
    );
    if (loginRegisterContainer) {
      const hasLoginLink =
        loginRegisterContainer.querySelector('a[href*="/login"]');
      const hasRegisterLink = loginRegisterContainer.querySelector(
        'a[href*="/register"]'
      );
      if (hasLoginLink && hasRegisterLink) {
        console.log("User is NOT logged in");
        return false;
      }
    }

    // Check for user profile elements
    const userProfile = document.querySelector(
      ".user-menu, .profile-menu, [data-user-menu]"
    );
    if (userProfile) {
      console.log("User is logged in");
      return true;
    }

    console.log("Login status unclear, assuming logged in");
    return true;
  }

  async detectPageTypeAndStart() {
    const url = window.location.href;

    // Applied success page: bayt.com/en/job/applied/?jb_id=...
    if (this.isAppliedSuccessPage(url)) {
      await this.handleAppliedSuccessPage();
      return;
    }

    if (this.isJobListingPage(url)) {
      await this.startJobListingProcess();
    } else if (this.isApplicationPage(url)) {
      await this.handleApplicationPage();
    }
  }

  /**
   * Check if URL is the applied success page
   * Pattern: bayt.com/en/job/applied/?jb_id=...
   */
  isAppliedSuccessPage(url) {
    return url.includes("bayt.com") && url.includes("/job/applied/");
  }

  /**
   * Check if URL is a job listing/results page
   * Pattern: bayt.com/en/{country}/jobs/{keyword}-jobs/
   */
  isJobListingPage(url) {
    return /bayt\.com\/en\/[^\/]+\/jobs\/[^\/]+-jobs/.test(url);
  }

  isValidJobPage(url) {
    // Bayt job URLs end with a number followed by slash: /jobs/job-title-73791437/
    return (
      url.includes("bayt.com/en/") &&
      url.includes("/jobs/") &&
      /-\d+\/?$/.test(url)
    );
  }

  isApplicationPage(url) {
    return (
      url.includes("bayt.com") &&
      (url.includes("/apply") || url.includes("/application"))
    );
  }

  findAllJobLinks() {
    // Find job cards with data-job-id attribute
    const jobCards = Array.from(document.querySelectorAll("li[data-job-id]"));

    const validLinks = [];
    let skippedCount = 0;

    for (const card of jobCards) {
      // Skip if already processed
      if (card.classList.contains("fastapply-processed")) continue;

      // Find the Easy Apply button with direct apply URL - THIS IS REQUIRED
      const easyApplyLink = card.querySelector(
        '.jb-easy-apply a[href*="/job/apply/"]'
      );

      // Find the job title link inside h2
      const titleLink = card.querySelector('h2 a[href*="/jobs/"]');
      if (!titleLink) continue;

      // Skip if title link already processed
      if (titleLink.classList.contains("fastapply-processed")) continue;

      // SKIP jobs without Easy Apply button - mark them and continue
      if (!easyApplyLink) {
        card.classList.add("fastapply-processed");
        titleLink.classList.add("fastapply-processed");
        this.markLinkAsColor(titleLink, "orange", "No Easy Apply");
        skippedCount++;
        continue;
      }

      // Get the Easy Apply URL - this is the actual apply link
      const applyUrl = easyApplyLink.getAttribute("href") || "";
      if (!applyUrl) {
        card.classList.add("fastapply-processed");
        titleLink.classList.add("fastapply-processed");
        this.markLinkAsColor(titleLink, "orange", "Invalid Apply URL");
        skippedCount++;
        continue;
      }

      // Extract job info from card
      const jobTitle = titleLink.textContent?.trim() || "";
      const company =
        card
          .querySelector(".job-company-location-wrapper a.t-bold")
          ?.textContent?.trim() || "";
      const locationEl = card.querySelector(
        ".job-company-location-wrapper .t-mute"
      );
      const location = locationEl?.textContent?.trim() || "";
      const jobId = card.getAttribute("data-job-id") || "";

      // Extract additional job details from card
      const description =
        card.querySelector(".jb-descr")?.textContent?.trim() || "";
      const salary =
        card.querySelector(".jb-label-salary")?.textContent?.trim() || "";
      const careerLevel =
        card.querySelector(".jb-label-careerlevel")?.textContent?.trim() || "";
      const workMode =
        card.querySelector(".jb-label-remote")?.textContent?.trim() || "";

      // Attach metadata to title link - use Easy Apply URL as primary
      titleLink._jobTitle = jobTitle;
      titleLink._company = company;
      titleLink._location = location;
      titleLink._jobId = jobId;
      titleLink._cardElement = card;
      titleLink._applyUrl = applyUrl; // The Easy Apply URL is the actual link to use
      titleLink._description = description;
      titleLink._salary = salary;
      titleLink._careerLevel = careerLevel;
      titleLink._workMode = workMode;

      validLinks.push(titleLink);
    }
    return validLinks;
  }

  async openJob(linkElement, url) {
    linkElement.classList.add("fastapply-processed");

    // Mark card as processed too
    if (linkElement._cardElement) {
      linkElement._cardElement.classList.add("fastapply-processed");
    }

    const jobTitle =
      linkElement._jobTitle || linkElement.textContent?.trim() || "";
    const jobId = linkElement._jobId || this.extractJobId(url);

    this.markLinkAsColor(linkElement, "blue", "Processing");

    // Build job info from link element data for preference matching
    const jobInfo = {
      title: jobTitle,
      company: linkElement._company || "",
      location: linkElement._location || "",
      description: linkElement._description || "",
      salary: linkElement._salary || "",
      jobType: linkElement._careerLevel || "",
    };

    console.log("Job info:", jobInfo);

    // Check if job matches user preferences (only if preference matching is enabled)
    if (
      this.sessionContext?.preferences?.applyOnlyMatching ||
      this.sessionContext?.preferences?.applyOnlyQualified
    ) {
      const matches = await this.doesJobMatchPreferences(jobInfo);
      if (!matches) {
        this.markLinkAsColor(linkElement, "orange", "Skipped");
        notifyStatus({
          type: "DOES_NOT_MATCH_PREFERENCES",
          data: { title: jobInfo.title, reason: this.reason },
        });
        await Utils.delay(3000);
        // Move to next job
        this.findAndOpenNextJob();
        return;
      }
    }

    // Always use the Easy Apply URL - we only include jobs with Easy Apply
    const applyUrl = linkElement._applyUrl;

    if (!applyUrl) {
      console.log(`⚠️ No Easy Apply URL for job: ${jobTitle}`);
      this.markLinkAsColor(linkElement, "red", "No Apply URL");
      return;
    }

    // Build full URL if relative
    const fullApplyUrl = applyUrl.startsWith("http")
      ? applyUrl
      : `https://www.bayt.com${applyUrl}`;

    // Save job details to localStorage for the success page to retrieve
    const jobDetails = {
      jobId: jobId,
      title: jobTitle,
      company: linkElement._company || "",
      location: linkElement._location || "",
      description: linkElement._description || "",
      salary: linkElement._salary || "",
      careerLevel: linkElement._careerLevel || "",
      workMode: linkElement._workMode || "",
      url: fullApplyUrl,
      platform: "bayt",
      timestamp: Date.now(),
    };
    localStorage.setItem(`bayt_job_${jobId}`, JSON.stringify(jobDetails));
    this.sendMessage({
      type: "START_APPLICATION",
      data: {
        url: fullApplyUrl,
        jobId: jobId,
        title: jobTitle,
        requestId: `req_${Date.now()}`,
      },
    });
  }

  extractJobId(url) {
    // Bayt job URLs end with a number: /jobs/job-title-73791437/
    const match = url.match(/-(\d+)\/?$/);
    return match ? match[1] : null;
  }

  handleNoJobsFound() {
    const nextBtn = document.querySelector("a#pnnext");
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

  // ========================================
  // JOB DETAIL PAGE HANDLING
  // ========================================

  async handleJobDetailPage() {
    console.log("📄 Handling Bayt job detail page");
    notifyStatus({ type: "FILLING_FORM" });

    try {
      // Extract job info
      const jobInfo = await this.extractJobInfo();

      // Find and click Apply button - look for the Easy Apply link with data-automation-id
      const applyBtn =
        document.querySelector(
          '[data-automation-id="readyApplyLink"], #applyLink_1, #applyButton, a.btn.is-primary[href*="/job/apply/"]'
        ) || this.findApplyButton();

      if (!applyBtn) {
        console.log("⚠️ Apply button not found");
        this.handleJobSkipped("Apply button not found");
        return;
      }

      // Get the apply URL from the href attribute and navigate directly
      const applyUrl = applyBtn.getAttribute("href");
      if (applyUrl && applyUrl.includes("/job/apply/")) {
        console.log("🔗 Navigating to apply URL:", applyUrl);
        window.location.href = applyUrl;
      } else {
        applyBtn.click();
      }
      await Utils.delay(2000);

      // Handle application form
      await this.handleApplicationForm(jobInfo);
    } catch (error) {
      console.error("❌ Error handling job detail page:", error);
      // this.handleJobSkipped(error.message);
    }
  }

  findApplyButton() {
    const buttons = document.querySelectorAll("button, a.btn");
    for (const btn of buttons) {
      const text = btn.textContent.toLowerCase();
      if (text.includes("apply") || text.includes("تقدم")) {
        return btn;
      }
    }
    return null;
  }

  async extractJobInfo() {
    // Title - from h1#job_title
    const titleEl = document.querySelector(
      "#job_title, h1, [data-job-title], .job-title"
    );

    // Company - from the company link in the media-list
    const companyEl = document.querySelector(
      ".media-list .t-bold[href*='/company/'], [data-company-name], .company-name"
    );

    // Location - from the muted text next to company
    const locationEl = document.querySelector(
      ".media-list .t-mute a[href*='/jobs/'], [data-job-location], .location"
    );

    // Description - from the job description section
    const descriptionEl = document.querySelector(
      ".card-content h2.h5 + .t-break, .job-description, [data-job-description]"
    );

    // Salary - from data-automation-id="id_salary_range"
    const salaryEl = document.querySelector(
      '[data-automation-id="id_salary_range"] .u-stretch'
    );

    // Work mode (Remote/On-site/Hybrid) - from data-automation-id="id_remote_working"
    const workModeEl = document.querySelector(
      '[data-automation-id="id_remote_working"] .u-stretch'
    );

    // Job type and experience level - from data-automation-id="id_type_level_experience"
    const jobTypeEl = document.querySelector(
      '[data-automation-id="id_type_level_experience"] .u-stretch'
    );

    // Number of vacancies - from data-automation-id="id_number_of_vacancies"
    const vacanciesEl = document.querySelector(
      '[data-automation-id="id_number_of_vacancies"] .u-stretch'
    );

    // Company size - from data-automation-id="id_company_employees_industry"
    const companySizeEl = document.querySelector(
      '[data-automation-id="id_company_employees_industry"] .u-stretch'
    );

    // Parse job type and experience level (format: "Full time · Mid career")
    const jobTypeText = jobTypeEl?.textContent?.trim() || "";
    const jobTypeParts = jobTypeText.split("·").map((s) => s.trim());
    const employmentType = jobTypeParts[0] || "";
    const experienceLevel = jobTypeParts[1] || "";

    return {
      title: titleEl?.textContent?.trim() || "",
      company: companyEl?.textContent?.trim() || "",
      location: locationEl?.textContent?.trim() || "",
      description: descriptionEl?.textContent?.trim() || "",
      salary: salaryEl?.textContent?.trim() || "",
      workMode: workModeEl?.textContent?.trim() || "",
      jobType: employmentType,
      experienceLevel: experienceLevel,
      vacancies: vacanciesEl?.textContent?.trim() || "",
      companySize: companySizeEl?.textContent?.trim() || "",
      url: window.location.href,
      jobId: this.extractJobId(window.location.href),
    };
  }

  async handleApplicationForm(jobInfo) {
    console.log("📋 Handling Bayt application form");

    try {
      // Wait for form
      const form = await this.waitForSelector("form", 5000);
      if (!form) {
        console.log("⚠️ Application form not found");
        this.handleJobSkipped("Application form not found");
        return;
      }

      // Update form handler with job description
      if (this.formHandler) {
        this.formHandler.jobDescription = jobInfo.description;
      }

      // Fill form fields
      notifyStatus({ type: "FILLING_FORM" });
      if (this.formHandler) {
        await this.formHandler.handleFormFilling(form);
      }

      // Handle file uploads
      const preferences =
        this.sessionContext?.preferences ||
        this.config?.config?.preferences ||
        {};
      if (preferences.useCustomResume === true) {
        notifyStatus({ type: "TAILORING_RESUME" });
      } else {
        notifyStatus({ type: "UPLOADING_FILES" });
      }
      if (this.fileHandler) {
        await this.fileHandler.handleFileUploads(
          form,
          this.userProfile,
          jobInfo.description
        );
      }

      await Utils.delay(1000);

      // Co-pilot mode: wait for user approval
      if (this.copilotMode) {
        notifyStatus({
          type: "COPILOT_SUBMIT_READY",
          data: { buttonText: "Submit", title: jobInfo.title },
        });

        const userAction = await this.waitForUserAction();
        if (userAction === "SKIP") {
          this.handleJobSkipped("User skipped");
          return;
        }
      }

      // Submit form
      const submitBtn = form.querySelector(
        'button[type="submit"], input[type="submit"], button.submit'
      );
      if (submitBtn) {
        notifyStatus({ type: "SUBMITTING_APPLICATION" });
        submitBtn.click();
        await Utils.delay(3000);

        // Check for success
        const successIndicator = document.querySelector(
          ".success, .confirmation, [data-success]"
        );
        if (successIndicator || !document.querySelector("form")) {
          this.handleJobSuccess(jobInfo);
        } else {
          this.handleJobSuccess(jobInfo); // Assume success
        }
      } else {
        this.handleJobSkipped("Submit button not found");
      }
    } catch (error) {
      console.error("❌ Error handling application form:", error);
      this.handleJobSkipped(error.message);
    }
  }

  async handleApplicationPage() {
    // Same as handleApplicationForm but for direct application pages
    const jobInfo = await this.extractJobInfo();
    await this.handleApplicationForm(jobInfo);
  }

  /**
   * Handle the applied success page
   * URL pattern: bayt.com/en/job/applied/?jb_id=5392067&cv_id=98858835
   */
  async handleAppliedSuccessPage() {
    console.log("✅ Bayt application success page detected");

    // Extract job ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const jobId = urlParams.get("jb_id");

    if (!jobId) {
      console.warn("⚠️ No job ID found in applied URL");
      return;
    }

    // Retrieve job details from localStorage
    const storedJobKey = `bayt_job_${jobId}`;
    const storedJobData = localStorage.getItem(storedJobKey);
    let jobInfo = {};
    if (storedJobData) {
      try {
        jobInfo = JSON.parse(storedJobData);
        // Clean up localStorage after retrieving
        localStorage.removeItem(storedJobKey);
      } catch (e) {
        console.warn("⚠️ Failed to parse stored job data:", e);
      }
    }

    // Build job info with defaults
    const finalJobInfo = {
      jobId: jobId,
      title: jobInfo.title || "Bayt Job",
      company: jobInfo.company || "",
      location: jobInfo.location || "",
      description: jobInfo.description || "",
      salary: jobInfo.salary || "",
      careerLevel: jobInfo.careerLevel || "",
      workMode: jobInfo.workMode || "",
      url: jobInfo.url || window.location.href,
      platform: "bayt",
    };

    // Notify status
    notifyStatus({
      type: "APPLICATION_SUBMITTED",
      data: { title: finalJobInfo.title },
    });

    // Add to applied jobs set
    this.appliedJobs.add(finalJobInfo.url);

    const cleanUrl = finalJobInfo.url
      ? finalJobInfo.url.split("?")[0]
      : window.location.pathname;
    // this.sendMessage({
    //   type: "APPLICATION_COMPLETED",
    //   jobData: {
    //     jobId: finalJobInfo.jobId,
    //     title: finalJobInfo.title,
    //     company: finalJobInfo.company,
    //     location: finalJobInfo.location,
    //     description: finalJobInfo.description,
    //     salary: finalJobInfo.salary,
    //     careerLevel: finalJobInfo.careerLevel,
    //     workMode: finalJobInfo.workMode,
    //     url: cleanUrl,
    //     platform: "bayt",
    //   },
    // });

    this.sendMessage({
      type: "APPLICATION_COMPLETED",
      jobData: {
        jobId: finalJobInfo.jobId,
        title: finalJobInfo.title,
        company: finalJobInfo.company,
        location: finalJobInfo.location,
        description: finalJobInfo.description,
        jobUrl: cleanUrl,
        platform: "bayt",
        appliedAt: Date.now(),
      },
    });

    console.log(`✅ Application success sent for: ${finalJobInfo.title}`);
  }

  /**
   * Start job listing process on results page
   * Pattern: bayt.com/en/{country}/jobs/{keyword}-jobs/
   */
  async startJobListingProcess() {
    // Guard: Prevent duplicate processes
    if (this.isSearchingJobs) {
      console.log("⏭️ Already processing jobs - ignoring duplicate call");
      return;
    }
    this.isSearchingJobs = true;

    console.log("🔍 Starting Bayt job listing process");
    notifyStatus({
      type: "JOB_SEARCH_STARTED",
      data: { preferences: this.config?.config?.preferences || {} },
    });

    this.sendMessage({ type: "GET_SEARCH_TASK" });

    // Wait for job listings to load
    await this.waitForJobListingsToLoad();

    // Find and open jobs
    this.findAndOpenNextJob();
  }

  /**
   * Apply search filters on Bayt search page
   * Fills in keyword (position) and location, then clicks Find jobs
   */
  async applySearchFilters() {
    // Check if filters already applied (persisted in sessionStorage)
    const filterKey = "bayt_search_filters_set";
    if (sessionStorage.getItem(filterKey)) {
      console.log("📍 Search filters already applied, skipping");
      return;
    }

    const preferences = this.config?.config?.preferences || {};
    const positions = preferences.positions || [];

    // Get city - handle array or string
    const cityRaw = preferences.city || "";
    const city = Array.isArray(cityRaw) ? cityRaw[0] : cityRaw;

    // Get location/country - handle array or string
    const locationRaw = preferences.location || "";
    const location = Array.isArray(locationRaw) ? locationRaw[0] : locationRaw;

    console.log("📍 Applying Bayt search filters:", {
      positions,
      city,
      location,
    });

    try {
      // Fill keyword/position input
      if (positions.length > 0) {
        const keywordInput = document.querySelector("#text_search");
        if (keywordInput) {
          await this.typeIntoInput(keywordInput, positions[0]);
          await Utils.delay(1500);

          // Try to select from dropdown suggestions if available
          await this.selectKeywordSuggestion(positions[0]);
        }
      }

      // Fill location - use city if available, otherwise country
      const locationToSearch = city || location;
      if (locationToSearch) {
        await this.selectLocationFromDropdown(
          locationToSearch,
          city ? location : ""
        );
      }

      // Mark filters as set before clicking search
      sessionStorage.setItem(filterKey, "true");

      // Click the Find jobs button
      await this.clickSearchButton();
    } catch (error) {
      console.error("❌ Error applying search filters:", error);
    }
  }

  /**
   * Type text into an input field, simulating user input
   */
  async typeIntoInput(input, text) {
    // Clear existing value
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await Utils.delay(300);

    // Focus the input
    input.focus();
    input.click();
    await Utils.delay(300);

    // Type the text
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await Utils.delay(500);
  }

  /**
   * Select keyword suggestion from dropdown if available
   */
  async selectKeywordSuggestion(searchText) {
    await Utils.delay(1000);

    // Find suggestions in the dropdown
    const suggestions = document.querySelectorAll(
      ".searchable .options li:not(.is-title), .list-menu-group li[data-text]"
    );

    if (suggestions.length === 0) {
      console.log("⚠️ No keyword suggestions found, using typed text");
      return;
    }

    console.log(`📋 Found ${suggestions.length} keyword suggestions`);

    const searchLower = searchText.toLowerCase();
    let bestMatch = null;
    let bestScore = -1;

    for (const suggestion of suggestions) {
      const text =
        suggestion.getAttribute("data-text")?.toLowerCase() ||
        suggestion.textContent?.trim().toLowerCase() ||
        "";
      if (!text) continue;

      // Skip company suggestions (they have URLs as values)
      const value = suggestion.getAttribute("data-value") || "";
      if (value.startsWith("/")) continue;

      let score = 0;

      if (text === searchLower) {
        score = 100;
      } else if (text.startsWith(searchLower)) {
        score = 80;
      } else if (text.includes(searchLower)) {
        score = 60;
      } else if (searchLower.includes(text)) {
        score = 40;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = suggestion;
      }
    }

    if (bestMatch && bestScore > 0) {
      console.log(
        `📋 Selecting keyword: ${
          bestMatch.getAttribute("data-text") || bestMatch.textContent?.trim()
        }`
      );
      const link = bestMatch.querySelector("a") || bestMatch;
      link.click();
      await Utils.delay(500);
    }
  }

  /**
   * Select location from Bayt's dropdown
   * Format in dropdown: "Country · City" (e.g., "United Arab Emirates · Dubai")
   */
  async selectLocationFromDropdown(searchLocation, country) {
    console.log(
      `📍 Selecting location: ${searchLocation}, country: ${country}`
    );

    // Click on the location input to open dropdown
    const locationInput = document.querySelector("#search_country__r");

    if (locationInput) {
      locationInput.click();
      await Utils.delay(800);
    }

    // Find location options in the dropdown
    const options = document.querySelectorAll(
      ".list-menu .options li[data-text][data-value]"
    );

    if (options.length === 0) {
      console.log("⚠️ No location options found");
      return;
    }

    console.log(`📍 Found ${options.length} location options`);

    const searchLower = searchLocation.toLowerCase().trim();
    const countryLower = country ? country.toLowerCase().trim() : "";

    let bestMatch = null;
    let bestScore = -1;

    for (const option of options) {
      const text = option.getAttribute("data-text")?.toLowerCase() || "";
      const value = option.getAttribute("data-value") || "";

      if (!text || !value) continue;

      let score = 0;

      // Exact match on value slug (e.g., "dubai", "riyadh", "saudi-arabia")
      if (value === searchLower || value === searchLower.replace(/\s+/g, "-")) {
        score = 100;
      }
      // Text contains both city and country (format: "Country · City")
      else if (
        countryLower &&
        text.includes(searchLower) &&
        text.includes(countryLower)
      ) {
        score = 90;
      }
      // Text ends with the city (e.g., "United Arab Emirates · Dubai" matches "Dubai")
      else if (
        text.endsWith(searchLower) ||
        text.includes(`· ${searchLower}`)
      ) {
        score = 80;
      }
      // Exact text match on country or city
      else if (text === searchLower) {
        score = 75;
      }
      // Text contains the search location
      else if (text.includes(searchLower)) {
        score = 60;
      }
      // Value matches country slug (for country-only search)
      else if (
        !country &&
        (value === searchLower.replace(/\s+/g, "-") ||
          text.startsWith(searchLower))
      ) {
        score = 50;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = option;
      }
    }

    if (bestMatch) {
      console.log(
        `📍 Selecting location: ${bestMatch.getAttribute("data-text")}`
      );
      const link = bestMatch.querySelector("a");
      if (link) {
        link.click();
      } else {
        bestMatch.click();
      }
      await Utils.delay(500);
    } else {
      console.log("⚠️ No matching location found");
    }
  }

  /**
   * Click the Find jobs button
   */
  async clickSearchButton() {
    try {
      const searchButton = document.querySelector(
        '#submitButtonQuickSearchWidget, button[type="submit"][data-js-aid="search"]'
      );

      if (searchButton) {
        console.log("🔍 Clicking Find jobs button");
        searchButton.click();
        await Utils.delay(2000);
      } else {
        console.warn("⚠️ Find jobs button not found");
      }
    } catch (error) {
      console.error("❌ Error clicking search button:", error);
    }
  }

  /**
   * Wait for job listings to load
   */
  async waitForJobListingsToLoad(timeout = 15000) {
    console.log("⏳ Waiting for job listings to load...");
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check for job cards on Bayt - using the specific li[data-job-id] selector
      const jobCards = document.querySelectorAll("li[data-job-id]");

      if (jobCards.length > 0) {
        console.log(`✅ Found ${jobCards.length} job listings`);
        await Utils.delay(500);
        return true;
      }

      // Check for "no results" message
      const noResults = document.querySelector(
        '.no-results, .empty-state, [class*="no-jobs"]'
      );

      if (noResults) {
        console.log("⚠️ No job results found");
        return false;
      }

      await Utils.delay(500);
    }

    console.warn("⚠️ Timeout waiting for job listings to load");
    return false;
  }

  /**
   * Find and open next unprocessed job
   */
  findAndOpenNextJob() {
    if (!this.isRunning || this.isPaused) return;

    const links = this.findAllJobLinks();

    if (links.length === 0) {
      this.handleNoJobsFound();
      return;
    }

    for (const link of links) {
      const url = link.href;

      // Skip already processed links
      if (link.classList.contains("fastapply-processed")) {
        continue;
      }

      // Skip invalid links
      if (link.classList.contains("fastapply-invalid")) {
        continue;
      }

      // Validate job page
      if (!this.isValidJobPage(url)) {
        console.log(`⚠️ Invalid job URL: ${url}`);
        link.classList.add("fastapply-invalid");
        continue;
      }

      console.log(`🔗 Opening job: ${link._jobTitle} - ${url}`);
      this.openJob(link, url);
      return;
    }

    this.handleNoJobsFound();
  }

  // ========================================
  // RESULT HANDLING
  // ========================================

  handleJobSuccess(jobInfo) {
    console.log("✅ Job application successful:", jobInfo.title);
    this.appliedJobs.add(jobInfo.url);

    notifyStatus({
      type: "APPLICATION_SUBMITTED",
      data: { title: jobInfo.title },
    });
    this.markLinkByUrl(jobInfo.url, "green", "Applied");

    this.sendMessage({
      type: "APPLICATION_COMPLETED",
      jobData: {
        jobId: jobInfo.jobId,
        title: jobInfo.title,
        company: jobInfo.company,
        url: jobInfo.url,
        platform: "bayt",
      },
    });
  }

  handleJobSkipped(reason) {
    console.log("⏭️ Job skipped:", reason);
    this.sendMessage({
      type: "JOB_SKIPPED",
      data: { url: window.location.href, reason },
    });
  }

  // ========================================
  // JOB MATCHING
  // ========================================

  async doesJobMatchPreferences(jobInfo) {
    const preferences = this.sessionContext?.preferences || {};
    const backendApiHost =
      this.sessionContext?.backendApiHost || this.backendApiHost;
    const jwtToken = this.sessionContext?.jwtToken || this.jwtToken;

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
        jobType: jobInfo.jobType || "",
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
  // UTILITIES
  // ========================================

  sendMessage(message) {
    try {
      chrome.runtime.sendMessage(message);
    } catch (error) {
      console.warn("Failed to send message:", error);
    }
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
      console.warn("Error marking link:", error);
    }
  }

  markLinkByUrl(url, color, status) {
    try {
      const links = document.querySelectorAll('a[href*="bayt.com"]');
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

  async waitForSelector(selector, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await Utils.delay(100);
    }
    return null;
  }

  /**
   * Restore appropriate mode buttons based on current copilot state
   */
  restoreModeButtons() {
    // Check current mode and show appropriate buttons
    if (this.copilotState.isInCoPilotMode()) {
      updateStatusButtons("co-pilot-search");
    } else {
      updateStatusButtons("auto-pilot");
    }
  }

  async stop() {
    this.isRunning = false;
    console.log("⏹️ Bayt automation stopped");
    notifyStatus({ type: "AUTOMATION_STOPPED" });
  }
}
