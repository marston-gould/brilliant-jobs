import { ReedFileHandler } from "./reed-file-handler.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";
import Utils from "../../utils/utils.js";

export default class ReedPlatform {
  constructor(config) {
    this.config = config || {};
    this.platform = "reed";
    this.baseUrl = "https://www.reed.co.uk";

    // Session context
    this.sessionContext = config?.sessionContext || null;
    this.sessionId = config?.sessionId || null;
    this.userId = config?.userId || null;
    this.userProfile = config?.userProfile || null;

    // State
    this.isRunning = false;
    this.isPaused = false;
    this.processedJobs = new Set();

    // Processing guards - prevent duplicate processing
    this.isProcessingApplication = false;
    this.hasStartedAutomation = false;
    this.isSearchingJobs = false;

    // API hosts and services - initialized via sessionContext
    this.aiApiHost = null;
    this.backendApiHost = null;
    this.jwtToken = null;

    // Handlers
    this.fileHandler = null;

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
    console.log("🤖 Initializing Reed platform");

    // Global overlay is managed by content-status-overlay.js
    // Initial notification to show overlay
    notifyStatus({ type: "AUTOMATION_STARTING" });

    // Apply session context preferences (including co-pilot mode)
    if (this.sessionContext) {
      await this.setSessionContext(this.sessionContext);
    }

    this.setupMessageListeners();
    console.log("✅ Reed platform initialized");
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

    // Initialize file handler
    this.fileHandler = new ReedFileHandler({
      backendApiHost: this.backendApiHost,
      aiApiHost: this.aiApiHost,
      jwtToken: this.jwtToken,
    });

    // Co-pilot mode
    const preferences =
      sessionContext.preferences ||
      sessionContext.sessionConfig?.preferences ||
      {};
    this.copilotMode = preferences.coPilotMode === true;

    if (this.copilotMode) {
      console.log("🔒 Co-pilot mode enabled for Reed");
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
    console.log("🔄 Reed SEARCH_NEXT received");
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
    console.log("🎮 Reed Co-pilot action:", action);

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
      await this.detectPageTypeAndStart();
    } catch (error) {
      console.error("❌ Failed to start Reed automation:", error);
      notifyStatus({ type: "APPLICATION_ERROR" });
      this.hasStartedAutomation = false;
    }
  }

  async detectPageTypeAndStart() {
    const url = window.location.href;

    if (url.includes("reed.co.uk/jobs/") && /\/\d+/.test(url)) {
      await this.handleJobDetailPage();
    } else if (url.includes("reed.co.uk/jobs")) {
      await this.startReedSearchProcess();
    } else {
      this.sendMessage({
        type: "APPLICATION_SKIPPED",
        data: { url, reason: "Unknown page type" },
      });
    }
  }

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
      if (link.classList.contains("fastapply-processed")) continue;
      if (link.classList.contains("fastapply-invalid")) continue;

      if (!this.isValidJobPage(url)) {
        link.classList.add("fastapply-invalid");
        this.markLinkAsColor(link, "red", "Invalid");
        continue;
      }

