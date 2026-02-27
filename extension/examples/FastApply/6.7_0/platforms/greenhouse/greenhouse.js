// platforms/greenhouse/greenhouse.js - Clean implementation following Workable pattern
import GreenhouseFormHandler from "./greenhouse-form-handler.js";
import GreenhouseFileHandler from "./greenhouse-file-handler.js";
import { UrlUtils, DomUtils } from "../../shared/utilities/index.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";
import Utils from "../../utils/utils.js";

export default class GreenhousePlatform {
  constructor(config) {
    this.config = config || {};
    this.platform = "greenhouse";
    this.baseUrl = "https://boards.greenhouse.io";

    // Session context
    this.sessionContext = config?.sessionContext || null;
    this.sessionId = config?.sessionId || null;
    this.userId = config?.userId || null;
    this.userProfile = config?.userProfile || null;

    // Control state
    this.isRunning = false;
    this.isPaused = false;

    // Processing guards - prevent duplicate form processing
    this.isProcessingApplication = false;
    this.hasStartedAutomation = false;
    this.hasSetLocationFilter = false;
    this.isSearchingJobs = false;

    // API hosts (initialized in setSessionContext)
    this.aiApiHost = null;
    this.backendApiHost = null;

    // Handlers
    this.fileHandler = null;
    this.formHandler = null;

    // UI: Global overlay managed by content-status-overlay.js

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
    // Global overlay is managed by content-status-overlay.js
    // Initial notification to show overlay
    notifyStatus({ type: "AUTOMATION_STARTING" });

    // Apply session context preferences (including co-pilot mode)
    if (this.sessionContext) {
      await this.setSessionContext(this.sessionContext);
    }

    this.setupMessageListeners();
  }

  /**
   * Ensure overlay is shown - triggers global overlay
   */
  ensureOverlay() {
    // Global overlay is managed by content-status-overlay.js
    notifyStatus({ type: "FILLING_FORM" });
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

    // Setup URL change listener for SPA navigation (e.g., after login)
    this.setupUrlChangeListener();
  }

  /**
   * Listen for URL changes in SPAs (no page refresh).
   * This handles cases like login page → jobs page navigation.
   */
  setupUrlChangeListener() {
    // Store the current URL to detect changes
    this.lastUrl = window.location.href;

    // Method 1: Intercept History API (pushState/replaceState)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    const self = this;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      self.handleUrlChange();
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      self.handleUrlChange();
    };

    // Method 2: Listen for popstate (back/forward buttons)
    window.addEventListener("popstate", () => {
      this.handleUrlChange();
    });

