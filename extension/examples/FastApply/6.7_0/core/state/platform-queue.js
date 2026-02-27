// core/state/platform-queue.js
// Manages a queue of platforms for non-stop multi-platform automation

export const QueueStatus = Object.freeze({
  IDLE: "IDLE",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  STOPPED: "STOPPED",
});

/**
 * Generates a unique queue ID
 * @returns {string} Unique queue identifier
 */
function generateQueueId() {
  return `queue_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;
}

/**
 * PlatformQueue - Manages sequential processing of multiple platforms
 * When one platform completes, the next one starts automatically
 */
export default class PlatformQueue {
  /**
   * Create a new platform queue
   * @param {string[]} platforms - Array of platform names to process
   * @param {Object} sharedParams - Shared parameters for all platforms
   */
  constructor(platforms, sharedParams) {
    if (!Array.isArray(platforms) || platforms.length === 0) {
      throw new Error("Platforms array is required and must not be empty");
    }
    if (!sharedParams) {
      throw new Error("Shared params are required");
    }

    this.id = generateQueueId();
    this.platforms = [...platforms]; // Original list
    this.sharedParams = Object.freeze({ ...sharedParams }); // Freeze to prevent mutation

    this.currentIndex = 0;
    this.status = QueueStatus.IDLE;

    // Track results per platform
    this.results = [];

    // Track session IDs for each platform
    this.sessionIds = new Map(); // platform -> sessionId

    // Timestamps
    this.createdAt = Date.now();
    this.startedAt = null;
    this.completedAt = null;
    this.updatedAt = Date.now();
  }

  // ============================================
  // Queue Operations
  // ============================================

  /**
   * Start the queue
   */
  start() {
    if (this.status !== QueueStatus.IDLE) {
      throw new Error(`Cannot start queue from status: ${this.status}`);
    }
    this.status = QueueStatus.RUNNING;
    this.startedAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
   * Get the current platform being processed
   * @returns {string|null} Current platform name or null if queue is complete
   */
  getCurrentPlatform() {
    if (this.currentIndex >= this.platforms.length) {
      return null;
    }
    return this.platforms[this.currentIndex];
  }

  /**
   * Get the next platform in the queue (without advancing)
   * @returns {string|null} Next platform name or null if no more platforms
   */
  peekNext() {
    const nextIndex = this.currentIndex + 1;
    if (nextIndex >= this.platforms.length) {
      return null;
    }
    return this.platforms[nextIndex];
  }

  /**
   * Advance to the next platform
   * @returns {string|null} Next platform name or null if queue is complete
   */
  getNext() {
    this.currentIndex++;
    this.updatedAt = Date.now();

    if (this.currentIndex >= this.platforms.length) {
      this.status = QueueStatus.COMPLETED;
      this.completedAt = Date.now();
      return null;
    }

    return this.platforms[this.currentIndex];
  }

  /**
   * Record completion of a platform
   * @param {string} platform - Platform that completed
   * @param {Object} progress - Progress data from the session
   * @param {string} sessionId - Session ID for the platform
   */
  recordPlatformComplete(platform, progress, sessionId = null) {
    this.results.push({
      platform,
      progress: { ...progress },
      sessionId,
      completedAt: Date.now(),
      status: "COMPLETED",
    });

    if (sessionId) {
      this.sessionIds.set(platform, sessionId);
    }

    this.updatedAt = Date.now();
  }

  /**
   * Record a platform that was stopped or failed
   * @param {string} platform - Platform name
   * @param {string} reason - Reason for stopping
   * @param {Object} progress - Progress data
   */
  recordPlatformStopped(platform, reason, progress = {}) {
    this.results.push({
      platform,
      progress: { ...progress },
      reason,
      completedAt: Date.now(),
      status: "STOPPED",
    });
    this.updatedAt = Date.now();
  }

  /**
   * Pause the queue
   */
  pause() {
    if (this.status !== QueueStatus.RUNNING) {
      throw new Error(`Cannot pause queue from status: ${this.status}`);
    }
    this.status = QueueStatus.PAUSED;
    this.updatedAt = Date.now();
  }

  /**
   * Resume the queue
   */
  resume() {
    if (this.status !== QueueStatus.PAUSED) {
      throw new Error(`Cannot resume queue from status: ${this.status}`);
    }
    this.status = QueueStatus.RUNNING;
    this.updatedAt = Date.now();
  }

  /**
   * Stop the queue
   * @param {string} reason - Reason for stopping
   */
  stop(reason = "User stopped") {
    this.status = QueueStatus.STOPPED;
    this.stoppedReason = reason;
    this.completedAt = Date.now();
    this.updatedAt = Date.now();
  }

  // ============================================
  // Status Queries
  // ============================================

  /**
   * Check if the queue is complete
   * @returns {boolean}
   */
  isComplete() {
    return (
      this.status === QueueStatus.COMPLETED ||
      this.currentIndex >= this.platforms.length
    );
  }

  /**
   * Check if the queue is in a terminal state
   * @returns {boolean}
   */
  isTerminal() {
    return [QueueStatus.COMPLETED, QueueStatus.STOPPED].includes(this.status);
  }

  /**
   * Check if the queue is active
   * @returns {boolean}
   */
  isActive() {
    return this.status === QueueStatus.RUNNING;
  }

  /**
   * Get the number of remaining platforms
   * @returns {number}
   */
  getRemainingCount() {
    return Math.max(0, this.platforms.length - this.currentIndex);
  }

  /**
   * Get queue status summary
   * @returns {Object}
   */
  getStatus() {
    return {
      queueId: this.id,
      status: this.status,
      platforms: this.platforms,
      currentPlatform: this.getCurrentPlatform(),
      currentIndex: this.currentIndex,
      totalPlatforms: this.platforms.length,
      remainingCount: this.getRemainingCount(),
      nextPlatform: this.peekNext(),
      results: [...this.results],
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Get automation params for a specific platform
   * @param {string} platform - Platform name
   * @returns {Object} Params to start automation for this platform
   */
  getParamsForPlatform(platform) {
    return {
      ...this.sharedParams,
      platform,
    };
  }

  /**
   * Serialize queue for logging/storage
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      platforms: this.platforms,
      sharedParams: this.sharedParams,
      currentIndex: this.currentIndex,
      status: this.status,
      results: this.results,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      updatedAt: this.updatedAt,
    };
  }
}
