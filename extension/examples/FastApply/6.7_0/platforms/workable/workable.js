// platforms/workable/workable-clean.js
import WorkableFormHandler from "./workable-form-handler.js";
import WorkableFileHandler from "./workable-file-handler.js";
import { UrlUtils, DomUtils } from "../../shared/utilities/index.js";
import AIService from "../../services/ai-service.js";
import {
  notifyStatus,
  updateStatusButtons,
} from "../../utils/status-helper.js";
import { CoPilotState, COPILOT_ACTIONS } from "../../core/constants.js";
import Utils from "../../utils/utils.js";

export default class WorkablePlatform {
  constructor(config) {
    this.config = config || {};
    this.platform = "workable";
    this.baseUrl = "https://apply.workable.com";

    // Session context
    this.sessionContext = config?.sessionContext || null;
    this.sessionId = config?.sessionId || null;
    this.userId = config?.userId || null;
    this.userProfile = config?.userProfile || null;

    // Port connection to background
    this.port = null;
    this.isRunning = false;
    this.isPaused = false;

    // Processing guards - prevent duplicate processing
    this.isProcessingApplication = false;
    this.hasStartedAutomation = false;
    this.isSearchingJobs = false;

    // API hosts and services are initialized in handleInitializeAutomation when the session is ready.
    this.aiApiHost = null;
    this.HOST = null;
    this.backendApiHost = null;
    this.aiService = null;
    this.applicationTracker = null;

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

    // Listen for DOM events from the overlay (direct, more reliable)
    document.addEventListener("copilot-control-action", (event) => {
      const { action } = event.detail || {};
      if (action) {
        console.log("🎮 Received copilot-control-action DOM event:", action);
        this.handleCoPilotAction({ action });
      }
    });
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  async initialize() {
    // Apply session context preferences (including co-pilot mode)
    if (this.sessionContext) {
      await this.setSessionContext(this.sessionContext);
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

      case "SEARCH_NEXT":
        this.handleSearchNext(data);
        break;

      case "CONTROL_ACTION":
        this.handleCoPilotAction({ action: message.action });
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
        // Handle search task data from background
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
      return;
    }
    setTimeout(() => this.findAndOpenNextJob(), 500);
  }

  handleAlreadyApplied(data) {
    notifyStatus({
      type: "ALREADY_APPLIED",
      data: { title: data.title || "Job" },
    });

    // Mark the link as already applied (orange)
    if (data.url) {
      this.markLinkByUrl(data.url, "orange", "Already Applied");
    }
  }

  handleDuplicate(data) {
    notifyStatus({ type: "DUPLICATE_APPLICATION" });

    // Mark the link as duplicate (orange)
    if (data && data.url) {
      this.markLinkByUrl(data.url, "orange", "Duplicate");
    }
  }

  handleLimitReached(data) {
    notifyStatus({ type: "LIMIT_EXCEEDED" });
    this.isRunning = false;
    return;
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

      // Ensure correct mode buttons are shown after automation starts
      this.restoreModeButtons();

      await Utils.delay(1000);
      await this.ensureUserProfile();
      await this.detectPageTypeAndStart();
    } catch (error) {
      notifyStatus({ type: "APPLICATION_ERROR" });
    }
  }

  async ensureUserProfile() {
    // User profile is now injected via sessionContext
  }