    // Method 3: Periodic check as fallback (for any edge cases)
    this.urlCheckInterval = setInterval(() => {
      if (window.location.href !== this.lastUrl) {
        this.handleUrlChange();
      }
    }, 1000);
  }

  /**
   * Handle URL change - re-run page detection logic
   */
  handleUrlChange() {
    const newUrl = window.location.href;

    // Only proceed if URL actually changed
    if (newUrl === this.lastUrl) return;

    console.log(`🔄 URL changed: ${this.lastUrl} → ${newUrl}`);
    this.lastUrl = newUrl;

    // Reset processing flags since we're on a new page
    this.isProcessingApplication = false;
    // Don't reset hasStartedAutomation - we're still in the same session

    // Wait a moment for the new page to render, then re-detect
    setTimeout(async () => {
      // If we were on login page and now we're not, re-run detection
      if (!newUrl.includes("/users/sign_in")) {
        console.log("🔄 Re-running page detection after navigation");
        await this.detectPageTypeAndStart();
      }
    }, 1000);
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
        this.startApplication();
        break;

      case "COPILOT_ACTION":
        this.handleCoPilotAction(data);
        break;

      default:
        break;
    }
  }

  /**
   * CRITICAL: Handle SEARCH_NEXT - Mark previous job and open next job
   */
  handleSearchNext(data) {
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
      notifyStatus({ type: "APPLICATION_ERROR" });
      // Reset flag on error so retry is possible
      this.hasStartedAutomation = false;
    }
  }

  async detectPageTypeAndStart() {
    const url = window.location.href;

    // Login page detection - prompt user to login
    if (url.includes("my.greenhouse.io/users/sign_in")) {
      console.log(
        "🔐 Greenhouse login page detected - prompting user to login"
      );

      notifyStatus({
        type: "LOGIN_REQUIRED",
        data: { platform: "Greenhouse" },
      });
      return;
    }
    if (url.includes("google.com/search")) {
      await this.startSearchProcess();
      // if (url.includes("my.greenhouse.io/jobs")) {
      //   await this.startGreenhouseSearchProcess();
    } else if (this.isSuccessPage(url)) {
      await this.handleSuccessfulSubmission(this.cachedJobDescription);
    } else if (this.isValidJobPage(url)) {
      await this.navigateToApplicationAndStart();
    } else {
      console.log("Invalid page - not a job listing");
      this.sendMessage({
        type: "APPLICATION_SKIPPED",
        data: { url, reason: "Invalid page - not a job listing" },
      });
    }
  }

  /**
   * Start search process on my.greenhouse.io/jobs page
   */
  async startGreenhouseSearchProcess() {
    // Guard: Prevent duplicate search processes
    if (this.isSearchingJobs) {
      console.log("⏭️ Already searching for jobs - ignoring duplicate call");
      return;
    }
    this.isSearchingJobs = true;

    console.log("🔍 Starting Greenhouse native search process");
    notifyStatus({
      type: "JOB_SEARCH_STARTED",
      data: { preferences: this.config?.config?.preferences || {} },
    });

    // Set location filter before searching
    await this.setLocationFilter();

    this.sendMessage({ type: "GET_SEARCH_TASK" });

    // Wait for job cards to load before finding jobs
    await this.waitForJobCardsToLoad();

    this.findAndOpenNextJob();
  }

  /**
   * Wait for job cards to load on the search results page
   */
  async waitForJobCardsToLoad(timeout = 15000) {
    console.log("⏳ Waiting for job cards to load...");
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check if job cards are present
      const jobCards = document.querySelectorAll(
        '[data-provides="search-result"]'
      );

      if (jobCards.length > 0) {
        console.log(`✅ Found ${jobCards.length} job cards loaded`);
        await Utils.delay(500); // Small extra delay to ensure DOM is stable
        return true;
      }

      // Check for "no results" message
      const noResults =
        document.querySelector('[data-provides="no-results"]') ||
        document.querySelector(".no-results") ||
        document.body.textContent?.includes("No jobs found");

      if (noResults) {
        console.log("⚠️ No job results found");
        return false;
      }

      await Utils.delay(500);
    }

    console.warn("⚠️ Timeout waiting for job cards to load");
    return false;
  }

  /**
   * Set location filter on Greenhouse search page
   * Types the preference city slowly, waits for options, and selects the best match
   */
  async setLocationFilter() {
    // Check if we've already set the location filter (persisted in sessionStorage)
    const filterKey = "greenhouse_location_filter_set";
    if (sessionStorage.getItem(filterKey)) {
      console.log("📍 Location filter already set, skipping");
      return;
    }

    const preferences = this.config?.config?.preferences || {};
    const city = preferences.city || "";
    const country = preferences.country || "";

    if (!city) {
      console.log("📍 No city preference set, skipping location filter");
      return;
    }

    console.log(`📍 Setting location filter: ${city}, ${country}`);

    try {
      // Find the location input field
      const locationInput = document.querySelector(
        'input[id*="react-select"][aria-describedby*="placeholder"]' +
          ", .select__input-container input" +
          ', input[aria-autocomplete="list"][role="combobox"]'
      );

      if (!locationInput) {
        console.warn("⚠️ Location input field not found");
        return;
      }

      // Click on the container to open the dropdown first
      const selectContainer =
        locationInput.closest(".select__control") ||
        locationInput.closest('[class*="select__"]') ||
        locationInput.parentElement;
      if (selectContainer) {
        selectContainer.click();
        await Utils.delay(300);
      }

      // Focus the input
      locationInput.focus();
      await Utils.delay(200);

      // Simulate mouse down/up events to fully activate
      locationInput.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      );
      locationInput.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      locationInput.click();
      await Utils.delay(300);

      // Type the city slowly, character by character
      // Extract just the city name (before the comma if present, e.g., "New York, NY" -> "New York")
      const searchText = city.includes(",") ? city.split(",")[0].trim() : city;
      for (const char of searchText) {
        // Simulate keydown event
        const keydownEvent = new KeyboardEvent("keydown", {
          key: char,
          code: `Key${char.toUpperCase()}`,
          bubbles: true,
        });
        locationInput.dispatchEvent(keydownEvent);

        // Update the value
        locationInput.value += char;

        // Dispatch input event (React listens to this)
        locationInput.dispatchEvent(new Event("input", { bubbles: true }));
        locationInput.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: char,
          })
        );

        // Simulate keyup event
        const keyupEvent = new KeyboardEvent("keyup", {
          key: char,
          code: `Key${char.toUpperCase()}`,
          bubbles: true,
        });
        locationInput.dispatchEvent(keyupEvent);

        await Utils.delay(200); // 200ms between characters for slower typing
      }

      // Wait for dropdown options to load
      await Utils.delay(1500);

      // Find all dropdown options
      const options = document.querySelectorAll(
        '[class*="select__option"], [id*="react-select"][role="option"]'
      );

      if (options.length === 0) {
        console.warn("⚠️ No location options found");
        return;
      }

      console.log(`📍 Found ${options.length} location options`);

      // Find the best matching option
      const targetLocation = country
        ? `${city}, ${country}`.toLowerCase()
        : city.toLowerCase();
      let bestMatch = null;
      let bestScore = -1;

      for (const option of options) {
        const optionText = option.textContent?.trim().toLowerCase() || "";

        // Calculate match score
        let score = 0;

        // Exact match gets highest score
        if (optionText === targetLocation) {
          score = 100;
        }
        // Contains both city and country
        else if (
          optionText.includes(city.toLowerCase()) &&
          country &&
          optionText.includes(country.toLowerCase())
        ) {
          score = 80;
        }
        // Starts with city name
        else if (optionText.startsWith(city.toLowerCase())) {
          score = 60;
        }
        // Contains city name
        else if (optionText.includes(city.toLowerCase())) {
          score = 40;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = option;
        }
      }

      if (bestMatch) {
        console.log(`📍 Selecting location: ${bestMatch.textContent?.trim()}`);
        bestMatch.click();
        await Utils.delay(800);

        // Mark location filter as set before clicking Search (persists across page refresh)
        sessionStorage.setItem(filterKey, "true");

        // Click the Search button
        await this.clickSearchButton();
      } else {
        console.warn("⚠️ No matching location found");
        // Clear the input and continue without filter
        locationInput.value = "";
        locationInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } catch (error) {
      console.error("❌ Error setting location filter:", error);
    }
  }

  /**
   * Click the Search button on Greenhouse search page
   */
  async clickSearchButton() {
    try {
      const searchButton = document.querySelector(
        'button.btn.btn--rounded.btn--large.btn__primary[type="button"]'
      );

      if (
        searchButton &&
        searchButton.textContent?.trim().toLowerCase() === "search"
      ) {
        console.log("🔍 Clicking Search button");
        searchButton.click();
        await Utils.delay(2000); // Wait for search results to load
      } else {
        console.warn("⚠️ Search button not found");
      }
    } catch (error) {
      console.error("❌ Error clicking search button:", error);
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
    if (!this.isRunning) {
      console.log("⏹️ Not running, stopping job search");
      return;
    }

    const links = this.findAllJobLinks();

    if (links.length === 0) {
      this.handleNoJobsFound();
      return;
    }

    for (const link of links) {
      const url = link.href;

      // Check both the link AND its card element for processed class
      const isProcessed =
        link.classList.contains("fastapply-processed") ||
        (link._cardElement &&
          link._cardElement.classList.contains("fastapply-processed"));

      if (isProcessed) {
        continue;
      }

      // Check both the link AND its card element for invalid class
      const isInvalid =
        link.classList.contains("fastapply-invalid") ||
        (link._cardElement &&
          link._cardElement.classList.contains("fastapply-invalid"));

      if (isInvalid) {
        continue;
      }

      if (!this.isValidJobPage(url)) {
        link.classList.add("fastapply-invalid");
        if (link._cardElement) {
          link._cardElement.classList.add("fastapply-invalid");
        }
        this.markLinkAsColor(link, "red", "Invalid");
        continue;
      }

      this.openJob(link, url);
      return;
    }

    this.handleNoJobsFound();
  }

  findAllJobLinks() {
    const url = window.location.href;

    // On my.greenhouse.io/jobs, extract job cards
    if (url.includes("my.greenhouse.io/jobs")) {
      return this.findJobCardsFromGreenhouseSearch();
    }

    // Google search fallback - find all greenhouse links
    const allLinks = Array.from(
      document.querySelectorAll('a[href*="greenhouse.io"]')
    );

    // Filter to valid job pages and deduplicate by URL
    const seenUrls = new Set();
    const uniqueLinks = [];

    for (const link of allLinks) {
      const linkUrl = link.href;

      // Skip if not a valid job page
      if (
        !this.isValidJobPage(linkUrl) &&
        !/^https:\/\/(job-boards|boards)\.greenhouse\.io\/[^\/]+\/jobs\/[^\/]+/.test(
          linkUrl
        )
      ) {
        continue;
      }

      // Normalize URL to prevent duplicates (remove hash, query params, trailing slash)
      const normalizedUrl = linkUrl
        .split("#")[0]
        .split("?")[0]
        .replace(/\/$/, "");

      // Skip if we've already seen this URL
      if (seenUrls.has(normalizedUrl)) {
        continue;
      }

      seenUrls.add(normalizedUrl);
      uniqueLinks.push(link);
    }

    console.log(
      `🔍 Found ${uniqueLinks.length} unique Greenhouse job links (from ${allLinks.length} total)`
    );
    return uniqueLinks;
  }

  /**
   * Find job cards from my.greenhouse.io/jobs search results
   * Returns an array of link elements with job info attached
   */
  findJobCardsFromGreenhouseSearch() {
    const jobCards = Array.from(
      document.querySelectorAll('[data-provides="search-result"]')
    );

    const jobLinks = [];

    for (const card of jobCards) {
      // Find the "View job" button/link in each card
      const viewJobLink = card.querySelector("a.btn[href]");
      if (!viewJobLink) continue;

      const url = viewJobLink.href;
      if (!url) continue;

      // Extract job info from card
      const titleEl = card.querySelector("h4.section-title");
      const companyEl = card.querySelector(".flex.flex-col p.body");
      const locationTag = card.querySelector(".tag-text");

      // Attach metadata to link element for later use
      viewJobLink._jobTitle = titleEl?.textContent?.trim() || "";
      viewJobLink._company = companyEl?.textContent?.trim() || "";
      viewJobLink._location = locationTag?.textContent?.trim() || "";
      viewJobLink._cardElement = card;

      jobLinks.push(viewJobLink);
    }

    console.log(
      `📋 Found ${jobLinks.length} job cards on Greenhouse search page`
    );
    return jobLinks;
  }

  async openJob(linkElement, url) {
    // Mark BOTH the link AND the card as processed to prevent re-selection
    linkElement.classList.add("fastapply-processed");
    if (linkElement._cardElement) {
      linkElement._cardElement.classList.add("fastapply-processed");
      linkElement._cardElement.style.border = "2px solid #2196F3";
    }

    // Extract job title from metadata or element
    const jobTitle =
      linkElement._jobTitle ||
      linkElement.querySelector("h3")?.textContent?.trim() ||
      linkElement.querySelector("h4")?.textContent?.trim() ||
      linkElement.textContent?.trim() ||
      "Job";

    const company = linkElement._company || "";

    this.markLinkAsColor(linkElement, "blue", "Processing");
    this.sendMessage({
      type: "START_APPLICATION",
      data: {
        url: url,
        jobId: this.extractGreenhouseJobId(url),
        company: company,
        title: jobTitle,
        requestId: `req_${Date.now()}`,
      },
    });
  }

  extractGreenhouseJobId(url) {
    // Greenhouse URLs: boards.greenhouse.io/company/jobs/123456
    const match = url.match(/\/jobs\/(\d+)/);
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
      const links = document.querySelectorAll('a[href*="greenhouse.io"]');
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
    // First, try to find "See more jobs" button (Greenhouse search page)
    const seeMoreBtn = this.findSeeMoreJobsButton();

    if (seeMoreBtn && !this.isPaused) {
      console.log("📋 Clicking 'See more jobs' to load more listings");
      notifyStatus({
        type: "LOADING_MORE_JOBS",
        data: { message: "Loading more jobs..." },
      });
      seeMoreBtn.click();
      // Wait for new jobs to load, then continue
      setTimeout(() => {
        if (!this.isPaused) this.findAndOpenNextJob();
      }, 2000);
      return;
    }

    // Fall back to pagination (for Google search or other pages)
    const nextBtn = this.findNextPageButton();

    if (nextBtn && !this.isPaused) {
      console.log("📄 Clicking next page button");
      nextBtn.click();
      setTimeout(() => {
        if (!this.isPaused) this.findAndOpenNextJob();
      }, 3000);
    } else {
      console.log("✅ No more jobs found - search completed");
      notifyStatus({ type: "SEARCH_COMPLETED" });
      this.sendMessage({ type: "SEARCH_COMPLETED" });
    }
  }

  /**
   * Find the "See more jobs" button on Greenhouse search page
   */
  findSeeMoreJobsButton() {
    // Look for the specific Greenhouse "See more jobs" button
    const buttons = document.querySelectorAll("button.btn.btn__tertiary");
    for (const btn of buttons) {
      const spanText = btn
        .querySelector("span")
        ?.textContent?.trim()
        .toLowerCase();
      if (
        spanText === "see more jobs" ||
        spanText === "load more" ||
        spanText === "show more"
      ) {
        if (btn.offsetParent !== null) {
          // Check if visible
          return btn;
        }
      }
    }

    // Also try finding by text content directly
    const allButtons = document.querySelectorAll("button");
    for (const btn of allButtons) {
      const text = btn.textContent?.trim().toLowerCase();
      if (text === "see more jobs" || text === "load more jobs") {
        if (btn.offsetParent !== null) {
          return btn;
        }
      }
    }

    return null;
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
    // Guard: Prevent duplicate application processing
    if (this.isProcessingApplication) {
      console.log(
        "⏭️ navigateToApplicationAndStart() called but already processing - ignoring"
      );
      return;
    }
    this.isProcessingApplication = true;
    console.log(
      "🚀 navigateToApplicationAndStart() - starting application flow"
    );

    try {
      // Extract job description from job listing page first
      const jobDescription = await this.extractJobDescription();
      this.cachedJobDescription = jobDescription;
      // Save to localStorage for retrieval on confirmation page
      localStorage.setItem(
        "greenhouse_pending_job",
        JSON.stringify(jobDescription)
      );

      // Check if job matches preferences
      if (
        this.config.config.preferences?.applyOnlyMatching ||
        this.config.config.preferences?.applyOnlyQualified
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

          this.isProcessingApplication = false;
          return;
        }
      }

      // Find and click Apply button
      const applyButton = this.findApplyButton();
      if (applyButton) {
        applyButton.click();
        await this.waitForApplicationForm();
        await this.startApplication(true); // internalCall=true bypasses guard
      } else {
        // If no apply button, we might already be on the form
        await this.startApplication(true); // internalCall=true bypasses guard
      }
    } catch (error) {
      this.isProcessingApplication = false;
      this.handleApplicationError(error);
    }
  }

  async startApplication(internalCall = false) {
    // Guard: Prevent duplicate application processing from external calls
    // internalCall=true when called from navigateToApplicationAndStart (already guarded)
    if (!internalCall && this.isProcessingApplication) {
      console.log(
        "⏭️ startApplication() called but already processing - ignoring"
      );
      return;
    }
    // Set the flag when called directly (e.g., from START_AUTOMATION_NOW)
    if (!internalCall) {
      this.isProcessingApplication = true;
    }
    console.log("📝 startApplication() - beginning form processing");

    try {
      const jobDetails =
        this.cachedJobDescription || (await this.extractJobDescription());

      const form = await this.findApplicationForm();

      if (!form) {
        throw new Error("Cannot find application form");
      }

      await this.processApplicationForm(form, jobDetails);
    } catch (error) {
      console.error("Error in startApplication:", error);
      this.isProcessingApplication = false;
    }
  }

  async findApplicationForm() {
    const selectors = [
      "#application_form",
      'form[action*="greenhouse"]',
      'form[action*="applications"]',
      "form.application-form",
      "form#application-form",
      "#s2id_job_application_location",
      "form",
    ];

    for (const selector of selectors) {
      const form = await Utils.waitForElement(selector, 2000);
      if (form) return form.closest("form") || form;
    }

    return null;
  }

  async processApplicationForm(form, jobDescription) {
    try {
      // Ensure global overlay is visible
      notifyStatus({ type: "FILLING_FORM" });

      // Step 1: Initialize form handler
      if (!this.formHandler && this.userProfile) {
        this.formHandler = new GreenhouseFormHandler({
          host: this.getAiApiHost(),
          userData: this.userProfile,
          platform: this.platform,
          copilotMode: this.copilotState.isInCoPilotMode(),
          copilotState: this.copilotState,
          jobId: jobDescription.jobId,
        });
      }

      // Step 2: Initialize file handler
      if (!this.fileHandler && this.userProfile) {
        this.fileHandler = new GreenhouseFileHandler({
          backendApiHost: this.getApiHost(),
          aiApiHost: this.getAiApiHost(),
          jwtToken: this.getJwtToken(),
          preferences:
            this.sessionContext?.preferences ||
            this.config?.config?.preferences,
        });
      }

      // Build enriched job description with job metadata for AI context
      if (this.formHandler) {
        const jobDescParts = [];
        if (jobDescription.title) jobDescParts.push(`Job Title: ${jobDescription.title}`);
        if (jobDescription.company) jobDescParts.push(`Company: ${jobDescription.company}`);
        if (jobDescription.location) jobDescParts.push(`Location: ${jobDescription.location}`);
        if (jobDescription.department) jobDescParts.push(`Department: ${jobDescription.department}`);
        if (jobDescription.fullDescription) jobDescParts.push(`\nJob Description:\n${jobDescription.fullDescription}`);
        const enrichedJobDescription = jobDescParts.join('\n');

        this.formHandler.jobDescription = enrichedJobDescription;
        this.formHandler.userData = this.userProfile;
        this.formHandler.currentJobTitle =
          jobDescription.title || document.title;
      }

      // Step 3: Handle file uploads FIRST (sequential)
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
          await this.fileHandler.handleFileUploads(
            form,
            this.userProfile,
            jobDescription.fullDescription,
            jobDescription.jobId,
            jobDescription.title || ""
          );
          console.log("✅ File uploads completed");
        } catch (error) {
          console.warn("⚠️ File upload warning:", error);
        }
      }
      await Utils.delay(500);

      // Step 4: Fill form fields AFTER file uploads (sequential)
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
      if (submitted === "CAPTCHA_PENDING") {
        console.log("⏸️ CAPTCHA pending - waiting for user");
      } else {
        throw new Error("Form submission failed");
      }
    } catch (error) {
      console.error("❌ Error processing form:", error);
      throw error;
    }
  }

  async handleSuccessfulSubmission(jobDescription) {
    console.log("✅ Application submitted successfully");

    // Retrieve from localStorage if not available in memory (page navigated to confirmation URL)
    if (!jobDescription) {
      try {
        const stored = localStorage.getItem("greenhouse_pending_job");
        if (stored) {
          jobDescription = JSON.parse(stored);
          localStorage.removeItem("greenhouse_pending_job");
        }
      } catch (e) {
        console.error("Error retrieving job description from localStorage:", e);
      }
    }

    jobDescription = jobDescription || {};

    // Reset processing flag - this application is complete
    this.isProcessingApplication = false;

    notifyStatus({
      type: "APPLICATION_SUBMITTED",
      data: { title: jobDescription.title || "Job" },
    });

    const jobData = {
      jobId:
        this.extractGreenhouseJobId(window.location.href) ||
        Utils.generateId("greenhouse_"),
      title: jobDescription.title || document.title || "Job on Greenhouse",
      company: jobDescription.company || "Company on Greenhouse",
      location: jobDescription.location || "Not specified",
      description: jobDescription.fullDescription || "",
      jobUrl: window.location.href.replace(/#.*$/, ""),
      platform: "greenhouse",
      department: jobDescription.department,
      appliedAt: Date.now(),
    };

    console.log("jobData", jobData);
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
   * Handle the confirmation page after successful application
   */
  async handleConfirmationPage() {
    console.log(
      "🎉 Greenhouse confirmation page detected - application successful!"
    );
    const jobDetails = this.extractJobDetailsFromPage();

    const url = window.location.href;
    const jobId = this.extractGreenhouseJobId(url);

    const jobData = {
      jobId,
      title: jobDetails.title || "Job on Greenhouse",
      company: jobDetails.company,
      location: jobDetails.location,
      description: this.cachedJobDescription?.fullDescription || "",
      jobUrl: url.replace(/#.*$/, ""),
      platform: "greenhouse",
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
      // Extract full description using correct Greenhouse selectors
      const descriptionSelectors = [
        ".job__description",
        ".job__description.body",
        "#content .content",
        ".content-wrapper",
        ".job-description",
        "#app_body",
        "#content",
        ".content",
      ];

      let fullDescription = "";
      for (const selector of descriptionSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent?.trim()) {
          fullDescription = element.textContent.trim();
          break;
        }
      }

      const jobDescription = {
        title: DomUtils.extractText([
          ".job__title h1",
          ".job__title .section-header",
          ".app-title",
          "h1.job-title",
          ".posting-headline h2",
          "h1",
        ]),
        location: DomUtils.extractText([
          ".job__location div",
          ".job__location",
          ".location",
          ".job-location",
          "[data-qa='job-location']",
        ]),
        department: DomUtils.extractText([
          ".job__department",
          ".department",
          ".job-department",
          "[data-qa='job-department']",
        ]),
        company: this.extractCompany(),
        company: this.extractCompany(),
        fullDescription: fullDescription,
        jobId: this.extractJobId(),
      };

      return jobDescription;
    } catch (error) {
      console.error("Error extracting job description:", error);
      return { title: document.title || "Job Position", fullDescription: "" };
    }
  }

  extractJobId() {
    // Extract from URL (boards.greenhouse.io/COMPANY/jobs/123)
    const urlMatch = window.location.href.match(/jobs\/(\d+)/);
    if (urlMatch && urlMatch[1]) {
      return urlMatch[1];
    }

    // Fallback: check query param gh_jid
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("gh_jid")) {
      return urlParams.get("gh_jid");
    }

    return null;
  }

  extractCompany() {
    // Try to extract from URL first (boards.greenhouse.io/COMPANY/jobs/123)
    const urlMatch = window.location.href.match(
      /greenhouse\.io\/([^\/]+)\/jobs/
    );
    if (urlMatch) {
      return urlMatch[1]
        .replace(/-/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
    }

    // Fallback to DOM extraction
    const selectors = [
      ".company-name",
      "[data-qa='company-name']",
      'meta[property="og:site_name"]',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const companyName =
          element.getAttribute("content") || element.textContent.trim();
        if (companyName) {
          return companyName;
        }
      }
    }

    return "Company on Greenhouse";
  }

  extractJobDetailsFromPage() {
    const details = {
      title: document.title || "Job on Greenhouse",
      company: this.extractCompany() || "Company",
      location: "Not specified",
      department: "Not specified",
    };

    try {
      const titleElement = document.querySelector(
        ".app-title, h1.job-title, h1"
      );
      if (titleElement) {
        details.title = titleElement.textContent.trim();
      }

      const locationEl = document.querySelector(".location, .job-location");
      if (locationEl) {
        details.location = locationEl.textContent.trim();
      }

      const departmentEl = document.querySelector(
        ".department, .job-department"
      );
      if (departmentEl) {
        details.department = departmentEl.textContent.trim();
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
        title: jobInfo.title || "",
        company: jobInfo.company || "",
        location: jobInfo.location || "",
        description: jobInfo.fullDescription || jobInfo.description || "",
        salary: jobInfo.salary || "",
        jobType: jobInfo.type || "",
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
          // Guard: skip fires twice (DOM event + forwarded CONTROL_ACTION)
          if (this._skipInProgress) break;
          this._skipInProgress = true;

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
    // Standard Greenhouse URLs (including regional subdomains like job-boards.eu.greenhouse.io)
    if (
      /^https:\/\/(job-boards|boards)(\.eu)?\.greenhouse\.io\/[^\/]+\/jobs\/\d+/.test(
        url
      )
    ) {
      return true;
    }

    return false;
  }

  isApplicationPage(url) {
    // Greenhouse applications are on the same page, check for form presence
    return url.includes("greenhouse.io") && url.includes("/jobs/");
  }

  isSuccessPage(url) {
    // Check URL for confirmation page pattern
    return url.includes("greenhouse.io") && url.includes("/confirmation");
  }

  isConfirmationPage(url) {
    // Greenhouse shows confirmation on the same URL, check DOM for success message
    const successIndicators = [
      ".confirmation",
      ".thank-you",
      "#application_confirmation",
      "[data-qa='confirmation']",
    ];

    for (const selector of successIndicators) {
      if (document.querySelector(selector)) {
        return true;
      }
    }

    return false;
  }

  findApplyButton() {
    const applySelectors = [
      "#submit_app",
      'button[type="submit"]',
      'input[type="submit"]',
      ".submit-button",
      'a[href*="#app"]',
      'a.btn[href*="apply"]',
    ];

    for (const selector of applySelectors) {
      const element = document.querySelector(selector);
      if (element && DomUtils.isElementVisible(element)) {
        return element;
      }
    }

    return null;
  }

  async waitForApplicationForm(timeout = 10000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const form = await this.findApplicationForm();
      if (form) {
        return true;
      }
      await this.delay(200);
    }

    throw new Error("Timeout waiting for application form to load");
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
      this.formHandler = new GreenhouseFormHandler({
        host: this.aiApiHost,
        userData: this.userProfile,
        platform: this.platform,
        copilotMode: this.copilotState.isInCoPilotMode(),
        copilotState: this.copilotState,
      });
    } else if (this.userProfile) {
      this.formHandler.userData = this.userProfile;
    }

    if (!this.fileHandler && this.userProfile) {
      this.fileHandler = new GreenhouseFileHandler({
        backendApiHost: this.backendApiHost,
        aiApiHost: this.aiApiHost,
        jwtToken: this.getJwtToken(),
        preferences:
          this.sessionContext?.preferences || this.config.config.preferences,
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

    // Clear URL change listener interval
    if (this.urlCheckInterval) {
      clearInterval(this.urlCheckInterval);
      this.urlCheckInterval = null;
    }

    // Global overlay cleanup handled by content-status-overlay.js

    // Clear global reference
    if (window.greenhouseStatusOverlay) {
      window.greenhouseStatusOverlay = null;
    }

    this.isRunning = false;
  }
}