      console.log(`🔗 Opening job: ${link._jobTitle} - ${url}`);
      this.openJob(link, url);
      return;
    }

    this.handleNoJobsFound();
  }

  findAllJobLinks() {
    // Find job cards - Reed uses article[data-qa="job-card"]
    const jobCards = Array.from(
      document.querySelectorAll('article[data-qa="job-card"]')
    );

    const validLinks = [];
    let skippedCount = 0;

    for (const card of jobCards) {
      // Skip if already processed
      if (card.classList.contains("fastapply-processed")) continue;

      // Find Easy Apply badge - REQUIRED
      const easyApplyBadge = card.querySelector(
        '.index-module_label__easyApply__RxLXy, [class*="easyApply"]'
      );

      // Find the job title link
      const titleLink = card.querySelector('a[data-qa="job-card-title"]');
      if (!titleLink) continue;

      // Skip if title link already processed
      if (titleLink.classList.contains("fastapply-processed")) continue;

      // SKIP jobs without Easy Apply badge - mark them and continue
      if (!easyApplyBadge) {
        console.log(
          `⏭️ Skipping job without Easy Apply: ${titleLink.textContent?.trim()}`
        );
        card.classList.add("fastapply-processed");
        titleLink.classList.add("fastapply-processed");
        this.markLinkAsColor(titleLink, "orange", "No Easy Apply");
        skippedCount++;
        continue;
      }

      // Extract job info from card
      const jobTitle = titleLink.textContent?.trim() || "";
      const jobId =
        titleLink.getAttribute("data-id") ||
        card.getAttribute("data-id")?.replace("job", "") ||
        "";

      // Company from the recruiter link
      const companyLink = card.querySelector(
        ".job-card_profileUrl__fRi56, a[data-element='recruiter']"
      );
      const company = companyLink?.textContent?.trim() || "";

      // Metadata from the list
      const metadataItems = card.querySelectorAll(
        ".job-card_jobMetadata__item___QNud, [data-qa='job-card-options'] li"
      );
      let salary = "";
      let location = "";
      let jobType = "";
      let workMode = "";

      metadataItems.forEach((item) => {
        const text = item.textContent?.trim() || "";
        // Determine type by icon or content
        if (
          item.querySelector('[xlink\\:href="#svg-salary"]') ||
          text.includes("£") ||
          text.includes("$") ||
          text.toLowerCase().includes("salary")
        ) {
          salary = text;
        } else if (
          item.querySelector('[xlink\\:href="#svg-location"]') ||
          (item.hasAttribute("data-qa") &&
            item.getAttribute("data-qa").includes("location"))
        ) {
          location = text;
        } else if (
          item.querySelector('[xlink\\:href="#svg-clock"]') ||
          text.toLowerCase().includes("time") ||
          text.toLowerCase().includes("permanent") ||
          text.toLowerCase().includes("contract")
        ) {
          jobType = text;
        } else if (
          item.querySelector('[xlink\\:href="#svg-remote"]') ||
          text.toLowerCase().includes("remote") ||
          text.toLowerCase().includes("home")
        ) {
          workMode = text;
        }
      });

      // Build full URL
      const jobUrl = titleLink.href.startsWith("http")
        ? titleLink.href
        : `https://www.reed.co.uk${titleLink.getAttribute("href")}`;

      // Attach metadata to title link
      titleLink._jobTitle = jobTitle;
      titleLink._company = company;
      titleLink._location = location;
      titleLink._jobId = jobId;
      titleLink._cardElement = card;
      titleLink._salary = salary;
      titleLink._jobType = jobType;
      titleLink._workMode = workMode;
      titleLink._jobUrl = jobUrl;

      validLinks.push(titleLink);
    }

    console.log(
      `📋 Found ${validLinks.length} Easy Apply jobs on Reed (skipped ${skippedCount} without Easy Apply)`
    );
    return validLinks;
  }

  isValidJobPage(url) {
    return url.includes("reed.co.uk/jobs/") && /\/\d+/.test(url);
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

    // Build clean URL
    const cleanUrl = url.split("?")[0];

    // Save job details to localStorage for the success page to retrieve
    const jobDetails = {
      jobId: jobId,
      title: jobTitle,
      company: linkElement._company || "",
      location: linkElement._location || "",
      salary: linkElement._salary || "",
      jobType: linkElement._jobType || "",
      workMode: linkElement._workMode || "",
      url: cleanUrl,
      platform: "reed",
      timestamp: Date.now(),
    };
    localStorage.setItem(`reed_job_${jobId}`, JSON.stringify(jobDetails));
    console.log(`💾 Saved job details to localStorage: reed_job_${jobId}`);

    this.sendMessage({
      type: "START_APPLICATION",
      data: {
        url: cleanUrl,
        jobId: jobId,
        title: jobTitle,
        company: linkElement._company || "",
        requestId: `req_${Date.now()}`,
      },
    });
  }

  extractJobId(url) {
    const match = url.match(/\/(\d+)(?:[#?]|$)/);
    return match ? match[1] : null;
  }

  handleNoJobsFound() {
    // Check current page number - if on page 1, don't paginate
    const activePage = document.querySelector(
      ".pagination .page-item.active span, .pagination .page-item.active a"
    );
    const currentPageNum = activePage?.textContent?.trim() || "1";

    if (currentPageNum === "1") {
      console.log("📄 On page 1, no more Easy Apply jobs - completing search");
      notifyStatus({ type: "SEARCH_COMPLETED" });
      this.sendMessage({ type: "SEARCH_COMPLETED" });
      return;
    }

    // Check for Reed's pagination - next page link (not disabled)
    const nextBtn = document.querySelector(
      'a.page-link.next:not(.disabled), a[aria-label="Next page"]:not([class*="disabled"])'
    );

    // Also check if next button's parent is not disabled
    const nextBtnParent = nextBtn?.closest(".page-item");
    const isNextDisabled = nextBtnParent?.classList.contains("disabled");

    if (nextBtn && !isNextDisabled && !this.isPaused) {
      console.log("📄 Going to next page...");
      nextBtn.click();
      setTimeout(() => {
        if (!this.isPaused) this.findAndOpenNextJob();
      }, 3000);
    } else {
      console.log("📄 No more pages - completing search");
      notifyStatus({ type: "SEARCH_COMPLETED" });
      this.sendMessage({ type: "SEARCH_COMPLETED" });
    }
  }

  // ========================================
  // JOB DETAIL PAGE HANDLING
  // ========================================

  async handleJobDetailPage() {
    console.log("📄 Handling Reed job detail page");
    console.log("📍 Current URL:", window.location.href);
    notifyStatus({ type: "FILLING_FORM" });

    // Mark as processing to prevent duplicate calls
    this.isProcessingApplication = true;

    try {
      // Wait for page to be reasonably loaded - look for job title or apply button
      console.log("⏳ Waiting for page content to load...");
      await Utils.delay(2000); // Initial wait for React to render

      // Extract comprehensive job info from the detail page
      const jobInfo = this.extractJobInfo();
      console.log("📝 Extracted job info:", jobInfo);

      // Check if job matches user preferences (if enabled)
      const matches = await this.doesJobMatchPreferences(jobInfo);
      if (!matches) {
        console.log("❌ Job does not match preferences, skipping...");
        notifyStatus({
          type: "DOES_NOT_MATCH_PREFERENCES",
          data: { title: jobInfo.title, reason: this.reason },
        });
        this.handleJobSkipped("Does not match preferences: " + this.reason);
        return;
      }

      // Save job info to localStorage for later retrieval
      if (jobInfo.jobId) {
        localStorage.setItem(
          `reed_job_${jobInfo.jobId}`,
          JSON.stringify({
            ...jobInfo,
            platform: "reed",
            timestamp: Date.now(),
          })
        );
        console.log(
          `💾 Saved job details to localStorage: reed_job_${jobInfo.jobId}`
        );
      }

      // Wait for Apply button to appear (instead of immediately checking)
      console.log("⏳ Waiting for Apply button to appear...");
      const applyBtn = await this.waitForSelector(
        '[data-qa="apply-btn"], button.btn-primary[type="button"]',
        15000
      );

      if (!applyBtn) {
        console.log("⚠️ Apply button not found after waiting");
        this.handleJobSkipped("Apply button not found");
        return;
      }

      console.log("✅ Apply button found:", applyBtn.textContent?.trim());
      console.log("🔘 Clicking Apply Now button");

      // Robust click: scroll into view, focus, then click using multiple methods
      await this.robustClick(applyBtn);
      await Utils.delay(2000);

      // Wait for application modal to appear
      console.log("⏳ Waiting for application modal...");

      // Try multiple modal selectors
      const applicationModal = await this.waitForSelector(
        '[data-qa="apply-job-modal"], .modal-content, .modal-dialog, [role="dialog"]',
        10000
      );

      // Debug: log what modals exist on the page
      const allModals = document.querySelectorAll(
        '.modal, [role="dialog"], .modal-dialog, .modal-content'
      );
      console.log(`🔍 Found ${allModals.length} modal elements on page`);
      allModals.forEach((m, i) => {
        console.log(`  Modal ${i}:`, m.className, m.getAttribute("data-qa"));
      });

      if (applicationModal) {
        console.log(
          "📋 Application modal detected:",
          applicationModal.className
        );
        // Check if it's the right modal by looking for expected content
        const isApplyModal = applicationModal.querySelector(
          '[data-qa="submit-application-btn"], [data-qa="UpdateCvBtn"], .apply-job-modal, h3'
        );
        if (isApplyModal) {
          console.log("✅ Confirmed this is the application modal");
          await this.handleApplicationModal(jobInfo);
        } else {
          console.log(
            "⚠️ Modal found but not the application modal, checking content..."
          );
          console.log(
            "Modal HTML preview:",
            applicationModal.innerHTML?.substring(0, 500)
          );
          await this.handleApplicationModal(jobInfo); // Try anyway
        }
      } else {
        // May redirect to external page or different flow
        console.log(
          "⚠️ Application modal not found, may be external application"
        );
        this.handleJobSkipped("External application - modal not found");
      }
    } catch (error) {
      console.error("❌ Error handling job detail page:", error);
      this.handleJobSkipped(error.message);
    } finally {
      this.isProcessingApplication = false;
    }
  }

  /**
   * Robust click method that ensures the element is clicked properly
   * Uses multiple click approaches for React/modern web apps
   */
  async robustClick(element) {
    if (!element) return false;

    try {
      // 1. Scroll element into view
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      await Utils.delay(500);

      // 2. Focus the element
      element.focus();
      await Utils.delay(100);

      // 3. Try native click first
      element.click();

      // 4. Also dispatch mouse events for React apps
      const mouseDownEvent = new MouseEvent("mousedown", {
        view: window,
        bubbles: true,
        cancelable: true,
        buttons: 1,
      });
      element.dispatchEvent(mouseDownEvent);

      const mouseUpEvent = new MouseEvent("mouseup", {
        view: window,
        bubbles: true,
        cancelable: true,
        buttons: 1,
      });
      element.dispatchEvent(mouseUpEvent);

      const clickEvent = new MouseEvent("click", {
        view: window,
        bubbles: true,
        cancelable: true,
        buttons: 1,
      });
      element.dispatchEvent(clickEvent);

      console.log("✅ Click dispatched successfully");
      return true;
    } catch (error) {
      console.error("❌ Error in robustClick:", error);
      return false;
    }
  }

  /**
   * Extract comprehensive job information from Reed job detail page
   * Based on HTML structure provided by user
   */
  extractJobInfo() {
    // Title - from h1 with data-qa="job-title"
    const titleEl = document.querySelector(
      '[data-qa="job-title"], h1.job-title-block_title__9fRYc, h1'
    );

    // Company - from the "posted by" section, extract just company name
    const postedByEl = document.querySelector('[data-qa="job-posted-by"]');
    let company = "";
    if (postedByEl) {
      const companyLink = postedByEl.querySelector("a");
      company = companyLink?.textContent?.trim() || "";
    }

    // Salary - from data-qa="job-salary"
    const salaryEl = document.querySelector('[data-qa="job-salary"]');
    const salary = salaryEl?.textContent?.trim() || "";

    // Location - from data-qa="job-location"
    const locationEl = document.querySelector('[data-qa="job-location"]');
    const location = locationEl?.textContent?.trim() || "";

    // Job type (Permanent, full-time, etc.) - from metadata items with clock icon
    const metadataItems = document.querySelectorAll(
      ".job-metadata_jobMetadata__item__VKljR, [class*='jobMetadata__item']"
    );
    let jobType = "";
    let workMode = "";

    metadataItems.forEach((item) => {
      const text = item.textContent?.trim() || "";
      const hasClockIcon = item.querySelector('[xlink\\:href="#svg-clock"]');
      const hasRemoteIcon = item.querySelector('[xlink\\:href="#svg-remote"]');

      if (
        hasClockIcon ||
        text.toLowerCase().includes("time") ||
        text.toLowerCase().includes("permanent") ||
        text.toLowerCase().includes("contract")
      ) {
        jobType = text;
      }
      if (
        hasRemoteIcon ||
        text.toLowerCase().includes("remote") ||
        text.toLowerCase().includes("hybrid") ||
        text.toLowerCase().includes("home")
      ) {
        workMode = text;
      }
    });

    // Skills - from the skills line or skills section
    const skillsLineEl = document.querySelector('[data-qa="job-skills-line"]');
    const skillsSectionEl = document.querySelector(
      '[data-qa="skills-section"]'
    );
    let skills = [];

    if (skillsLineEl) {
      const skillSpans = skillsLineEl.querySelectorAll(
        ".skills-line_skillsList__cwXiu span"
      );
      skillSpans.forEach((span) => {
        const skill = span.textContent?.trim();
        if (skill) skills.push(skill);
      });
    }

    if (skillsSectionEl && skills.length === 0) {
      const skillItems = skillsSectionEl.querySelectorAll(
        ".skills_item__s027g, [class*='lozenges__item']"
      );
      skillItems.forEach((item) => {
        // Remove the plus icon text if present
        const text = item.textContent?.trim().replace(/^\+\s*/, "");
        if (text) skills.push(text);
      });
    }

    // Description - from data-qa="job-description"
    const descriptionEl = document.querySelector('[data-qa="job-description"]');
    const description = descriptionEl?.textContent?.trim() || "";

    // Badges (Featured, Easy Apply, etc.)
    const badges = [];
    const badgeElements = document.querySelectorAll(
      '[data-qa="job-badges"] label, .job-badges_badges__EylBw label'
    );
    badgeElements.forEach((badge) => {
      const text = badge.textContent?.trim();
      if (text) badges.push(text);
    });

    return {
      title: titleEl?.textContent?.trim() || "",
      company: company,
      salary: salary,
      location: location,
      jobType: jobType,
      workMode: workMode,
      skills: skills,
      description: description,
      badges: badges,
      url: window.location.href,
      jobId: this.extractJobId(window.location.href),
    };
  }

  /**
   * Handle the Reed application modal
   * Flow: Update CV button -> Upload CV modal -> Upload resume -> Wait for success -> Submit
   */
  async handleApplicationModal(jobInfo) {
    console.log("📋 Handling Reed application modal");

    try {
      // Step 1: Click "Update" button to open CV upload modal
      const updateBtn = await this.waitForSelector(
        '[data-qa="UpdateCvBtn"], button.current-cv_button__5gNgh',
        5000
      );

      if (updateBtn) {
        console.log("🔘 Clicking Update CV button");
        updateBtn.click();
        await Utils.delay(1500);

        // Step 2: Wait for the CV upload modal
        const uploadModal = await this.waitForSelector(
          '[data-qa="upload-cv-modal"]',
          5000
        );

        if (uploadModal) {
          console.log("📂 CV upload modal detected");
          const preferences = this.sessionContext?.preferences || {};
          if (preferences.useCustomResume === true) {
            notifyStatus({ type: "TAILORING_RESUME" });
          } else {
            notifyStatus({ type: "UPLOADING_FILES" });
          }

          // Find the file input in the upload modal
          const fileInput = uploadModal.querySelector(
            'input[data-qa="drop-input"], input[type="file"]'
          );

          if (fileInput && this.fileHandler) {
            // Upload the resume
            const uploadSuccess = await this.fileHandler.handleFileUploads(
              uploadModal,
              this.userProfile,
              jobInfo.description
            );

            if (uploadSuccess) {
              console.log("✅ Resume uploaded successfully");
              // Wait a moment for the modal to close and return to application modal
              await Utils.delay(2000);
            } else {
              console.warn(
                "⚠️ Resume upload may have failed, continuing anyway"
              );
            }
          } else {
            console.warn("⚠️ File input not found in upload modal");
          }
        } else {
          console.warn(
            "⚠️ CV upload modal not found, continuing with existing CV"
          );
        }
      } else {
        console.log("ℹ️ Update CV button not found, using existing CV");
      }

      // Wait for application modal to be ready again
      await Utils.delay(1000);

      // Co-pilot mode: wait for user approval before submitting
      if (this.copilotMode) {
        notifyStatus({
          type: "COPILOT_SUBMIT_READY",
          data: { buttonText: "Submit Application", title: jobInfo.title },
        });

        const userAction = await this.waitForUserAction();
        if (userAction === "SKIP") {
          this.handleJobSkipped("User skipped");
          return;
        }
      }

      // Step 3: Click Submit Application button
      const submitBtn = await this.waitForSelector(
        '[data-qa="submit-application-btn"], button.cv_buttonGroup__button__WhYWX.btn-primary',
        5000
      );

      if (submitBtn) {
        console.log("🔘 Clicking Submit Application button");
        notifyStatus({ type: "SUBMITTING_APPLICATION" });
        submitBtn.click();
        await Utils.delay(3000);

        // Check for success - look for confirmation modal or success state
        const confirmation = await this.waitForApplicationSuccess(10000);

        if (confirmation) {
          console.log("✅ Application submitted successfully!");
          this.handleJobSuccess(jobInfo);

          // Close confirmation if there's a button
          const closeBtn = document.querySelector(
            '[data-qa="application-confirmation-modal"] button, .modal-header-module_close__uMGR9'
          );
          if (closeBtn) {
            closeBtn.click();
          }
        } else {
          // Check if modal closed (which could indicate success)
          const modalStillOpen = document.querySelector(
            '[data-qa="apply-job-modal"]'
          );
          if (!modalStillOpen) {
            console.log("✅ Application modal closed - assuming success");
            this.handleJobSuccess(jobInfo);
          } else {
            // Check for any error messages
            const errorMessage = document.querySelector(
              '.alert-danger, .error-message, [class*="error"]'
            );
            if (errorMessage) {
              this.handleJobSkipped(
                `Error: ${errorMessage.textContent?.trim()}`
              );
            } else {
              this.handleJobSuccess(jobInfo); // Assume success if no clear error
            }
          }
        }
      } else {
        console.log("⚠️ Submit button not found");
        this.handleJobSkipped("Submit button not found");
      }
    } catch (error) {
      console.error("❌ Error in application modal:", error);
      this.handleJobSkipped(error.message);
    }
  }

  /**
   * Wait for application success indicators
   */
  async waitForApplicationSuccess(timeout = 10000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check for confirmation modal
      const confirmationModal = document.querySelector(
        '[data-qa="application-confirmation-modal"]'
      );
      if (confirmationModal) {
        return confirmationModal;
      }

      // Check for success alert
      const successAlert = document.querySelector(
        '.alert-success, [class*="success"]'
      );
      if (
        successAlert &&
        successAlert.textContent?.toLowerCase().includes("submitted")
      ) {
        return successAlert;
      }

      // Check if we're redirected to a success page
      if (
        window.location.href.includes("/applied") ||
        window.location.href.includes("/confirmation")
      ) {
        return true;
      }

      await Utils.delay(500);
    }

    return null;
  }

  // ========================================
  // REED NATIVE SEARCH
  // ========================================

  async startReedSearchProcess() {
    // Guard: Prevent duplicate search processes
    if (this.isSearchingJobs) {
      console.log("⏭️ Already searching for jobs - ignoring duplicate call");
      return;
    }
    this.isSearchingJobs = true;

    console.log("🔍 Starting Reed search process");
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
   * Wait for job listings to load
   */
  async waitForJobListingsToLoad(timeout = 15000) {
    console.log("⏳ Waiting for job listings to load...");
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check for job cards on Reed
      const jobCards = document.querySelectorAll('article[data-qa="job-card"]');

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

  // ========================================
  // RESULT HANDLING
  // ========================================

  handleJobSuccess(jobInfo) {
    console.log("✅ Job application successful:", jobInfo.title);
    notifyStatus({
      type: "APPLICATION_SUBMITTED",
      data: { title: jobInfo.title },
    });
    this.markLinkByUrl(jobInfo.url, "green", "Applied");

    // Clean URL (remove query params)
    const cleanUrl = jobInfo.url
      ? jobInfo.url.split("?")[0]
      : window.location.href.split("?")[0];

    this.sendMessage({
      type: "APPLICATION_COMPLETED",
      jobData: {
        jobId: jobInfo.jobId,
        title: jobInfo.title,
        company: jobInfo.company,
        location: jobInfo.location || "",
        salary: jobInfo.salary || "",
        jobType: jobInfo.jobType || "",
        workMode: jobInfo.workMode || "",
        skills: jobInfo.skills || [],
        jobUrl: cleanUrl,
        platform: "reed",
        appliedAt: Date.now(),
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
      const links = document.querySelectorAll('a[href*="reed.co.uk"]');
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
    console.log(
      `⏳ waitForSelector: Looking for "${selector}" (timeout: ${timeout}ms)`
    );
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (el) {
        console.log(
          `✅ waitForSelector: Found "${selector}" after ${
            Date.now() - start
          }ms`
        );
        return el;
      }
      await Utils.delay(100);
    }
    console.log(
      `⚠️ waitForSelector: "${selector}" not found after ${timeout}ms`
    );
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
    console.log("⏹️ Reed automation stopped");
    notifyStatus({ type: "AUTOMATION_STOPPED" });
  }
}
