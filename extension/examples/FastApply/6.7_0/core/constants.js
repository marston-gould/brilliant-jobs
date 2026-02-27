// core/constants.js
export const PLATFORMS = {
  LINKEDIN: "linkedin",
  INDEED: "indeed",
  RECRUITEE: "recruitee",
  GLASSDOOR: "glassdoor",
  WORKDAY: "workday",
  LEVER: "lever",
  BREEZY: "breezy",
  ASHBY: "ashby",
  WELLFOUND: "wellfound",
  DICE: "dice",
  SIMPLYHIRED: "simplyhired",
  SMARTRECRUITERS: "smartrecruiters",
  JOBVITE: "jobvite",
  RIPPLING: "rippling",
  ICIMS: "icims",
  MONSTER: "monster",
};

export const AUTOMATION_STATUS = {
  CREATED: "created",
  STARTING: "starting",
  RUNNING: "running",
  PAUSED: "paused",
  STOPPED: "stopped",
  COMPLETED: "completed",
  FAILED: "failed",
  INTERRUPTED: "interrupted",
};

export const APPLICATION_STATUS = {
  PENDING: "pending",
  SUBMITTED: "submitted",
  FAILED: "failed",
  SKIPPED: "skipped",
};

export const DELAYS = {
  BETWEEN_APPLICATIONS: { min: 3000, max: 8000 },
  BETWEEN_PAGES: { min: 2000, max: 5000 },
  FORM_FILLING: { min: 500, max: 1500 },
  PAGE_LOAD: { min: 2000, max: 10000 },
};

export const SELECTORS = {
  // Common selectors across platforms
  APPLY_BUTTON: [
    'button[aria-label*="apply" i]',
    'button[class*="apply" i]',
    'a[class*="apply" i]',
    'input[value*="apply" i]',
  ],

  JOB_TITLE: [
    "h1",
    ".job-title",
    '[data-testid="job-title"]',
    ".jobsearch-JobInfoHeader-title",
  ],

  COMPANY_NAME: [
    ".company",
    ".company-name",
    '[data-testid="company-name"]',
    ".jobsearch-InlineCompanyRating",
  ],
};

// Co-Pilot Control Actions
export const COPILOT_ACTIONS = {
  SWITCH_TO_COPILOT: "SWITCH_TO_COPILOT",
  SWITCH_TO_AUTOPILOT: "SWITCH_TO_AUTOPILOT",
  TAKE_CONTROL: "TAKE_CONTROL",
  LET_AI_CONTINUE: "LET_AI_CONTINUE",
  SUBMIT: "SUBMIT",
  SKIP: "SKIP",
  PAUSE: "PAUSE",
  RESUME: "RESUME",
};

// Co-Pilot State Management Class
export class CoPilotState {
  constructor() {
    this.mode = "auto-pilot";

    this.controlMode = "ai";

    // Current job being processed
    this.currentJob = {
      jobDetails: null,
      submitButton: null,
      nextButton: null,
      formData: null,
      timestamp: null,
    };

    // Pause state
    this.isPaused = false;
    this.pauseReason = null; // "user_review" | "manual_control" | "user_pause"

    // Resume callback for continuing automation after user action
    this.resumeCallback = null;
  }

  // Mode switching methods
  switchToAutoPilot() {
    this.mode = "auto-pilot";
    this.controlMode = "ai";
  }

  switchToCoPilot() {
    this.mode = "co-pilot";
    this.controlMode = "ai";
  }

  // Control switching methods
  takeManualControl() {
    this.controlMode = "manual";
    this.pauseReason = "manual_control";
  }

  letAIContinue() {
    this.controlMode = "ai";
    this.pauseReason = null;
  }

  // Job submission management
  setPendingSubmission(jobDetails, submitButton) {
    this.currentJob = {
      jobDetails,
      submitButton,
      formData: null,
      timestamp: Date.now(),
    };
    this.pauseReason = "user_review";
    this.isPaused = true;
  }

  clearPendingSubmission() {
    this.currentJob = {
      jobDetails: null,
      submitButton: null,
      nextButton: null,
      formData: null,
      timestamp: null,
    };
    this.pauseReason = null;
    this.isPaused = false;
  }

  // Next button management (for step-by-step review in co-pilot mode)
  setPendingNext(jobDetails, nextButton) {
    this.currentJob = {
      ...this.currentJob,
      jobDetails,
      nextButton,
      timestamp: Date.now(),
    };
    this.pauseReason = "user_review_step";
    this.isPaused = true;
  }

  clearPendingNext() {
    this.currentJob.nextButton = null;
    this.pauseReason = null;
    this.isPaused = false;
  }

  // State check helpers
  isInCoPilotMode() {
    return this.mode === "co-pilot";
  }

  isInAutoPilotMode() {
    return this.mode === "auto-pilot";
  }

  isUserInControl() {
    return this.controlMode === "manual";
  }

  isAIInControl() {
    return this.controlMode === "ai";
  }

  hasPendingSubmission() {
    return this.currentJob.submitButton !== null;
  }

  hasPendingNext() {
    return this.currentJob.nextButton !== null;
  }
}

// Indeed-specific Co-Pilot State (handles multi-tab architecture)
export class IndeedCoPilotState extends CoPilotState {
  constructor() {
    super();

    // Indeed-specific: Track multiple tabs
    this.tabs = {
      searchTabId: null,
      formTabId: null,
      successTabId: null,
    };

    // User action promise resolver
    this.userActionResolver = null;
    this.userActionPromise = null;
  }

  // Tab management
  setFormTab(tabId) {
    this.tabs.formTabId = tabId;
  }

  setSearchTab(tabId) {
    this.tabs.searchTabId = tabId;
  }

  setSuccessTab(tabId) {
    this.tabs.successTabId = tabId;
  }

  clearFormTab() {
    this.tabs.formTabId = null;
  }

  // User action promise mechanism
  waitForUserAction() {
    if (this.userActionPromise) {
      return this.userActionPromise;
    }

    this.userActionPromise = new Promise((resolve) => {
      this.userActionResolver = resolve;
    });

    return this.userActionPromise;
  }

  resolveUserAction(action) {
    if (this.userActionResolver) {
      this.userActionResolver(action);
      this.userActionResolver = null;
      this.userActionPromise = null;
    }
  }

  // Indeed-specific: Set pending submission with form tab
  setPendingSubmissionWithTab(jobDetails, submitButton, formTabId) {
    this.setPendingSubmission(jobDetails, submitButton);
    this.setFormTab(formTabId);
  }

  // Clear all Indeed-specific state
  clearAll() {
    this.clearPendingSubmission();
    this.tabs = {
      searchTabId: null,
      formTabId: null,
      successTabId: null,
    };
    this.userActionResolver = null;
    this.userActionPromise = null;
  }
}
