// platforms/icims/icims.js - iCIMS platform automation
import { UrlUtils, DomUtils } from "../../shared/utilities/index.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";
import Utils from "../../utils/utils.js";
import { IcimsFormHandler } from "./icims-form-handler.js";
import { IcimsFileHandler } from "./icims-file-handler.js";

export default class ICIMSPlatform {
  constructor(config) {
    this.config = config || {};
    this.platform = "icims";
    this.baseUrl = "https://icims.com";

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

    // Cached reference to the document containing iCIMS job content (may be inside an iframe)
    this._jobDocument = null;

    // Track the last page URL we already filled — prevents re-filling the same step
    this._lastFilledPageUrl = null;

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
    console.log("📥 iCIMS handleMessage:", type, data);

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
      console.error("❌ Error setting iCIMS session context:", error);
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

      // iCIMS is an SPA — watch for navigation changes after initial detection
      this.startNavigationWatcher();
    } catch (error) {
      notifyStatus({ type: "APPLICATION_ERROR" });
    }
  }

  // ========================================
  // SPA NAVIGATION WATCHER
  // ========================================

  startNavigationWatcher() {
    if (this._navWatcher) return;
    let lastUrl = window.location.href;
    let lastIframeUrl = this.getIframeUrl();

    this._navWatcher = setInterval(async () => {
      if (!this.isRunning || this._handlingNavigation) return;

      const currentUrl = window.location.href;
      const currentIframeUrl = this.getIframeUrl();
      const urlChanged = currentUrl !== lastUrl;
      const iframeChanged = currentIframeUrl && currentIframeUrl !== lastIframeUrl;

      if (urlChanged || iframeChanged) {
        lastUrl = currentUrl;
        lastIframeUrl = currentIframeUrl;
        this._jobDocument = null; // Reset cached document
        this._lastFilledPageUrl = null; // New page — allow filling
        this.stopEmailErrorObserver(); // Clean up page-specific observer
        console.log("🔄 SPA navigation detected:", currentUrl);
        await Utils.delay(1000); // Let new content render
        await this.detectPageTypeAndStart();
      }
    }, 500);
  }

  stopNavigationWatcher() {
    if (this._navWatcher) {
      clearInterval(this._navWatcher);
      this._navWatcher = null;
    }
  }

  getIframeUrl() {
    try {
      const iframes = document.querySelectorAll("iframe");
      for (const iframe of iframes) {
        try {
          if (iframe.contentWindow?.location?.href) {
            const href = iframe.contentWindow.location.href;
            if (href.includes("icims.com")) return href;
          }
        } catch (e) {}
      }
    } catch (e) {}
    return "";
  }

  /**
   * After clicking Apply, wait for the SPA to navigate to the next page
   * and handle it directly (don't rely on the interval watcher alone).
   */
  async waitForNextPage(preStartUrl, preStartIframeUrl) {
    const startUrl = preStartUrl || window.location.href;
    const startIframeUrl = preStartIframeUrl || this.getIframeUrl();

    for (let i = 0; i < 30; i++) {
      await Utils.delay(1000);
      this._jobDocument = null;

      const url = window.location.href;
      const iframeUrl = this.getIframeUrl();
      const activeUrl = iframeUrl || url;

      const urlChanged = url !== startUrl;
      const iframeChanged = iframeUrl && iframeUrl !== startIframeUrl;

      if (urlChanged || iframeChanged) {
        console.log("🔄 Post-Apply navigation detected:", activeUrl);
        // New page — reset the filled tracker so the new step can be handled
        this._lastFilledPageUrl = null;
        await Utils.delay(1000); // Let content render

        if (/icims\.com\/jobs\/login\b/i.test(activeUrl)) {
          console.log("🔐 Universal login page - skipping");
        } else if (this.isFormPage(activeUrl)) {
          await this.handleQuestionsPage();
        } else if (this.isEmailEntryPage(activeUrl)) {
          await this.handleEmailEntryPage();
        } else if (this.isCandidateFormPage(activeUrl)) {
          await this.handleCandidateFormPage();
        } else if (this.isEeoPage(activeUrl)) {
          await this.handleQuestionsPage();
        } else if (this.isQuestionsPage(activeUrl)) {
          await this.handleQuestionsPage();
        } else if (this.isSuccessPage()) {
          this.stopNavigationWatcher();
          await this.handleSuccessPage();
        }

        // Mark the new page as handled after processing
        this._lastFilledPageUrl = activeUrl;
        return;
      }
    }
    console.log("⚠️ No navigation detected after Apply click");
  }

  async detectPageTypeAndStart() {
    if (this._handlingNavigation) return;
    this._handlingNavigation = true;

    try {
      const url = window.location.href;
      const iframeUrl = this.getIframeUrl();
      const activeUrl = iframeUrl || url;

      // Skip if we already filled this exact page — prevents re-filling the same step
      if (this._lastFilledPageUrl && this._lastFilledPageUrl === activeUrl) {
        console.log("⏭️ Already handled this page, skipping re-fill");
        return;
      }

      // Universal login page — do nothing, let user handle it
      if (/icims\.com\/jobs\/login\b/i.test(url) || /icims\.com\/jobs\/login\b/i.test(iframeUrl)) {
        console.log("🔐 On iCIMS universal login page - skipping");
        return;
      }

      // Detect external login pages — do nothing, let user log in
      if (url.includes("login.icims.com") || url.includes("login-page.icims.com")) {
        notifyStatus({ type: "LOGIN_REQUIRED" });
        console.log("🔐 On iCIMS login page - waiting for user to log in");
        this.isPaused = true;
        return;
      }

      if (url.includes("google.com/search")) {
        await this.startSearchProcess();
      } else if (this.isFormPage(activeUrl)) {
        await this.handleQuestionsPage();
      } else if (this.isEeoPage(activeUrl)) {
        await this.handleQuestionsPage();
      } else if (this.isQuestionsPage(activeUrl)) {
        await this.handleQuestionsPage();
      } else if (this.isCandidateFormPage(activeUrl)) {
        await this.handleCandidateFormPage();
      } else if (this.isEmailEntryPage(activeUrl)) {
        await this.handleEmailEntryPage();
      } else if (this.isSuccessPage()) {
        this.stopNavigationWatcher();
        await this.handleSuccessPage();
      } else if (this.isJobNotFoundPage()) {
        this.stopNavigationWatcher();
        this.sendMessage({
          type: "APPLICATION_SKIPPED",
          data: { url, reason: "Job not found" },
        });
      } else if (this.isValidJobPage(activeUrl)) {
        await this.startApplicationProcess();
      } else {
        this.sendMessage({
          type: "APPLICATION_SKIPPED",
          data: { url, reason: "Unknown page type" },
        });
      }

      // Mark this page as handled — won't re-fill until URL changes
      this._lastFilledPageUrl = activeUrl;
    } finally {
      this._handlingNavigation = false;
    }
  }

  isEmailEntryPage(url) {
    // Match: icims.com/jobs/{id}/{title}/login (email entry step before candidate form)
    return /icims\.com\/jobs\/\d+\/[^/]+\/login/i.test(url);
  }

  isCandidateFormPage(url) {
    // Match: icims.com/jobs/{id}/{title}/candidate
    return /icims\.com\/jobs\/\d+\/[^/]+\/candidate/i.test(url);
  }

  isQuestionsPage(url) {
    return /icims\.com\/jobs\/\d+\/[^/]+\/questions/i.test(url);
  }

  isEeoPage(url) {
    return /icims\.com\/jobs\/\d+\/[^/]+\/eeo/i.test(url);
  }

  isFormPage(url) {
    return /icims\.com\/jobs\/\d+\/[^/]+\/form\b/i.test(url);
  }

  isJobNotFoundPage() {
    const url = window.location.href;
    return url.includes("notFound=1") || url.includes("/jobs/search?");
  }

  initHandlers() {
    const backendApiHost = this.getApiHost();
    const aiApiHost = this.getAiApiHost();
    const jwtToken = this.getJwtToken();
    const preferences = this.sessionContext?.preferences
      || this.config?.config?.preferences || {};

    if (!this.formHandler) {
      this.formHandler = new IcimsFormHandler({
        host: aiApiHost,
        userData: this.userProfile || {},
        jobDescription: this.cachedJobDescription || "",
        jobTitle: this.cachedJobTitle || "",
        copilotMode: this.copilotState?.isInCoPilotMode?.() || false,
        copilotState: this.copilotState,
      });
    } else {
      // Sync job description/title if extracted after handler was created
      if (this.cachedJobDescription) {
        this.formHandler.jobDescription = this.cachedJobDescription;
      }
      if (this.cachedJobTitle) {
        this.formHandler.jobTitle = this.cachedJobTitle;
      }
    }
    if (!this.fileHandler) {
      this.fileHandler = new IcimsFileHandler({
        preferences,
        backendApiHost,
        aiApiHost,
        jwtToken,
      });
    } else {
      // Sync credentials — they may not have been available when handler was first created
      this.fileHandler.backendApiHost = backendApiHost;
      this.fileHandler.aiApiHost = aiApiHost;
      this.fileHandler.jwtToken = jwtToken;
      this.fileHandler.preferences = preferences;
    }
  }

  async handleEmailEntryPage() {
    this.initHandlers();
    console.log("📧 Detected iCIMS email entry page");

    // Wait for content — may be inside an iframe
    const doc = await this.waitForJobContent();
    await Utils.delay(500);

    const targetDoc = doc || document;

    // Capture URLs BEFORE submitting — page may navigate during the 3s error wait
    const preStartUrl = window.location.href;
    const preStartIframeUrl = this.getIframeUrl();

    // Fill email and click Next — form handler watches for "already in use" error
    const result = await this.formHandler.handleEmailEntry(targetDoc);

    if (result === "login_required") {
      console.log("🔐 Email already in use — waiting for user to log in");
      return;
    }

    // hCaptcha pages (step=email) — the invisible captcha may auto-pass.
    // Wait briefly for navigation before falling back to LOGIN_REQUIRED.
    const activeUrl = this.getIframeUrl() || window.location.href;
    if (/[?&]step=email/.test(activeUrl)) {
      console.log("📧 hCaptcha detected — waiting for auto-resolve...");
      // Give invisible hCaptcha up to ~10 seconds to auto-resolve and navigate
      for (let i = 0; i < 20; i++) {
        await Utils.delay(500);
        const currentUrl = window.location.href;
        const currentIframeUrl = this.getIframeUrl();
        const urlChanged = currentUrl !== preStartUrl;
        const iframeChanged = currentIframeUrl && currentIframeUrl !== preStartIframeUrl;
        if (urlChanged || iframeChanged) {
          console.log("📧 hCaptcha auto-resolved — page navigating");
          this._lastFilledPageUrl = null;
          await Utils.delay(1000);
          await this.waitForNextPage(preStartUrl, preStartIframeUrl);
          return;
        }
      }
      // hCaptcha did not auto-resolve — user needs to handle it manually
      console.log("🔐 hCaptcha requires user intervention — showing LOGIN_REQUIRED");
      notifyStatus({ type: "LOGIN_REQUIRED" });
      return;
    }

    // Non-hCaptcha email pages — wait for SPA navigation to candidate/next page
    // Pass pre-captured URLs since the page may have already navigated during waitForEmailError
    console.log("📧 Email submitted — waiting for next page");
    await this.waitForNextPage(preStartUrl, preStartIframeUrl);
  }

  async handleCandidateFormPage() {
    this.initHandlers();
    console.log("📝 Detected iCIMS candidate profile page");

    // Wait for content — may be inside an iframe
    const doc = await this.waitForJobContent();

    // Wait for the form to actually exist in the document (not just the wrapper)
    const form = await this.waitForElement(doc, "#profileForm", 10000);
    if (!form) {
      console.log("⚠️ Profile form not found after waiting — page may still be loading");
      return;
    }

    const jobTitle = this.extractJobTitle();
    notifyStatus({ type: "APPLYING_TO_JOB", data: { title: jobTitle } });
    await Utils.delay(1000);

    const result = await this.formHandler.handleCandidateForm(doc || document, this.fileHandler);
    if (result === "resume_uploading") {
      console.log("📎 Resume uploaded — page will reload for parsing");
      // Don't process further — navigation watcher will detect the reload
      return;
    }
    if (result === true) {
      console.log("📝 Candidate form submitted — waiting for next page");
      // Form submitted — wait for SPA navigation to questions page
      await this.waitForNextPage();
    }
  }

  async handleQuestionsPage() {
    this.initHandlers();
    console.log("📝 Detected iCIMS questions page");

    // Wait for content — may be inside an iframe
    this._jobDocument = null; // Force fresh lookup
    const doc = await this.waitForJobContent();

    // Wait for form in main doc OR accessible iframes
    let form = null;
    let formDoc = doc || document;

    for (let i = 0; i < 20; i++) { // 10 seconds max
      // Check main document first
      form = (doc || document).querySelector("#questions, #profileForm, form");
      if (form) {
        formDoc = doc || document;
        break;
      }

      // Check all accessible iframes recursively
      const iframeResult = this.findFormInAllIframes();
      if (iframeResult) {
        form = iframeResult.form;
        formDoc = iframeResult.doc;
        break;
      }

      await Utils.delay(500);
    }

    if (!form) {
      // Form may be in a cross-origin iframe (e.g. atlassian.icims.com demographics form)
      // Use chrome.scripting.executeScript from the background to handle it
      console.log("🔍 Form not accessible — attempting cross-origin injection via background");
      const handled = await this.handleCrossOriginForm();
      if (handled) {
        console.log("✅ Cross-origin form handled — waiting for next page");
        await this.waitForNextPage();
      } else {
        console.log("⚠️ Questions form not found after waiting");
      }
      return;
    }

    const jobTitle = this.extractJobTitle();
    notifyStatus({ type: "FILLING_FORM", data: { title: jobTitle } });
    await Utils.delay(1000);

    const result = await this.formHandler.handleQuestionsForm(formDoc);
    if (result === "waiting_for_user") {
      console.log("🤝 Co-pilot: waiting for user to submit questions");
    } else if (result === true) {
      console.log("📝 Questions form submitted — waiting for next page");
      await this.waitForNextPage();
    }
  }

  /**
   * Handle a form inside a cross-origin iframe by asking the background
   * to inject a self-contained handler via chrome.scripting.executeScript.
   * Returns true if the form was found and handled.
   */
  async handleCrossOriginForm() {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "HANDLE_CROSS_ORIGIN_FORM" }, resolve);
      });
      return response?.success === true;
    } catch (e) {
      console.warn("⚠️ Cross-origin form injection failed:", e.message);
      return false;
    }
  }

  /**
   * Search all same-origin iframes for a form element.
   * Used when the form is loaded in a child iframe (e.g. demographics survey).
   */
  findFormInIframes() {
    const iframes = document.querySelectorAll("iframe");
    for (const iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          const form = iframeDoc.querySelector("form");
          if (form) {
            return { form, doc: iframeDoc };
          }
        }
      } catch (e) {}
    }
    return null;
  }

  /**
   * Recursively search all same-origin iframes (including nested) for a form.
   * Also searches iframes inside the job document returned by waitForJobContent.
   */
  findFormInAllIframes() {
    const searched = new Set();

    const searchDoc = (doc) => {
      if (!doc || searched.has(doc)) return null;
      searched.add(doc);

      const iframes = doc.querySelectorAll("iframe");
      for (const iframe of iframes) {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc && !searched.has(iframeDoc)) {
            const form = iframeDoc.querySelector("form");
            if (form) {
              return { form, doc: iframeDoc };
            }
            // Recurse into nested iframes
            const nested = searchDoc(iframeDoc);
            if (nested) return nested;
          }
        } catch (e) {}
      }
      return null;
    };

    // Search from top document
    let result = searchDoc(document);
    if (result) return result;

    // Also search from the cached job document (may be an iframe doc with its own iframes)
    if (this._jobDocument && this._jobDocument !== document) {
      result = searchDoc(this._jobDocument);
      if (result) return result;
    }

    return null;
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
      document.querySelectorAll('a[href*="icims.com"]')
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
    const allLinks = document.querySelectorAll('a[href*="icims.com"]');
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
    // iCIMS URL formats:
    // https://careers-{company}.icims.com/jobs/{jobId}/job
    // https://{company}.icims.com/jobs/{jobId}/job
    const companyPattern = /(?:careers-)?([^.]+)\.icims\.com/i;
    const match = url.match(companyPattern);
    if (match) {
      return match[1].replace("careers-", "");
    }
    return null;
  }

  normalizeJobUrl(url) {
    let normalized = url.split("?")[0].replace(/\/$/, "");
    return normalized;
  }

  extractJobId(url) {
    // Extract job ID from iCIMS URL - typically: /jobs/{jobId}/job
    const jobPattern = /\/jobs\/(\d+)/i;
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
      const links = document.querySelectorAll('a[href*="icims.com"]');
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
      // Check if the page redirected to a "not found" search page
      if (this.isJobNotFoundPage()) {
        console.log("⚠️ Job not found — page redirected to search");
        this.sendMessage({
          type: "APPLICATION_SKIPPED",
          data: { url: window.location.href, reason: "Job not found" },
        });
        return;
      }

      // Wait for iCIMS job content to load (may be inside an iframe) — no timeout
      const jobDoc = await this.waitForJobContent(0);

      // Re-check after content loads in case of late redirect
      if (this.isJobNotFoundPage()) {
        console.log("⚠️ Job not found — redirected after load");
        this.sendMessage({
          type: "APPLICATION_SKIPPED",
          data: { url: window.location.href, reason: "Job not found" },
        });
        return;
      }

      const jobTitle = this.extractJobTitle();
      this.cachedJobTitle = jobTitle;

      notifyStatus({
        type: "APPLYING_TO_JOB",
        data: { title: jobTitle },
      });

      await Utils.delay(1500);

      // Extract job description and build enriched version with metadata for AI context
      const rawJobDescription = this.extractJobDescription();
      const company = this.extractCompanyFromUrl(window.location.href) || "";
      const location = this.extractLocation();
      const jobDescParts = [];
      if (jobTitle) jobDescParts.push(`Job Title: ${jobTitle}`);
      if (company && company !== "Company") jobDescParts.push(`Company: ${company}`);
      if (location && location !== "Not specified") jobDescParts.push(`Location: ${location}`);
      if (rawJobDescription) jobDescParts.push(`\nJob Description:\n${rawJobDescription}`);
      this.cachedJobDescription = jobDescParts.length > 0 ? jobDescParts.join('\n') : rawJobDescription;

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

      // Click the Apply button
      const doc = this.getJobDocument();
      const applyButton = doc.querySelector("a.iCIMS_ApplyOnlineButton");
      if (applyButton) {
        console.log("📝 Clicking iCIMS Apply button");
        applyButton.click();
        // SPA — wait for navigation then handle the next page
        await this.waitForNextPage();
      } else {
        console.log("⚠️ Apply button not found on page");
        notifyStatus({ type: "APPLICATION_ERROR", data: { message: "Apply button not found" } });
      }
    } catch (error) {
      console.error("Error in startApplicationProcess:", error);
      this.handleApplicationError(error);
    }
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
      jobId: this.extractJobId(window.location.href) || Utils.generateId("ic_"),
      title: jobTitle,
      company: companyName,
      location: this.extractLocation(),
      description: this.cachedJobDescription || "",
      jobUrl: window.location.href,
      platform: "icims",
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
    console.log("🎉 iCIMS success page detected!");

    const jobTitle = this.extractJobTitle();
    const companyName =
      this.extractCompanyFromUrl(window.location.href) || "Company";

    const jobData = {
      jobId: this.extractJobId(window.location.href),
      title: jobTitle,
      company: companyName,
      location: this.extractLocation(),
      description: this.cachedJobDescription || "",
      jobUrl: window.location.href,
      platform: "icims",
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
    // TODO: Update with actual iCIMS success page detection selectors
    const successIndicators = [
      '[data-testid="success"]',
      ".application-success",
      ".confirmation-message",
      ".success-message",
      ".iCIMS_SuccessMessage",
    ];

    const doc = this.getJobDocument();
    for (const selector of successIndicators) {
      if (doc.querySelector(selector)) {
        return true;
      }
    }

    // Also check for common success page text
    const pageText = (doc.body || document.body)?.innerText?.toLowerCase() || "";
    if (
      pageText.includes("application submitted") ||
      pageText.includes("thank you for applying") ||
      pageText.includes("your application has been received")
    ) {
      return true;
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
  // IFRAME-AWARE DOM ACCESS
  // ========================================

  /**
   * Get the document containing iCIMS job content.
   * iCIMS renders job pages inside a same-origin iframe, so the content
   * may not be in the top-level document.
   */
  getJobDocument() {
    if (this._jobDocument) return this._jobDocument;

    // Check top-level document first
    if (document.querySelector(".iCIMS_MainWrapper")) {
      this._jobDocument = document;
      return document;
    }

    // Check same-origin iframes
    const iframes = document.querySelectorAll("iframe");
    for (const iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc && iframeDoc.querySelector(".iCIMS_MainWrapper")) {
          this._jobDocument = iframeDoc;
          return iframeDoc;
        }
      } catch (e) {
        // Cross-origin iframe, skip
      }
    }

    return document;
  }

  /**
   * Wait for iCIMS job content to be available (top-level or inside an iframe).
   */
  async waitForJobContent(interval = 500) {
    return new Promise((resolve) => {
      const check = () => {
        // Check top-level document
        if (document.querySelector(".iCIMS_MainWrapper")) {
          this._jobDocument = document;
          resolve(document);
          return;
        }

        // Check iframes
        const iframes = document.querySelectorAll("iframe");
        for (const iframe of iframes) {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc && iframeDoc.querySelector(".iCIMS_MainWrapper")) {
              this._jobDocument = iframeDoc;
              resolve(iframeDoc);
              return;
            }
          } catch (e) {
            // Cross-origin, skip
          }
        }

        setTimeout(check, interval);
      };
      check();
    });
  }

  /**
   * Wait for a specific element to appear in a document.
   * Returns the element or null if timeout.
   */
  async waitForElement(doc, selector, timeout = 10000) {
    const interval = 500;
    const maxAttempts = Math.ceil(timeout / interval);
    for (let i = 0; i < maxAttempts; i++) {
      const el = doc.querySelector(selector);
      if (el) return el;
      await Utils.delay(interval);
    }
    return null;
  }

  // ========================================
  // JOB DATA EXTRACTION
  // ========================================

  extractJobDescription() {
    const doc = this.getJobDocument();
    const selectors = [
      ".iCIMS_Expandable_Text",
      ".iCIMS_InfoMsg_Job",
      ".iCIMS_InfoMsg.iCIMS_InfoMsg_Job",
      ".iCIMS_JobContent",
      ".iCIMS_Expandable_Container",
    ];

    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }

    const mainContent = doc.querySelector(".iCIMS_JobContainer, main");
    if (mainContent) {
      return mainContent.textContent.trim();
    }

    return "";
  }

  extractJobTitle() {
    const doc = this.getJobDocument();
    const selectors = [
      "h1.iCIMS_Header",
      "#iCIMS_Header h1",
      ".iCIMS_Header",
      "h1",
    ];

    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }

    return document.title.split(" - ")[0] || "Job on iCIMS";
  }

  extractLocation() {
    const doc = this.getJobDocument();
    // Location is in: .col-xs-6.header.left > span (skip the sr-only label span)
    const locationContainer = doc.querySelector(".col-xs-6.header.left");
    if (locationContainer) {
      const spans = locationContainer.querySelectorAll("span:not(.sr-only)");
      for (const span of spans) {
        const text = span.textContent.trim();
        if (text) return text;
      }
    }

    const selectors = [
      ".iCIMS_JobHeaderLocation",
      ".iCIMS_JobLocation",
    ];

    for (const selector of selectors) {
      const element = doc.querySelector(selector);
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
  // JOB MATCHING (Apply Only Matching / Apply Only Qualified)
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
        // Check if user is qualified for the job
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
        // Check if job matches user preferences
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
  // CO-PILOT ACTIONS (Skip, Pause, Resume, Mode Switch)
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

        case COPILOT_ACTIONS.NEXT:
          console.log("➡️ User clicked next (co-pilot)");
          // In co-pilot mode, advance to next step
          this.copilotState.resolveWaitingAction();
          break;

        case COPILOT_ACTIONS.SUBMIT:
          console.log("📤 User clicked submit (co-pilot)");
          // In co-pilot mode, proceed with form submission
          this.copilotState.resolveWaitingAction();
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
    // iCIMS job URL patterns:
    // https://careers-{company}.icims.com/jobs/{jobId}/job
    // https://{company}.icims.com/jobs/{jobId}/job

    // Must contain icims.com
    if (!url.includes("icims.com")) {
      return false;
    }

    // Must contain /jobs/ followed by a numeric job ID
    const jobPattern = /icims\.com\/jobs\/\d+/i;
    return jobPattern.test(url);
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

  // ========================================
  // EMAIL "ALREADY IN USE" ERROR OBSERVER
  // ========================================

  /**
   * Start observing for "email already in use" error messages.
   * iCIMS shows a div.iCIMS_ErrorMessage when the submitted email
   * is already registered. We detect this in real-time and show
   * the LOGIN_REQUIRED overlay so the user knows they need to log in.
   */
  startEmailErrorObserver(doc) {
    this.stopEmailErrorObserver();

    const checkForError = () => {
      const errorMessages = doc.querySelectorAll(".iCIMS_ErrorMessage");
      for (const el of errorMessages) {
        if (el.textContent.toLowerCase().includes("already in use")) {
          console.log("🔐 Email already in use error detected — showing LOGIN_REQUIRED");
          notifyStatus({ type: "LOGIN_REQUIRED" });
          this.stopEmailErrorObserver();
          return true;
        }
      }
      return false;
    };

    // Check if error already exists in DOM
    if (checkForError()) return;

    // Watch for new error elements being injected
    this._emailErrorObserver = new MutationObserver(() => {
      checkForError();
    });

    this._emailErrorObserver.observe(doc.body || doc.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  stopEmailErrorObserver() {
    if (this._emailErrorObserver) {
      this._emailErrorObserver.disconnect();
      this._emailErrorObserver = null;
    }
  }

  cleanup() {
    console.log("🧹 Cleaning up iCIMS...");
    this.stopEmailErrorObserver();
    this.isRunning = false;
  }
}
