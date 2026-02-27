// platforms/jobvite/jobvite.js - Jobvite platform automation
import { UrlUtils, DomUtils } from "../../shared/utilities/index.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";
import Utils from "../../utils/utils.js";
import { AIService } from "../../services/index.js";
import { JobviteFormHandler } from "./jobvite-form-handler.js";
import { JobviteFileHandler } from "./jobvite-file-handler.js";

export default class JobvitePlatform {
  constructor(config) {
    this.config = config || {};
    this.platform = "jobvite";
    this.baseUrl = "https://jobs.jobvite.com";

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
    console.log("📥 Jobvite handleMessage:", type, data);

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
      console.error("❌ Error setting Jobvite session context:", error);
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
    } else if (this.isApplicationPage(url)) {
      // Already on /apply page, process the form
      await this.processApplicationForm();
    } else if (this.isValidJobPage(url)) {
      await this.startApplicationProcess();
    } else {
      this.sendMessage({
        type: "APPLICATION_SKIPPED",
        data: { url, reason: "Unknown page type" },
      });
    }
  }

  isApplicationPage(url) {
    // Check if we're on the /apply page
    return url.includes("jobs.jobvite.com") && url.includes("/apply");
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
      document.querySelectorAll('a[href*="jobvite.com"]')
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
    const allLinks = document.querySelectorAll('a[href*="jobvite.com"]');
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
    // Jobvite URL format: https://jobs.jobvite.com/{company}/job/{jobId}
    const companyPattern = /jobs\.jobvite\.com\/([^/]+)/i;
    const match = url.match(companyPattern);
    return match ? match[1] : null;
  }

  normalizeJobUrl(url) {
    let normalized = url.split("?")[0].replace(/\/$/, "");
    return normalized;
  }

  extractJobId(url) {
    // Extract job ID from Jobvite URL
    const jobPattern = /\/job\/([^/?]+)/i;
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
      const links = document.querySelectorAll('a[href*="jobvite.com"]');
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
      // Extract comprehensive job data from the page FIRST
      // This parses JSON-LD schema and caches data for form handling
      const jobData = this.extractJobDataFromPage();
      const jobTitle = jobData.title;

      notifyStatus({
        type: "APPLYING_TO_JOB",
        data: { title: jobTitle },
      });

      await Utils.delay(1500);

      // Check if job matches preferences (Apply Only Matching)
      if (this.config.config.preferences?.applyOnlyMatching) {
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

      // Check if user is qualified (Apply Only Qualified)
      if (this.config.config.preferences?.applyOnlyQualified) {
        const jobDetails = this.getJobProperties();
        const qualified = await this.doesJobMatchPreferences(jobDetails);
        if (!qualified) {
          notifyStatus({
            type: "NOT_QUALIFIED",
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
              reason: this.reason || "Not qualified for this position",
            },
          });

          return;
        }
      }

      // Click the Apply button to navigate to application form
      // Jobvite Apply button: <a class="jv-button jv-button-primary jv-button-apply" href="/idtus/job/o34Tyfwi/apply">Apply</a>
      const applyButton = document.querySelector(
        'a.jv-button-apply, a[href*="/apply"], .jv-job-detail-top-actions a.jv-button-primary'
      );

      if (applyButton) {
        console.log("🖱️ Clicking Apply button...");
        notifyStatus({
          type: "CLICKING_APPLY",
          data: { title: jobTitle },
        });

        // In co-pilot mode, wait for user confirmation
        if (this.copilotState.isInCoPilotMode()) {
          notifyStatus({
            type: "COPILOT_APPLY_READY",
            data: { jobTitle, action: "Click Apply to proceed" },
          });
          updateStatusButtons("co-pilot-apply");
          await this.copilotState.waitForUserAction();
        }

        applyButton.click();
        // The page will navigate to /apply - processApplicationForm will handle the form
      } else {
        console.warn("⚠️ Apply button not found on this page");
        notifyStatus({
          type: "NO_APPLY_BUTTON",
          data: { message: "Could not find Apply button on this job page" },
        });

        this.sendMessage({
          type: "APPLICATION_SKIPPED",
          data: {
            url: window.location.href,
            title: jobTitle,
            reason: "Apply button not found",
          },
        });
      }
    } catch (error) {
      console.error("Error in startApplicationProcess:", error);
      this.handleApplicationError(error);
    }
  }

  async processApplicationForm() {
    try {
      const jobTitle = this.extractJobTitle();
      const jobDescription = this.extractJobDescription();

      console.log("📋 Processing Jobvite application form (Indeed pattern)...");
      notifyStatus({
        type: "FILLING_FORM",
        data: { title: jobTitle },
      });

      await Utils.delay(1000);

      // Initialize file handler with AI capabilities
      if (!this.fileHandler) {
        this.fileHandler = new JobviteFileHandler({
          preferences:
            this.sessionContext?.preferences || this.config?.preferences,
          backendApiHost: this.backendApiHost || this.getApiHost(),
          aiApiHost: this.aiApiHost || this.getAiApiHost(),
          jwtToken: this.getJwtToken(),
        });
      }

      // Initialize form handler (Indeed pattern - handles everything internally)
      if (!this.formHandler) {
        this.formHandler = new JobviteFormHandler({
          host: this.aiApiHost || this.getAiApiHost(),
          userData: this.userProfile || {},
          userPreferences:
            this.sessionContext?.preferences || this.config?.preferences,
          jobDescription: jobDescription,
          fileHandler: this.fileHandler,
          copilotMode: this.copilotState.isInCoPilotMode(),
          copilotState: this.copilotState,
          logger: (message) => notifyStatus(message),
        });
      }

      // Update form handler with current data for this job
      this.formHandler.userData = this.userProfile;
      this.formHandler.jobDescription = jobDescription;
      this.formHandler.currentJobTitle = jobTitle;
      this.formHandler.copilotMode = this.copilotState.isInCoPilotMode();
      this.formHandler.fileHandler = this.fileHandler;

      // Run the complete form filling loop (handles all steps, navigation, and submission)
      const success = await this.formHandler.fillCompleteForm();

      if (success) {
        await this.handleSuccessfulSubmission();
      } else {
        console.warn("⚠️ Form processing did not complete successfully");
      }
    } catch (error) {
      console.error("Error in processApplicationForm:", error);
      this.handleApplicationError(error);
    }
  }

  async handleSuccessfulSubmission() {
    console.log("✅ Application submitted successfully");

    // Use cached job data if available (from extractJobDataFromPage)
    const cachedData = this.cachedJobData || {};
    const jobTitle = cachedData.title || this.extractJobTitle();
    const companyName =
      cachedData.company ||
      this.extractCompanyFromUrl(window.location.href) ||
      "Company";

    notifyStatus({
      type: "APPLICATION_SUBMITTED",
      data: { title: jobTitle },
    });

    // Build complete job data for message router
    const jobData = {
      jobId:
        cachedData.jobId ||
        this.extractJobId(window.location.href) ||
        Utils.generateId("jv_"),
      title: jobTitle,
      company: companyName,
      location: cachedData.location || this.extractLocation(),
      description: cachedData.description || this.cachedJobDescription || "",
      employmentType: cachedData.employmentType || "",
      industry: cachedData.industry || "",
      salary: cachedData.salary || "",
      datePosted: cachedData.datePosted || "",
      jobUrl: cachedData.jobUrl || window.location.href,
      platform: "jobvite",
      appliedAt: new Date().toISOString(),
      status: "applied",
    };

    console.log("📤 Sending job data to message router:", {
      title: jobData.title,
      company: jobData.company,
      location: jobData.location,
    });

    try {
      this.sendMessage({
        type: "APPLICATION_COMPLETED",
        data: jobData,
      });

      if (jobData.jobUrl) {
        this.markLinkByUrl(jobData.jobUrl, "green", "Completed");
      }
    } catch (error) {
      console.error("❌ Error sending job data:", error);
      this.sendMessage({
        type: "APPLICATION_COMPLETED",
        data: jobData,
      });
    }

    // Close tab after brief delay
    await this.delay(2500);
    window.close();
  }

  async handleSuccessPage() {
    console.log("🎉 Jobvite success page detected!");

    // Use cached job data if available, otherwise extract from page
    const cached = this.cachedJobData || {};
    
    const jobTitle = cached.title || this.extractJobTitle() || "Job Application";
    const companyName = cached.company || 
      this.extractCompanyFromUrl(window.location.href) || "Company";
    const jobUrl = cached.jobUrl || this.currentJobUrl || window.location.href.replace('/applyConfirmation', '');

    const jobData = {
      jobId: cached.jobId || this.extractJobId(jobUrl),
      title: jobTitle,
      company: companyName,
      location: cached.location || this.extractLocation(),
      description: cached.description || this.cachedJobDescription || "",
      jobUrl: jobUrl,
      platform: "jobvite",
      appliedAt: new Date().toISOString(),
      status: "applied",
    };

    console.log("📋 Sending job completion data:", jobData);

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
    const url = window.location.href;
    
    // URL-based detection for confirmation page
    if (url.includes('/applyConfirmation') || url.includes('/apply/confirmation')) {
      console.log("✅ Success page detected via URL: applyConfirmation");
      return true;
    }
    
    // DOM-based detection fallback
    const successIndicators = [
      '[data-testid="success"]',
      ".application-success",
      ".confirmation-message",
      ".jv-apply-confirmation",
      "[ng-controller*='Confirmation']",
      ".thank-you-message",
    ];

    for (const selector of successIndicators) {
      if (document.querySelector(selector)) {
        console.log(`✅ Success page detected via selector: ${selector}`);
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
    //WAIT
    this.delay(2500);
    this.sendMessage({
      type: "APPLICATION_SKIPPED",
      data: {
        url: window.location.href,
        title: jobTitle,
        reason: "Error occurred",
      },
    });
  }

  // ========================================
  // JOB DATA EXTRACTION
  // ========================================

  /**
   * Extract comprehensive job data from Jobvite page
   * Primary source: JSON-LD schema (most reliable)
   * Fallback: DOM selectors
   */
  extractJobDataFromPage() {
    // Try JSON-LD first (most reliable)
    const jsonLdData = this.extractFromJsonLd();

    // Merge with DOM data as fallback
    const domData = this.extractFromDom();

    // Combine both sources - prefer JSON-LD
    const jobData = {
      jobId: jsonLdData.identifier || this.extractJobId(window.location.href),
      title: jsonLdData.title || domData.title || "Job on Jobvite",
      company:
        jsonLdData.hiringOrganization ||
        domData.company ||
        this.extractCompanyFromUrl(window.location.href),
      location: jsonLdData.location || domData.location || "Not specified",
      description: jsonLdData.description || domData.description || "",
      datePosted: jsonLdData.datePosted || "",
      employmentType: jsonLdData.employmentType || "",
      industry: jsonLdData.industry || "",
      salary: jsonLdData.salary || "",
      jobUrl: window.location.href,
      platform: "jobvite",
    };

    // Cache for form handling
    this.cachedJobData = jobData;
    this.cachedJobDescription = jobData.description;

    console.log("📋 Extracted job data:", {
      title: jobData.title,
      company: jobData.company,
      location: jobData.location,
      descLength: jobData.description.length,
    });

    return jobData;
  }

  /**
   * Extract job data from JSON-LD script tag
   * Jobvite uses schema.org/JobPosting format
   */
  extractFromJsonLd() {
    try {
      const scripts = document.querySelectorAll(
        'script[type="application/ld+json"]'
      );

      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);

          // Check if it's a JobPosting schema
          if (data["@type"] === "JobPosting") {
            // Extract location from jobLocation array
            let location = "";
            if (
              data.jobLocation &&
              Array.isArray(data.jobLocation) &&
              data.jobLocation.length > 0
            ) {
              const loc = data.jobLocation[0];
              if (loc.address) {
                const addr = loc.address;
                const parts = [];
                if (addr.addressLocality) parts.push(addr.addressLocality);
                if (addr.addressRegion) parts.push(addr.addressRegion);
                if (
                  addr.addressCountry &&
                  addr.addressCountry !== "United States"
                ) {
                  parts.push(addr.addressCountry);
                }
                location = parts.join(", ");
              }
            }

            // Extract salary if available
            let salary = "";
            if (data.baseSalary && data.baseSalary.value) {
              const sv = data.baseSalary.value;
              if (sv.minValue && sv.maxValue) {
                salary = `${sv.minValue} - ${sv.maxValue}`;
              }
            }

            // Clean HTML from description
            const description = data.description
              ? this.stripHtml(data.description)
              : "";

            return {
              title: data.title || "",
              hiringOrganization: data.hiringOrganization || "",
              location: location,
              description: description,
              datePosted: data.datePosted || "",
              employmentType: data.employmentType || "",
              industry: data.industry || "",
              identifier: data.identifier || "",
              salary: salary,
            };
          }
        } catch (e) {
          // Invalid JSON, continue to next script
        }
      }
    } catch (error) {
      console.warn("Error extracting from JSON-LD:", error);
    }

    return {};
  }

  /**
   * Extract job data from DOM elements
   * Fallback when JSON-LD is not available
   */
  extractFromDom() {
    return {
      title: this.extractJobTitleFromDom(),
      company: this.extractCompanyFromDom(),
      location: this.extractLocationFromDom(),
      description: this.extractDescriptionFromDom(),
    };
  }

  /**
   * Strip HTML tags from text
   */
  stripHtml(html) {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || "";
  }

  extractJobDescription() {
    // Use cached data if available
    if (this.cachedJobDescription) {
      return this.cachedJobDescription;
    }
    return this.extractDescriptionFromDom();
  }

  extractDescriptionFromDom() {
    // Jobvite description selectors - ordered by specificity
    const selectors = [
      ".jv-job-detail-description p",
      ".jv-job-detail-description",
      ".jv-page-body .jv-wrapper",
      ".job-description",
      "[ng-non-bindable]",
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim().length > 100) {
        return element.textContent.trim();
      }
    }

    return "";
  }

  extractJobTitle() {
    // Use cached data if available
    if (this.cachedJobData?.title) {
      return this.cachedJobData.title;
    }
    return this.extractJobTitleFromDom();
  }

  extractJobTitleFromDom() {
    // Jobvite title selectors - ordered by specificity
    const selectors = [
      ".jv-header",
      "h2.jv-header",
      ".jv-page-body h2",
      "h1",
      ".job-title",
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }

    return document.title.split(" - ")[0] || "Job on Jobvite";
  }

  extractLocation() {
    // Use cached data if available
    if (this.cachedJobData?.location) {
      return this.cachedJobData.location;
    }
    return this.extractLocationFromDom();
  }

  extractLocationFromDom() {
    // Jobvite location selectors
    const selectors = [
      ".jv-job-detail-meta",
      "p.jv-job-detail-meta",
      ".job-location",
      ".location",
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        // Parse location from meta string like "Engineering | Arlington, Virginia | JR-814"
        const text = element.textContent.trim();
        const parts = text.split(/\s*\|\s*/).filter(Boolean);
        if (parts.length >= 2) {
          // Second part is usually the location
          return parts[1].trim();
        }
        return text;
      }
    }

    return "Not specified";
  }

  extractCompanyFromDom() {
    // Try to get company from meta tags or page elements
    const metaCompany = document.querySelector('meta[property="og:site_name"]');
    if (metaCompany) {
      return metaCompany.content;
    }

    // Fallback to extracting from URL
    return this.extractCompanyFromUrl(window.location.href) || "Company";
  }

  getJobProperties() {
    // Use comprehensive extraction
    if (!this.cachedJobData) {
      this.extractJobDataFromPage();
    }

    return {
      title: this.cachedJobData?.title || this.extractJobTitle(),
      company:
        this.cachedJobData?.company ||
        this.extractCompanyFromUrl(window.location.href) ||
        "Company",
      location: this.cachedJobData?.location || this.extractLocation(),
      description:
        this.cachedJobData?.description || this.extractJobDescription(),
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
    // Jobvite job URL pattern: https://jobs.jobvite.com/{company}/job/{jobId}
    // Example: https://jobs.jobvite.com/idtus/job/o34Tyfwi

    // Must be on jobs.jobvite.com domain
    if (!url.includes("jobs.jobvite.com")) {
      return false;
    }

    // Must contain /job/ followed by a job ID (not /apply)
    if (url.includes("/apply")) {
      return false; // This is an application page, not a job listing
    }

    // Parse URL to check path structure
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);

      // Must have at least 3 path segments: {company}/job/{jobId}
      if (pathParts.length < 3) {
        return false;
      }

      // Second segment should be "job"
      if (pathParts[1] !== "job") {
        return false;
      }

      // Third segment is the job ID (alphanumeric)
      const jobId = pathParts[2];
      if (!jobId || jobId.length < 3) {
        return false;
      }

      return true;
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
      console.error("Error sending message:", error);
    }
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  cleanup() {
    console.log("🧹 Cleaning up Jobvite...");
    this.isRunning = false;
  }
}
