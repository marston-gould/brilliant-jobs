// core/state/session-state.js
// Immutable session state with clear transitions - Single Source of Truth

export const SessionStatus = Object.freeze({
  CREATED: "CREATED",
  STARTING: "STARTING",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  STOPPED: "STOPPED",
  FAILED: "FAILED",
});

/**
 * Generates a unique session ID
 * @returns {string} Unique session identifier
 */
function generateSessionId() {
  return `session_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;
}

/**
 * SessionState - Immutable state container for automation sessions
 * This is the SINGLE source of truth for session data
 */
export default class SessionState {
  constructor(params) {
    // Validate required params
    if (!params.platform) throw new Error("platform is required");
    if (!params.userId) throw new Error("userId is required");
    if (!params.selectedProfile) throw new Error("selectedProfile is required");

    // Core identifiers
    this.id = generateSessionId();
    this.platform = params.platform;
    this.userId = params.userId;

    // User profile (frozen to prevent mutation)
    this.userProfile = Object.freeze({ ...params.selectedProfile });

    // Configuration (frozen)
    this.config = Object.freeze({
      jobsToApply: params.jobsToApply || 10,
      preferences: params.preferences || {},
      backendApiHost: params.backendApiHost,
      aiApiHost: params.aiApiHost,
      jwtToken: params.jwtToken,
      devMode: params.devMode || false,
      subscription: params.subscription || null,
    });

    // Runtime overrides (mutable, not part of frozen config)
    this.copilotModeOverride = null;

    // Mutable state
    this.status = SessionStatus.CREATED;
    this.windowId = null;
    this.progress = {
      completed: 0,
      failed: 0,
      skipped: 0,
      total: params.jobsToApply || 10,
    };
    this.submittedJobs = [];
    this.currentJob = null;
    this.error = null;

    // Timestamps
    this.createdAt = Date.now();
    this.startedAt = null;
    this.updatedAt = Date.now();
    this.completedAt = null;
  }

  // ============================================
  // State Machine Transitions
  // ============================================

  /**
   * Transition to STARTING status
   * @param {number} windowId - The automation window ID
   */
  start(windowId) {
    if (this.status !== SessionStatus.CREATED) {
      throw new Error(`Cannot start session from status: ${this.status}`);
    }
    this.status = SessionStatus.STARTING;
    this.windowId = windowId;
    this.startedAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
   * Transition to RUNNING status
   */
  run() {
    if (this.status !== SessionStatus.STARTING) {
      throw new Error(`Cannot run session from status: ${this.status}`);
    }
    this.status = SessionStatus.RUNNING;
    this.updatedAt = Date.now();
  }

  /**
   * Transition to PAUSED status
   */
  pause() {
    if (this.status !== SessionStatus.RUNNING) {
      throw new Error(`Cannot pause session from status: ${this.status}`);
    }
    this.status = SessionStatus.PAUSED;
    this.updatedAt = Date.now();
  }

  /**
   * Resume from PAUSED to RUNNING
   */
  resume() {
    if (this.status !== SessionStatus.PAUSED) {
      throw new Error(`Cannot resume session from status: ${this.status}`);
    }
    this.status = SessionStatus.RUNNING;
    this.updatedAt = Date.now();
  }

  /**
   * Transition to COMPLETED status
   */
  complete() {
    this.status = SessionStatus.COMPLETED;
    this.completedAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
   * Transition to STOPPED status (user-initiated)
   * @param {string} reason - Reason for stopping
   */
  stop(reason = "User stopped") {
    this.status = SessionStatus.STOPPED;
    this.error = reason;
    this.completedAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
   * Transition to FAILED status
   * @param {string|Error} error - Error that caused failure
   */
  fail(error) {
    this.status = SessionStatus.FAILED;
    this.error = error instanceof Error ? error.message : error;
    this.completedAt = Date.now();
    this.updatedAt = Date.now();
  }

  // ============================================
  // Progress Tracking
  // ============================================

  /**
   * Record a successful job application
   * @param {Object} jobData - Job details
   */
  recordSuccess(jobData) {
    this.progress.completed++;
    this.submittedJobs.push({
      ...jobData,
      status: "SUCCESS",
      timestamp: Date.now(),
    });
    this.currentJob = null;
    this.updatedAt = Date.now();

    // Auto-complete if target reached
    if (this.progress.completed >= this.progress.total) {
      this.complete();
    }
  }

  /**
   * Record a failed job application
   * @param {Object} jobData - Job details
   * @param {string} error - Error message
   */
  recordFailure(jobData, error) {
    this.progress.failed++;
    this.submittedJobs.push({
      ...jobData,
      status: "FAILED",
      error,
      timestamp: Date.now(),
    });
    this.currentJob = null;
    this.updatedAt = Date.now();
  }

  /**
   * Record a skipped job
   * @param {Object} jobData - Job details
   * @param {string} reason - Reason for skipping
   */
  recordSkipped(jobData, reason) {
    this.progress.skipped++;
    this.submittedJobs.push({
      ...jobData,
      status: "SKIPPED",
      reason,
      timestamp: Date.now(),
    });
    this.currentJob = null;
    this.updatedAt = Date.now();
  }

  /**
   * Set current job being processed
   * @param {Object} jobData - Current job details
   */
  setCurrentJob(jobData) {
    this.currentJob = {
      ...jobData,
      startedAt: Date.now(),
    };
    this.updatedAt = Date.now();
  }

  // ============================================
  // Runtime Overrides
  // ============================================

  /**
   * Update copilot mode at runtime (persists across page navigations)
   * @param {string} mode - "co-pilot" or "auto-pilot"
   */
  updateCopilotMode(mode) {
    this.copilotModeOverride = mode;
    this.updatedAt = Date.now();
  }

  // ============================================
  // Context Getters (Frozen objects for safety)
  // ============================================

  /**
   * Get context to inject into content scripts
   * This is the ONLY way to get session data for injection
   * @returns {Object} Frozen context object
   */
  getContext() {
    // Merge runtime copilot mode override into preferences
    // Normalize to boolean (true/false) for backward compat with platforms
    // that check `=== true`. The override stores strings ("co-pilot"/"auto-pilot")
    // but the frontend originally sends booleans.
    const preferences = this.copilotModeOverride
      ? {
          ...this.config.preferences,
          copilotMode: this.copilotModeOverride === "co-pilot",
        }
      : this.config.preferences;

    return Object.freeze({
      sessionId: this.id,
      platform: this.platform,
      userId: this.userId,
      userProfile: this.userProfile,
      backendApiHost: this.config.backendApiHost,
      aiApiHost: this.config.aiApiHost,
      jwtToken: this.config.jwtToken,
      preferences,
      devMode: this.config.devMode,
      jobsToApply: this.config.jobsToApply,
      subscription: this.config.subscription,
      windowId: this.windowId,
    });
  }

  /**
   * Get current status summary
   * @returns {Object} Status summary
   */
  getStatus() {
    return {
      sessionId: this.id,
      status: this.status,
      progress: { ...this.progress },
      currentJob: this.currentJob,
      error: this.error,
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
    };
  }

  /**
   * Serialize session for storage
   * @returns {Object} Serializable session data
   */
  toJSON() {
    return {
      id: this.id,
      platform: this.platform,
      userId: this.userId,
      userProfile: this.userProfile,
      config: this.config,
      status: this.status,
      windowId: this.windowId,
      progress: this.progress,
      submittedJobs: this.submittedJobs,
      currentJob: this.currentJob,
      error: this.error,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
    };
  }

  /**
   * Check if session is in a terminal state
   * @returns {boolean}
   */
  isTerminal() {
    return [
      SessionStatus.COMPLETED,
      SessionStatus.STOPPED,
      SessionStatus.FAILED,
    ].includes(this.status);
  }

  /**
   * Check if session is active (can process jobs)
   * @returns {boolean}
   */
  isActive() {
    return this.status === SessionStatus.RUNNING;
  }
}