  async detectPageTypeAndStart() {
    const url = window.location.href;

    // Google search results page (primary search flow)
    if (url.includes("google.com/search")) {
      await this.startSearchProcess();
    }
    // Workable native search page (legacy/direct navigation)
    else if (
      url.includes("jobs.workable.com/search") ||
      url.includes("jobs.workable.com/?")
    ) {
      await this.startWorkableSearchProcess();
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
   * Start search process on Google search results page
   */
  async startSearchProcess() {
    if (this.isSearchingJobs) {
      console.log("⏭️ Already searching for jobs - ignoring duplicate call");
      return;
    }
    this.isSearchingJobs = true;

    console.log("🔍 Starting Google search process for Workable jobs");
    notifyStatus({
      type: "JOB_SEARCH_STARTED",
      data: { preferences: this.config?.config?.preferences || {} },
    });

    this.sendMessage({ type: "GET_SEARCH_TASK" });
    await Utils.delay(2000);
    this.findAndOpenNextJob();
  }

  /**
   * Start search process on jobs.workable.com/search page
   */
  async startWorkableSearchProcess() {
    // Guard: Prevent duplicate search processes
    if (this.isSearchingJobs) {
      console.log("⏭️ Already searching for jobs - ignoring duplicate call");
      return;
    }
    this.isSearchingJobs = true;

    console.log("🔍 Starting Workable native search process");
    notifyStatus({
      type: "JOB_SEARCH_STARTED",
      data: { preferences: this.config?.config?.preferences || {} },
    });

    // Apply search filters before searching
    await this.applySearchFilters();

    this.sendMessage({ type: "GET_SEARCH_TASK" });

    // Wait for job cards to load before finding jobs
    await this.waitForJobCardsToLoad();

    this.findAndOpenNextJob();
  }

  /**
   * Apply search filters on Workable search page
   * Fills in job title, location, and clicks Search
   */
  async applySearchFilters() {
    // Check if filters already applied (persisted in sessionStorage)
    const filterKey = "workable_search_filters_set";
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

    console.log("📍 Applying search filters:", { positions, city, location });

    try {
      // Fill job title/keyword input and select from dropdown
      if (positions.length > 0) {
        const jobInput = document.querySelector(
          '[data-ui="search-input-job"] input[type="search"]'
        );
        if (jobInput) {
          await this.typeIntoInput(jobInput, positions[0]);
          await Utils.delay(1500);

          // Wait for job title suggestions and select best match
          await this.selectJobTitleSuggestion(positions[0]);
        }
      }

      // Fill location input - use city if available, otherwise use country/location
      const locationToSearch = city || location;
      if (locationToSearch) {
        const locationInput = document.querySelector(
          '[data-ui="search-input-location"] input[type="search"]'
        );
        if (locationInput) {
          // Extract location name before comma if needed (e.g., "Toronto, ON" -> "Toronto")
          const searchLocation = locationToSearch.includes(",")
            ? locationToSearch.split(",")[0].trim()
            : locationToSearch;
          await this.typeIntoInput(locationInput, searchLocation);
          await Utils.delay(1500);

          // Wait for location suggestions and select best match
          // Pass the country for better matching when searching by city
          await this.selectLocationSuggestion(
            searchLocation,
            city ? location : ""
          );
        }
      }

      // Mark filters as set before clicking Search
      sessionStorage.setItem(filterKey, "true");

      // Click the Search button
      await this.clickSearchButton();
    } catch (error) {
      console.error("❌ Error applying search filters:", error);
    }
  }

  /**
   * Select job title from dropdown suggestions
   */
  async selectJobTitleSuggestion(searchText) {
    await Utils.delay(1000);

    // Find job title suggestions in the listbox
    const suggestions = document.querySelectorAll(
      '[role="listbox"] [role="option"]:not([disabled]), [role="listbox"] li:not([data-role="empty-list-item"])'
    );

    if (suggestions.length === 0) {
      console.warn("⚠️ No job title suggestions found");
      return;
    }

    console.log(`📋 Found ${suggestions.length} job title suggestions`);

    const searchLower = searchText.toLowerCase();
    let bestMatch = null;
    let bestScore = -1;

    for (const suggestion of suggestions) {
      // Skip disabled/empty options
      if (
        suggestion.getAttribute("disabled") ||
        suggestion.getAttribute("aria-disabled") === "true"
      ) {
        continue;
      }

      const text = suggestion.textContent?.trim().toLowerCase() || "";
      if (!text) continue;

      let score = 0;

      // Exact match gets highest score
      if (text === searchLower) {
        score = 100;
      }
      // Starts with search text
      else if (text.startsWith(searchLower)) {
        score = 80;
      }
      // Contains search text
      else if (text.includes(searchLower)) {
        score = 60;
      }
      // Search text contains option text
      else if (searchLower.includes(text)) {
        score = 40;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = suggestion;
      }
    }

    if (bestMatch) {
      console.log(`📋 Selecting job title: ${bestMatch.textContent?.trim()}`);
      bestMatch.click();
      await Utils.delay(500);
    } else {
      console.warn("⚠️ No matching job title found, using typed text");
    }
  }

  /**
   * Type text into an input field slowly, simulating user input
   */
  async typeIntoInput(input, text) {
    // Clear existing value
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await Utils.delay(300);

    // Click on the container to activate
    const container =
      input.closest('[data-input-type="autocomplete"]') ||
      input.closest('[class*="container"]') ||
      input.parentElement;
    if (container) {
      container.click();
      await Utils.delay(300);
    }

    // Focus the input
    input.focus();
    await Utils.delay(200);

    // Simulate mouse events to fully activate
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    input.click();
    await Utils.delay(300);

    // Type slowly character by character
    for (const char of text) {
      // Simulate keydown event
      const keydownEvent = new KeyboardEvent("keydown", {
        key: char,
        code: `Key${char.toUpperCase()}`,
        bubbles: true,
      });
      input.dispatchEvent(keydownEvent);

      // Update the value
      input.value += char;

      // Dispatch input events (React listens to these)
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(
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
      input.dispatchEvent(keyupEvent);

      await Utils.delay(200); // 200ms between characters for slower typing
    }
  }

  /**
   * Select location from dropdown suggestions
   * Matches "city, country" format (e.g., "Toronto, Canada")
   */
  async selectLocationSuggestion(city, country) {
    await Utils.delay(1000);

    // Find location suggestions in the listbox
    const suggestions = document.querySelectorAll(
      '[role="listbox"] [role="option"]:not([disabled]), [role="listbox"] li:not([data-role="empty-list-item"])'
    );

    if (suggestions.length === 0) {
      console.warn("⚠️ No location suggestions found");
      return;
    }

    console.log(`📍 Found ${suggestions.length} location suggestions`);

    // Target format: "city, country" (e.g., "Toronto, Canada")
    const cityLower = city.toLowerCase();
    const countryLower = country ? country.toLowerCase() : "";
    const targetLocation = country
      ? `${city}, ${country}`.toLowerCase()
      : cityLower;

    let bestMatch = null;
    let bestScore = -1;

    for (const suggestion of suggestions) {
      // Skip disabled/empty options
      if (
        suggestion.getAttribute("disabled") ||
        suggestion.getAttribute("aria-disabled") === "true"
      ) {
        continue;
      }

      const text = suggestion.textContent?.trim().toLowerCase() || "";
      if (!text) continue;

      let score = 0;

      // Exact match gets highest score
      if (text === targetLocation) {
        score = 100;
      }
      // Contains both city AND country
      else if (
        text.includes(cityLower) &&
        countryLower &&
        text.includes(countryLower)
      ) {
        score = 80;
      }
      // Starts with city name
      else if (text.startsWith(cityLower)) {
        score = 60;
      }
      // Contains city name
      else if (text.includes(cityLower)) {
        score = 40;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = suggestion;
      }
    }

    if (bestMatch) {
      console.log(`📍 Selecting location: ${bestMatch.textContent?.trim()}`);
      bestMatch.click();
      await Utils.delay(500);
    } else {
      console.warn("⚠️ No matching location found");
    }
  }

  /**
   * Click the Search jobs button
   */
  async clickSearchButton() {
    try {
      const searchButton = document.querySelector(
        'button[data-ui="search-button"], button[type="submit"]'
      );

      if (searchButton) {
        console.log("🔍 Clicking Search jobs button");
        searchButton.click();
        await Utils.delay(2000);
      } else {
        console.warn("⚠️ Search button not found");
      }
    } catch (error) {
      console.error("❌ Error clicking search button:", error);
    }
  }

  /**
   * Wait for job cards to load on the search results page
   */
  async waitForJobCardsToLoad(timeout = 15000) {
    console.log("⏳ Waiting for job cards to load...");
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check for job cards on Workable search page
      const jobCards = document.querySelectorAll(
        '[data-ui="job-item"], li[class*="jobsList__list-item"], a[href*="/view/"]'
      );

      if (jobCards.length > 0) {
        console.log(`✅ Found ${jobCards.length} job cards loaded`);
        await Utils.delay(500);
        return true;
      }

      // Check for "no results" message
      const noResults = document.querySelector(
        '[data-ui="no-results"], [class*="no-results"], [class*="empty-state"], [class*="emptyState"]'
      );

      if (noResults) {
        console.log("⚠️ No job results found");
        return false;
      }

      await Utils.delay(500);
    }

    console.warn("⚠️ Timeout waiting for job cards to load");
    return false;
  }

  // ========================================
  // JOB SEARCH AND OPENING
  // ========================================

  /**
   * Find and open next unprocessed job from search results
   */
  findAndOpenNextJob() {
    if (!this.isRunning || this.isPaused) return;
    console.log(this.isRunning, this.isPaused);
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

      // Skip and mark invalid links
      if (link.classList.contains("fastapply-invalid")) {
        continue;
      }

      // Validate job page
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
    // On jobs.workable.com search page, extract job cards
    if (window.location.hostname === "jobs.workable.com") {
      return this.findJobCardsFromWorkableSearch();
    }

    // Google search results - find all Workable links
    const allLinks = Array.from(
      document.querySelectorAll('a[href*="workable.com"]')
    );

    // Filter out secondary/duplicate links (e.g., "Read more", "Learn more")
    const secondaryTexts = ["read more", "learn more", "view more", "see more", "more"];

    const validLinks = allLinks.filter((link) => {
      const linkUrl = link.href;
      const linkText = link.textContent?.trim().toLowerCase() || "";

      // Skip secondary links
      if (secondaryTexts.includes(linkText)) return false;

      return this.isValidJobPage(linkUrl);
    });

    // Deduplicate by normalized URL
    const seen = new Set();
    return validLinks.filter((link) => {
      const normalized = link.href
        .replace(/\/$/, "")
        .replace(/[?#].*$/, "")
        .replace(/\/apply\/?$/, "");
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }

  /**
   * Find job cards from jobs.workable.com search results
   */
  findJobCardsFromWorkableSearch() {
    // Find job item containers
    const jobItems = Array.from(
      document.querySelectorAll(
        '[data-ui="job-item"], li[class*="jobsList__list-item"]'
      )
    );

    const validLinks = [];

    for (const item of jobItems) {
      // Find the main job link (the overlay link or title link)
      const link = item.querySelector(
        'a[class*="jobCard__overlay"], a[href*="/view/"]'
      );

      if (!link) continue;

      const url = link.href;
      if (!url || !url.includes("/view/")) continue;

      // Skip if already processed
      if (item.classList.contains("fastapply-processed")) continue;
      if (link.classList.contains("fastapply-processed")) continue;

      // Extract job info from card using data attributes and selectors
      const jobTitle =
        item.getAttribute("data-job-title") ||
        item.querySelector('[data-ui="job-card-title"]')?.textContent?.trim() ||
        "";
      const company =
        item.getAttribute("data-company-name") ||
        item
          .querySelector('[data-ui="job-card-company-label"] a')
          ?.textContent?.trim() ||
        "";
      const location =
        item
          .querySelector('[data-ui="job-card-location"]')
          ?.textContent?.trim() || "";
      const workplace =
        item
          .querySelector('[data-ui="job-card-workplace"]')
          ?.textContent?.trim() || "";
      const employmentType =
        item
          .querySelector('[data-ui="job-card-employment-type"]')
          ?.textContent?.trim() || "";

      link._jobTitle = jobTitle;
      link._company = company;
      link._location = location;
      link._workplace = workplace;
      link._employmentType = employmentType;
      link._cardElement = item;

      validLinks.push(link);
    }

    console.log(
      `📋 Found ${validLinks.length} job cards on Workable search page`
    );
    return validLinks;
  }

  async openJob(linkElement, url) {
    linkElement.classList.add("fastapply-processed");

    // Normalize URL and mark ALL links with the same URL as processed to prevent duplicates
    const normalizedUrl = this.normalizeJobUrl(url);
    const allLinks = document.querySelectorAll('a[href*="workable.com"]');
    for (const link of allLinks) {
      if (this.normalizeJobUrl(link.href) === normalizedUrl) {
        link.classList.add("fastapply-processed");
      }
    }

    // Extract job title from h3 element in Google search results
    const h3 = linkElement.querySelector("h3");
    const jobTitle = h3
      ? h3.textContent.trim()
      : linkElement.textContent.trim();

    this.markLinkAsColor(linkElement, "blue", "Processing");
    this.sendMessage({
      type: "START_APPLICATION",
      data: {
        url: normalizedUrl,
        jobId: this.extractWorkableJobId(normalizedUrl),
        title: jobTitle,
        company: this.extractWorkableCompany(normalizedUrl, linkElement),
        requestId: `req_${Date.now()}`,
      },
    });
  }

  /**
   * Normalize Workable job URL to a consistent form
   * Removes trailing slash, query params, and /apply suffix
   */
  normalizeJobUrl(url) {
    return url
      .replace(/[?#].*$/, "")
      .replace(/\/apply\/?$/, "")
      .replace(/\/$/, "");
  }

  extractWorkableCompany(url, linkElement = null) {
    // Try to extract from aria-label: "Job Title at Company Name"
    if (linkElement) {
      const ariaLabel = linkElement.getAttribute("aria-label");
      if (ariaLabel && ariaLabel.includes(" at ")) {
        const company = ariaLabel.split(" at ").pop().trim();
        if (company) return company;
      }
    }

    // Try to extract from Google result text: "Title at Company"
    if (linkElement) {
      const h3 = linkElement.querySelector("h3");
      const text = h3?.textContent || linkElement.textContent || "";
      if (text.includes(" at ")) {
        const company = text.split(" at ").pop().trim();
        if (company) return company;
      }
    }

    // Fallback: extract from URL path ending with "at-company-name"
    const urlMatch = url.match(/-at-([^/]+)\/?$/);
    if (urlMatch) {
      return urlMatch[1].replace(/-/g, " ");
    }

    // Fallback: extract from apply.workable.com/[COMPANY]/
    const workableMatch = url.match(/\/\/apply\.workable\.com\/([^/]+)/);
    if (workableMatch) {
      return workableMatch[1].replace(/-/g, " ");
    }

    return null;
  }

  extractWorkableJobId(url) {
    // Match apply.workable.com/company/j/JOBID
    const jMatch = url.match(/\/j\/([^/]+)/);
    if (jMatch) return jMatch[1];

    // Match jobs.workable.com/view/JOBID/slug
    const viewMatch = url.match(/\/view\/([^/]+)/);
    if (viewMatch) return viewMatch[1];

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
      const links = document.querySelectorAll('a[href*="workable.com"]');
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

  async navigateToOverviewPage() {
    try {
      const currentUrl = window.location.href;
      const overviewUrl = currentUrl.replace(/\/apply\/?$/, "");

      if (overviewUrl !== currentUrl) {
        console.log(`🔄 Navigating to overview: ${overviewUrl}`);
        window.location.href = overviewUrl;
        await this.waitForPageLoad();
        await Utils.delay(1000);
      }
    } catch (error) {}
  }

  async navigateToApplicationAndStart() {
    try {
      // Check if job is no longer available
      if (this.isJobUnavailable()) {
        console.log("⚠️ Job is no longer available - skipping");
        notifyStatus({
          type: "APPLICATION_SKIPPED",
          data: { reason: "Job is no longer available" },
        });
        this.sendMessage({
          type: "APPLICATION_SKIPPED",
          data: {
            url: window.location.href,
            reason: "Job is no longer available",
          },
        });
        return;
      }

      const currentUrl = window.location.href;
      const isAlreadyOnApplyPage = /\/apply\/?(\?.*)?$/.test(currentUrl);

      if (isAlreadyOnApplyPage) {
        // Already on the /apply/ page - go straight to form handling
        console.log("📝 Already on apply page, starting form directly");
        await this.startApplication();
        return;
      }

      // Extract job description from overview page
      const jobDescription = await this.extractJobDescription();
      this.cachedJobDescription = jobDescription;

      // Check if job matches preferences (if enabled)
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

      // Click the "Apply" button to reveal application form
      // apply.workable.com uses <a data-ui="apply-button"> or tab <a data-ui="application-form-tab">
      // jobs.workable.com uses <button data-ui="overview-apply-now">
      const applyButton = document.querySelector(
        '[data-ui="apply-button"], a[data-ui="application-form-tab"], button[data-ui="overview-apply-now"]'
      );

      if (applyButton) {
        console.log("🖱️ Clicking apply button:", applyButton.textContent?.trim());
        applyButton.click();
        await Utils.delay(2000);
      }

      // Start the application process
      await this.startApplication();
    } catch (error) {
      this.handleApplicationError(error);
    }
  }

  async startApplication() {
    try {
      const jobDetails =
        this.cachedJobDescription || (await this.extractJobDescription());

      const jobTitle = jobDetails.title || document.title || "Job on Workable";

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
      console.error("Error in startApplication:", error);
      // this.handleApplicationError(error);
    }
  }

  async findApplicationForm() {
    const selectors = [
      "form.whr-form",
      'form[action*="workable"]',
      'form[action*="apply"]',
      "form.application-form",
      "form#application-form",
      'form[data-ui="application-form"]',
      "form",
    ];

    for (const selector of selectors) {
      const form = await Utils.waitForElement(selector, 2000);
      if (form) {
        // Wait for form to become interactive (remove inert attribute)
        await this.waitForFormInteractive(form);
        return form;
      }
    }

    return null;
  }

  /**
   * Wait for form to become interactive (inert attribute removed)
   */
  async waitForFormInteractive(form, timeout = 10000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (!form.hasAttribute("inert")) {
        return true;
      }
      await Utils.delay(500);
    }

    console.warn("Form still has inert attribute after timeout");
    return false;
  }

  async processApplicationForm(form, jobDescription) {
    // Start real-time CAPTCHA monitoring
    const captchaObserver = this.setupCaptchaWatcher(form);

    try {
      notifyStatus({ type: "COLLECTING_FIELDS" });
      await Utils.delay(1000);

      // If userProfile is missing, try to get it from sessionContext
      if (!this.userProfile && this.sessionContext?.userProfile) {
        this.userProfile = this.sessionContext.userProfile;
      }

      if (!this.userProfile) {
        throw new Error("User profile not available");
      }

      // Ensure handlers are initialized - lazy init if needed
      if (!this.formHandler && this.userProfile) {
        this.formHandler = new WorkableFormHandler({
          host: this.getAiApiHost(),
          userData: this.userProfile,
          logger: (msg) => console.log("🤖 Workable Form Handler:", msg),
          aiService: this.aiService,
        });
      }

      if (!this.fileHandler && this.userProfile) {
        this.fileHandler = new WorkableFileHandler({
          backendApiHost: this.getApiHost(),
          aiApiHost: this.getAiApiHost(),
          jwtToken: this.getJwtToken(),
          preferences: this.config?.config?.preferences,
        });
      }

      // Build enriched job description with job metadata for AI context
      if (this.formHandler) {
        const jobDescParts = [];
        if (jobDescription.title) jobDescParts.push(`Job Title: ${jobDescription.title}`);
        if (jobDescription.company) jobDescParts.push(`Company: ${jobDescription.company}`);
        if (jobDescription.location) jobDescParts.push(`Location: ${jobDescription.location}`);
        if (jobDescription.department) jobDescParts.push(`Department: ${jobDescription.department}`);
        if (jobDescription.workplace) jobDescParts.push(`Workplace: ${jobDescription.workplace}`);
        if (jobDescription.fullDescription) jobDescParts.push(`\nJob Description:\n${jobDescription.fullDescription}`);
        const enrichedJobDescription = jobDescParts.join('\n');

        this.formHandler.jobDescription = enrichedJobDescription;
        this.formHandler.userData = this.userProfile;
        this.formHandler.currentJobTitle =
          jobDescription.title || document.title;
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
            jobDescription.fullDescription,
            jobDescription.jobId,
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

        await this.formHandler.handlePhoneInputWithCountryCode(
          form,
          this.userProfile
        );

        await this.formHandler.handleCustomSelectWithModal(
          form,
          this.userProfile
        );

        await this.formHandler.fillFormWithProfile(
          form,
          this.userProfile,
          jobDescription
        );
      }

      notifyStatus({ type: "SUBMITTING_APPLICATION" });
      await Utils.delay(1000);

      // Wait a bit for validation
      await Utils.delay(2000);

      // Submit form - with null check
      if (!this.formHandler) {
        throw new Error("Form handler not initialized - cannot submit");
      }

      const submitted = await this.formHandler.submitForm(form, {
        dryRun: false,
      });

      if (submitted === true) {
        await this.handleSuccessfulSubmission(jobDescription);
      } else if (submitted === "CAPTCHA_PENDING") {
        // CAPTCHA is blocking - user has been notified, skip this job
        console.log("🔐 CAPTCHA still pending after timeout - skipping job");
        this.sendMessage({
          type: "APPLICATION_SKIPPED",
          data: {
            url: window.location.href,
            title: jobDescription.title,
            reason: "CAPTCHA not solved",
          },
        });
      } else {
        throw new Error("Form submission failed");
      }
    } catch (error) {
      console.error("Error processing form:", error);
      throw error;
    } finally {
      // Clean up CAPTCHA observer
      if (captchaObserver) {
        captchaObserver.disconnect();
      }
    }
  }

  /**
   * Set up a MutationObserver to detect CAPTCHA widgets appearing in real-time.
   * Watches for iframes, cf-turnstile containers, and data-sitekey elements being added.
   * @param {HTMLElement} form - The form to watch within
   * @returns {MutationObserver|null}
   */
  setupCaptchaWatcher(form) {
    try {
      let captchaNotified = false;
      const watchTarget = form.closest("body") || document.body;

      const observer = new MutationObserver((mutations) => {
        if (captchaNotified) return;

        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;

            const isCaptcha =
              node.matches?.(
                '.cf-turnstile, [data-sitekey], .g-recaptcha, .h-captcha, iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"]'
              ) ||
              node.querySelector?.(
                '.cf-turnstile, [data-sitekey], .g-recaptcha, .h-captcha, iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"]'
              );

            if (isCaptcha) {
              captchaNotified = true;
              console.log("🔐 CAPTCHA widget detected in real-time via MutationObserver");
              notifyStatus({ type: "CAPTCHA_DETECTED" });
              return;
            }
          }
        }
      });

      observer.observe(watchTarget, {
        childList: true,
        subtree: true,
      });

      return observer;
    } catch (error) {
      console.warn("Could not setup CAPTCHA watcher:", error);
      return null;
    }
  }

  async handleSuccessfulSubmission(jobDescription) {
    notifyStatus({
      type: "APPLICATION_SUBMITTED",
      data: { title: jobDescription.title || "Job" },
    });

    // Extract job data
    const jobData = {
      jobId:
        jobDescription.jobId ||
        this.extractJobIdFromUrl(window.location.href) ||
        Utils.generateId("workable_"),
      title: jobDescription.title || document.title || "Job on Workable",
      company: jobDescription.company || "Company on Workable",
      location: jobDescription.location || "Not specified",
      jobUrl: window.location.href.replace(/\/apply\/?$/, ""),
      platform: "workable",
      workplace: jobDescription.workplace,
      department: jobDescription.department,
      description: jobDescription.fullDescription || "",
      appliedAt: Date.now(),
    };

    // Save the applied job using the new API
    try {
      // Send APPLICATION_COMPLETED to background
      this.sendMessage({
        type: "APPLICATION_COMPLETED",
        data: jobData,
      });

      // Mark the link as completed (green) on search page
      if (jobData.jobUrl) {
        this.markLinkByUrl(jobData.jobUrl, "green", "Completed");
      }
    } catch (error) {
      console.error("❌ Error processing application:", error);

      // Still send completion message even if save failed
      this.sendMessage({
        type: "APPLICATION_COMPLETED",
        data: jobData,
      });
    }
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
      // Try JSON-LD structured data first (available on both .apply and .jobs pages)
      let jsonLdData = null;
      try {
        const jsonLd = document.querySelector(
          'script[type="application/ld+json"]'
        );
        if (jsonLd) {
          jsonLdData = JSON.parse(jsonLd.textContent);
        }
      } catch (e) {
        // JSON parse failed, continue with DOM extraction
      }

      const jobDescription = {
        title:
          DomUtils.extractText([
            'h1[data-ui="overview-title"]',
            'h1[data-ui="job-title"]',
            ".posting-header h2",
            "h1",
          ]) || jsonLdData?.title || "",
        location:
          DomUtils.extractText([
            'span[data-ui="overview-location"]',
            'div[data-ui="job-location"]',
            ".location",
          ]) ||
          jsonLdData?.applicantLocationRequirements
            ?.map((l) => l.name)
            .join(", ") ||
          "",
        department: DomUtils.extractText([
          'span[data-ui="overview-department"]',
          'span[data-ui="job-department"]',
          ".department",
        ]),
        workplace: DomUtils.extractText([
          'span[data-ui="overview-workplace"]',
          'span[data-ui="job-workplace"]',
          ".workplace",
        ]) || (jsonLdData?.jobLocationType === "TELECOMMUTE" ? "Remote" : ""),
        employmentType:
          DomUtils.extractText([
            'span[data-ui="overview-employment-type"]',
            'span[data-ui="job-employment-type"]',
            'span[data-ui="job-type"]',
          ]) || jsonLdData?.employmentType || "",
        company: this.extractCompany(),
        jobId: this.extractJobId(),
      };

      // Extract full description from DOM
      const descriptionParts = [];

      // Try new selector first, then fall back to old selector
      const descContent = document.querySelector(
        '[data-ui="job-breakdown-description-parsed-html"]'
      );
      if (descContent) {
        descriptionParts.push(descContent.textContent.trim());
      } else {
        // Fallback to apply.workable.com / jobs.workable.com selector
        const descSection = document.querySelector(
          'section[data-ui="job-description"]'
        );
        if (descSection) {
          const content = descSection.querySelector("div");
          if (content) {
            descriptionParts.push(content.textContent.trim());
          }
        }
      }

      // Try new selector first, then fall back to old selector
      const reqContent = document.querySelector(
        '[data-ui="job-breakdown-requirements-parsed-html"]'
      );
      if (reqContent) {
        descriptionParts.push(
          "\n\n--- REQUIREMENTS ---\n" + reqContent.textContent.trim()
        );
      } else {
        const reqSection = document.querySelector(
          'section[data-ui="job-requirements"]'
        );
        if (reqSection) {
          const content = reqSection.querySelector("div");
          if (content) {
            descriptionParts.push(
              "\n\n--- REQUIREMENTS ---\n" + content.textContent.trim()
            );
          }
        }
      }

      // If DOM extraction yielded nothing, fall back to JSON-LD description
      if (descriptionParts.length === 0 && jsonLdData?.description) {
        // JSON-LD description is HTML - strip tags for plain text
        const temp = document.createElement("div");
        temp.innerHTML = jsonLdData.description;
        descriptionParts.push(temp.textContent.trim());
      }

      jobDescription.fullDescription = descriptionParts.join("\n");

      return jobDescription;
    } catch (error) {
      console.error("Error extracting job description:", error);
      return { title: document.title || "Job Position" };
    }
  }

  extractCompany() {
    // Try to extract from overview-company section (jobs.workable.com)
    const overviewCompany = document.querySelector(
      'h2[data-ui="overview-company"] a'
    );
    if (overviewCompany) {
      const companyName = overviewCompany.textContent.trim();
      if (companyName) {
        return companyName;
      }
    }

    // Try company logo alt text (apply.workable.com)
    const companyLogo = document.querySelector(
      'a[data-ui="company-logo"] img'
    );
    if (companyLogo) {
      const companyName = companyLogo.getAttribute("alt")?.trim();
      if (companyName) {
        return companyName;
      }
    }

    // Try JSON-LD structured data
    try {
      const jsonLd = document.querySelector(
        'script[type="application/ld+json"]'
      );
      if (jsonLd) {
        const data = JSON.parse(jsonLd.textContent);
        const companyName = data?.hiringOrganization?.name;
        if (companyName) {
          return companyName;
        }
      }
    } catch (e) {
      // JSON parse failed, continue to other selectors
    }

    const selectors = [
      'a[data-ui="company-name"]',
      ".company-name",
      '[data-ui="company-name"]',
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

    // Fallback to URL
    return (
      UrlUtils.extractCompanyFromUrl(window.location.href, "workable") ||
      "Company on Workable"
    );
  }

  extractJobId() {
    try {
      const url = window.location.href;

      // Pattern 1: apply.workable.com/company/j/SHORTCODE/
      const jMatch = url.match(/\/j\/([^\/\?]+)/);
      if (jMatch && jMatch[1]) {
        return jMatch[1];
      }

      // Pattern 2: jobs.workable.com/view/SHORTCODE/
      const viewMatch = url.match(/\/view\/([^\/\?]+)/);
      if (viewMatch && viewMatch[1]) {
        return viewMatch[1];
      }

      // Fallback: Check if there's a shortcode in meta or canonical
      return null;
    } catch (error) {
      console.error("Error extracting job ID:", error);
      return null;
    }
  }

  extractJobIdFromUrl(url) {
    try {
      const matches = url.match(/\/j\/([A-Za-z0-9]+)/);
      return matches ? matches[1] : null;
    } catch (error) {
      return null;
    }
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

  /**
   * Restore appropriate mode buttons based on current copilot state
   */
  restoreModeButtons() {
    // Global overlay always available

    // Check current mode and show appropriate buttons
    if (this.copilotState.isInCoPilotMode()) {
      updateStatusButtons("co-pilot-search");
    } else {
      updateStatusButtons("auto-pilot");
    }
  }

  // ========================================
  // UTILITIES
  // ========================================

  /**
   * Check if the job page shows an "unavailable" or "not found" state
   */
  isJobUnavailable() {
    // Workable shows data-ui="job-unavailable" when a job is taken down
    if (document.querySelector('[data-ui="job-unavailable"]')) {
      return true;
    }

    // Also check for common "not available" text in the main content
    const mainContent =
      document.querySelector('main, [role="main"]') || document.body;
    const text = mainContent.textContent?.toLowerCase() || "";
    if (
      text.includes("this job is not available anymore") ||
      text.includes("this job is no longer available") ||
      text.includes("this position has been filled") ||
      text.includes("this job has been closed")
    ) {
      return true;
    }

    return false;
  }

  isValidJobPage(url) {
    // Match apply.workable.com/company/j/jobid or apply.workable.com/company/jobs/jobid
    if (/^https:\/\/apply\.workable\.com\/[^\/]+\/(j|jobs)\/[^\/]+/.test(url)) {
      return true;
    }

    // Match jobs.workable.com/view/jobid/slug (from native search)
    if (/^https:\/\/jobs\.workable\.com\/view\/[^\/]+/.test(url)) {
      return true;
    }

    // Match company.workable.com/j/jobid or company.workable.com/jobs/jobid (custom subdomains)
    if (/^https:\/\/[\w-]+\.workable\.com\/(j|jobs)\/[^\/]+/.test(url)) {
      return true;
    }

    return false;
  }

  isApplicationPage(url) {
    return url.includes("/apply/") || url.includes("/application");
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
      this.sessionContext?.sessionConfig?.backendApiHost ||
      this.config.sessionContext?.backendApiHost ||
      this.config.backendApiHost
    );
  }

  getAiApiHost() {
    return (
      this.sessionAiApiHost ||
      this.sessionContext?.aiApiHost ||
      this.sessionContext?.sessionConfig?.aiApiHost ||
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
    this.HOST = this.aiApiHost;
    this.backendApiHost = this.getApiHost();

    if (!this.aiService) {
      this.aiService = new AIService({
        aiApiHost: this.aiApiHost,
        platform: this.platform,
      });
    }

    // Initialize Handlers
    if (!this.formHandler) {
      this.formHandler = new WorkableFormHandler({
        host: this.aiApiHost,
        userData: this.userProfile,
        // statusOverlay removed - uses global overlay
        logger: (msg) => console.log("🤖 Workable Form Handler:", msg),
        aiService: this.aiService,
      });
    } else {
      if (this.userProfile) {
        this.formHandler.userData = this.userProfile;
      }
    }

    if (!this.fileHandler) {
      this.fileHandler = new WorkableFileHandler({
        backendApiHost: this.backendApiHost,
        aiApiHost: this.aiApiHost,
        jwtToken: this.getJwtToken(),
        preferences: this.config?.config?.preferences,
      });
    } else {
      // Update preferences if file handler already exists
      if (this.config?.config?.preferences) {
        this.fileHandler.preferences = this.sessionContext.preferences;
      }
    }

    // Load co-pilot mode preference from session context
    if (sessionContext.preferences?.hasOwnProperty("copilotMode")) {
      if (sessionContext.preferences.copilotMode === true) {
        this.copilotState.switchToCoPilot();
        // Update formHandler if it exists
        if (this.formHandler) {
          this.formHandler.copilotMode = true;
          console.log(
            "✅ Updated formHandler.copilotMode to true from session context"
          );
        }
        if (true) {
          // Global overlay
          updateStatusButtons("co-pilot-search");
        }
      } else {
        this.copilotState.switchToAutoPilot();
        // Update formHandler if it exists
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

  /**
   * Delay utility
   */
  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  cleanup() {
    console.log("🧹 Cleaning up...");

    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }

    if (true) {
      // Global overlay
      // Global overlay - cleanup handled automatically
      // Global overlay - no local instance needed
    }

    this.isRunning = false;
  }
}
